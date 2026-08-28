import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Keep spies and Vitest-managed globals isolated between tests.
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    include: ['{src,test}/**/__tests__/**/*.ts', '{src,test}/**/*.{spec,test}.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 99.2,
        branches: 95.75,
        functions: 99.3,
        lines: 99.2,
      },
    },
  },
});
