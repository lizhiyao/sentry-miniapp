import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Release tags may point at a merged candidate, but never an unmerged branch. */
export function validateReleaseSource(directory, tag, expectedSha) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'sentry-miniapp');
  assert.equal(tag, `v${pkg.version}`);
  const version = readFileSync(resolve(directory, 'src/version.ts'), 'utf8');
  assert.equal(version.match(/SDK_VERSION\s*=\s*'([^']+)'/)?.[1], pkg.version);
  const sha = git('rev-parse', 'HEAD^{commit}');
  assert.equal(git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`), sha);
  if (expectedSha) assert.equal(sha, expectedSha);
  git('merge-base', '--is-ancestor', sha, 'refs/remotes/origin/master');
  git('diff', 'HEAD', '--exit-code');
  return { sha, tag, name: pkg.name, version: pkg.version };
}
