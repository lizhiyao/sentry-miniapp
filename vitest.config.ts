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
      // Vitest 4 uses AST-aware V8 remapping, so preserve its measured baseline.
      thresholds: {
        statements: 98.7,
        branches: 93.4,
        functions: 98.7,
        lines: 99.3,
      },
    },
  },
});
