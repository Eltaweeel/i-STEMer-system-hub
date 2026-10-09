// Rehearses the pending migrations on real PostgreSQL 17.6 as a NON-superuser postgres (see hosted-pg.mjs).
// These results are separate from the PGlite suites, which run as a superuser and cannot see these failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { migrationNames } from './migration-inventory.mjs';
import { applyRecorded, catalogSnapshot, readMigration, startHostedLikeCluster } from './hosted-pg.mjs';
import { applyMigration, MigrationRefused, prepareMigration } from '../ops/apply-migration.mjs';

const LEDGER_HEAD = '20260921080000';
const applied = migrationNames.filter((name) => name.slice(0, 14) <= LEDGER_HEAD);
const pendingSix = migrationNames.filter((name) => name.slice(0, 14) > LEDGER_HEAD && name.slice(0, 14) < '20261008120000');
const OMAR = '20261008120000_omar_research_usage_command.sql';
const unrepaired = (name) => readFileSync(new URL(`./fixtures/unrepaired/${name}`, import.meta.url), 'utf8');

async function withCluster(options, run) {
  const cluster = await startHostedLikeCluster(options);
  try {
    // History is replayed as it was applied; its warnings are recorded, not judged (see the auth test below).
    await applyRecorded(cluster.owner, applied, { failOnWarning: false });
    cluster.owner.historyWarnings = cluster.owner.warnings.splice(0);
    await run(cluster.owner, cluster);
  } finally {
    await cluster.owner.end().catch(() => undefined);
    await cluster.stop();
  }
}
const one = async (client, sql, params = []) => Object.values((await client.query(sql, params)).rows[0] ?? {})[0];
const membershipsOfPostgres = (client) => client.query(`select r.rolname, g.rolname as grantor, a.admin_option, a.inherit_option, a.set_option
  from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles g on g.oid=a.grantor
  where a.member='postgres'::regrole order by 1,2`).then((r) => r.rows);
// In the runbook the operator supplies the reviewed digest; here it is the digest of the file under test.
const prepared = (name, text = readMigration(name)) =>
  prepareMigration({ fileName: name, text, expectedSha256: createHash('sha256').update(text, 'utf8').digest('hex') });

test('inventory: 26 applied, six pending in order, then the Omar migration', () => {
  assert.equal(applied.length, 26);
  assert.deepEqual(pendingSix.map((n) => n.slice(0, 14)),
    ['20260921090000', '20260921100000', '20260921110000', '20260921120000', '20260921130000', '20260921140000']);
  assert.equal(migrationNames.at(-1), OMAR);
});

test('the rehearsal cluster reproduces the recorded hosted role state', () => withCluster({}, async (db) => {
  assert.deepEqual(db.historyWarnings, []);
  assert.equal(await one(db, 'select rolsuper from pg_roles where rolname = current_user'), false);
  const approval = (await membershipsOfPostgres(db)).filter((m) => m.rolname === 'bagos_approval_command');
  assert.deepEqual(approval, [{ rolname: 'bagos_approval_command', grantor: 'supabase_admin', admin_option: true, inherit_option: false, set_option: false }]);
  assert.equal(await one(db, "select pg_has_role('postgres','bagos_approval_command','SET')"), false);
  assert.equal(await one(db, "select has_schema_privilege('bagos_approval_command','private','CREATE')"), false);
}));

test('unrepaired 090000 fails on the is_member grant when postgres is not a member of authenticated', () => withCluster({}, async (db) => {
  await assert.rejects(db.query(unrepaired(pendingSix[0])), (e) => e.code === '42501' && /permission denied for function is_member/.test(e.message));
  await db.query('rollback');
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
}));

test('unrepaired 090000 fails at the ownership transfer when the is_member grant only warns', () => withCluster({ platformMembers: true }, async (db) => {
  await assert.rejects(db.query(unrepaired(pendingSix[0])), (e) => e.code === '42501' && /permission denied for schema private/.test(e.message));
  await db.query('rollback');
  assert.ok(db.warnings.some((w) => /no privileges were granted for "is_member"/.test(w)));
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
}));

