import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareMigration, assertVerifiedTls, clientConfig, assertPrivateFile, assertPlan, preparePostcheck, PHASE_A, PHASE_B, MigrationRefused } from '../ops/apply-migration.mjs';

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
  const text = '-- comment\nbegin;\ncreate function f() returns void language plpgsql as $$ begin perform 1; end; $$;\ncommit;\n';
  const digest = sha256(text);
  const result = prepareMigration({ fileName, text, expectedSha256: digest });
  assert.equal(result.body, 'create function f() returns void language plpgsql as $$ begin perform 1; end; $$;');
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

test('clientConfig: returns correct configuration for valid URL', () => {
  const url = 'postgresql://op:pw%40x@db.example.com:5432/postgres?sslmode=verify-full&sslrootcert=/etc/ca.pem';
  const ca = '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----';
  const config = clientConfig(url, () => ca);
  assert.equal(config.host, 'db.example.com');
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'postgres');
  assert.equal(config.user, 'op');
  assert.equal(config.password, 'pw@x');
  assert.deepEqual(config.ssl, {
    ca,
    rejectUnauthorized: true,
    servername: 'db.example.com'
  });
});

test('clientConfig: refuses socket URL', () => {
  assert.throws(
    () => clientConfig('socket:/tmp/x?db=a&sslmode=verify-full&sslrootcert=/c'),
    MigrationRefused
  );
});

test('clientConfig: refuses http URL', () => {
  assert.throws(
    () => clientConfig('http://db.example.com/x?sslmode=verify-full&sslrootcert=/c'),
    MigrationRefused
  );
});

test('clientConfig: refuses IP address as host', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@127.0.0.1/db?sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses IPv6 address as host', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@[::1]/db?sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses socket path in hostname', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@/tmp/socket?sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses extra host parameter', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?host=/tmp&sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses options parameter', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?options=-c%20x&sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses sslnegotiation parameter', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?sslnegotiation=direct&sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses uselibpqcompat parameter', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?uselibpqcompat=true&sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses ssl parameter', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?ssl=1&sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses application_name parameter', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?application_name=x&sslmode=verify-full&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses sslmode=verify-ca', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?sslmode=verify-ca&sslrootcert=/c'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses relative sslrootcert path', () => {
  assert.throws(
    () => clientConfig('postgresql://u:secret@db.example.com/db?sslmode=verify-full&sslrootcert=ca.pem'),
    (error) => error instanceof MigrationRefused && !error.message.includes('secret')
  );
});

test('clientConfig: refuses missing user', () => {
  assert.throws(
    () => clientConfig('postgresql://:pw@db.example.com/db?sslmode=verify-full&sslrootcert=/c'),
    MigrationRefused
  );
});

test('clientConfig: refuses missing database', () => {
  assert.throws(
    () => clientConfig('postgresql://u:pw@db.example.com/?sslmode=verify-full&sslrootcert=/c'),
    MigrationRefused
  );
});

test('clientConfig: refuses CA reader returning text without BEGIN CERTIFICATE', () => {
  assert.throws(
    () => clientConfig('postgresql://u:pw@db.example.com/db?sslmode=verify-full&sslrootcert=/c', () => 'not a certificate'),
    MigrationRefused
  );
});

test('assertPrivateFile: passes for mode 0o100400 with matching uid', () => {
  const stat = { mode: 0o100400, uid: 1000 };
  assert.doesNotThrow(() => assertPrivateFile('test', stat, 1000));
});

test('assertPrivateFile: passes for mode 0o100600 with matching uid', () => {
  const stat = { mode: 0o100600, uid: 1000 };
  assert.doesNotThrow(() => assertPrivateFile('test', stat, 1000));
});

test('assertPrivateFile: refuses mode 0o100640', () => {
  const stat = { mode: 0o100640, uid: 1000 };
  assert.throws(
    () => assertPrivateFile('test', stat, 1000),
    MigrationRefused
  );
});

test('assertPrivateFile: refuses mode 0o100604', () => {
  const stat = { mode: 0o100604, uid: 1000 };
  assert.throws(
    () => assertPrivateFile('test', stat, 1000),
    MigrationRefused
  );
});

test('assertPrivateFile: refuses different uid', () => {
  const stat = { mode: 0o100400, uid: 1000 };
  assert.throws(
    () => assertPrivateFile('test', stat, 2000),
    MigrationRefused
  );
});

test('assertPlan: accepts PHASE_B versions with phase-b-postcheck', () => {
  assert.doesNotThrow(
    () => assertPlan(PHASE_B.versions, { fileName: 'phase-b-postcheck.sql' })
  );
});

test('assertPlan: refuses PHASE_B with only B1', () => {
  assert.throws(
    () => assertPlan(['20260921090000'], { fileName: 'phase-b-postcheck.sql' }),
    MigrationRefused
  );
});

test('assertPlan: refuses PHASE_B subset B1..B5', () => {
  assert.throws(
    () => assertPlan(['20260921090000', '20260921100000', '20260921110000', '20260921120000', '20260921130000'], { fileName: 'phase-b-postcheck.sql' }),
    MigrationRefused
  );
});

test('assertPlan: refuses PHASE_B out of order', () => {
  assert.throws(
    () => assertPlan([...PHASE_B.versions].reverse(), { fileName: 'phase-b-postcheck.sql' }),
    MigrationRefused
  );
});

test('assertPlan: refuses PHASE_B with extra version', () => {
  assert.throws(
    () => assertPlan([...PHASE_B.versions, '20261008120000'], { fileName: 'phase-b-postcheck.sql' }),
    MigrationRefused
  );
});

test('assertPlan: refuses PHASE_B without postcheck', () => {
  assert.throws(
    () => assertPlan(PHASE_B.versions, null),
    MigrationRefused
  );
});

test('assertPlan: refuses PHASE_B with PHASE_A postcheck', () => {
  assert.throws(
    () => assertPlan(PHASE_B.versions, { fileName: 'phase-a-postcheck.sql' }),
    MigrationRefused
  );
});

test('assertPlan: accepts PHASE_A versions with phase-a-postcheck', () => {
  assert.doesNotThrow(
    () => assertPlan(PHASE_A.versions, { fileName: 'phase-a-postcheck.sql' })
  );
});

test('assertPlan: refuses PHASE_A without postcheck', () => {
  assert.throws(
    () => assertPlan(PHASE_A.versions, null),
    MigrationRefused
  );
});

test('assertPlan: accepts non-reviewed versions with null postcheck', () => {
  assert.doesNotThrow(
    () => assertPlan(['20991231000000'], null)
  );
});

test('preparePostcheck: refuses postcheck with top-level commit', () => {
  const text = 'select 1; commit;';
  assert.throws(
    () => preparePostcheck({ fileName: 'postcheck.sql', text, expectedSha256: sha256(text) }),
    MigrationRefused
  );
});

test('preparePostcheck: refuses empty postcheck', () => {
  const text = '';
  assert.throws(
    () => preparePostcheck({ fileName: 'postcheck.sql', text, expectedSha256: sha256(text) }),
    MigrationRefused
  );
});

test('preparePostcheck: accepts DO block', () => {
  const text = 'do $$ begin perform 1; end; $$;';
  const digest = sha256(text);
  const result = preparePostcheck({ fileName: 'postcheck.sql', text, expectedSha256: digest });
  assert.equal(result.fileName, 'postcheck.sql');
  assert.equal(result.sha256, digest);
  assert.equal(result.text, text);
});
