import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const isShallow = () =>
  execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() === 'true';

// VitePress 的页面更新时间和 sitemap lastmod 都依赖每个文件的 Git 历史。
if (existsSync(new URL('../../.git', import.meta.url)) && isShallow()) {
  console.log('Fetching Git history for documentation timestamps...');
  execFileSync('git', ['fetch', '--unshallow', '--no-tags'], {
    cwd: root,
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (isShallow()) {
    throw new Error('Documentation build requires complete Git history for accurate timestamps.');
  }
}