test('unrepaired 090000 with only the CREATE grant added would leave PUBLIC with EXECUTE (ACL set after transfer)', () => withCluster({ platformMembers: true }, async (db) => {
  const onlyCreateFixed = unrepaired(pendingSix[0])
    .replace('grant bagos_approval_command to postgres;', 'grant create on schema private to bagos_approval_command;\ngrant bagos_approval_command to postgres;');
  await db.query(onlyCreateFixed);
  assert.ok(db.warnings.some((w) => /no privileges could be revoked/.test(w)));
  assert.equal(await one(db, `select count(*)::int from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)'::regprocedure and a.privilege_type = 'EXECUTE' order by 1) g where grantee = 'PUBLIC'`), 1);
  assert.equal(await one(db, "select has_function_privilege('anon','private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)','EXECUTE')"), true);
}));

test('unrepaired 100000 cannot replace the approval-command function after a repaired 090000', () => withCluster({}, async (db) => {
  await applyRecorded(db, [pendingSix[0]]);
  await assert.rejects(db.query(unrepaired(pendingSix[1])), (e) => e.code === '42501' && /must be owner of function create_finished_post_package/.test(e.message));
  await db.query('rollback');
}));

test('the repaired six apply in order with no WARNING and leave no temporary authority behind', () => withCluster({}, async (db) => {
  const before = await membershipsOfPostgres(db);
  await applyRecorded(db, pendingSix);
  assert.deepEqual(await membershipsOfPostgres(db), before);
  for (const role of ['bagos_approval_command', 'bagos_membership_reader', 'bagos_research_command']) {
    assert.equal(await one(db, "select has_schema_privilege($1,'private','CREATE')", [role]), false, role);
  }
  const fn = 'private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)';
  assert.equal(await one(db, `select pg_get_userbyid(proowner) from pg_proc where oid = '${fn}'::regprocedure`), 'bagos_approval_command');
  assert.equal(await one(db, `select prosecdef from pg_proc where oid = '${fn}'::regprocedure`), true);
  for (const role of ['anon', 'service_role', 'bagos_content_calendar_command', 'bagos_content_calendar_executor', 'bagos_research_executor']) {
    assert.equal(await one(db, 'select has_function_privilege($1,$2,\'EXECUTE\')', [role, fn]), false, role);
  }
  // proacl, not information_schema: the latter hides rows that do not involve the current role (postgres no longer owns it).
  assert.equal(await one(db, `select count(*)::int from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)'::regprocedure and a.privilege_type = 'EXECUTE' order by 1) g where grantee = 'PUBLIC'`), 0);
  assert.equal(await one(db, 'select has_function_privilege(\'authenticated\',$1,\'EXECUTE\')', [fn]), true);
  assert.equal(await one(db, "select has_function_privilege('bagos_approval_command','private.is_member(uuid,text[])','EXECUTE')"), true);
  // RLS stays forced on the new table and its policies name only the intended roles.
  assert.deepEqual((await db.query(`select relrowsecurity, relforcerowsecurity from pg_class where oid='public.finished_post_revision_bodies'::regclass`)).rows,
    [{ relrowsecurity: true, relforcerowsecurity: true }]);
  assert.deepEqual((await db.query(`select policyname, roles::text from pg_policies where tablename='finished_post_revision_bodies' order by 1`)).rows, [
    { policyname: 'approval_command_finished_post_insert', roles: '{bagos_approval_command}' },
    { policyname: 'approval_command_finished_post_read', roles: '{bagos_approval_command}' },
    { policyname: 'finished_post_bodies_read', roles: '{authenticated}' },
  ]);
  assert.deepEqual((await db.query('select version from supabase_migrations.schema_migrations where version > $1 order by 1', [LEDGER_HEAD])).rows.map((r) => r.version),
    pendingSix.map((n) => n.slice(0, 14)));
}));

