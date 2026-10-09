import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareMigration, assertVerifiedTls, MigrationRefused } from '../ops/apply-migration.mjs';

// Helper to compute SHA256 digest
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

test('prepareMigration: accepts a valid migration file', () => {
  const fileName = '20261008120000_omar_research_usage_command.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const digest = sha256(text);
  const result = prepareMigration({ fileName, text, expectedSha256: digest });
  assert.equal(result.version, '20261008120000');
  assert.equal(result.name, 'omar_research_usage_command');
  assert.equal(result.sha256, digest);
  assert.equal(result.body, 'select 1;');
});

test('prepareMigration: accepts body with plpgsql lines', () => {
  const fileName = '20261008120000_test_plpgsql.sql';
  const text = '-- comment\nbegin;\n  begin\n    select 1;\n  end $$;\ncommit;\n';
  const digest = sha256(text);
  const result = prepareMigration({ fileName, text, expectedSha256: digest });
  assert.equal(result.body, '  begin\n    select 1;\n  end $$;');
});

test('prepareMigration: refuses wrong digest (64 hex but different)', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const wrongDigest = 'a'.repeat(64);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: wrongDigest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses digest not 64 lowercase hex', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: 'invalid' }),
    MigrationRefused
  );
});

test('prepareMigration: refuses digest with uppercase hex', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const badDigest = 'A'.repeat(64);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: badDigest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses file name not matching pattern (x.sql)', () => {
  const fileName = 'x.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses file name with only 13 digits', () => {
  const fileName = '2026100812000_a.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses file name with uppercase in name', () => {
  const fileName = '20261008120000_A.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses file with CRLF line endings', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\r\nbegin;\r\nselect 1;\r\ncommit;\r\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses two top-level begin; lines', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\nbegin;\nselect 1;\nbegin;\ncommit;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses missing commit;', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\nbegin;\nselect 1;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses non-comment statement before begin;', () => {
  const fileName = '20261008120000_test.sql';
  const text = 'select 1;\nbegin;\nselect 2;\ncommit;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses non-comment statement after commit;', () => {
  const fileName = '20261008120000_test.sql';
  const text = 'begin;\nselect 1;\ncommit;\nselect 2;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: refuses commit; before begin;', () => {
  const fileName = '20261008120000_test.sql';
  const text = 'commit;\nselect 1;\nbegin;\nselect 2;\n';
  const digest = sha256(text);
  assert.throws(
    () => prepareMigration({ fileName, text, expectedSha256: digest }),
    MigrationRefused
  );
});

test('prepareMigration: wrong digest error message contains actual digest', () => {
  const fileName = '20261008120000_test.sql';
  const text = '-- comment\nbegin;\nselect 1;\ncommit;\n';
  const actualDigest = sha256(text);
  const wrongDigest = 'b'.repeat(64);
  try {
    prepareMigration({ fileName, text, expectedSha256: wrongDigest });
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof MigrationRefused);
    assert.ok(error.message.includes(actualDigest));
  }
});

test('assertVerifiedTls: accepts verify-full with sslrootcert', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=verify-full&sslrootcert=/etc/x/ca.crt';
  assert.doesNotThrow(() => assertVerifiedTls(connectionString));
});

test('assertVerifiedTls: refuses missing sslmode', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslrootcert=/etc/x/ca.crt';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: refuses sslmode=require', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=require';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: refuses sslmode=verify-ca', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=verify-ca';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: refuses sslmode=disable', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=disable';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: refuses duplicate sslmode with different values', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=verify-full&sslmode=disable';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: refuses ssl= parameter alongside verify-full', () => {
  const connectionString = 'postgresql://u:p@db.example.com:5432/postgres?sslmode=verify-full&ssl=0';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: refuses non-URL string', () => {
  const connectionString = 'not a url at all';
  assert.throws(
    () => assertVerifiedTls(connectionString),
    MigrationRefused
  );
});

test('assertVerifiedTls: no refusal message echoes the credentials', () => {
  for (const query of ['sslrootcert=/etc/x/ca.crt', 'sslmode=require', 'sslmode=verify-ca', 'sslmode=disable',
    'sslmode=verify-full&sslmode=disable', 'sslmode=verify-full&ssl=0']) {
    assert.throws(() => assertVerifiedTls(`postgresql://u:p@db.example.com:5432/postgres?${query}`),
      (error) => error instanceof MigrationRefused && !error.message.includes('u:p'), query);
  }
});

test('assertVerifiedTls: error message for invalid URL does not contain credentials', () => {
  const connectionString = 'postgres://secretuser:secretpass@db.com/db';
  try {
    assertVerifiedTls(connectionString);
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof MigrationRefused);
    assert.ok(!error.message.includes('secretuser'));
    assert.ok(!error.message.includes('secretpass'));
  }
});

test('assertVerifiedTls: refuses a missing sslrootcert and any options= parameter', () => {
  for (const query of ['sslmode=verify-full', 'sslmode=verify-full&sslrootcert=/etc/x/ca.crt&options=-c%20client_min_messages%3Derror']) {
    assert.throws(() => assertVerifiedTls(`postgresql://u:p@db.example.com:5432/postgres?${query}`),
      (error) => error instanceof MigrationRefused && !error.message.includes('u:p'), query);
  }
});

test('prepareMigration: keeps the whole reviewed text for the ledger row', () => {
  const text = ['-- comment', 'begin;', 'select 1;', 'commit;', ''].join(String.fromCharCode(10));
  const prepared = prepareMigration({ fileName: '20261008120000_omar_research_usage_command.sql', text, expectedSha256: sha256(text) });
  assert.equal(prepared.text, text);
});
