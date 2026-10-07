// Bundles the standalone worker into one CommonJS file for the VPS (no Next.js runtime needed).
// `server-only` guards the Next.js app against client bundling; in this Node process it is
// intentionally replaced by an empty module at build time, because a runtime flag cannot undo
// an inlined module that throws on import.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');

await build({
  entryPoints: [resolve(here, 'research-worker-main.ts')],
  outfile: resolve(app, 'dist/research-worker.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  tsconfig: resolve(app, 'tsconfig.json'),
  logLevel: 'info',
  plugins: [{
    name: 'neutralize-server-only',
    setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty-server-only' }));
      b.onLoad({ filter: /.*/, namespace: 'empty-server-only' }, () => ({ contents: '', loader: 'js' }));
    },
  }],
});
