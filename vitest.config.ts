import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = __dirname;

export default defineConfig({
  // Route tests import Next.js server-component pages that use JSX without an
  // explicit `import React`. Use the automatic JSX runtime so those transform
  // cleanly under vitest without changing the app's runtime configuration.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    // Tests are either pure functions (contrast, projection, schema) or use
    // renderToStaticMarkup for server-side rendering. No test needs a real
    // DOM, so we stay in node — this is faster and avoids happy-dom's memory
    // pressure on Windows.
    environment: 'node',
    include: [
      'packages/**/__tests__/**/*.test.{ts,tsx}',
      'packages/**/*.test.{ts,tsx}',
      'apps/**/__tests__/**/*.test.{ts,tsx}',
      'apps/**/*.test.{ts,tsx}',
      'test-fixtures/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/.next/**', '**/out/**', '**/dist/**'],
    globals: false,
  },
  resolve: {
    alias: {
      '@bagos/contracts': path.resolve(root, 'packages/core/contracts/src/index.ts'),
      '@bagos/fixtures': path.resolve(root, 'packages/core/fixtures/src/index.ts'),
      '@bagos/organization': path.resolve(root, 'packages/core/organization/src/index.ts'),
      '@bagos/ui': path.resolve(root, 'packages/core/ui/src/index.ts'),
    },
  },
});
