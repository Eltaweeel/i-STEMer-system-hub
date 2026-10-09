// Splits SQL into its top-level statements, skipping everything PostgreSQL itself treats as opaque at that level:
// '...' strings (with '' doubling), E'...' strings (with backslash escapes), "..." identifiers, $tag$...$tag$ bodies,
// -- line comments and nested /* */ comments. It exists to find transaction control BEFORE a migration runs; a
// PL/pgSQL `begin`/`end;` inside a dollar-quoted body is not a statement at this level and is not reported.
//
// It reads tokens the way PostgreSQL's lexer does where that matters: an identifier is consumed whole (letters,
// digits, '_', '$' and every non-ASCII character continue it), so 'é$tag$' is an identifier, never the start of a
// dollar quote. It assumes standard_conforming_strings = on (backslashes are ordinary in '...'), which the apply tool
// forces for its transaction; a statement that changes that setting is refused. Where it cannot be sure PostgreSQL
// would open a quoted section, it reads on as top-level SQL, so an error can only refuse too much, never too little.
// Anything it cannot read with certainty (an unterminated quote, body or comment) is an error, never a guess.

export class SqlScanError extends Error {}

const IDENT_START = /[A-Za-z_\u0080-￿]/;
const IDENT_CONT = /[A-Za-z0-9_$\u0080-￿]/;
const DOLLAR_TAG = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;

/** Reads a '...' (escapes=false) or E'...' (escapes=true) literal starting at the quote; returns the index after it. */
function readString(sql, quoteIndex, escapes) {
  let i = quoteIndex + 1;
  while (i < sql.length) {
    if (escapes && sql[i] === '\\') { i += 2; continue; }
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") { i += 2; continue; }
      return i + 1;
    }
    i += 1;
  }
  throw new SqlScanError('unterminated string literal');
}

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
    } else if (IDENT_START.test(c)) {
      let end = i + 1;
      while (end < n && IDENT_CONT.test(sql[end])) end += 1;
      const word = sql.slice(i, end);
      if ((word === 'e' || word === 'E') && sql[end] === "'") {
        // E'...' strings are refused at the top level: in them a backslash escapes a quote, and PostgreSQL continues
        // that mode across a line break into a following '...', which this scan does not follow. None of the reviewed
        // files uses one (inside function bodies they are opaque and allowed).
        throw new SqlScanError("E'' strings are not accepted at the top level");
      } else {
        current += word;
        i = end;
      }
    } else if (c === "'") {
      i = readString(sql, i, false);
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
    } else if (c === '$' && !/[0-9]/.test(sql[i - 1] ?? '')) {
      // Identifiers (which may contain '$') were consumed whole above, so a '$' here starts a token of its own:
      // a dollar quote, or a positional parameter such as $1. After a digit PostgreSQL rejects the text anyway.
      const match = DOLLAR_TAG.exec(sql.slice(i));
      if (!match) { current += c; i += 1; continue; }
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

// Statements that start, end or partly undo a transaction, or change how this scanner's reading of later statements
// would match PostgreSQL's. Inside the tool's own transaction any of these could commit early, discard work, or let a
// later part run outside the transaction the ledger row belongs to.
const REFUSED = [
  /^(begin|start transaction|commit|end|rollback|abort|savepoint|release|prepare transaction)\b/,
  /^set (session characteristics as )?transaction\b/,
  /^(set|reset)\b.*\bstandard_conforming_strings\b/,
  // A quoted setting name ("standard_conforming_strings") hides which setting it is from this scan.
  /^(set|reset)( session| local)? "x"/,
  // Settings that change how later text is decoded, or whether WARNINGs reach the tool.
  /^(set|reset)( session| local)? (client_encoding|names|client_min_messages)\b/,
  /^reset all\b/,
];
// Not detectable here: set_config('standard_conforming_strings', ...) and similar function calls. The apply tool
// therefore re-asserts the settings it relies on before every SQL text it sends; that, not this list, is the guard.

/** Throws unless the SQL holds no top-level transaction control. Returns the statements otherwise. */
export function assertNoTransactionControl(sql) {
  const statements = topLevelStatements(sql);
  for (const statement of statements) {
    if (REFUSED.some((pattern) => pattern.test(statement))) {
      throw new SqlScanError(`top-level transaction control is not allowed: ${statement.split(' ').slice(0, 3).join(' ')}`);
    }
  }
  return statements;
}