test('without GRANT OPTION on auth, 090000 warns and the apply tool refuses it, recording nothing', () => withCluster({ authGrantOption: false }, async (db) => {
  // The same condition already made applied history skip its auth grants silently (hence the runbook preflight).
  assert.ok(db.historyWarnings.some((w) => /no privileges were granted for "uid"/.test(w)));
  await assert.rejects(applyMigration(db, prepared(pendingSix[0]), { requirePresent: [LEDGER_HEAD] }),
    (e) => e instanceof MigrationRefused && /no privileges were granted for "(auth|uid|jwt)"/.test(e.message));
  assert.equal(await one(db, 'select count(*)::int from supabase_migrations.schema_migrations where version = $1', ['20260921090000']), 0);
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
}));

test('Phase A then Phase B (Omar first, six after) ends in the same catalog and ledger as applying in file order', async () => {
  let inOrder;
  await withCluster({}, async (db) => {
    await applyRecorded(db, [...pendingSix, OMAR]);
    inOrder = { catalog: await catalogSnapshot(db), ledger: (await db.query('select version, name from supabase_migrations.schema_migrations order by 1')).rows };
  });
  await withCluster({}, async (db) => {
    const phaseA = await applyMigration(db, prepared(OMAR), { requirePresent: [LEDGER_HEAD] });
    assert.deepEqual(phaseA, { version: '20261008120000', committed: true });
    // Phase A leaves exactly six pending.
    assert.equal(await one(db, 'select count(*)::int from supabase_migrations.schema_migrations where version between $1 and $2', ['20260921090000', '20260921140000']), 0);
    let previous = LEDGER_HEAD;
    for (const name of pendingSix) {
      await applyMigration(db, prepared(name), { requirePresent: [previous, '20261008120000'] });
      previous = name.slice(0, 14);
    }
    assert.deepEqual(await catalogSnapshot(db), inOrder.catalog);
    assert.deepEqual((await db.query('select version, name from supabase_migrations.schema_migrations order by 1')).rows, inOrder.ledger);
  });
});

test('Phase A applies the Omar migration alone, with the reviewed grants and no WARNING', () => withCluster({}, async (db) => {
  await applyMigration(db, prepared(OMAR), { requirePresent: [LEDGER_HEAD] });
  const usage = 'private.record_research_usage(uuid,integer,boolean)';
  assert.equal(await one(db, `select pg_get_userbyid(proowner) from pg_proc where oid='${usage}'::regprocedure`), 'postgres');
  assert.equal(await one(db, 'select has_function_privilege(\'bagos_research_executor\',$1,\'EXECUTE\')', [usage]), true);
  assert.equal(await one(db, "select has_function_privilege('bagos_research_executor','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')"), false);
  for (const role of ['bagos_reel_analyst_executor', 'bagos_content_calendar_executor']) {
    assert.equal(await one(db, "select has_function_privilege($1,'private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')", [role]), true, role);
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await one(db, 'select has_function_privilege($1,$2,\'EXECUTE\')', [role, usage]), false, role);
  }
}));

test('a failure inside a migration rolls back the migration, its ledger row and every temporary grant', () => withCluster({}, async (db) => {
  const before = await catalogSnapshot(db);
  const broken = readMigration(pendingSix[0]).replace(/\ncommit;\n?$/, '\nselect 1/0;\ncommit;\n');
  await assert.rejects(applyMigration(db, prepared(pendingSix[0], broken), { requirePresent: [LEDGER_HEAD] }), (e) => e.code === '22012');
  assert.deepEqual(await catalogSnapshot(db), before);
  assert.equal(await one(db, 'select count(*)::int from supabase_migrations.schema_migrations where version = $1', ['20260921090000']), 0);
}));

test('the apply tool refuses a wrong digest, a recorded version, a missing prerequisite, and rehearses without committing', () => withCluster({}, async (db) => {
  const text = readMigration(OMAR);
  assert.throws(() => prepareMigration({ fileName: OMAR, text, expectedSha256: 'f'.repeat(64) }), MigrationRefused);
  await assert.rejects(applyMigration(db, prepared(pendingSix[1]), { requirePresent: ['20260921090000'] }),
    (e) => e instanceof MigrationRefused && /required versions not recorded: 20260921090000/.test(e.message));
  assert.deepEqual(await applyMigration(db, prepared(OMAR), { rehearse: true }), { version: '20261008120000', committed: false });
  assert.equal(await one(db, "select to_regprocedure('private.record_research_usage(uuid,integer,boolean)')::text"), null);
  await applyMigration(db, prepared(OMAR));
  await assert.rejects(applyMigration(db, prepared(OMAR)), (e) => e instanceof MigrationRefused && /already recorded/.test(e.message));
}));

