import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Node 工具实现为 ESM JS，安装消费检查另外验证公开声明。
import { instrumentWechatProject } from '../../scripts/internal/replay/project.mjs';
// @ts-expect-error WXML 编译器为内部 Node 工具，不进入 SDK 声明。
import { instrumentWxml, parseWxml } from '../../scripts/internal/replay/wxml.mjs';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
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
  await writeFile(join(input, 'pages/template.wxml'), '<text>{{title}}</text>');
  await writeFile(
    join(input, 'components/card.wxml'),
    '<view><text>{{title}}</text><input value="{{private}}" /></view>',
  );
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
    expect(parseWxml(page)).toHaveLength(1);
    for (const file of ['pages/a.js', 'pages/a.js.map', 'pages/b.wxml'])
      expect(await readFile(join(options.output, file), 'utf8')).toBe(
        await readFile(join(options.input, file), 'utf8'),
      );
    const component = await readFile(join(options.output, 'components/card.wxml'), 'utf8');
    expect(component).toContain('data-sentry-replay-text="{{title}}"');
    const inputNode = parseWxml(component)[0].children[1];
    expect(
      inputNode.attrs.some((attr: { name: string }) => attr.name === 'data-sentry-replay-text'),
    ).toBe(false);
    expect(instrumentWxml(page, { sourceId: 'new', page: true })).toBe(page);
    await expect(instrumentWechatProject(options)).rejects.toThrow('already exists');
  });
  it('XML 位置编辑不吞闭合标签，支持比较运算、实体、引号与字符串内结束括号', () => {
    const original = `<wxs module="m">var x = '<view>'; module.exports=x;</wxs><view class='a&amp;b' hidden wx:if="{{a < b}}"><text>{{'x}}' + name}}</text><button disabled>确定 &amp; 继续</button></view>`;
    const output = instrumentWxml(original, { sourceId: 'test', page: true });
    expect(output).toContain(`<wxs module="m">var x = '<view>'; module.exports=x;</wxs>`);
    expect(output).toContain('class="a&amp;b sentry-replay sentry-replay-root"');
    expect(output).toContain('wx:if="{{a < b}}"');
    const nodes = parseWxml(output).filter((node: { name: string }) => node.name !== 'wxs');
    expect(nodes[0].children).toHaveLength(2);
    expect(
      nodes[0].children[1].attrs.find(
        (attr: { name: string }) => attr.name === 'data-sentry-replay-text',
      ).value,
    ).toBe('确定 &amp; 继续');
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
    for (const bad of [
      '<view><text></view>',
      '<view>{{unclosed</view>',
      '<view data-sentry-replay-node="owned"/>',
      '<view wx:for="{{list}}" wx:for-index="a-b"/>',
    ])
      expect(() => instrumentWxml(bad, { sourceId: 'a' })).toThrow();
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
  it('保留方法冲突和纯模板入口明确失败，符号链接别名不能绕过输出隔离', async () => {
    const options = await fixture();
    await writeFile(join(options.input, 'pages/a.js'), 'Page({__sentryReplayTap(){}})');
    await expect(instrumentWechatProject(options)).rejects.toThrow('__sentryReplayTap');
    await writeFile(join(options.input, 'pages/a.js'), 'Page({})');
    await writeFile(
      join(options.input, 'pages/a.wxml'),
      '<block><template is="{{kind}}" data="{{...state}}" /></block>',
    );
    await expect(instrumentWechatProject(options)).rejects.toThrow('framework adapter');
    const alias = join(options.input, '..', 'alias');
    await symlink(options.input, alias);
    await expect(
      instrumentWechatProject({ ...options, output: join(alias, 'generated') }),
    ).rejects.toThrow('separate');
  });
});
