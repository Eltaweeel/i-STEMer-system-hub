#!/usr/bin/env node
// Lint gate: no component may hardcode a domain colour by named slot
// (e.g. --domain-2-core). Components read --domain-active-* after a
// subtree is scoped with data-domain-slot="N". The scope attribute assignment
// is the ONE allowed place a numeric slot appears.
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

// Matches --domain-1-core, --domain-4-wash, etc. (numeric-slot form only).
const pattern = /--domain-[1-8]-(core|tint|edge|wash|bloom)/g;

const violations = [];
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
  console.error(
    'Hardcoded per-slot domain colour reference detected. Scope with data-domain-slot="N" and read --domain-active-* instead.',
  );
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.tokens.join(', ')}`);
  }
  process.exit(1);
}

console.log('domain-hardcode check: ok');
