import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeXML } from 'entities';
import { JSDOM } from 'jsdom';
import { runInNewContext } from 'node:vm';
// @ts-expect-error Node 工具实现为 ESM JS，安装消费检查另外验证公开声明。
import { instrumentWechatProject } from '../../scripts/internal/replay/project.mjs';
// @ts-expect-error WXML 编译器为内部 Node 工具，不进入 SDK 声明。
import { instrumentWxml, parseWxml } from '../../scripts/internal/replay/wxml.mjs';
// @ts-expect-error 框架插件仅在 Node 构建时执行。
import * as frameworkTools from '../../scripts/internal/replay/frameworks.mjs';
// @ts-expect-error Taro 编译适配器是内部 Node 工具。
import { instrumentTaroBase } from '../../scripts/internal/replay/taro.mjs';
import { projectFrame } from '../../src/replay/frame';
const { wechatReplayVitePlugin, instrumentWechatAssets } = frameworkTools;

const folders: string[] = [];
function rendered(source: string) {
  return parseWxml(source).filter((node: { name: string }) => node.name !== 'wxs');
}
function literals(source: string): string[] {
  return parseWxml(source)
    .filter((node: { name: string }) => node.name === 'wxs')
    .flatMap((node: { text: string[] }) => {
      const module: { exports: { s?: string[] } } = { exports: {} };
      runInNewContext(node.text.join(''), { module });
      return module.exports.s || [];
    });
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('框架构建接缝', () => {
  it('Vite 重复写入和 watch 增量保持干净输入，移除的依赖恢复原模板，其它平台不改产物', async () => {
    const { input } = await fixture();
    vi.stubEnv('UNI_PLATFORM', 'mp-weixin');
    const plugin = wechatReplayVitePlugin({ pages: ['pages/a'] });
    plugin.configResolved({ root: input, build: { outDir: '.' } });
    const js = await readFile(join(input, 'pages/a.js'), 'utf8');
    const component = await readFile(join(input, 'components/card.wxml'), 'utf8');
    await plugin.writeBundle.handler();
    const first = await readFile(join(input, 'pages/a.wxml'), 'utf8');
    await plugin.writeBundle.handler();
    expect(await readFile(join(input, 'pages/a.wxml'), 'utf8')).toBe(first);
    await writeFile(join(input, 'pages/a.wxml'), '<view>增量更新</view>');
    await plugin.writeBundle.handler();
    expect(await readFile(join(input, 'pages/a.wxml'), 'utf8')).toContain('增量更新');
    expect(await readFile(join(input, 'components/card.wxml'), 'utf8')).toBe(component);
    expect(await readFile(join(input, 'pages/a.js'), 'utf8')).toBe(js);
    vi.stubEnv('UNI_PLATFORM', 'mp-alipay');
    const other = wechatReplayVitePlugin();
    other.configResolved({ root: input, build: { outDir: 'does-not-exist' } });
    await expect(other.writeBundle.handler()).resolves.toBeUndefined();
  });

  it('Taro 渲染观测同步增量文字与隐私开关，不读取输入值；缺失能力安全降级', async () => {
    const code = await readFile(
      new URL('../../scripts/replay-taro-runtime.cjs', import.meta.url),
      'utf8',
    );
    const dom = new JSDOM('<main><span>更新前</span><input value="PRIVATE" /></main>');
    const { document, MutationObserver } = dom.window;
    const span = document.querySelector('span')!;
    const input = document.querySelector('input')!;
    Object.defineProperty(input, 'value', {
      get() {
        throw new Error('private input read');
      },
    });
    runInNewContext(code, { require: () => ({ document, MutationObserver }) });
    expect(span.getAttribute('srReplayText')).toBe('更新前');
    span.firstChild!.nodeValue = '已更新';
    span.setAttribute('data-sentry-replay-mask', 'true');
    await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0));
    expect(span.getAttribute('srReplayText')).toBe('已更新');
    expect(span.getAttribute('srReplaymask')).toBe('true');
    span.removeAttribute('data-sentry-replay-mask');
    span.textContent = 'A'.repeat(300);
    await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0));
    expect(span.getAttribute('srReplayText')).toHaveLength(256);
    expect(span.getAttribute('srReplaymask')).toBe('false');
    expect(input.getAttribute('srReplayText')).toBe('');
    dom.window.close();
    expect(() => runInNewContext(code, { require: () => ({}) })).not.toThrow();
  });

  it('Taro 共享模板的不同实例以 sid 归属，公开兄弟不继承前一实例遮蔽，桥接组件保留遮蔽', async () => {
    const source = `<template name="taro_tmpl"><template is="{{xs.a(0,item.nn,'')}}" data="{{i:item,c:1,l:xs.f('',item.nn)}}" wx:for="{{root.cn}}" /></template>
<template name="tmpl_0_0"><view class="{{i.cl}}" data-sid="{{i.sid}}"><template is="{{xs.a(c,item.nn,l)}}" data="{{i:item,c:c+1}}" wx:for="{{i.cn}}"/></view></template>
<template name="tmpl_1_0"><view class="{{i.cl}}" data-sid="{{i.sid}}"/></template>
<template name="tmpl_15_container"><comp i="{{i}}"/></template>
<template name="tmpl_0_9"><block>{{i.v}}</block></template>`;
    const output = instrumentTaroBase(source, { sourceId: 'base', components: { comp: ['base'] } });
    expect(output).not.toContain('&quot;');
    expect(output).toContain('sr_replay_root:sr_replay_root');
    const roots = parseWxml(output);
    const helper = roots.find((node: any) => node.name === 'wxs');
    const module = {
      exports: {} as { c: (s: string, n: string) => boolean },
    };
    runInNewContext(helper.text.join(''), {
      module,
      getRegExp: (s: string, flags: string) => new RegExp(s, flags),
    });
    expect(module.exports.c('other\tsentry-mask\nlast', 'sentry-mask')).toBe(true);
    expect(module.exports.c('sentry-masked', 'sentry-mask')).toBe(false);
    const templates = roots.filter((node: any) => node.name === 'template');
    const evaluate = (
      name: string,
      sid: string,
      text: string,
      cl: string,
      marks = {},
      root = false,
    ) => {
      const node = templates.find((node: any) =>
        node.attrs.some((attr: any) => attr.name === 'name' && attr.value === name),
      ).children[0];
      const dataset: Record<string, unknown> = {},
        mark: Record<string, unknown> = { ...marks };
      for (const attr of node.attrs) {
        if (!attr.name.startsWith('data-sentry-') && !attr.name.startsWith('mark:')) continue;
        let value = decodeXML(attr.value);
        if (value.includes('{{')) {
          const expression = value.slice(value.indexOf('{{') + 2, value.lastIndexOf('}}'));
          const result = runInNewContext(expression, {
            i: { sid, cl, srReplayText: text },
            sr_taro_base: module.exports,
            sr_replay_root: root,
          });
          value = value.startsWith('\u200b') ? '\u200b' + result : result;
        }
        if (attr.name.startsWith('mark:')) mark[attr.name.slice(5)] = value;
        else
          dataset[
            attr.name.slice(5).replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())
          ] = value;
      }
      return { left: 0, top: 0, width: 100, height: 30, dataset, mark };
    };
    const root = evaluate('tmpl_0_0', 'root', '公开', 'sentry-unmask', {}, true);
    const masked = evaluate('tmpl_1_0', 'one', 'PRIVATE_MASKED', 'sentry-mask', root.mark);
    const sibling = evaluate('tmpl_1_0', 'two', '公开兄弟', '', root.mark);
    const bridge = evaluate('tmpl_15_container', 'bridge', '', 'sentry-mask', root.mark);
    const child = evaluate('tmpl_0_0', 'inner', 'PRIVATE_COMPONENT', 'sentry-unmask');
    const frame = projectFrame(
      [{ width: 375, height: 700 }, [root, masked, sibling, bridge, child]],
      'test',
      20,
    )!;
    expect(frame.nodes.map((node) => node.text)).toEqual([
      '公开',
      '**************',
      '公开兄弟',
      '',
      '*****************',
    ]);
    expect(frame.nodes[4].parent).toBe(3);
    const assets = {
      'app.json': { source: () => '{"pages":["index"],"usingComponents":{"comp":"/comp"}}' },
      'index.wxml': {
        source: () => '<import src="./base.wxml"/><template is="taro_tmpl" data="{{root:root}}"/>',
      },
      'base.wxml': { source: () => source },
      'comp.json': { source: () => '{"component":true}' },
      'comp.wxml': {
        source: () => '<import src="./base.wxml"/><template is="{{kind}}" data="{{i:i}}"/>',
      },
      'index.js': { source: () => 'Page({});' },
    };
    const changed = await instrumentWechatAssets(assets);
    expect(changed.get('index.wxml')).toContain('sr_replay_root:true');
    expect(changed.get('base.wxml')).toContain('mark:sr_');
    expect(changed.has('index.js')).toBe(false);
  });
});
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'miniapp-replay-tool-'));
  folders.push(folder);
  const input = join(folder, 'source'),
    output = join(folder, 'output');
  await mkdir(join(input, 'pages'), { recursive: true });
  await mkdir(join(input, 'components'));
  await writeFile(
    join(input, 'app.json'),
    JSON.stringify({
      pages: ['pages/a', 'pages/b'],
      usingComponents: { card: '/components/card' },
    }),
  );
  await writeFile(
    join(input, 'pages/a.wxml'),
    '<view><card wx:for="{{items}}" wx:for-index="row" /><include src="./template.wxml" /></view>',
  );
  await writeFile(join(input, 'pages/b.wxml'), '<text>unselected</text>');
  await writeFile(join(input, 'pages/template.wxml'), '<text>名称：{{title}}</text>');
  await writeFile(
    join(input, 'components/card.wxml'),
    '<view><text>{{title}}</text><input value="{{private}}" /></view>',
  );
  await writeFile(join(input, 'components/card.json'), '{"component":true}');
  await writeFile(
    join(input, 'pages/a.js'),
    'Page({onTap(){return 42}});\n//# sourceMappingURL=a.js.map\n',
  );
  await writeFile(join(input, 'pages/a.js.map'), '{"version":3,"sources":["business.ts"]}');
  return { input, output, pages: ['pages/a'] };
}
describe('WXML 构建工具的实际项目输出', () => {
  it('保留绑定、属性、业务 JS/map 与未选页面；生成静态组件图且可幂等处理', async () => {
    const options = await fixture();
    const report = await instrumentWechatProject(options);
    expect(report.files.sort()).toEqual([
      'components/card.wxml',
      'pages/a.wxml',
      'pages/template.wxml',
    ]);
    const page = await readFile(join(options.output, 'pages/a.wxml'), 'utf8');
    expect(page).toContain('sentry-replay-root');
    expect(page).toContain('="{{row}}"');
    expect(page).toContain('data-sentry-replay-target=');
    expect(rendered(page)).toHaveLength(1);
    // include 的 WXS 声明被微信忽略，引用页必须带齐被引用模板的独立辅助模块。
    const template = await readFile(join(options.output, 'pages/template.wxml'), 'utf8');
    const module = template.match(/<wxs module="([^"]+)"/)![1];
    expect(page).toContain('<wxs module="' + module + '"');
    for (const file of ['pages/a.js', 'pages/a.js.map', 'pages/b.wxml'])
      expect(await readFile(join(options.output, file), 'utf8')).toBe(
        await readFile(join(options.input, file), 'utf8'),
      );
    const component = await readFile(join(options.output, 'components/card.wxml'), 'utf8');
    expect(component).toContain('data-sentry-replay-text="\u200b{{ title }}"');
    const inputNode = rendered(component)[0].children[1];
    expect(
      inputNode.attrs.some((attr: { name: string }) => attr.name === 'data-sentry-replay-text'),
    ).toBe(false);
    for (const kind of ['input', 'textarea', 'image']) {
      const value = `<${kind} data-sentry-replay-type="${kind}" value="{{private}}" />`;
      expect(instrumentWxml(value, { sourceId: 'private-kind', page: true })).toContain(
        `data-sentry-replay-type="${kind}"`,
      );
      expect(() =>
        instrumentWxml(
          `<${kind} data-sentry-replay-type="text" data-sentry-replay-text="{{private}}" />`,
          { sourceId: 'private-kind', page: true },
        ),
      ).toThrow('Replay private node type conflicts');
    }
    expect(instrumentWxml(page, { sourceId: 'new', page: true })).toBe(page);
    await expect(instrumentWechatProject(options)).rejects.toThrow('already exists');
  });
  it('XML 位置编辑不吞闭合标签，支持比较运算、实体、引号与字符串内结束括号', () => {
    const original = `<wxs module="m">var x = '<view>'; module.exports=x;</wxs><view class='a&amp;b' hidden wx:if="{{a < b}}"><text>{{'x}}' + name}}</text><button disabled>确定 &amp; 继续</button></view>`;
    const output = instrumentWxml(original, { sourceId: 'test', page: true });
    expect(output).toContain(`<wxs module="m">var x = '<view>'; module.exports=x;</wxs>`);
    expect(output).toContain("class='a&amp;b sentry-replay sentry-replay-root'");
    expect(output).toContain('wx:if="{{a < b}}"');
    const classBinding = '<view class=\'{{ active && m.label("x&y") }}\' />';
    expect(instrumentWxml(classBinding, { sourceId: 'class', page: true })).toContain(
      'class=\'{{ active && m.label("x&y") }} sentry-replay sentry-replay-root\'',
    );
    const nodes = parseWxml(output).filter((node: { name: string }) => node.name !== 'wxs');
    expect(nodes[0].children).toHaveLength(2);
    expect(
      nodes[0].children[1].attrs.find(
        (attr: { name: string }) => attr.name === 'data-sentry-replay-text',
      ).value,
    ).toMatch(/^\u200b{{ sr_replay_test\.s\[\d+\] }}$/);
    expect(literals(output)).toContain('确定 &amp; 继续');
    const special = instrumentWxml("<text>订单\\'s \"确认\" \\\\path\n下一行 {{'</wxs>'}}</text>", {
      sourceId: 'special',
      page: true,
    });
    expect(literals(special)).toContain('订单\\\'s "确认" \\\\path\n下一行 ');
    expect(literals(special)).toContain('</wxs>');
    expect(special.split('</wxs>')[0]).not.toContain("'</wxs>'");
    expect(output).not.toContain('data-sentry-replay-text="var x');
    expect(
      instrumentWxml(
        '<view><!-- {{unfinished --><wxs module="m">var secret = 42;</wxs><text>公开</text></view>',
        { sourceId: 'comments', page: true },
      ),
    ).not.toContain('data-sentry-replay-text="var secret');
    expect(
      instrumentWxml('<view capture-bind:tap="business" />', { sourceId: 'a', page: true }),
    ).not.toContain('__sentryReplayTap');
    const slot = instrumentWxml('<view class="label"><slot /></view>', { sourceId: 'slot' });
    expect(slot).toContain('data-sentry-replay-slot="true"');
    expect(slot).toContain('data-sentry-replay-slots="d"');
    expect(rendered(slot)[0].children.map((node: { name: string }) => node.name)).toEqual(['slot']);
    expect(
      instrumentWxml('<view><slot name="title" /></view>', { sourceId: 'named' }),
    ).not.toContain('data-sentry-replay-slot=');
    expect(instrumentWxml('<view><slot name="title" /></view>', { sourceId: 'named' })).toContain(
      'data-sentry-replay-slots="ntitle"',
    );
    const assigned = instrumentWxml(
      '<widget><block slot="title"><text>标题</text></block></widget>',
      {
        sourceId: 'caller',
        components: { widget: ['component'] },
      },
    );
    expect(assigned).toContain('data-sentry-replay-assigned="ntitle"');
    expect(assigned).toContain('<block slot="title">');
    for (const bad of [
      '<view><text></view>',
      '<view>{{unclosed</view>',
      '<view data-sentry-replay-node="owned"/>',
      '<view data-sentry-replay-slot="true"/>',
      '<view data-sentry-replay-slots="d"/>',
      '<view data-sentry-replay-assigned="d"/>',
      '<view><slot name="{{name}}"/></view>',
      '<view slot="{{name}}"/>',
      '<view wx:for="{{list}}" wx:for-index="a-b"/>',
      '<view><block data-sentry-replay-mask="true">私密</block></view>',
      '<view><block wx:for="{{list}}">{{item}}</block></view>',
      '<text>{{m.format(value)}}</text>',
      '<text decode>内容 &amp;</text>',
    ])
      expect(() => instrumentWxml(bad, { sourceId: 'a' })).toThrow();
    expect(
      instrumentWxml('<widget><slot/></widget>', {
        sourceId: 'forward',
        components: { widget: ['child'] },
      }),
    ).toContain('data-sentry-replay-slots="d>d"');
    expect(
      literals(instrumentWxml('<text decode="{{false}}">0</text>', { sourceId: 'decode' })),
    ).toContain('0');
    expect(
      instrumentWxml('<text decode data-sentry-replay-text="内容 &amp;">内容 &amp;</text>', {
        sourceId: 'manual',
      }),
    ).toContain('data-sentry-replay-text="内容 &amp;"');
  });
  it('拒绝路径逃逸、嵌套输出、未知页面、外部链接，失败前不写输出', async () => {
    const options = await fixture();
    for (const pages of [[], ['pages/missing']])
      await expect(instrumentWechatProject({ ...options, pages })).rejects.toThrow();
    await expect(
      instrumentWechatProject({ ...options, output: join(options.input, 'generated') }),
    ).rejects.toThrow('separate');
    await writeFile(join(options.input, 'pages/a.wxml'), '<include src="../../secret.wxml"/>');
    await expect(instrumentWechatProject(options)).rejects.toThrow('escapes');
    await writeFile(join(options.input, 'pages/a.wxml'), '<view><widget/></view>');
    for (const [reference, reason] of [
      ['../../secret', 'escapes'],
      ['../node_modules/ui/index', 'excluded'],
      ['plugin://widget', 'Unsupported'],
      ['plugin-private://widget', 'Unsupported'],
      ['dynamicLib://widget', 'Unsupported'],
      ['{{componentPath}}', 'Unsupported'],
    ]) {
      await writeFile(
        join(options.input, 'pages/a.json'),
        JSON.stringify({ usingComponents: { widget: reference } }),
      );
      await expect(instrumentWechatProject(options)).rejects.toThrow(
        reason === 'Unsupported'
          ? /Unsupported replay dependency: .* in pages\/a.wxml。.*请改选/
          : reason,
      );
    }
    await writeFile(
      join(options.input, 'project.config.json'),
      '{"miniprogramRoot":"node_modules/app"}',
    );
    await expect(instrumentWechatProject(options)).rejects.toThrow('excluded');
    await rm(join(options.input, 'project.config.json'));
    await writeFile(join(options.input, 'pages/a.wxml'), '<view/>');
    await symlink('/tmp', join(options.input, 'outside'));
    await expect(instrumentWechatProject(options)).rejects.toThrow('Symlinks');
    await expect(readFile(join(options.output, 'app.json'))).rejects.toThrow();
  });
  it('子包与 miniprogramRoot 中解析局部组件、循环引用和已知模板', async () => {
    const options = await fixture();
    await writeFile(
      join(options.input, 'project.config.json'),
      JSON.stringify({ miniprogramRoot: '.' }),
    );
    await writeFile(
      join(options.input, 'app.json'),
      JSON.stringify({ subPackages: [{ root: 'pages', pages: ['a'] }] }),
    );
    await writeFile(
      join(options.input, 'pages/a.json'),
      JSON.stringify({ usingComponents: { card: '../components/card' } }),
    );
    await writeFile(
      join(options.input, 'components/card.json'),
      JSON.stringify({ usingComponents: { self: './card' } }),
    );
    await writeFile(
      join(options.input, 'components/card.wxml'),
      '<view><self wx:if="{{false}}" /></view>',
    );
    await writeFile(join(options.input, 'pages/template.wxml'), '<card/>');
    expect((await instrumentWechatProject(options)).files).toContain('components/card.wxml');
    expect(await readFile(join(options.output, 'pages/template.wxml'), 'utf8')).toContain(
      'data-sentry-replay-target=',
    );
  });
  it.each([
    {
      declaration: 'page',
      reference: '@ui/weapp/button/index',
      target: 'miniprogram_npm/@ui/weapp/button/index',
    },
    {
      declaration: 'global',
      reference: '@ui/weapp/button',
      target: 'miniprogram_npm/@ui/weapp/button/index',
      miniprogramRoot: 'miniprogram',
    },
    {
      declaration: 'subpackage',
      reference: 'ui-button',
      target: 'pages/miniprogram_npm/ui-button/index',
    },
    {
      declaration: 'page',
      reference: '../components/directory',
      target: 'components/directory/index',
    },
  ])(
    '解析 $declaration 的 $reference 及目录入口',
    async ({ declaration, reference, target, miniprogramRoot }) => {
      const options = await fixture();
      await writeFile(
        join(options.input, 'app.json'),
        JSON.stringify({
          ...(declaration === 'subpackage'
            ? { subPackages: [{ root: 'pages', pages: ['a'] }] }
            : { pages: ['pages/a'] }),
          usingComponents: declaration === 'global' ? { widget: reference } : {},
        }),
      );
      await writeFile(join(options.input, 'pages/a.wxml'), '<view><widget>确认</widget></view>');
      if (declaration !== 'global')
        await writeFile(
          join(options.input, 'pages/a.json'),
          JSON.stringify({ usingComponents: { widget: reference } }),
        );
      await mkdir(join(options.input, target, '..'), { recursive: true });
      await writeFile(join(options.input, target + '.json'), '{"component":true}');
      await writeFile(
        join(options.input, target + '.wxml'),
        '<button><view><slot /></view></button>',
      );
      if (miniprogramRoot) {
        await rename(options.input, options.input + '-original');
        await mkdir(options.input);
        await rename(options.input + '-original', join(options.input, miniprogramRoot));
        await writeFile(
          join(options.input, 'project.config.json'),
          JSON.stringify({ miniprogramRoot }),
        );
      }
      const report = await instrumentWechatProject(options);
      expect(report.files.sort()).toEqual([target + '.wxml', 'pages/a.wxml'].sort());
      const output = join(options.output, miniprogramRoot || '');
      expect(await readFile(join(output, 'pages/a.wxml'), 'utf8')).toContain(
        'data-sentry-replay-target=',
      );
      expect(literals(await readFile(join(output, 'pages/a.wxml'), 'utf8'))).toContain('确认');
      expect(await readFile(join(output, target + '.wxml'), 'utf8')).toContain(
        'data-sentry-replay-slot="true"',
      );
    },
  );
  it.each([
    '<view />',
    '<view>前缀<slot /></view>',
    '<view><slot name="title" /></view>',
    '<view><slot wx:if="{{show}}" /></view>',
    '<view><view><slot /></view><view><slot /></view></view>',
    '<slot />',
    '<view wx:for="{{items}}"><view><slot /></view></view>',
  ])('无法确定默认插槽裸文字位置时明确拒绝、不写输出：%s', async (template) => {
    const options = await fixture();
    await writeFile(join(options.input, 'pages/a.wxml'), '<view><card>确认</card></view>');
    await writeFile(join(options.input, 'components/card.wxml'), template);
    await expect(instrumentWechatProject(options)).rejects.toThrow(
      /pages\/a.wxml: Replay component bare text.*card。.*实际插槽位置/,
    );
    await expect(readFile(join(options.output, 'app.json'))).rejects.toThrow();
  });
  it('组件查找优先本地再逐级 npm，忽略未使用声明；缺失依赖提供构建步骤且不写输出', async () => {
    const options = await fixture();
    await writeFile(
      join(options.input, 'app.json'),
      JSON.stringify({
        pages: ['pages/a'],
        usingComponents: { unused: 'plugin://unused/widget' },
      }),
    );
    await writeFile(
      join(options.input, 'pages/a.json'),
      JSON.stringify({ usingComponents: { widget: 'ui/button' } }),
    );
    await writeFile(join(options.input, 'pages/a.wxml'), '<view><widget /></view>');
    for (const path of [
      'pages/ui/button',
      'pages/miniprogram_npm/ui/button',
      'miniprogram_npm/ui/button',
    ]) {
      await mkdir(join(options.input, path, '..'), { recursive: true });
      await writeFile(join(options.input, path + '.json'), '{"component":true}');
      await writeFile(join(options.input, path + '.wxml'), '<text>组件</text>');
    }
    expect((await instrumentWechatProject(options)).files).toContain('pages/ui/button.wxml');
    // 只有 WXML 而缺少 JSON 的本地文件不是有效组件，继续查找完整 npm 产物。
    await rm(join(options.input, 'pages/ui/button.json'));
    const nested = { ...options, output: options.output + '-nested' };
    expect((await instrumentWechatProject(nested)).files).toContain(
      'pages/miniprogram_npm/ui/button.wxml',
    );
    await rm(join(options.input, 'pages/miniprogram_npm'), { recursive: true });
    const root = { ...options, output: options.output + '-root' };
    expect((await instrumentWechatProject(root)).files).toContain('miniprogram_npm/ui/button.wxml');
    await rm(join(options.input, 'miniprogram_npm'), { recursive: true });
    const missing = { ...options, output: options.output + '-missing' };
    await expect(instrumentWechatProject(missing)).rejects.toThrow('构建 npm');
    await expect(readFile(join(missing.output, 'app.json'))).rejects.toThrow();
    await writeFile(join(options.input, 'pages/a.wxml'), '<view><unused /></view>');
    await expect(instrumentWechatProject(missing)).rejects.toThrow('Unsupported replay dependency');
  });
  it('结构条件文字留在原容器，分支顺序、实体和私密子节点边界不丢失', () => {
    const source = `<view data-sentry-replay-unmask="true"><block wx:if="{{ value || value === 0 }}">{{value}}</block><block wx:elif="{{ pending }}">待处理 &quot; &amp; &amp;amp;</block><block wx:else>{{'x}}' + fallback}}</block><view data-sentry-replay-mask="true">私密子区域</view></view>`;
    const output = instrumentWxml(source, { sourceId: 'conditional', page: true });
    const node = rendered(output)[0];
    expect(node.children.map((child: { name: string }) => child.name)).toEqual([
      'block',
      'block',
      'block',
      'view',
    ]);
    for (const block of source.match(/<block[\s\S]*?<\/block>/g)!) expect(output).toContain(block);
    const text = decodeXML(
      node.attrs.find((attr: { name: string }) => attr.name === 'data-sentry-replay-text').value,
    );
    expect(text).toContain('( value || value === 0 )');
    expect(text).toContain('!((');
    expect(text).toContain('&& ( pending )');
    expect(literals(output)).toContain('待处理 &quot; &amp; &amp;amp;');
    expect(text).not.toContain('&amp;');
    expect(text).not.toContain('&quot;');
    expect(text).not.toContain('私密子区域');
    expect(
      node.attrs.some(
        (attr: { name: string; value: string }) =>
          attr.name === 'data-sentry-replay-text-format' && attr.value === 'wxml',
      ),
    ).toBe(true);
    const loop = instrumentWxml(
      '<view><block wx:if="{{show}}" wx:for="{{list}}"><text>{{item}}</text></block></view>',
      { sourceId: 'loop', page: true },
    );
    expect(loop).toContain('data-sentry-replay-text="\u200b{{ item }}"');
  });
  it('保留方法冲突和纯模板入口明确失败，符号链接别名不能绕过输出隔离', async () => {
    const options = await fixture();
    await writeFile(join(options.input, 'pages/a.js'), 'Page({__sentryReplayTap(){}})');
    await expect(instrumentWechatProject(options)).rejects.toThrow('__sentryReplayTap');
    await writeFile(join(options.input, 'pages/a.js'), 'Page({})');
    await writeFile(
      join(options.input, 'pages/a.wxml'),
      '<block><template is="{{kind}}" data="{{...state}}" /></block>',
    );
    await expect(instrumentWechatProject(options)).rejects.toThrow(
      'Template-only page needs a framework adapter: pages/a.wxml。纯模板页面',
    );
    await expect(readFile(join(options.output, 'app.json'))).rejects.toThrow();
    const alias = join(options.input, '..', 'alias');
    await symlink(options.input, alias);
    await expect(
      instrumentWechatProject({ ...options, output: join(alias, 'generated') }),
    ).rejects.toThrow('separate');
  });
});
