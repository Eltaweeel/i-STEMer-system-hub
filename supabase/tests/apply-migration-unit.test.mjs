import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { prepareMigration, assertVerifiedTls, clientConfig, assertPrivateFile, assertPlan, assertNoPgEnvironment, applyMigrations, applyQuarantine, preparePostcheck, PHASE_A, PHASE_B, MigrationRefused } from '../ops/apply-migration.mjs';

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

// Plans are judged on prepared files and steps, digests included (the tool pins the reviewed digests).
const filesOf = (plan) => Object.entries(plan.migrations).map(([version, sha]) => ({ version, sha256: sha }));
const stepOf = (pinned) => ({ fileName: pinned.fileName, sha256: pinned.sha256 });

test('assertPlan: accepts exactly the reviewed Phase B and Phase A', () => {
  assert.equal(assertPlan(filesOf(PHASE_B), stepOf(PHASE_B.postcheck), stepOf(PHASE_B.reopen)), PHASE_B);
  assert.equal(assertPlan(filesOf(PHASE_A), stepOf(PHASE_A.postcheck), null), PHASE_A);
});

test('assertPlan: refuses every incomplete, reordered, extended or unreviewed Phase B', () => {
  const six = filesOf(PHASE_B);
  const post = stepOf(PHASE_B.postcheck);
  const reopen = stepOf(PHASE_B.reopen);
  for (const [label, files, p, r] of [
    ['B1 alone', six.slice(0, 1), post, reopen],
    ['B1..B5', six.slice(0, 5), post, reopen],
    ['reversed', [...six].reverse(), post, reopen],
    ['plus Phase A', [...six, ...filesOf(PHASE_A)], post, reopen],
    ['edited B3', six.map((f, i) => (i === 2 ? { ...f, sha256: 'f'.repeat(64) } : f)), post, reopen],
    ['no post-check', six, null, reopen],
    ['Phase A post-check', six, stepOf(PHASE_A.postcheck), reopen],
    ['edited post-check', six, { ...post, sha256: '0'.repeat(64) }, reopen],
    ['no reopen', six, post, null],
    ['quarantine as reopen', six, post, stepOf(PHASE_B.quarantine)],
  ]) {
    assert.throws(() => assertPlan(files, p, r), MigrationRefused, label);
  }
});

test('assertPlan: refuses Phase A with an edited file, without its post-check, or with a reopen step', () => {
  const omar = filesOf(PHASE_A);
  assert.throws(() => assertPlan([{ ...omar[0], sha256: 'f'.repeat(64) }], stepOf(PHASE_A.postcheck), null), MigrationRefused);
  assert.throws(() => assertPlan(omar, null, null), MigrationRefused);
  assert.throws(() => assertPlan(omar, stepOf(PHASE_A.postcheck), stepOf(PHASE_B.reopen)), MigrationRefused);
});

test('assertPlan: leaves other versions alone, but never with a reopen step', () => {
  assert.equal(assertPlan([{ version: '20991231000000', sha256: 'a'.repeat(64) }], null, null), null);
  assert.throws(() => assertPlan([{ version: '20991231000000', sha256: 'a'.repeat(64) }], null, stepOf(PHASE_B.reopen)), MigrationRefused);
});

test('the pinned digests are the digests of the files in this repository', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const migrationFile = (version) => readdirSync(new URL('../migrations/', import.meta.url)).find((name) => name.startsWith(`${version}_`));
  for (const plan of [PHASE_A, PHASE_B]) {
    for (const [version, pinned] of Object.entries(plan.migrations)) assert.equal(sha256(read(`../migrations/${migrationFile(version)}`)), pinned, version);
    for (const step of [plan.postcheck, plan.reopen, plan.quarantine].filter(Boolean)) assert.equal(sha256(read(`../ops/${step.fileName}`)), step.sha256, step.fileName);
  }
});

test('assertNoPgEnvironment refuses any PG* variable and names it, never its value', () => {
  assert.doesNotThrow(() => assertNoPgEnvironment({ PATH: '/bin', HOME: '/h' }));
  for (const name of ['PGOPTIONS', 'PGPASSWORD', 'PGSSLNEGOTIATION', 'PGAPPNAME', 'pgHost']) {
    assert.throws(() => assertNoPgEnvironment({ [name]: 'secret-value' }),
      (e) => e instanceof MigrationRefused && e.message.includes(name) && !e.message.includes('secret-value'), name);
  }
});

