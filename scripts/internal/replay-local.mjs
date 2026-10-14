import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_FILE_BYTES, parseRecording } from './replay-local/recording.mjs';

const assets = new URL('./replay-local/', import.meta.url);
export async function startReplayLocal({ port = 8771, file } = {}) {
  const rrweb = dirname(createRequire(import.meta.url).resolve('@rrweb/replay'));
  let recording;
  if (file) {
    if ((await stat(file)).size > MAX_FILE_BYTES) throw new Error('录制文件超过 8 MiB');
    recording = await readFile(file, 'utf8');
    parseRecording(recording);
  }
  const routes = new Map([
    ['/', [new URL('viewer.html', assets), 'text/html']],
    ['/viewer.mjs', [new URL('viewer.mjs', assets), 'text/javascript']],
    ['/recording.mjs', [new URL('recording.mjs', assets), 'text/javascript']],
    ['/viewer.css', [new URL('viewer.css', assets), 'text/css']],
    ['/rrweb.js', [resolve(rrweb, '../umd/replay.js'), 'text/javascript']],
    ['/rrweb.css', [resolve(rrweb, 'style.css'), 'text/css']],
  ]);
  const server = createServer(async (req, res) => {
    const address = server.address();
    const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-src 'self' blob:; base-uri 'none'; form-action 'none'",
    );
    if (
      !hosts.includes(req.headers.host) ||
      (req.headers.origin && !hosts.some((h) => req.headers.origin === 'http://' + h))
    ) {
      res.writeHead(403);
      res.end('只允许本机访问');
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('仅支持 GET');
      return;
    }
    if (req.url === '/recording.json') {
      res.writeHead(recording ? 200 : 204, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(recording);
      return;
    }
    const route = routes.get(req.url);
    if (!route) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    try {
      const body = await readFile(route[0]);
      res.writeHead(200, { 'Content-Type': route[1] + '; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end('本地资源读取失败，请检查依赖安装');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    options = {};
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--file' && args[i + 1]) options.file = resolve(args[++i]);
      else if (args[i] === '--port' && args[i + 1]) {
        options.port = Number(args[++i]);
        if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
          throw new Error('端口须为 1 至 65535');
      } else throw new Error('用法：yarn replay:local [--file 录制.json] [--port 8771]');
    }
    const server = await startReplayLocal(options);
    console.log(
      `本地回放验证：http://127.0.0.1:${server.address().port}/\n不上传 Sentry；Ctrl+C 停止。`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
