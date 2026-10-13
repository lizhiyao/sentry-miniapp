import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { dependencies, instrumentWxml, parseWxml, textModules } from './wxml.mjs';

const ignored = new Set(['.git', 'node_modules', '.DS_Store']);
const hash = (name) => createHash('sha256').update(name).digest('hex').slice(0, 12);
function within(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
}
function local(root, from, name, extension) {
  if (typeof name !== 'string' || !name || name.includes('{{') || /\0|^[\w+-]+:/.test(name))
    throw new Error(
      'Unsupported replay dependency: ' +
        name +
        ' in ' +
        relative(root, from) +
        '。回放标记需要项目内可读取的静态 WXML；插件、动态库及动态路径暂不支持。' +
        '请改选不依赖它们的关键页面，不会跳过依赖生成不完整的录制。',
    );
  name = name.replace(/\\/g, '/');
  const file = resolve(
    name.startsWith('/') ? root : dirname(from),
    '.' + (name.startsWith('/') ? name : sep + name),
  );
  const resolved = extname(file) === extension ? file : file + extension;
  if (!within(root, resolved)) throw new Error('Replay dependency escapes project: ' + name);
  if (
    relative(root, resolved)
      .split(sep)
      .some((part) => ignored.has(part))
  )
    throw new Error('Replay dependency uses excluded directory: ' + name);
  return resolved;
}
async function isFile(path) {
  try {
    return (await lstat(path)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}
async function component(root, { from, name }) {
  const candidates = [];
  const add = (file) => candidates.push(file, join(file.slice(0, -5), 'index.wxml'));
  // 与微信编译器一致：本地文件／目录入口优先，再逐级查找已构建 npm。
  add(local(root, from, name, '.wxml'));
  if (!name.startsWith('.') && !name.startsWith('/')) {
    for (let folder = dirname(from); ; folder = dirname(folder)) {
      add(local(root, join(folder, 'miniprogram_npm', '_resolver.json'), name, '.wxml'));
      if (folder === root) break;
    }
  }
  for (const file of candidates)
    if ((await isFile(file)) && (await isFile(file.replace(/\.wxml$/, '.json')))) return file;
  throw new Error(
    'Replay component not found: ' +
      name +
      ' in ' +
      relative(root, from) +
      '。若使用 npm 组件，请先在微信开发者工具执行「工具 → 构建 npm」，' +
      '再对包含 miniprogram_npm 的项目生成回放标记。Searched: ' +
      candidates.map((file) => relative(root, file)).join(', '),
  );
}
async function json(path, optional = false) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw error;
  }
}