test('clientConfig turns on TCP keepalive', () => {
  const config = clientConfig('postgresql://op@db.example.com/postgres?sslmode=verify-full&sslrootcert=/etc/ca.pem', () => '-----BEGIN CERTIFICATE-----');
  assert.equal(config.keepAlive, true);
});

// A scripted stand-in for pg.Client: answers the tool's queries like a healthy database, with one fault injected.
function fakeClient({ readBack = 'exact', warnOn = null } = {}) {
  const listeners = [];
  const sent = [];
  const notice = (message) => listeners.forEach((fn) => fn({ severity: 'WARNING', message }));
  return {
    sent,
    on(event, fn) { if (event === 'notice') listeners.push(fn); },
    off(event, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
    async query(sql, params = []) {
      sent.push(sql);
      if (sql.includes('apply-migration-probe')) { notice('apply-migration-probe'); return { rows: [] }; }
      if (warnOn && sql.includes(warnOn)) notice('injected warning');
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'version', data_type: 'text' }, { column_name: 'name', data_type: 'text' },
          { column_name: 'statements', data_type: 'ARRAY', udt_name: '_text' }] };
      }
      if (sql.includes('i.indisunique')) return { rows: [{ ok: true }] };
      if (sql.includes('pg_trigger')) return { rows: [{ triggers: 0, rules: 0 }] };
      if (sql.startsWith('select version from')) return { rows: [] };
      if (sql.includes('txid_current')) return { rows: [{ x: '1' }] };
      if (sql.includes('jsonb_agg(row_to_json(m)')) return { rows: [{ members: [], creators: [] }] };
      if (sql.startsWith('insert into supabase_migrations')) return { rowCount: 1, rows: [{ version: params[0], name: params[1], statements: params[2] }] };
      if (sql.startsWith('select version, name, statements')) {
        const statements = readBack === 'exact' ? [lastText] : ['something else'];
        return { rows: [{ version: params[0], name: 'probe', statements }] };
      }
      return { rows: [] };
    },
  };
}
let lastText = '';
const probeMigration = () => {
  const text = ['begin;', 'create table public.probe(id int);', 'commit;', ''].join(String.fromCharCode(10));
  lastText = text;
  return prepareMigration({ fileName: '20991231000000_probe.sql', text, expectedSha256: sha256(text) });
};

test('a ledger row that does not read back exactly as written is refused and rolled back', async () => {
  const ok = fakeClient();
  assert.deepEqual(await applyMigrations(ok, [probeMigration()]), { versions: ['20991231000000'], committed: true });
  const bad = fakeClient({ readBack: 'different' });
  await assert.rejects(applyMigrations(bad, [probeMigration()]), (e) => e instanceof MigrationRefused && /did not read back exactly/.test(e.message));
  assert.ok(bad.sent.includes('rollback') && !bad.sent.includes('commit'));
});

test('a WARNING during the ledger write is refused and rolled back', async () => {
  const warned = fakeClient({ warnOn: 'insert into supabase_migrations' });
  await assert.rejects(applyMigrations(warned, [probeMigration()]), (e) => e instanceof MigrationRefused && /ledger write for 20991231000000 raised WARNING/.test(e.message));
  assert.ok(warned.sent.includes('rollback') && !warned.sent.includes('commit'));
});

test('a WARNING during the post-check is refused and rolled back', async () => {
  const text = 'select 1;';
  const check = preparePostcheck({ fileName: 'probe-check.sql', text, expectedSha256: sha256(text) });
  const warned = fakeClient({ warnOn: 'select 1;' });
  await assert.rejects(applyMigrations(warned, [probeMigration()], { postcheck: check }), (e) => e instanceof MigrationRefused && /probe-check.sql raised WARNING/.test(e.message));
  assert.ok(warned.sent.includes('rollback') && !warned.sent.includes('commit'));
});

test('applyQuarantine accepts only the reviewed quarantine file', async () => {
  const text = 'revoke execute on function public.approve_agent_revision(uuid,uuid,text) from authenticated;';
  const other = preparePostcheck({ fileName: 'phase-b-quarantine.sql', text, expectedSha256: sha256(text) });
  await assert.rejects(applyQuarantine(fakeClient(), other), (e) => e instanceof MigrationRefused && /only the reviewed phase-b-quarantine.sql/.test(e.message));
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
