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
        statements: 98.5,
        branches: 95,
        functions: 99,
        lines: 98.5,
      },
    },
  },
});
