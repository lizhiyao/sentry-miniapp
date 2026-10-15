import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { instrumentWechatProject } from './project.mjs';

async function transform(files, options) {
  const directory = await mkdtemp(join(tmpdir(), 'sentry-replay-build-'));
  try {
    const input = join(directory, 'input');
    await mkdir(input);
    for (const [name, content] of files) {
      if (isAbsolute(name) || name.split(/[\\/]/).includes('..'))
        throw new Error('Replay build asset escapes output: ' + name);
      const path = join(input, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    const app = JSON.parse(await readFile(join(input, 'app.json'), 'utf8'));
    const pages = options.pages ?? [
      ...(app.pages || []),
      ...(app.subPackages || app.subpackages || []).flatMap((pkg) =>
        pkg.pages.map((page) => pkg.root + '/' + page),
      ),
    ];
    const result = await instrumentWechatProject({
      input,
      output: join(directory, 'output'),
      pages,
      framework: options.framework,
    });
    return new Map(
      await Promise.all(
        result.files.map(async (name) => [name, await readFile(join(result.output, name), 'utf8')]),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Webpack 的本轮资产是干净输入；只替换 WXML，不重写业务脚本及 Source Map。 */
export async function instrumentWechatAssets(assets, options = {}) {
  const files = new Map();
  for (const [name, asset] of Object.entries(assets))
    if (/\.(wxml|json|js)$/.test(name) && !name.startsWith('../')) files.set(name, asset.source());
  return transform(files, { ...options, framework: 'taro' });
}

/** uni-app / Vite 的每次 writeBundle（含 watch）完成后处理最终 WXML。 */
export function wechatReplayVitePlugin(options = {}) {
  let root, enabled;
  const previous = new Map();
  return {
    name: 'sentry-miniapp-wechat-replay',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      enabled = process.env.UNI_PLATFORM === 'mp-weixin';
      root = resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (!enabled) return;
        const files = new Map();
        const collect = async (folder) => {
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            const path = join(folder, entry.name);
            if (entry.isSymbolicLink()) throw new Error('Replay output cannot contain symlinks');
            if (entry.isDirectory()) await collect(path);
            else if (/\.(wxml|json|js)$/.test(entry.name)) {
              const name = relative(root, path).split(sep).join('/');
              const content = await readFile(path, 'utf8');
              const cached = previous.get(name);
              files.set(name, cached?.output === content ? cached.input : content);
            }
          }
        };
        await collect(root);
        const changed = await transform(files, options);
        for (const [name] of previous)
          if (files.has(name) && !changed.has(name))
            await writeFile(join(root, name), files.get(name));
        const next = new Map();
        for (const [name, content] of changed) {
          await writeFile(join(root, name), content);
          next.set(name, { input: files.get(name), output: content });
        }
        previous.clear();
        for (const [name, content] of next) previous.set(name, content);
      },
    },
  };
}
