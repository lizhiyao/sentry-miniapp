import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

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

const sourceModule = '../scripts/internal/release-source.mjs';
const checksModule = '../scripts/internal/release-checks.mjs';
const { validateReleaseSource } = await import(sourceModule);
const { runReleaseChecks } = await import(checksModule);
const { findReleaseEvidence } = await import(evidenceModule);

describe('release source identity', () => {
  it.each([
    'lightweight',
    'annotated',
    'candidate',
    'unmerged',
    'moved-tag',
    'wrong-version',
    'dirty',
    'different-sha',
  ])('validates %s using real Git history', async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), 'release-source-'));
    const git = async (...args: string[]) =>
      (await exec('git', args, { cwd: directory })).stdout.trim();
    try {
      await git('init');
      await git('config', 'user.email', 'test@example.invalid');
      await git('config', 'user.name', 'release-test');
      await exec(process.execPath, ['-e', 'require("fs").mkdirSync("src")'], { cwd: directory });
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({ name: 'sentry-miniapp', version: '1.2.3' }),
      );
      await writeFile(join(directory, 'src/version.ts'), "export const SDK_VERSION = '1.2.3';");
      await git('add', '.');
      await git('commit', '-m', 'candidate');
      const candidate = await git('rev-parse', 'HEAD');
      await git('update-ref', 'refs/remotes/origin/master', candidate);
      if (scenario === 'annotated') await git('tag', '-a', 'v1.2.3', '-m', 'release');
      else await git('tag', 'v1.2.3');
      if (scenario === 'candidate') {
        await git('commit', '--allow-empty', '-m', 'later master');
        await git('update-ref', 'refs/remotes/origin/master', await git('rev-parse', 'HEAD'));
        await git('checkout', candidate);
      }
      if (scenario === 'unmerged' || scenario === 'moved-tag') {
        await git('commit', '--allow-empty', '-m', 'unmerged');
        if (scenario === 'unmerged') await git('tag', '-f', 'v1.2.3');
      }
      if (scenario === 'wrong-version')
        await writeFile(join(directory, 'src/version.ts'), "export const SDK_VERSION = '9.9.9';");
      if (scenario === 'dirty')
        await writeFile(
          join(directory, 'package.json'),
          JSON.stringify({ name: 'sentry-miniapp', version: '1.2.3', description: 'modified' }),
        );
      const actualCandidate = scenario === 'unmerged' ? await git('rev-parse', 'HEAD') : candidate;
      const check = () =>
        validateReleaseSource(
          directory,
          'v1.2.3',
          scenario === 'different-sha' ? 'other' : actualCandidate,
        );
      if (['lightweight', 'annotated', 'candidate'].includes(scenario))
        expect(check()).toMatchObject({ sha: candidate, tag: 'v1.2.3' });
      else expect(check).toThrow();
      expect(() => validateReleaseSource(directory, 'v9.9.9')).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('independent release evidence groups', () => {
  function groupedApi(frameworks: 'success' | 'missing' | 'error' | 'partial' = 'success') {
    const runsMethod = Symbol('runs'),
      jobsMethod = Symbol('jobs');
    return {
      rest: {
        actions: { listWorkflowRuns: runsMethod, listJobsForWorkflowRunAttempt: jobsMethod },
      },
      paginate: async (method: symbol, args: Record<string, unknown>) => {
        if (method === runsMethod) {
          expect(args.head_sha).toBe(sha);
          if (args.workflow_id === 'ci.yml') return [run];
          if (frameworks === 'error') throw new Error('API denied');
          if (frameworks === 'missing') return [];
          return [{ ...run, id: 43, path: '.github/workflows/framework-examples.yml' }];
        }
        expect(args.attempt_number).toBe(2);
        if (args.run_id === 42) return jobs;
        return [
          'Build Taro example',
          ...(frameworks === 'partial' ? [] : ['Build uni-app example']),
        ].map((name) => ({ name, head_sha: sha, status: 'completed', conclusion: 'success' }));
      },
    };
  }
  it.each(['success', 'missing', 'error', 'partial'] as const)(
    'framework evidence %s cannot skip its fallback',
    async (state) => {
      const groups = await findReleaseEvidence(groupedApi(state), repo, sha);
      expect(groups.ci.reused).toBe(true);
      expect(groups.frameworks.reused).toBe(state === 'success');
      if (state === 'error') expect(groups.frameworks.reason).toContain('API denied');
    },
  );
  it('does not accept an absent attempt or combine jobs from another attempt', async () => {
    expect(await findCiEvidence(api([{ ...run, run_attempt: 0 }]), repo, sha)).toBeNull();
    const missing = api([run], jobs.slice(1));
    expect(await findCiEvidence(missing, repo, sha)).toBeNull();
  });
});

