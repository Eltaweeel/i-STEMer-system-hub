// Flat ESLint config. Two rules matter beyond baseline:
//   1. `no-restricted-syntax` bans wall-clock reads in core and the app.
//   2. `@typescript-eslint` runs across our TypeScript.
// The tenant-token/domain-hardcode checks live in scripts/, not here, because
// ESLint does not read CSS.

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const wallClockBan = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Wall-clock read forbidden. Use the injected Clock port or FIXTURE_NOW/offsetMinutes from @bagos/fixtures.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Argument-less `new Date()` is a wall-clock read. Use the injected Clock port or FIXTURE_NOW.',
  },
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/dist/**',
      'docs/reference/**',
      'apps/istemer-demo/data/agents/**',
      'scripts/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-restricted-syntax': ['error', ...wallClockBan],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts', '**/__tests__/**/*.tsx'],
    rules: {
      // Tests may need to demonstrate the wall-clock ban firing on synthetic input;
      // they do that by scanning strings, not by calling the banned APIs themselves.
      // Left strict to catch accidental drift.
      'no-console': 'off',
    },
  },
];
