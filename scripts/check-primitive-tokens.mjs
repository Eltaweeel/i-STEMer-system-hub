#!/usr/bin/env node
// Lint gate: components must not reference tier-1 primitive tokens (--p-*).
// Only the token file itself and the contrast test are permitted to reference them.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

const ALLOWED = new Set([
  join('packages', 'core', 'ui', 'src', 'tokens.css'),
]);

const SEARCH_ROOTS = [
  join('packages', 'core', 'ui', 'src'),
  join('apps', 'istemer-demo', 'app'),
  join('apps', 'istemer-demo', 'components'),
];

const EXT_ALLOW = /\.(css|tsx|ts|jsx|js|scss)$/;
const SKIP_DIR = /(^|[\\/])(node_modules|\.next|out|dist|__tests__)([\\/]|$)/;

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (SKIP_DIR.test(full)) continue;
    if (e.isDirectory()) walk(full, files);
    else if (EXT_ALLOW.test(e.name)) files.push(full);
  }
  return files;
}

const violations = [];
const pattern = /--p-[a-zA-Z0-9-]+/g;

for (const searchRoot of SEARCH_ROOTS) {
  const abs = join(ROOT, searchRoot);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file).split(sep).join(sep);
    if (ALLOWED.has(rel)) continue;
    const content = readFileSync(file, 'utf8');
    const matches = content.match(pattern);
    if (matches) {
      violations.push({ file: rel, tokens: [...new Set(matches)] });
    }
  }
}

if (violations.length > 0) {
  console.error('Primitive-token leakage detected. Components must consume tier-2/tier-3 tokens only.');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.tokens.join(', ')}`);
  }
  process.exit(1);
}

console.log('primitive-token check: ok');