describe('shared release checks', () => {
  it.each(['quality', 'quality-fallback', 'node'])(
    'runs %s and stops at the first failed command',
    (mode) => {
      const completed: string[][] = [];
      runReleaseChecks(mode, (_command: string, args: string[]) => {
        completed.push(args);
      });
      const scriptNames = completed.filter((args) => args[0] === supervisor).map((args) => args[5]);
      expect(scriptNames).toContain(mode === 'node' ? 'test:shuffle' : 'test:coverage');
      if (mode === 'quality-fallback') expect(scriptNames).not.toContain('build');
      else expect(scriptNames).toContain('build');
      if (mode !== 'node')
        expect(scriptNames).toEqual(
          expect.arrayContaining(['lint', 'typecheck', 'docs:build', 'build:miniapp']),
        );
      for (let failAt = 0; failAt < completed.length; failAt++) {
        let calls = 0;
        expect(() =>
          runReleaseChecks(mode, () => {
            if (calls++ === failAt) throw new Error('failed check');
          }),
        ).toThrow('failed check');
        expect(calls).toBe(failAt + 1);
      }
    },
  );
  it('rejects unknown check modes before launching anything', () => {
    const execute = vi.fn();
    expect(() => runReleaseChecks('unknown', execute)).toThrow('Unknown release checks');
    expect(execute).not.toHaveBeenCalled();
  });
});

// Parse the actual workflow: these assertions protect the release dependency graph.
const { load: loadYaml } = createRequire(import.meta.url)('js-yaml');
const publishWorkflow = loadYaml(await readFile('.github/workflows/publish.yml', 'utf8'));
const ciWorkflow = loadYaml(await readFile('.github/workflows/ci.yml', 'utf8'));
const frameworksWorkflow = loadYaml(
  await readFile('.github/workflows/framework-examples.yml', 'utf8'),
);

