#!/usr/bin/env node
// A process deadline shorter than the Actions job deadline leaves time to upload evidence.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [label, seconds, command, ...args] = process.argv.slice(2);
if (!label || !/^[\w-]+$/.test(label) || !(Number(seconds) > 0) || !command) {
  throw new Error('Usage: run-diagnosed.mjs <label> <seconds> <command> [args...]');
}
const directory = resolve(process.env.DIAGNOSTICS_DIR || 'diagnostics', label);
mkdirSync(directory, { recursive: true });
const started = Date.now();
const log = (file, data) => appendFileSync(resolve(directory, file), data);
function snapshot() {
  log('resources.log', `\n${new Date().toISOString()}\n`);
  for (const [cmd, argv] of [
    ['ps', ['-axo', 'pid,ppid,pgid,stat,etime,%cpu,rss,command']],
    ['sh', ['-c', 'cat /proc/meminfo /sys/fs/cgroup/memory.events 2>/dev/null || true']],
  ]) {
    const result = spawnSync(cmd, argv, {
      encoding: 'utf8',
      timeout: 2000,
      maxBuffer: 4 * 1024 * 1024,
    });
    log('resources.log', result.stdout || result.error?.message || '');
  }
}
const child = spawn(command, args, {
  detached: true,
  env: { ...process.env, DIAGNOSTICS_DIR: resolve(process.env.DIAGNOSTICS_DIR || 'diagnostics') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of ['stdout', 'stderr'])
  child[stream].on('data', (data) => {
    log('output.log', data);
    process[stream].write(data);
  });
let reason = 'exit';
let killTimer;
function signalGroup(signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function stop(cause) {
  if (reason !== 'exit') return;
  reason = cause;
  snapshot();
  signalGroup('SIGTERM');
  killTimer = setTimeout(() => signalGroup('SIGKILL'), 2000);
}
const deadline = setTimeout(() => stop('timeout'), Number(seconds) * 1000);
const sampler = setInterval(snapshot, 15000);
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
snapshot();
child.on('error', (error) => log('output.log', `${error.stack}\n`));
child.on('close', (code, signal) => {
  clearTimeout(deadline);
  clearInterval(sampler);
  clearTimeout(killTimer);
  snapshot();
  signalGroup('SIGKILL');
  const exitCode = reason === 'timeout' ? 124 : reason !== 'exit' ? 143 : (code ?? 1);
  writeFileSync(
    resolve(directory, 'result.json'),
    JSON.stringify(
      { label, command, args, reason, code, signal, exitCode, elapsedMs: Date.now() - started },
      null,
      2,
    ),
  );
  process.exitCode = exitCode;
});
