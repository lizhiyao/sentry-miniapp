import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const supervisor = resolve('scripts/internal/run-diagnosed.mjs');
const evidenceModule = '../scripts/internal/ci-evidence.mjs';
const { findCiEvidence } = await import(evidenceModule);

async function runProbe(source: string, seconds = '5', command = process.execPath) {
  const directory = await mkdtemp(join(tmpdir(), 'release-supervisor-test-'));
  try {
    let exitCode = 0;
    try {
      await exec(process.execPath, [supervisor, 'probe', seconds, command, '-e', source], {
        env: { ...process.env, DIAGNOSTICS_DIR: directory },
        timeout: 8000,
      });
    } catch (error) {
      exitCode = (error as { code: number }).code;
    }
    return {
      exitCode,
      result: JSON.parse(await readFile(join(directory, 'probe/result.json'), 'utf8')),
      output: await readFile(join(directory, 'probe/output.log'), 'utf8'),
      resources: await readFile(join(directory, 'probe/resources.log'), 'utf8'),
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe('CI process diagnostics', () => {
  it('preserves successful output and failure exit codes', async () => {
    const success = await runProbe('console.log("finished")');
    expect(success.exitCode).toBe(0);
    expect(success.output).toContain('finished');
    expect(success.resources).toMatch(/PID|spawnSync ps EPERM/);
    const failure = await runProbe('console.error("broken"); process.exit(7)');
    expect(failure.exitCode).toBe(7);
    expect(failure.result.reason).toBe('exit');
    expect(failure.output).toContain('broken');
  });

  it('kills a hung worker group and writes a timeout result', async () => {
    const result = await runProbe(
      `
      const { spawn } = require('node:child_process');
      process.on('SIGTERM', () => {});
      const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'inherit' });
      console.log('worker=' + child.pid);
      setInterval(() => {}, 1000);
    `,
      '0.5',
    );
    expect(result.exitCode).toBe(124);
    expect(result.result.reason).toBe('timeout');
    expect(result.result.elapsedMs).toBeLessThan(7000);
    const pid = Number(result.output.match(/worker=(\d+)/)?.[1]);
    expect(pid).toBeGreaterThan(0);
    // A reparented zombie has exited; it may briefly await init reaping on Linux.
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('ESRCH');
    }
    if (alive) {
      expect(await readFile(`/proc/${pid}/status`, 'utf8')).toMatch(/State:\s+Z/);
    }
  });

  it('records executable launch failures', async () => {
    const result = await runProbe('', '1', '/nonexistent-release-command');
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('ENOENT');
  });
});

const repo = { owner: 'owner', repo: 'sdk' };
const sha = 'release-sha';
const run = {
  id: 42,
  head_sha: sha,
  event: 'push',
  head_branch: 'master',
  path: '.github/workflows/ci.yml',
  status: 'completed',
  conclusion: 'success',
  head_repository: { full_name: 'owner/sdk' },
  run_attempt: 2,
  html_url: 'https://example.com/run/42',
};
const jobs = ['Quality (Node 24.x)', 'build-and-test (20.x)', 'build-and-test (22.x)'].map(
  (name) => ({ name, head_sha: sha, status: 'completed', conclusion: 'success' }),
);
function api(runs = [run], results = jobs) {
  const listWorkflowRuns = Symbol('runs');
  const listJobsForWorkflowRunAttempt = Symbol('jobs');
  return {
    rest: { actions: { listWorkflowRuns, listJobsForWorkflowRunAttempt } },
    paginate: async (method: symbol, args: Record<string, unknown>) => {
      if (method === listWorkflowRuns) {
        expect(args.head_sha).toBe(sha);
        expect(args.workflow_id).toBe('ci.yml');
        return runs;
      }
      expect(args.attempt_number).toBe(2);
      return results;
    },
  };
}

describe('release CI evidence', () => {
  it('accepts only complete exact-SHA CI and records the run attempt', async () => {
    expect(await findCiEvidence(api(), repo, sha)).toMatchObject({ sha, runId: 42, attempt: 2 });
  });
  it.each([
    { head_sha: 'ancestor' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { path: '.github/workflows/other.yml' },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { head_repository: { full_name: 'fork/sdk' } },
  ])('rejects untrusted or mismatched runs: %j', async (change) => {
    expect(await findCiEvidence(api([{ ...run, ...change }]), repo, sha)).toBeNull();
  });
  it.each(['skipped', 'failure', 'cancelled'])('rejects a %s required job', async (conclusion) => {
    expect(
      await findCiEvidence(api([run], [{ ...jobs[0], conclusion }, ...jobs.slice(1)]), repo, sha),
    ).toBeNull();
  });
  it('rejects missing jobs and a job at a different SHA', async () => {
    expect(await findCiEvidence(api([run], jobs.slice(1)), repo, sha)).toBeNull();
    expect(
      await findCiEvidence(
        api([run], [{ ...jobs[0], head_sha: 'other' }, ...jobs.slice(1)]),
        repo,
        sha,
      ),
    ).toBeNull();
  });
});

const publishModule = '../scripts/internal/publish-tarball.mjs';
const { publishTarball } = await import(publishModule);

describe('verified tarball publishing', () => {
  it.each(['404', 'identical', 'different', '503', 'network', 'tampered'])(
    'handles %s without rebuilding or unsafe retries',
    async (scenario) => {
      const directory = await mkdtemp(join(tmpdir(), 'release-publish-test-'));
      try {
        const bytes = Buffer.from('test tarball bytes');
        const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
        const filename = 'sentry-miniapp-1.2.3.tgz';
        await writeFile(join(directory, filename), scenario === 'tampered' ? 'changed' : bytes);
        await writeFile(
          join(directory, 'manifest.json'),
          JSON.stringify({ name: 'sentry-miniapp', version: '1.2.3', filename, integrity }),
        );
        const execute = vi.fn();
        const fetchMetadata = vi.fn(async () => {
          if (scenario === 'network') throw new Error('network unavailable');
          return {
            ok: ['identical', 'different'].includes(scenario),
            status: Number(scenario),
            json: async () => ({
              dist: { integrity: scenario === 'identical' ? integrity : 'other' },
            }),
          };
        });
        if (scenario === '404') {
          expect(await publishTarball(directory, { execute, fetchMetadata })).toBe('published');
          expect(execute).toHaveBeenCalledExactlyOnceWith(
            'npm',
            [
              'publish',
              join(directory, filename),
              '--ignore-scripts',
              '--access',
              'public',
              '--tag',
              'latest',
              '--registry=https://registry.npmjs.org',
            ],
            { stdio: 'inherit', timeout: 120_000 },
          );
        } else if (scenario === 'identical') {
          expect(await publishTarball(directory, { execute, fetchMetadata })).toBe(
            'already-published-identical',
          );
          expect(execute).not.toHaveBeenCalled();
        } else {
          await expect(publishTarball(directory, { execute, fetchMetadata })).rejects.toThrow();
          expect(execute).not.toHaveBeenCalled();
          await expect(readFile(join(directory, 'publish-result.json'))).rejects.toMatchObject({
            code: 'ENOENT',
          });
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
