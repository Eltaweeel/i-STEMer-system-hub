import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topLevelStatements, assertNoTransactionControl, SqlScanError } from '../ops/sql-scan.mjs';

test('topLevelStatements: splits on top-level semicolons', () => {
  const result = topLevelStatements('select 1; select 2;');
  assert.deepEqual(result, ['select 1', 'select 2']);
});

test('topLevelStatements: ignores semicolons inside single-quoted strings', () => {
  const result = topLevelStatements("select 'a;b'; select 1;");
  assert.deepEqual(result, ["select ''", 'select 1']);
});

test('topLevelStatements: handles doubled single quotes for escaping', () => {
  const result = topLevelStatements("select 'a''b'; select 1;");
  assert.deepEqual(result, ["select ''", 'select 1']);
});

test('topLevelStatements: ignores semicolons inside E-string with escapes', () => {
  const result = topLevelStatements("select E'a\\;b'; select 1;");
  assert.deepEqual(result, ["select ''", 'select 1']);
});

test('topLevelStatements: ignores semicolons inside double-quoted identifiers', () => {
  const result = topLevelStatements('select "a;b"; select 1;');
  assert.deepEqual(result, ['select "x"', 'select 1']);
});

test('topLevelStatements: ignores semicolons inside dollar-quoted bodies', () => {
  const result = topLevelStatements('select $$a;b$$; select 1;');
  assert.deepEqual(result, ['select $body$', 'select 1']);
});

test('topLevelStatements: ignores semicolons inside tagged dollar-quoted bodies', () => {
  const result = topLevelStatements('select $tag$a;b$tag$; select 1;');
  assert.deepEqual(result, ['select $body$', 'select 1']);
});

test('topLevelStatements: handles nested different dollar tags', () => {
  const result = topLevelStatements('select $tag1$select $tag2$x$tag2$;$tag1$; select 1;');
  assert.deepEqual(result, ['select $body$', 'select 1']);
});

test('topLevelStatements: ignores semicolons inside line comments', () => {
  const result = topLevelStatements('select 1; -- comment;here\nselect 2;');
  assert.deepEqual(result, ['select 1', 'select 2']);
});

test('topLevelStatements: ignores semicolons inside nested block comments', () => {
  const result = topLevelStatements('select /* outer /* inner */ still outer; */ 1; select 2;');
  assert.deepEqual(result, ['select 1', 'select 2']);
});

test('topLevelStatements: collapses whitespace and lowercases', () => {
  const result = topLevelStatements('  SELECT   1  ;  ');
  assert.deepEqual(result, ['select 1']);
});

test('topLevelStatements: returns empty array for empty or whitespace-only input', () => {
  assert.deepEqual(topLevelStatements(''), []);
  assert.deepEqual(topLevelStatements('   '), []);
  assert.deepEqual(topLevelStatements('--comment'), []);
});

test('topLevelStatements: positional parameter $1 is not treated as dollar quote', () => {
  const result = topLevelStatements('select $1; select 1;');
  assert.deepEqual(result, ['select $1', 'select 1']);
});

test('topLevelStatements: positional parameter $99 is not treated as dollar quote', () => {
  const result = topLevelStatements('select $99; select 1;');
  assert.deepEqual(result, ['select $99', 'select 1']);
});

test('topLevelStatements: unterminated single-quoted string throws SqlScanError', () => {
  assert.throws(
    () => topLevelStatements("select 'unterminated"),
    (error) => error instanceof SqlScanError && error.message.includes('unterminated string')
  );
});

test('topLevelStatements: unterminated E-string throws SqlScanError', () => {
  assert.throws(
    () => topLevelStatements("select E'unterminated"),
    (error) => error instanceof SqlScanError && error.message.includes('unterminated string')
  );
});

test('topLevelStatements: unterminated double-quoted identifier throws SqlScanError', () => {
  assert.throws(
    () => topLevelStatements('select "unterminated'),
    (error) => error instanceof SqlScanError && error.message.includes('unterminated quoted identifier')
  );
});

test('topLevelStatements: unterminated dollar-quoted body throws SqlScanError', () => {
  assert.throws(
    () => topLevelStatements('select $$unterminated'),
    (error) => error instanceof SqlScanError && error.message.includes('unterminated dollar-quoted body')
  );
});

test('topLevelStatements: unterminated block comment throws SqlScanError', () => {
  assert.throws(
    () => topLevelStatements('select /* unterminated'),
    (error) => error instanceof SqlScanError && error.message.includes('unterminated block comment')
  );
});

test('assertNoTransactionControl: accepts empty SQL', () => {
  assert.doesNotThrow(() => assertNoTransactionControl(''));
  assert.doesNotThrow(() => assertNoTransactionControl('  '));
});

