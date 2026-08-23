// -----------------------------------------------------------------------------
// Guards that prove themselves.
//
// (1) The tenant-leakage scanner is a real function. We call it against
//     synthetic input to prove it fires on banned tokens, and against the real
//     packages/core tree to prove it stays clean. Word-boundary and camelCase
//     handling is asserted directly.
//
// (2) The dependency-cruiser rule "core-must-not-import-apps" cannot be
//     asserted from inside a unit test — a real boundary violation would have
//     to exist in-tree to observe it fire, which would defeat the purpose of
//     the guard. The reproduction procedure is documented here so a reviewer
//     can run it manually:
//
//         Step 1 — create a probe file at
//             packages/core/contracts/src/__probe.ts
//         with contents:
//             import '../../../../apps/istemer-demo/tenant/tenant.config';
//         Step 2 — from the repository root, run:
//             npx depcruise --config .dependency-cruiser.cjs packages
//         Step 3 — depcruise should exit non-zero and print an
//             `error core-must-not-import-apps` line referencing the probe.
//         Step 4 — delete the probe file.
//
//     Do not check the probe into the working tree. The rule's effectiveness
//     is proven at review time, not by a test in this file.
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  BANNED_TOKENS,
  IDENTIFIER_ALLOWLIST,
  scanForTenantLeakage,
  scanStringForTenantLeakage,
} from './leakage-scanner';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = resolve(HERE, '..');

describe('tenant-leakage scanner: fires on real leaks', () => {
  it('fires when a banned token appears as a standalone identifier', () => {
    const synthetic = `
      // fictional core file that mentions Hadeer inline
      export const owner = 'Hadeer';
    `;
    const found = scanStringForTenantLeakage(synthetic);
    expect(found).toContain('Hadeer');
  });

  it('is case-insensitive across all banned tokens (in an isolated position)', () => {
    for (const t of BANNED_TOKENS) {
      const upper = scanStringForTenantLeakage(`prefix ${t.toUpperCase()} suffix`);
      const lower = scanStringForTenantLeakage(`prefix ${t.toLowerCase()} suffix`);
      expect(upper).toContain(t);
      expect(lower).toContain(t);
    }
  });

  it('detects multiple banned tokens together', () => {
    const synthetic = 'PrismIQ Atlas academy student — all tenant vocabulary';
    const found = scanStringForTenantLeakage(synthetic);
    expect(found).toEqual(expect.arrayContaining(['PrismIQ', 'Atlas', 'academy', 'student']));
  });

  it('fires when a banned token stands alone even next to punctuation', () => {
    for (const line of [
      `const parent = 'x';`,
      `const student;`,
      `// student —`,
      `<school>`,
    ]) {
      const found = scanStringForTenantLeakage(line);
      expect(found.length).toBeGreaterThan(0);
    }
  });
});

describe('tenant-leakage scanner: word-boundary and camelCase safety', () => {
  it('does NOT fire on `parentToChildren` (allowlisted camelCase identifier)', () => {
    const found = scanStringForTenantLeakage('const parentToChildren = new Map();');
    expect(found).not.toContain('parent');
  });

  it('does NOT fire on `childToParent` (allowlisted camelCase identifier)', () => {
    const found = scanStringForTenantLeakage('const childToParent = new Map();');
    expect(found).not.toContain('parent');
  });

  it('does NOT fire on `relationshipToParent` (allowlisted camelCase identifier)', () => {
    const found = scanStringForTenantLeakage('readonly relationshipToParent: string | null;');
    expect(found).not.toContain('parent');
  });

  it('DOES fire on the standalone word `parent` right next to a non-allowlisted identifier', () => {
    const found = scanStringForTenantLeakage('const parent = someValue;');
    expect(found).toContain('parent');
  });

  it('DOES fire on `parent` inside a non-allowlisted camelCase identifier', () => {
    // If a real leak like `studentParentEmail` ever appears, the scanner must
    // catch it: the identifier is not on the allowlist, and `parent` is a
    // camelCase segment.
    const found = scanStringForTenantLeakage('const studentParentEmail = x;');
    expect(found).toEqual(expect.arrayContaining(['parent', 'student']));
  });

  it('exposes an allowlist with a justification for every entry', () => {
    for (const entry of IDENTIFIER_ALLOWLIST) {
      expect(entry.identifier.length).toBeGreaterThan(0);
      expect(entry.justification.length).toBeGreaterThan(10);
    }
  });
});

describe('tenant-leakage scanner: clean on real packages/core', () => {
  it('returns no violations', () => {
    const violations = scanForTenantLeakage(CORE_ROOT);
    if (violations.length > 0) {
      const rendered = violations
        .map((v) => `  ${v.file}:${v.line}  [${v.token}]  ${v.excerpt}`)
        .join('\n');
      throw new Error(`Tenant-token leakage found in core:\n${rendered}`);
    }
    expect(violations).toEqual([]);
  });
});
