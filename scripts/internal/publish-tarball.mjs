#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pathToFileURL } from 'node:url';

export async function publishTarball(
  directory,
  { fetchMetadata = fetch, execute = execFileSync } = {},
) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.name, 'sentry-miniapp');
  assert.equal(manifest.filename, `${manifest.name}-${manifest.version}.tgz`);
  const tarball = resolve(directory, manifest.filename);
  const integrity = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
  assert.equal(integrity, manifest.integrity, 'Release tarball changed after validation');
  const registry = 'https://registry.npmjs.org';
  const response = await fetchMetadata(
    `${registry}/${manifest.name}/${encodeURIComponent(manifest.version)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  let status;
  if (response.ok) {
    const published = await response.json();
    assert.equal(
      published.dist?.integrity,
      integrity,
      'Version already exists with different package bytes; refusing to claim release success',
    );
    status = 'already-published-identical';
  } else {
    assert.equal(response.status, 404, `Registry lookup failed: ${response.status}`);
    execute(
      'npm',
      [
        'publish',
        tarball,
        '--ignore-scripts',
        '--access',
        'public',
        '--tag',
        manifest.version.includes('-') ? 'next' : 'latest',
        `--registry=${registry}`,
      ],
      { stdio: 'inherit', timeout: 120_000 },
    );
    status = 'published';
  }
  writeFileSync(
    resolve(directory, 'publish-result.json'),
    JSON.stringify({ status, integrity }, null, 2),
  );
  console.log(status);

  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publishTarball(resolve('release-package'));
}
