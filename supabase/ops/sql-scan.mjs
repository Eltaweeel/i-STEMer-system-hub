// Splits SQL into its top-level statements, skipping everything PostgreSQL itself treats as opaque at that level:
// '...' strings (with '' doubling), E'...' strings (with backslash escapes), "..." identifiers, $tag$...$tag$ bodies,
// -- line comments and nested /* */ comments. It exists to find transaction control BEFORE a migration runs; a
// PL/pgSQL `begin`/`end;` inside a dollar-quoted body is not a statement at this level and is not reported.
// Anything it cannot read with certainty (an unterminated quote, body or comment) is an error, never a guess.

export class SqlScanError extends Error {}

const DOLLAR_TAG = /^\$([A-Za-z_\u0080-￿][A-Za-z_0-9\u0080-￿]*)?\$/;

/** Returns each top-level statement with comments removed and whitespace collapsed, in lower case. */
export function topLevelStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  const n = sql.length;
  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim().toLowerCase();
    if (text) statements.push(text);
    current = '';
  };
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
      current += ' ';
    } else if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth += 1; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth -= 1; i += 2; }
        else i += 1;
      }
      if (depth > 0) throw new SqlScanError('unterminated block comment');
      current += ' ';
    } else if (c === "'" || ((c === 'e' || c === 'E') && next === "'" && !/[A-Za-z0-9_$]/.test(sql[i - 1] ?? ''))) {
      const escapes = c !== "'";
      i += escapes ? 2 : 1;
      let closed = false;
      while (i < n) {
        if (escapes && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i += 1; closed = true; break;
        }
        i += 1;
      }
      if (!closed) throw new SqlScanError('unterminated string literal');
      current += " '' ";
    } else if (c === '"') {
      i += 1;
      let closed = false;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          i += 1; closed = true; break;
        }
        i += 1;
      }
      if (!closed) throw new SqlScanError('unterminated quoted identifier');
      current += ' "x" ';
    } else if (c === '$' && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? '')) {
      const match = DOLLAR_TAG.exec(sql.slice(i));
      if (!match) { current += c; i += 1; continue; } // a positional parameter such as $1
      const tag = match[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) throw new SqlScanError('unterminated dollar-quoted body');
      i = end + tag.length;
      current += ' $body$ ';
    } else if (c === ';') {
      flush();
      i += 1;
    } else {
      current += c;
      i += 1;
    }
  }
  flush();
  return statements;
}

// Statements that start, end or partly undo a transaction. Inside the tool's own transaction any of these would
// either commit early, discard work, or let a later part run outside the transaction the ledger row belongs to.
const TRANSACTION_CONTROL = [
  /^(begin|start transaction|commit|end|rollback|abort|savepoint|release|prepare transaction)\b/,
  /^set (session characteristics as )?transaction\b/,
];

/** Throws unless the SQL holds no top-level transaction control. Returns the statements otherwise. */
export function assertNoTransactionControl(sql) {
  const statements = topLevelStatements(sql);
  for (const statement of statements) {
    if (TRANSACTION_CONTROL.some((pattern) => pattern.test(statement))) {
      throw new SqlScanError(`top-level transaction control is not allowed: ${statement.split(' ').slice(0, 3).join(' ')}`);
    }
  }
  return statements;
}