/** 输出独立项目副本，所选页面及其静态组件依赖获得自动节点标记。 */
export async function instrumentWechatProject({ input, output, pages }) {
  const source = await realpath(resolve(input));
  let ancestor = resolve(output);
  const suffix = [];
  while (true) {
    try {
      ancestor = await realpath(ancestor);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      suffix.unshift(ancestor.split(sep).at(-1));
      ancestor = dirname(ancestor);
    }
  }
  const destination = join(ancestor, ...suffix);
  if (!Array.isArray(pages) || !pages.length) throw new Error('Select at least one page');
  if (source === destination || within(source, destination) || within(destination, source))
    throw new Error('Input and output must be separate, non-nested directories');
  try {
    await lstat(destination);
    throw new Error('Output already exists; use a fresh directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // 在读取依赖前检查链接，避免先跟随项目外资源；node_modules 不复制。
  const check = async (folder) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink())
        throw new Error('Symlinks are unsupported in replay output: ' + relative(source, path));
      if (entry.isDirectory()) await check(path);
    }
  };
  await check(source);
  const config = await json(join(source, 'project.config.json'), true);
  const root = resolve(source, config.miniprogramRoot || '.');
  if (root !== source && !within(source, root)) throw new Error('miniprogramRoot escapes project');
  if (
    relative(source, root)
      .split(sep)
      .some((part) => ignored.has(part))
  )
    throw new Error('miniprogramRoot uses excluded directory');
  const app = await json(join(root, 'app.json'));
  const knownPages = new Set([
    ...(app.pages || []),
    ...(app.subPackages || app.subpackages || []).flatMap((pkg) =>
      (pkg.pages || []).map((page) => pkg.root + '/' + page),
    ),
  ]);
  const selected = new Set(
    pages.map((page) => {
      if (!knownPages.has(page)) throw new Error('Unknown WeChat page: ' + page);
      return local(root, join(root, 'app.json'), page, '.wxml');
    }),
  );
  const sources = new Map(),
    componentMaps = new Map(),
    ownTags = new Map(),
    imported = new Map();
  const collect = async (file, inherited = new Map()) => {
    if (sources.has(file)) {
      const previous = componentMaps.get(file);
      for (const [tag, binding] of inherited) {
        if (
          previous.has(tag) &&
          !ownTags.get(file).has(tag) &&
          previous.get(tag) !== (await component(root, binding))
        )
          throw new Error(
            'Conflicting template component binding: ' + tag + ' in ' + relative(root, file),
          );
      }
      return;
    }
    const sourceText = await readFile(file, 'utf8');
    sources.set(file, sourceText);
    const imports = dependencies(sourceText).map((name) => local(root, file, name, '.wxml'));
    imported.set(file, imports);
    const metadata = await json(file.replace(/\.wxml$/, '.json'), true);
    ownTags.set(file, new Set(Object.keys(metadata.usingComponents || {})));
    const tags = new Set();
    const visit = (nodes) =>
      nodes.forEach((node) => {
        tags.add(node.name);
        visit(node.children);
      });
    visit(parseWxml(sourceText));
    const relativeFile = relative(root, file).split(sep).join('/');
    const independent = (app.subPackages || app.subpackages || []).some(
      (pkg) => pkg.independent && relativeFile.startsWith(pkg.root.replace(/\/$/, '') + '/'),
    );
    // npm 内部组件与独立分包不继承 app.json 的全局组件声明。
    const globals =
      relativeFile.split('/').includes('miniprogram_npm') || independent
        ? {}
        : app.usingComponents || {};
    const map = new Map(
      Object.entries(globals).map(([tag, path]) => [
        tag,
        { from: join(root, 'app.json'), name: path },
      ]),
    );
    for (const [tag, target] of inherited) map.set(tag, target);
    for (const [tag, path] of Object.entries(metadata.usingComponents || {}))
      map.set(tag, { from: file, name: path });
    const used = new Map();
    for (const [tag, binding] of map)
      if (tags.has(tag)) used.set(tag, await component(root, binding));
    // 全局组件路径相对于 app.json，局部定义相对于当前页面或组件。
    componentMaps.set(file, used);
    for (const dependency of imports) await collect(dependency, map);
    for (const dependency of used.values()) await collect(dependency);
    const javascript = file.replace(/\.wxml$/, '.js');
    try {
      if ((await readFile(javascript, 'utf8')).includes('__sentryReplayTap'))
        throw new Error('Reserved __sentryReplayTap in ' + relative(root, javascript));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  for (const page of selected) await collect(page);
  for (const page of selected) {
    const hasRenderedRoot = (nodes) =>
      nodes.some((node) =>
        node.name === 'block'
          ? hasRenderedRoot(node.children)
          : !['wxs', 'import', 'include', 'template', 'slot'].includes(node.name),
      );
    if (!hasRenderedRoot(parseWxml(sources.get(page))))
      throw new Error(
        'Template-only page needs a framework adapter: ' +
          relative(root, page) +
          '。纯模板页面（例如 Taro 递归模板）暂不支持自动标记；' +
          '请改选普通 WXML 页面。标记工具不会跳过模板或修改业务渲染结构。',
      );
  }
  const ids = new Map(
    [...sources.keys()].map((file) => [file, hash(relative(root, file).split(sep).join('/'))]),
  );
  const closure = (file, visited = new Set()) => {
    if (visited.has(file)) return visited;
    visited.add(file);
    for (const importedFile of imported.get(file) || []) closure(importedFile, visited);
    return visited;
  };
  const changed = new Map(),
    modules = new Map();
  for (const [file, content] of sources) {
    const components = Object.fromEntries(
      [...componentMaps.get(file)]
        .filter(([, target]) => ids.has(target))
        .map(([tag, target]) => [tag, [...closure(target)].map((item) => ids.get(item))]),
    );
    try {
      changed.set(
        file,
        instrumentWxml(content, {
          sourceId: ids.get(file),
          components,
          page: selected.has(file),
          modules,
        }),
      );
    } catch (error) {
      throw new Error(relative(root, file) + ': ' + error.message, { cause: error });
    }
  }
  // include 不保留被引用文件的 WXS 声明；引用者补齐模板闭包的专属辅助模块。
  for (const [file, content] of changed) {
    const definitions = textModules(
      new Map([...closure(file)].map((target) => [ids.get(target), modules.get(ids.get(target))])),
    );
    const at = content.indexOf('\n') + 1;
    changed.set(file, content.slice(0, at) + definitions + content.slice(at));
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (path) => !ignored.has(path.split(sep).at(-1)),
  });
  for (const [file, content] of changed)
    await writeFile(join(destination, relative(source, file)), content, 'utf8');
  return {
    output: destination,
    pages: [...pages],
    files: [...changed.keys()].map((file) => relative(root, file).split(sep).join('/')),
  };
}
