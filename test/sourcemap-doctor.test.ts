import { describe, expect, it, onTestFinished } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const repoRoot = resolve(__dirname, '..');
const doctorScript = join(repoRoot, 'scripts/doctor-sourcemap.mjs');
const execFileAsync = promisify(execFile);

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentry-miniapp-sourcemap-doctor-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value), 'utf8');
}

async function runDoctor(args: string[]): Promise<{ status: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [doctorScript, ...args, '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return { status: 0, stdout: stdout.toString() };
  } catch (error) {
    const err = error as { code?: number | string; stdout?: Buffer | string };
    return {
      status: typeof err.code === 'number' ? err.code : 1,
      stdout: Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : (err.stdout ?? ''),
    };
  }
}

describe.concurrent('doctor-sourcemap', () => {
  it('passes a dist with matching js and source map', async () => {
    const dist = makeTempDir();
    writeFileSync(join(dist, 'app.js'), 'console.log("ok");\n//# sourceMappingURL=app.js.map\n');
    writeJson(join(dist, 'app.js.map'), {
      version: 3,
      file: 'app.js',
      sources: ['src/app.ts'],
      sourcesContent: ['console.log("ok");'],
      names: [],
      mappings: 'AAAA',
    });
    writeJson(join(dist, 'app.d.ts.map'), {
      version: 3,
      file: 'app.d.ts',
      sources: ['src/app.ts'],
      names: [],
      mappings: 'AAAA',
    });

    const result = await runDoctor(['--dist', dist, '--release', 'miniapp@1.0.0']);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.status).toBe('pass');
    expect(report.summary.dist).toMatchObject({
      jsFiles: 1,
      mapFiles: 1,
      ignoredDeclarationMaps: 1,
    });
  });

  it('warns but does not fail for hidden source maps without release', async () => {
    const dist = makeTempDir();
    writeFileSync(join(dist, 'app.js'), 'console.log("ok");\n');
    writeJson(join(dist, 'app.js.map'), {
      version: 3,
      file: 'app.js',
      sources: ['src/app.ts'],
      names: [],
      mappings: 'AAAA',
    });

    const result = await runDoctor(['--dist', dist]);
    const report = JSON.parse(result.stdout);
    const warningCodes = report.warnings.map((warning: { code: string }) => warning.code);
    const noticeCodes = report.notices.map((notice: { code: string }) => notice.code);

    expect(result.status).toBe(0);
    expect(report.status).toBe('warn');
    expect(warningCodes).toEqual(
      expect.arrayContaining(['missing_release', 'missing_sources_content']),
    );
    expect(noticeCodes).toContain('hidden_source_map');
  });

  it('fails invalid source map json', async () => {
    const dist = makeTempDir();
    writeFileSync(join(dist, 'app.js'), 'console.log("ok");\n//# sourceMappingURL=app.js.map\n');
    writeFileSync(join(dist, 'app.js.map'), '{ invalid json', 'utf8');

    const result = await runDoctor(['--dist', dist, '--release', 'miniapp@1.0.0']);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(report.status).toBe('fail');
    expect(report.errors.map((item: { code: string }) => item.code)).toContain('invalid_map_json');
  });

  it('checks whether wechat outer maps can match build maps', async () => {
    const root = makeTempDir();
    const wechat = join(root, 'appservice.app.js.map');
    const buildMaps = join(root, 'build');
    mkdirSync(join(buildMaps, 'pages/index'), { recursive: true });

    writeJson(wechat, {
      version: 3,
      file: 'appservice.app.js',
      sources: ['webpack://pages/index/index.js'],
      sourcesContent: ['Page({});'],
      names: [],
      mappings: 'AAAA',
    });
    writeJson(join(buildMaps, 'pages/index/index.js.map'), {
      version: 3,
      file: 'pages/index/index.js',
      sources: ['src/pages/index.ts'],
      sourcesContent: ['Page({});'],
      names: [],
      mappings: 'AAAA',
    });

    const result = await runDoctor([
      '--wechat',
      wechat,
      '--build-maps',
      buildMaps,
      '--strip',
      'webpack://',
      '--release',
      'miniapp@1.0.0',
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.summary.wechat.merge).toMatchObject({
      total: 1,
      matched: 1,
      unmatched: 0,
      ambiguous: 0,
    });
    expect(report.errors).toHaveLength(0);
  });

  it('accepts a WeChat minigame game.js outer map and matches the Cocos build map', async () => {
    const root = makeTempDir();
    const wechat = join(root, 'wechat-online', 'game.js.map');
    const buildMaps = join(root, 'cocos-build');
    mkdirSync(join(root, 'wechat-online'), { recursive: true });
    mkdirSync(buildMaps, { recursive: true });

    writeJson(wechat, {
      version: 3,
      file: 'game.js',
      sources: ['game.js'],
      sourcesContent: ['compiled Cocos game code'],
      names: [],
      mappings: 'AAAA',
    });
    writeJson(join(buildMaps, 'game.js.map'), {
      version: 3,
      file: 'game.js',
      sources: ['assets/SdkDemoPanel.ts'],
      sourcesContent: ['throw new Error("Source Map test");'],
      names: [],
      mappings: 'AAAA',
    });

    const result = await runDoctor([
      '--wechat',
      wechat,
      '--build-maps',
      buildMaps,
      '--release',
      'minigame@1.0.0',
    ]);
    const report = JSON.parse(result.stdout);
    const warningCodes = report.warnings.map((warning: { code: string }) => warning.code);

    expect(result.status).toBe(0);
    expect(report.summary.wechat).toMatchObject({ outputFile: 'game.js', sources: 1 });
    expect(report.summary.wechat.merge).toMatchObject({
      total: 1,
      matched: 1,
      unmatched: 0,
      ambiguous: 0,
    });
    expect(warningCodes).not.toContain('wechat_map_file_unexpected');
    expect(report.suggestions).toContain(
      '需要把微信真机 appservice.app.js / game.js 解析到源码时，运行 scripts/merge-sourcemap.mjs 合成微信线上 map 与框架 / 引擎 map，再以 --url-prefix "app:///" 上传。',
    );
  });

  it('does not assume a game.js map in dist mode is a WeChat outer map', async () => {
    const dist = makeTempDir();
    writeFileSync(join(dist, 'game.js'), 'throw new Error("test");\n');
    writeJson(join(dist, 'game.js.map'), {
      version: 3,
      file: 'game.js',
      sources: ['assets/SdkDemoPanel.ts'],
      sourcesContent: ['throw new Error("test");'],
      names: [],
      mappings: 'AAAA',
    });

    const result = await runDoctor(['--dist', dist, '--release', 'minigame@1.0.0']);
    const report = JSON.parse(result.stdout);
    const notice = report.notices.find(
      (item: { code: string }) => item.code === 'wechat_appservice_map',
    );

    expect(result.status).toBe(0);
    expect(notice).toBeUndefined();
  });
});
