import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { frameEvents, projectFrame } from '../../src/replay/frame';
// @ts-expect-error 开发工具 JS 不属于 SDK 的公共声明。
import { parseRecording, MAX_FILE_BYTES } from '../../scripts/internal/replay-local/recording.mjs';
// @ts-expect-error Node-only 本地开发服务。
import { startReplayLocal } from '../../scripts/internal/replay-local.mjs';

const folders: string[] = [];
function httpRead(url: string, method = 'GET', headers = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>(
    (resolve, reject) => {
      request(url, { method, headers }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({ status: response.statusCode!, headers: response.headers, body }),
        );
        response.on('error', reject);
      })
        .on('error', reject)
        .end();
    },
  );
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
function sample() {
  const replayId = 'a'.repeat(32),
    errorId = 'b'.repeat(32);
  const events = frameEvents(
    projectFrame(
      [
        { width: 375, height: 700 },
        [
          {
            left: 10,
            top: 10,
            width: 100,
            height: 30,
            dataset: {
              sentryReplayType: 'text',
              sentryReplayText: '本地实际投影',
              sentryReplayUnmask: true,
            },
          },
        ],
      ],
      'pages/local/index',
      20,
    )!,
    1000,
  );
  return {
    schema: 'sentry-miniapp-local-replay',
    version: 1,
    mode: 'local',
    segments: [0, 2].map((segmentId) => ({
      replayId,
      segmentId,
      recording:
        JSON.stringify({ segment_id: segmentId }) +
        '\n' +
        JSON.stringify(
          events.map((event) => ({ ...event, timestamp: event.timestamp + segmentId * 1000 })),
        ),
      metadata: { errorIds: [errorId], urls: ['https://miniapp.invalid/pages/local/index'] },
    })),
    errors: [{ eventId: errorId, replayId }],
    summary: { droppedSegments: 1 },
  };
}
describe('本地录制导入与只读服务器', () => {
  it('按 Replay ID 与实际段时间组织录制，保留缺段提示、错误归属及兼容事件文件', () => {
    const report = sample();
    const extra = structuredClone(report.segments[0]);
    extra.replayId = 'c'.repeat(32);
    report.segments.unshift(extra);
    const parsed = parseRecording(JSON.stringify(report));
    expect(parsed.replays.map((r: { id: string }) => r.id)).toEqual([
      'c'.repeat(32),
      'a'.repeat(32),
    ]);
    expect(parsed.replays[1].segmentStarts).toEqual([
      { id: 0, time: 0 },
      { id: 2, time: 2000 },
    ]);
    expect(parsed.replays[1].errorIds).toEqual(['b'.repeat(32)]);
    expect(parsed.droppedSegments).toBe(1);
    const events = JSON.parse(report.segments[0].recording.split('\n')[1]);
    expect(parseRecording(JSON.stringify({ events })).replays[0].events).toEqual(events);
  });
  it('损坏 JSON、重复或错配分段、缺失首帧、超量及倒序事件均不能伪装为有效录制', () => {
    expect(() => parseRecording('{')).toThrow('有效 JSON');
    const report = sample();
    report.segments.push(report.segments[0]);
    expect(() => parseRecording(JSON.stringify(report))).toThrow('重复分段');
    const mismatch = sample();
    mismatch.segments[0].segmentId = 3;
    expect(() => parseRecording(JSON.stringify(mismatch))).toThrow('编号');
    expect(() =>
      parseRecording(
        JSON.stringify([
          { type: 4, timestamp: 2, data: { width: 1, height: 1 } },
          { type: 4, timestamp: 3, data: { width: 1, height: 1 } },
        ]),
      ),
    ).toThrow('首帧');
    expect(() => parseRecording(' '.repeat(MAX_FILE_BYTES + 1))).toThrow('8 MiB');
    const events = JSON.parse(sample().segments[0].recording.split('\n')[1]);
    events[0].timestamp = 2000;
    expect(() => parseRecording(JSON.stringify(events))).toThrow('时间顺序');
  });
  it('实际 HTTP 只服务本机固定资源，离线加载官方播放器，不提供上传或任意文件读取', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'replay-local-test-'));
    folders.push(folder);
    const file = join(folder, 'report.json');
    await writeFile(file, JSON.stringify(sample()));
    const server = await startReplayLocal({ port: 0, file });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      for (const route of [
        '/',
        '/viewer.mjs',
        '/recording.mjs',
        '/viewer.css',
        '/rrweb.js',
        '/rrweb.css',
        '/recording.json',
      ]) {
        const response = await httpRead(base + route);
        expect(response.status).toBe(200);
        expect(response.headers['content-security-policy']).toContain("connect-src 'self'");
        expect(response.body).not.toHaveLength(0);
      }
      expect((await httpRead(base + '/recording.json')).headers['cache-control']).toBe('no-store');
      expect((await httpRead(base + '/upload', 'POST')).status).toBe(405);
      expect((await httpRead(base + '/package.json')).status).toBe(404);
      expect((await httpRead(base, 'GET', { host: 'example.com' })).status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
  });
});
