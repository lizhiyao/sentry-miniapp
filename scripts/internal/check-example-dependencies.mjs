#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// This checks only the fixed overrides used by these examples, not npm's full
// override grammar or every copy of a package in the installed dependency tree.
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const versionPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?(?:\+[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?$/;

function requireExactVersion(value, label) {
  assert.equal(typeof value, 'string', `${label} must be an exact version string`);
  const match = versionPattern.exec(value);
  assert.ok(match, `${label} must be an exact version, received ${value}`);
  assert.ok(
    !match[1]?.split('.').some((part) => /^0\d+$/.test(part)),
    `${label} has an invalid numeric prerelease identifier: ${value}`,
  );
  return value;
}

function requirePackageName(name) {
  assert.ok(packageNamePattern.test(name), `Unsupported package name: ${name}`);
  return name;
}

async function installedPackage(requireFrom, name, expectedVersion, label) {
  requirePackageName(name);
  const manifestPath = requireFrom.resolve(`${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.name, name, `${label} resolved an unexpected package`);
  assert.equal(
    manifest.version,
    expectedVersion,
    `${label}: expected ${name}@${expectedVersion}, resolved ${name}@${manifest.version}`,
  );
  console.log(`${label}: ${manifest.name}@${manifest.version}`);
  return manifestPath;
}

async function main() {
  assert.equal(
    process.argv.length,
    3,
    'Usage: node scripts/internal/check-example-dependencies.mjs <example/package.json>',
  );
  const manifestPath = resolve(process.argv[2]);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const overrides = manifest.overrides;
  assert.ok(
    overrides && typeof overrides === 'object' && !Array.isArray(overrides),
    'Example manifest must declare a simple overrides object',
  );
  assert.ok(Object.keys(overrides).length > 0, 'Example overrides must not be empty');
  const requireFromExample = createRequire(manifestPath);
  let checks = 0;

  for (const [selector, override] of Object.entries(overrides)) {
    if (typeof override === 'string') {
      const name = requirePackageName(selector);
      assert.equal(
        override,
        `$${name}`,
        `${selector}: only a reference to the same direct devDependency is supported`,
      );
      const expectedVersion = requireExactVersion(
        manifest.devDependencies?.[name],
        `devDependencies.${name}`,
      );
      await installedPackage(requireFromExample, name, expectedVersion, 'Example dependency');
      checks += 1;
      continue;
    }

    assert.ok(
      override && typeof override === 'object' && !Array.isArray(override),
      `${selector}: unsupported override structure`,
    );
    const versionSeparator = selector.lastIndexOf('@');
    assert.ok(versionSeparator > 0, `${selector}: parent selector must include an exact version`);
    const parentName = requirePackageName(selector.slice(0, versionSeparator));
    const parentVersion = requireExactVersion(
      selector.slice(versionSeparator + 1),
      `${selector} parent version`,
    );
    assert.ok(Object.keys(override).length > 0, `${selector}: child overrides must not be empty`);
    const parentManifestPath = await installedPackage(
      requireFromExample,
      parentName,
      parentVersion,
      'Override parent',
    );
    const requireFromParent = createRequire(parentManifestPath);

    for (const [childName, childOverride] of Object.entries(override)) {
      requirePackageName(childName);
      const childVersion = requireExactVersion(childOverride, `${selector} -> ${childName}`);
      await installedPackage(requireFromParent, childName, childVersion, selector);
      checks += 1;
    }
  }

  console.log(`Verified ${checks} installed dependency overrides for ${manifest.name}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