test('the runbook readback queries return what docs/STAGING_MIGRATION_RUNBOOK.md says', () => withCluster({}, async (db) => {
  const p3 = () => db.query(`select r.rolname, a.admin_option, a.inherit_option, a.set_option, pg_get_userbyid(a.grantor) as grantor
    from pg_auth_members a join pg_roles r on r.oid=a.roleid where a.member='postgres'::regrole and r.rolname like 'bagos\_%' order by 1`).then((r) => r.rows);
  const savedP3 = await p3();
  assert.ok(savedP3.length > 0 && savedP3.every((m) => m.admin_option && !m.inherit_option && !m.set_option && m.grantor === 'supabase_admin'));
  const p4 = "select r.rolname from pg_roles r where r.rolname like 'bagos\_%' and has_schema_privilege(r.oid,'private','CREATE')";
  assert.deepEqual((await db.query(p4)).rows, []);

  // Phase A
  await applyMigration(db, prepared(OMAR), { requirePresent: [LEDGER_HEAD] });
  assert.deepEqual((await db.query("select version from supabase_migrations.schema_migrations where version > '20260921080000'")).rows, [{ version: '20261008120000' }]);
  assert.deepEqual((await db.query("select pg_get_userbyid(proowner) as owner, prosecdef, proconfig from pg_proc where oid='private.record_research_usage(uuid,integer,boolean)'::regprocedure")).rows,
    [{ owner: 'postgres', prosecdef: true, proconfig: ['search_path=""'] }]);
  const executeOn = async (sig) => (await db.query(`select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = '${sig}'::regprocedure and a.privilege_type = 'EXECUTE' order by 1`)).rows.map((r) => r.grantee);
  assert.deepEqual(await executeOn('private.record_research_usage(uuid,integer,boolean)'), ['bagos_research_executor', 'postgres']);
  assert.deepEqual(await executeOn('private.record_agent_usage(uuid,text,integer,boolean)'),
    ['bagos_content_calendar_executor', 'bagos_reel_analyst_executor', 'postgres']);
  assert.deepEqual(await p3(), savedP3);

  // Phase B, B1 then the rest
  let previous = LEDGER_HEAD;
  for (const name of pendingSix) {
    await applyMigration(db, prepared(name), { requirePresent: [previous, '20261008120000'] });
    previous = name.slice(0, 14);
    assert.equal(await one(db, "select pg_get_userbyid(proowner) from pg_proc where oid='private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)'::regprocedure"), 'bagos_approval_command', name);
    assert.deepEqual(await executeOn('private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)'), ['authenticated', 'bagos_approval_command'], name);
    assert.equal(await one(db, "select has_function_privilege('bagos_approval_command','private.is_member(uuid,text[])','EXECUTE')"), true, name);
    assert.deepEqual(await p3(), savedP3, name);
    assert.deepEqual((await db.query(p4)).rows, [], name);
  }
  assert.equal(await one(db, 'select count(*)::int from supabase_migrations.schema_migrations'), 33);
}));

test('the apply tool detects a body that ends its own transaction and writes no ledger row', () => withCluster({}, async (db) => {
  // A top-level END is a COMMIT; the envelope rule only counts literal begin;/commit; lines, so it gets through to here.
  const text = ['begin;', 'create table public.probe_early_commit(id int);', 'end;', 'select 1;', 'commit;', ''].join(String.fromCharCode(10));
  await assert.rejects(applyMigration(db, prepared('20991231000000_probe_early_commit.sql', text)),
    (e) => e instanceof MigrationRefused && /ended its own transaction/.test(e.message));
  assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version='20991231000000'"), 0);
  // What the body committed before ending the transaction stays: this is detection, not prevention.
  assert.equal(await one(db, "select to_regclass('public.probe_early_commit')::text"), 'probe_early_commit');
}));