describe('publish workflow gates', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'requires exactly the necessary fallback groups (core=%s, frameworks=%s)',
    (ci, frameworks) => {
      const expression = publishWorkflow.jobs.publish.if
        .replace(/^\$\{\{/, '')
        .replace(/\}\}$/, '')
        .replace(/needs\.([a-z-]+)/g, (_: string, key: string) => `needs['${key}']`);
      const check = (
        nodeResult: string,
        frameworkResult: string,
        planResult = 'success',
        cancelled = false,
      ) =>
        runInNewContext(expression, {
          always: () => true,
          cancelled: () => cancelled,
          needs: {
            plan: {
              result: planResult,
              outputs: { ci: String(ci), frameworks: String(frameworks) },
            },
            'fallback-nodes': { result: nodeResult },
            'fallback-frameworks': { result: frameworkResult },
          },
        });
      const nodeOK = ci ? 'skipped' : 'success';
      const frameworkOK = frameworks ? 'skipped' : 'success';
      expect(check(nodeOK, frameworkOK)).toBe(true);
      expect(check(nodeOK, frameworkOK, 'failure')).toBe(false);
      expect(check(nodeOK, frameworkOK, 'success', true)).toBe(false);
      for (const failed of ['failure', 'cancelled', 'skipped']) {
        if (!ci) expect(check(failed, frameworkOK)).toBe(false);
        if (!frameworks) expect(check(nodeOK, failed)).toBe(false);
      }
    },
  );
  it('pins fallback and publishing to the validated SHA, retaining shared recipes and tarball verification', () => {
    const {
      plan,
      publish,
      'fallback-nodes': nodes,
      'fallback-frameworks': frameworks,
    } = publishWorkflow.jobs;
    expect(publish.needs).toEqual(
      expect.arrayContaining(['plan', 'fallback-nodes', 'fallback-frameworks']),
    );
    expect(nodes.strategy.matrix['node-version']).toEqual(['20.x', '22.x']);
    expect(nodes.if).toContain("ci != 'true'");
    expect(frameworks.if).toContain("frameworks != 'true'");
    expect(frameworks.uses).toBe('./.github/workflows/framework-examples.yml');
    for (const job of [nodes, publish]) {
      expect(
        job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/checkout@')).with
          .ref,
      ).toBe('${{ needs.plan.outputs.sha }}');
    }
    expect(frameworks.with.ref).toBe('${{ needs.plan.outputs.sha }}');
    expect(frameworksWorkflow.on.push).toEqual({ branches: ['master'] });
    expect(frameworksWorkflow.on.workflow_call.inputs.ref.required).toBe(true);
    expect(frameworksWorkflow.jobs.build.steps[0].with.ref).toContain('inputs.ref');
    expect(
      ciWorkflow.jobs.quality.steps.some(
        (s: { run?: string }) => s.run === 'node scripts/internal/release-checks.mjs quality',
      ),
    ).toBe(true);
    expect(
      ciWorkflow.jobs['build-and-test'].steps.some(
        (s: { run?: string }) => s.run === 'node scripts/internal/release-checks.mjs node',
      ),
    ).toBe(true);
    expect(
      nodes.steps.some(
        (s: { run?: string }) => s.run === 'node scripts/internal/release-checks.mjs node',
      ),
    ).toBe(true);
    const steps = publish.steps;
    const quality = steps.find(
      (s: { name?: string }) => s.name === 'Run shared fallback quality checks',
    );
    expect(quality.run).toBe('node scripts/internal/release-checks.mjs quality-fallback');
    expect(quality.if).toContain("ci != 'true'");
    for (const name of [
      'Build release once',
      'Pack release',
      'Install and validate exact release tarball',
      'Recheck release identity',
      'Publish exact verified tarball',
    ]) {
      const step = steps.find((s: { name?: string }) => s.name === name);
      expect(step).toBeDefined();
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).toBeUndefined();
    }
    expect(
      steps.find((s: { name?: string }) => s.name === 'Install and validate exact release tarball')
        .run,
    ).toContain('check-package-consumers.mjs "release-package/$TARBALL"');
    expect(
      steps.find((s: { name?: string }) => s.name === 'Publish exact verified tarball').run,
    ).toContain('sha256sum --check');
    const source = plan.steps.find((s: { id?: string }) => s.id === 'source');
    expect(source['continue-on-error']).toBeUndefined();
    expect(source.run).toContain('validateReleaseSource');
  });
  it.each(['valid', 'failure', 'invalid-json', 'invalid-shape'])(
    'query %s produces conservative independent fallback decisions',
    async (scenario) => {
      const directory = await mkdtemp(join(tmpdir(), 'release-decision-'));
      try {
        await exec(process.execPath, ['-e', 'require("fs").mkdirSync("release-package")'], {
          cwd: directory,
        });
        await writeFile(
          join(directory, 'release-package/ci-evidence.json'),
          scenario === 'invalid-json'
            ? '{'
            : JSON.stringify(
                scenario === 'invalid-shape'
                  ? {}
                  : { ci: { reused: true }, frameworks: { reused: false } },
              ),
        );
        const step = publishWorkflow.jobs.plan.steps.find(
          (s: { id?: string }) => s.id === 'decision',
        );
        const code = step.run.split("<<'NODE'\n")[1].split('\nNODE')[0];
        const output = join(directory, 'output');
        await exec(process.execPath, ['--input-type=module', '-e', code], {
          cwd: directory,
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            QUERY_OUTCOME: scenario === 'failure' ? 'failure' : 'success',
          },
        });
        expect(await readFile(output, 'utf8')).toBe(
          `ci=${scenario === 'valid'}\nframeworks=false\n`,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
