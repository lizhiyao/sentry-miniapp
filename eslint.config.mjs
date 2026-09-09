import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

const lintFiles = ['src/**/*.{ts,js,mjs}', 'test/**/*.{ts,js,mjs}', 'scripts/**/*.{ts,js,mjs}'];

export default defineConfig([
  {
    name: 'sentry-miniapp/files',
    files: lintFiles,
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    name: 'sentry-miniapp/rules',
    files: lintFiles,
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]);
