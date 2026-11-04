import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const supervisor = fileURLToPath(new URL('./run-diagnosed.mjs', import.meta.url));
/** CI and CD use the same commands; CD's unconditional build validates its final tarball. */
export function runReleaseChecks(mode, execute = execFileSync) {
  const check = (name, seconds, script, ...args) =>
    execute(process.execPath, [supervisor, name, String(seconds), 'yarn', 'run', script, ...args], {
      stdio: 'inherit',
    });
  const testArgs = [
    '--maxWorkers=2',
    '--reporter=verbose',
    '--reporter=junit',
    '--outputFile.junit=diagnostics/tests/junit.xml',
  ];
  if (mode === 'node') {
    check('build', 240, 'build');
    check('tests', 480, 'test:shuffle', ...testArgs);
    return;
  }
  if (mode !== 'quality' && mode !== 'quality-fallback')
    throw new Error(`Unknown release checks: ${mode}`);
  check('lint', 120, 'lint');
  check('typecheck', 120, 'typecheck');
  if (mode === 'quality') check('build', 240, 'build');
  check('docs', 180, 'docs:build');
  check('miniapp', 180, 'build:miniapp');
  execute('git', ['diff', 'HEAD', '--exit-code'], { stdio: 'inherit' });
  check('tests', 480, 'test:coverage', ...testArgs);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runReleaseChecks(process.argv[2]);
}
