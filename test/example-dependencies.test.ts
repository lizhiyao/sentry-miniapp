import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestContext } from 'vitest';

const checkScript = resolve(__dirname, '../scripts/internal/check-example-dependencies.mjs');
const parentName = '@dcloudio/uni-nvue-styler';
const parentVersion = '3.0.0-5020620260917001';

function writePackage(file: string, manifest: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(manifest), 'utf8');
}

function makeExample(
  installedPostcss: string,
  onTestFinished: TestContext['onTestFinished'],
): string {
  const directory = mkdtempSync(join(tmpdir(), 'sentry-miniapp-example-dependencies-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, 'package.json');
  writePackage(manifestPath, {
    name: 'example-dependency-check-fixture',
    devDependencies: { vite: '6.4.3' },
    overrides: {
      vite: '$vite',
      [`${parentName}@${parentVersion}`]: { postcss: '8.5.29' },
    },
  });
  writePackage(join(directory, 'node_modules/vite/package.json'), {
    name: 'vite',
    version: '6.4.3',
  });
  // A patched root copy must not hide the stale copy selected by the parent.
  writePackage(join(directory, 'node_modules/postcss/package.json'), {
    name: 'postcss',
    version: '8.5.29',
  });
  const parentDirectory = join(directory, 'node_modules', parentName);
  writePackage(join(parentDirectory, 'package.json'), {
    name: parentName,
    version: parentVersion,
    dependencies: { postcss: '8.5.6' },
  });
  writePackage(join(parentDirectory, 'node_modules/postcss/package.json'), {
    name: 'postcss',
    version: installedPostcss,
  });
  return manifestPath;
}

describe('installed example dependency overrides', () => {
  it.for([
    { installedPostcss: '8.5.6', expectedStatus: 1 },
    { installedPostcss: '8.5.29', expectedStatus: 0 },
  ])('checks the actual parent consumer with PostCSS $installedPostcss', (scenario, context) => {
    const manifestPath = makeExample(scenario.installedPostcss, context.onTestFinished);
    const result = spawnSync(process.execPath, [checkScript, manifestPath], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(scenario.expectedStatus);
    expect(result.stdout).toContain('Example dependency: vite@6.4.3');

    if (scenario.expectedStatus === 1) {
      expect(result.stderr).toContain('expected postcss@8.5.29, resolved postcss@8.5.6');
      expect(result.stdout).not.toContain('Verified');
    } else {
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`${parentName}@${parentVersion}: postcss@8.5.29`);
      expect(result.stdout).toContain('Verified 2 installed dependency overrides');
    }
  });
});