test('assertNoTransactionControl: rejects BEGIN', () => {
  assert.throws(
    () => assertNoTransactionControl('begin;'),
    (error) => error instanceof SqlScanError && error.message.includes('transaction control')
  );
});

test('assertNoTransactionControl: rejects BEGIN (uppercase)', () => {
  assert.throws(
    () => assertNoTransactionControl('BEGIN;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects START TRANSACTION', () => {
  assert.throws(
    () => assertNoTransactionControl('start transaction;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects COMMIT', () => {
  assert.throws(
    () => assertNoTransactionControl('commit;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects COMMIT AND CHAIN', () => {
  assert.throws(
    () => assertNoTransactionControl('commit and chain;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects COMMIT WORK', () => {
  assert.throws(
    () => assertNoTransactionControl('commit work;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects END', () => {
  assert.throws(
    () => assertNoTransactionControl('end;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects END TRANSACTION', () => {
  assert.throws(
    () => assertNoTransactionControl('end transaction;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects ROLLBACK', () => {
  assert.throws(
    () => assertNoTransactionControl('rollback;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects ROLLBACK TO SAVEPOINT', () => {
  assert.throws(
    () => assertNoTransactionControl('rollback to savepoint a;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects ABORT', () => {
  assert.throws(
    () => assertNoTransactionControl('abort;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects SAVEPOINT', () => {
  assert.throws(
    () => assertNoTransactionControl('savepoint a;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects RELEASE', () => {
  assert.throws(
    () => assertNoTransactionControl('release a;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects PREPARE TRANSACTION', () => {
  assert.throws(
    () => assertNoTransactionControl("prepare transaction 'x';"),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects SET TRANSACTION', () => {
  assert.throws(
    () => assertNoTransactionControl('set transaction isolation level serializable;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects SET SESSION CHARACTERISTICS AS TRANSACTION', () => {
  assert.throws(
    () => assertNoTransactionControl('set session characteristics as transaction read only;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects multiple statements with END after SELECT', () => {
  assert.throws(
    () => assertNoTransactionControl('create table t(i int);\nend;\nselect 1;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects END preceded by block comment', () => {
  assert.throws(
    () => assertNoTransactionControl('/* x */ end;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: rejects END preceded by line comment', () => {
  assert.throws(
    () => assertNoTransactionControl('-- c\nend;'),
    (error) => error instanceof SqlScanError
  );
});

test('assertNoTransactionControl: accepts plpgsql function body with begin/end in dollar quote', () => {
  const sql = 'create function f() returns void language plpgsql as $$ begin perform 1; end; $$;';
  assert.doesNotThrow(() => assertNoTransactionControl(sql));
});

test('assertNoTransactionControl: accepts DO block with begin/end', () => {
  const sql = 'do $$ begin perform 1; end; $$;';
  assert.doesNotThrow(() => assertNoTransactionControl(sql));
});

test('assertNoTransactionControl: accepts DO block with exception', () => {
  const sql = 'do $$ begin perform 1; exception when others then perform 2; end; $$;';
  assert.doesNotThrow(() => assertNoTransactionControl(sql));
});

test('assertNoTransactionControl: accepts quoted string containing end;', () => {
  assert.doesNotThrow(() => assertNoTransactionControl("select 'end;'"));
});

test('assertNoTransactionControl: accepts line comment ending with commit;', () => {
  assert.doesNotThrow(() => assertNoTransactionControl('select 1; -- commit;'));
});

test('assertNoTransactionControl: accepts dollar-quoted body containing commit;', () => {
  assert.doesNotThrow(() => assertNoTransactionControl("select $q$ commit; $q$"));
});

test('all migration files have no top-level transaction control', () => {
  const migrationDir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = readdirSync(migrationDir).filter((f) => f.endsWith('.sql'));
  assert.equal(files.length, 33, 'should have exactly 33 migration files');
  // The one applied migration written without a begin;/commit; envelope. The apply tool never runs it; its whole
  // text is scanned instead.
  const unenveloped = [];
  for (const file of files) {
    const content = readFileSync(join(migrationDir, file), 'utf8');
    const lines = content.split('\n');
    const beginIndex = lines.indexOf('begin;');
    const commitIndex = lines.indexOf('commit;');
    if (beginIndex < 0 && commitIndex < 0) {
      unenveloped.push(file);
      assert.doesNotThrow(() => assertNoTransactionControl(content), `${file}: no top-level transaction control`);
      continue;
    }
    assert.ok(beginIndex >= 0 && commitIndex > beginIndex, `${file}: begin; precedes commit;`);
    const body = lines.slice(beginIndex + 1, commitIndex).join('\n');
    assert.doesNotThrow(
      () => assertNoTransactionControl(body),
      `${file}: body should have no top-level transaction control`
    );
  }
  assert.deepEqual(unenveloped, ['20260915224433_mvp_security_hardening.sql']);
});
