import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Banned tokens: tenant vocabulary that must never leak into packages/core.
// Case-insensitive, matched only at WORD BOUNDARIES so generic vocabulary
// (e.g. `parentToChildren`, `relationshipToParent`) does not trigger.
// CamelCase and PascalCase boundaries count as word boundaries.
export const BANNED_TOKENS = [
  'i-STEMer',
  'STEMer',
  'Deputy',
  'PrismIQ',
  'Atlas',
  'Hadeer',
  'Hermes',
  'academy',
  'student',
  'parent',
  'school',
  'Marketing Agent',
  'Social Agent',
  'Designer Agent',
] as const;

// Explicit, reviewed allowlist. The Batch 1 spec requires unavoidable
// generic words be allowed only through a reviewed allowlist, one line of
// justification each. Only add entries with a real, concrete justification.
export interface AllowlistEntry {
  readonly identifier: string;
  readonly justification: string;
}
export const IDENTIFIER_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    identifier: 'parentToChildren',
    justification: 'Standard tree-projection variable name; not a reference to a student\'s parent.',
  },
  {
    identifier: 'childToParent',
    justification: 'Standard tree-projection variable name.',
  },
  {
    identifier: 'relationshipToParent',
    justification: 'Field on TreeNode describing the accessible sentence for the incoming edge.',
  },
];
const ALLOWED_IDENTIFIERS = new Set(IDENTIFIER_ALLOWLIST.map((e) => e.identifier));

export interface Violation {
  readonly file: string;
  readonly token: string;
  readonly line: number;
  readonly excerpt: string;
}

const SKIP = /(^|[\\/])(node_modules|\.next|out|dist|__tests__)([\\/]|$)/;
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|scss|md|json)$/;

function walk(dir: string, files: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (SKIP.test(full)) continue;
    if (e.isDirectory()) walk(full, files);
    else if (EXT.test(e.name)) files.push(full);
  }
  return files;
}

// Escape a string for use inside a regex.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a regex that matches `token` only when surrounded by word boundaries
// where a word is [A-Za-z0-9] AND camelCase / PascalCase transitions also
// count as boundaries. Example: `parent` matches in `the parent of`, in
// `parent-of`, in `ParentTree` (Pascal-boundary before `Parent`), but NOT
// in `parentToChildren` because the character after `parent` is `T` (an
// upper-case letter following a lower-case letter = a camelCase boundary),
// which by itself is fine — but the character AFTER that ('o') means
// `parent` is followed by `To`, and `parent` sits inside the larger
// identifier `parentToChildren`. We treat that whole identifier as one
// word for the purposes of matching and consult the allowlist instead.
//
// Implementation strategy: split the source into "identifiers" (runs of
// [A-Za-z0-9_-]) plus other text, then for each identifier decide whether
// it *is* (or contains, at a camelCase segment boundary) a standalone
// occurrence of the banned token.
const IDENTIFIER_RE = /[A-Za-z][A-Za-z0-9]*/g;

// Split a camelCase / PascalCase identifier into its constituent words.
// snake_case and kebab-case are handled by the caller (we only receive
// identifiers already split on non-alphanumeric chars).
function splitCamel(identifier: string): string[] {
  // Insert a space before each upper-case letter that follows a lower-case
  // letter, and before each upper-case letter that precedes a lower-case
  // letter and follows another upper-case letter (handles acronyms).
  const spaced = identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return spaced.split(' ').filter((s) => s.length > 0);
}

interface FoundToken {
  readonly token: string;
  readonly enclosingIdentifier: string | null; // null if matched outside an identifier
}

// Scan a single line for banned-token occurrences honouring word boundaries
// and the identifier allowlist. Banned tokens fall into three shapes and each
// is matched differently:
//   1) contains a space or a non-alphanumeric (e.g. "Marketing Agent",
//      "i-STEMer") — matched as a whole phrase with word boundaries around it.
//   2) single mixed-case identifier (e.g. "PrismIQ", "Hadeer", "STEMer") —
//      matched as a whole identifier, case-insensitively. The identifier
//      allowlist can still permit a specific occurrence.
//   3) single all-lowercase generic word (e.g. "parent", "student") — matched
//      against each camelCase segment of each identifier on the line. This is
//      the case where the allowlist matters most.
function scanLine(line: string, tokens: readonly string[]): FoundToken[] {
  const results: FoundToken[] = [];
  const identsInLine = line.match(IDENTIFIER_RE) ?? [];

  for (const token of tokens) {
    const hasSpace = /\s/.test(token);
    const hasNonAlnum = /[^A-Za-z0-9]/.test(token);
    const isAllLower =
      !hasSpace && !hasNonAlnum && token === token.toLowerCase();

    if (hasSpace || hasNonAlnum) {
      // Category 1 — whole-phrase, word-boundary match.
      const re = new RegExp(
        `(?<![A-Za-z0-9])${escapeRegex(token)}(?![A-Za-z0-9])`,
        'i',
      );
      if (re.test(line)) {
        results.push({ token, enclosingIdentifier: null });
      }
      continue;
    }

    if (!isAllLower) {
      // Category 2 — whole-identifier, case-insensitive match.
      const lowerToken = token.toLowerCase();
      for (const ident of identsInLine) {
        if (ident.toLowerCase() !== lowerToken) continue;
        if (!ALLOWED_IDENTIFIERS.has(ident)) {
          results.push({ token, enclosingIdentifier: ident });
        }
      }
      continue;
    }

    // Category 3 — generic word, split identifiers on camelCase boundaries.
    const lowerToken = token.toLowerCase();
    for (const ident of identsInLine) {
      const parts = splitCamel(ident).map((p) => p.toLowerCase());
      if (!parts.includes(lowerToken)) continue;
      if (!ALLOWED_IDENTIFIERS.has(ident)) {
        results.push({ token, enclosingIdentifier: ident });
      }
    }
  }

  return results;
}

export function scanForTenantLeakage(
  rootDir: string,
  tokens: readonly string[] = BANNED_TOKENS,
): Violation[] {
  const results: Violation[] = [];
  try {
    statSync(rootDir);
  } catch {
    return results;
  }
  const files = walk(rootDir);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (raw === undefined) continue;
      const found = scanLine(raw, tokens);
      for (const f of found) {
        results.push({
          file: relative(process.cwd(), file),
          token: f.token,
          line: i + 1,
          excerpt: raw.trim(),
        });
      }
    }
  }
  return results;
}

// Direct-string variant used by the "prove the scanner works" test.
export function scanStringForTenantLeakage(
  source: string,
  tokens: readonly string[] = BANNED_TOKENS,
): string[] {
  const found: string[] = [];
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    for (const hit of scanLine(line, tokens)) {
      if (!found.includes(hit.token)) found.push(hit.token);
    }
  }
  return found;
}
