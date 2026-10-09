// Rehearses the pending migrations on real PostgreSQL 17.6 as a NON-superuser postgres (see hosted-pg.mjs).
// These results are separate from the PGlite suites, which run as a superuser and cannot see these failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { migrationNames } from './migration-inventory.mjs';
import { applyRecorded, catalogSnapshot, readMigration, startHostedLikeCluster } from './hosted-pg.mjs';
import { applyMigration, applyMigrations, MigrationRefused, prepareMigration, preparePostcheck } from '../ops/apply-migration.mjs';

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
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const prepared = (name, text = readMigration(name)) => prepareMigration({ fileName: name, text, expectedSha256: sha256(text) });
const opsText = (name) => readFileSync(new URL(`../ops/${name}`, import.meta.url), 'utf8');
const postcheck = (fileName, text = opsText(fileName)) => preparePostcheck({ fileName, text, expectedSha256: sha256(text) });
// The two reviewed plans, exactly as the runbook runs them.
const phaseA = (db, options = {}) => applyMigration(db, prepared(OMAR),
  { requirePresent: [LEDGER_HEAD], postcheck: postcheck('phase-a-postcheck.sql'), ...options });
const phaseB = (db, options = {}) => applyMigrations(db, pendingSix.map((name) => prepared(name)),
  { requirePresent: [LEDGER_HEAD], postcheck: postcheck('phase-b-postcheck.sql'), ...options });
const ledgerCountOfSix = (db) => one(db, "select count(*)::int from supabase_migrations.schema_migrations where version between '20260921090000' and '20260921140000'");
const bodySha = (db, signature) => one(db, `select encode(sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid = to_regprocedure($1)`, [signature]);
const APPROVE = 'private.approve_agent_revision(uuid,uuid,text)';
/** Calls the public approve entry point as an outsider with the given JWT claims; returns the refusal it gets. */
async function outsiderApprove(db, claims, { lockTimeout = null } = {}) {
  const subject = '00000000-0000-4000-8000-0000000000aa';
  await db.query('begin');
  try {
    if (lockTimeout) await db.query(`set local lock_timeout = '${lockTimeout}'`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [subject, JSON.stringify({ sub: subject, role: 'authenticated', ...claims })]);
    await db.query("select public.approve_agent_revision(gen_random_uuid(), gen_random_uuid(), null)");
    return { code: null, message: 'accepted' };
  } catch (error) {
    return { code: error.code, message: error.message };
  } finally {
    await db.query('rollback');
  }
}
// Preflight P7 exactly as in docs/STAGING_MIGRATION_RUNBOOK.md.
const P7 = `select r.role, c.what, case c.what
    when 'usage on schema auth' then has_schema_privilege(r.role, 'auth', 'USAGE')
    when 'execute auth.uid()' then has_function_privilege(r.role, 'auth.uid()', 'EXECUTE')
    when 'execute auth.jwt()' then has_function_privilege(r.role, 'auth.jwt()', 'EXECUTE') end as ok
  from (values ('bagos_research_command'), ('bagos_membership_reader'), ('bagos_platform_reader')) r(role)
  cross join (values ('usage on schema auth'), ('execute auth.uid()'), ('execute auth.jwt()')) c(what) order by 1, 2`;

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


// ---------------------------------------------------------------------------------------------------------------
// The two reviewed plans through the apply tool (Phase A: Omar alone; Phase B: all six in ONE transaction).

test('the currently applied approve command lets a signed-in outsider past its owner and assurance checks', () => withCluster({}, async (db) => {
  // Pre-existing state on the hosted project (20260915225738 / 20260920140000), which Phase B's 20260921130000 repairs.
  // A refusal for any other reason than the checks shows the caller got past them: 'approval not found' (23503).
  assert.deepEqual(await outsiderApprove(db, { aal: 'aal2' }), { code: '23503', message: 'approval not found' });
  assert.deepEqual(await outsiderApprove(db, {}), { code: '23503', message: 'approval not found' });
}));

test('Phase B applies all six in one transaction with its post-check, and then refuses outsiders', () => withCluster({}, async (db) => {
  const before = await membershipsOfPostgres(db);
  assert.deepEqual(await phaseB(db), { versions: pendingSix.map((n) => n.slice(0, 14)), committed: true });
  assert.equal(await ledgerCountOfSix(db), 6);
  assert.deepEqual(await membershipsOfPostgres(db), before);
  assert.deepEqual(await outsiderApprove(db, { aal: 'aal2' }), { code: '42501', message: 'owner approval required' });
  assert.deepEqual(await outsiderApprove(db, { aal: 'aal1' }), { code: '42501', message: 'mfa assurance required' });
  assert.deepEqual(await outsiderApprove(db, {}), { code: '42501', message: 'mfa assurance required' });
}));

test('the Phase B post-check refuses the pre-Phase-B state and the state after B1..B4', () => withCluster({}, async (db) => {
  await assert.rejects(db.query(opsText('phase-b-postcheck.sql')), /phase-b post-check: .* (is missing|differs)/);
  await applyRecorded(db, pendingSix.slice(0, 4));
  await assert.rejects(db.query(opsText('phase-b-postcheck.sql')), /phase-b post-check: .* differs from the reviewed definition/);
}));

test('the Phase B post-check behaviour probe alone catches the NULL-blind owner check', () => withCluster({}, async (db) => {
  // Run only the behaviour block against the applied (vulnerable) bodies: it must refuse them by itself.
  const text = opsText('phase-b-postcheck.sql');
  await assert.rejects(db.query(text.slice(text.indexOf('do $behaviour$'))), (e) => e.code === '23503' && /approval not found/.test(e.message));
}));

test('no other session sees Phase B until it commits, and an interrupted Phase B leaves nothing behind', () => withCluster({}, async (db, cluster) => {
  const observer = await cluster.connect('postgres');
  try {
    const appliedApprove = await bodySha(observer, APPROVE);
    const membersBefore = await membershipsOfPostgres(observer);
    const pid = await one(db, 'select pg_backend_pid()');
    // The real post-check, followed by a pause that holds the batch open before COMMIT.
    const paused = postcheck('phase-b-postcheck.sql', `${opsText('phase-b-postcheck.sql')}\nselect pg_sleep(30);\n`);
    const run = applyMigrations(db, pendingSix.map((name) => prepared(name)), { requirePresent: [LEDGER_HEAD], postcheck: paused });
    run.catch(() => undefined);
    // Wait until the batch is inside its pause, i.e. all six bodies, ledger rows and the post-check have run.
    for (let i = 0; i < 300; i += 1) {
      const waiting = await one(observer, "select count(*)::int from pg_stat_activity where pid = $1 and wait_event = 'PgSleep'", [pid]);
      if (waiting) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(await one(observer, "select count(*)::int from pg_stat_activity where pid = $1 and wait_event = 'PgSleep'", [pid]), 1, 'batch reached its pause');
    assert.equal(await bodySha(observer, APPROVE), appliedApprove, 'B5 body visible before COMMIT');
    assert.equal(await ledgerCountOfSix(observer), 0, 'ledger rows visible before COMMIT');
    // Measured, not assumed: B1's policy and constraint changes hold ACCESS EXCLUSIVE locks on approvals, memberships,
    // artifacts, artifact_revisions, objectives and content_calendar_revision_bodies until COMMIT, so an approval call
    // made meanwhile cannot run the old body's queries; it waits (here cut off by its own lock timeout).
    assert.deepEqual(await outsiderApprove(observer, { aal: 'aal2' }, { lockTimeout: '1s' }),
      { code: '55P03', message: 'canceling statement due to lock timeout' }, 'approval calls wait on the open batch');
    const held = (await observer.query(`select distinct c.relname from pg_locks l join pg_class c on c.oid = l.relation
      where l.pid = $1 and l.granted and l.mode = 'AccessExclusiveLock' and c.relname in ('approvals','memberships') order by 1`, [pid])).rows.map((r) => r.relname);
    assert.deepEqual(held, ['approvals', 'memberships']);
    // The operator's process dies mid-batch. (The dead client also emits an 'error' event; that is expected here.)
    db.on('error', () => undefined);
    assert.equal(await one(observer, 'select pg_terminate_backend($1)', [pid]), true);
    await assert.rejects(run);
    assert.equal(await ledgerCountOfSix(observer), 0);
    assert.equal(await bodySha(observer, APPROVE), appliedApprove);
    assert.equal(await one(observer, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
    assert.deepEqual(await membershipsOfPostgres(observer), membersBefore);
  } finally {
    await observer.end();
  }
}));

test('Phase B cannot be applied one file at a time, partly, or without its post-check', () => withCluster({}, async (db) => {
  const six = pendingSix.map((name) => prepared(name));
  for (const [list, opts] of [
    [six.slice(0, 1), { postcheck: postcheck('phase-b-postcheck.sql') }],
    [six.slice(0, 5), { postcheck: postcheck('phase-b-postcheck.sql') }],
    [six, {}],
    [six, { postcheck: postcheck('phase-a-postcheck.sql') }],
    [[...six, prepared(OMAR)], { postcheck: postcheck('phase-b-postcheck.sql') }],
  ]) {
    await assert.rejects(applyMigrations(db, list, { requirePresent: [LEDGER_HEAD], ...opts }), MigrationRefused);
  }
  assert.equal(await ledgerCountOfSix(db), 0);
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
}));

test('without GRANT OPTION on auth, Phase B is refused at 090000 and records nothing', () => withCluster({ authGrantOption: false }, async (db) => {
  // The same condition already made applied history skip its auth grants silently (hence preflights P6 and P7).
  assert.ok(db.historyWarnings.some((w) => /no privileges were granted for "uid"/.test(w)));
  await assert.rejects(phaseB(db), (e) => e instanceof MigrationRefused && /no privileges were granted for "(auth|uid|jwt)"/.test(e.message));
  assert.equal(await ledgerCountOfSix(db), 0);
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
}));

test('preflight P7 is all true with GRANT OPTION on auth, and shows the missing schema access without it', async () => {
  await withCluster({}, async (db) => {
    assert.ok((await db.query(P7)).rows.every((r) => r.ok === true));
  });
  await withCluster({ authGrantOption: false }, async (db) => {
    const missing = (await db.query(P7)).rows.filter((r) => !r.ok).map((r) => `${r.role}: ${r.what}`);
    assert.deepEqual(missing, ['bagos_membership_reader: usage on schema auth', 'bagos_platform_reader: usage on schema auth', 'bagos_research_command: usage on schema auth']);
  });
});

test('Phase A then Phase B ends in the same catalog and ledger as applying in file order', async () => {
  let inOrder;
  await withCluster({}, async (db) => {
    await applyRecorded(db, [...pendingSix, OMAR]);
    inOrder = { catalog: await catalogSnapshot(db), ledger: (await db.query('select version, name, statements from supabase_migrations.schema_migrations order by 1')).rows };
  });
  await withCluster({}, async (db) => {
    assert.deepEqual(await phaseA(db), { version: '20261008120000', committed: true });
    assert.equal(await ledgerCountOfSix(db), 0, 'Phase A leaves the six pending');
    await phaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] });
    assert.deepEqual(await catalogSnapshot(db), inOrder.catalog);
    assert.deepEqual((await db.query('select version, name, statements from supabase_migrations.schema_migrations order by 1')).rows, inOrder.ledger);
  });
});

test('Phase A applies the Omar migration alone with its post-check and no WARNING', () => withCluster({}, async (db) => {
  await phaseA(db);
  const usage = 'private.record_research_usage(uuid,integer,boolean)';
  assert.equal(await one(db, 'select has_function_privilege(\'bagos_research_executor\',$1,\'EXECUTE\')', [usage]), true);
  assert.equal(await one(db, "select has_function_privilege('bagos_research_executor','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')"), false);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await one(db, 'select has_function_privilege($1,$2,\'EXECUTE\')', [role, usage]), false, role);
  }
  assert.equal(await ledgerCountOfSix(db), 0);
}));

test('the post-checks catch a changed grant after the fact', () => withCluster({}, async (db) => {
  await phaseA(db);
  await phaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] });
  await db.query(opsText('phase-a-postcheck.sql'));
  await db.query(opsText('phase-b-postcheck.sql'));
  await db.query('begin');
  await db.query('grant execute on function private.finished_post_calendar_approved(uuid,uuid) to anon');
  await assert.rejects(db.query(opsText('phase-b-postcheck.sql')), /finished_post_calendar_approved\(uuid,uuid\) differs/);
  await db.query('rollback');
  await db.query('begin');
  await db.query('grant execute on function private.record_agent_usage(uuid,text,integer,boolean) to bagos_research_executor');
  await assert.rejects(db.query(opsText('phase-a-postcheck.sql')), /record_agent_usage\(uuid,text,integer,boolean\) differs/);
  await db.query('rollback');
}));

test('a failure inside Phase B rolls back every file, every ledger row and every temporary grant', () => withCluster({}, async (db) => {
  const before = await catalogSnapshot(db);
  const broken = readMigration(pendingSix[3]).replace(/\ncommit;\n?$/, '\nselect 1/0;\ncommit;\n');
  const six = pendingSix.map((name, i) => (i === 3 ? prepared(name, broken) : prepared(name)));
  await assert.rejects(applyMigrations(db, six, { requirePresent: [LEDGER_HEAD], postcheck: postcheck('phase-b-postcheck.sql') }), (e) => e.code === '22012');
  assert.deepEqual(await catalogSnapshot(db), before);
  assert.equal(await ledgerCountOfSix(db), 0);
}));

test('the apply tool refuses a wrong digest, a missing prerequisite, a recorded version, and rehearses without committing', () => withCluster({}, async (db) => {
  assert.throws(() => prepareMigration({ fileName: OMAR, text: readMigration(OMAR), expectedSha256: 'f'.repeat(64) }), MigrationRefused);
  await assert.rejects(phaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] }),
    (e) => e instanceof MigrationRefused && /required versions not recorded: 20261008120000/.test(e.message));
  assert.deepEqual(await phaseA(db, { rehearse: true }), { version: '20261008120000', committed: false });
  assert.equal(await one(db, "select to_regprocedure('private.record_research_usage(uuid,integer,boolean)')::text"), null);
  assert.deepEqual(await phaseB(db, { rehearse: true }), { versions: pendingSix.map((n) => n.slice(0, 14)), committed: false });
  assert.equal(await ledgerCountOfSix(db), 0);
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
  await phaseA(db);
  await assert.rejects(phaseA(db), (e) => e instanceof MigrationRefused && /already recorded: 20261008120000/.test(e.message));
}));

test('transaction control in a body is refused before anything runs, so even --rehearse commits nothing', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  for (const statement of ['end;', 'commit;', 'COMMIT AND CHAIN;', 'rollback;', 'abort;', 'begin;', 'savepoint s;', '/* c */ End;']) {
    const text = ['begin;', 'create table public.probe_early_commit(id int);', statement, 'select 1;', 'commit;', ''].join(nl);
    assert.throws(() => prepared('20991231000000_probe_early_commit.sql', text), (e) => e instanceof MigrationRefused && /transaction control|exactly one top-level begin; and commit;/.test(e.message), statement);
  }
  assert.equal(await one(db, "select to_regclass('public.probe_early_commit')::text"), null);
  assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version='20991231000000'"), 0);
}));

test('a migration that leaves a role membership or schema CREATE behind is refused', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  for (const leak of ['grant bagos_approval_command to postgres with inherit true, set false;', 'grant create on schema private to bagos_approval_command;']) {
    const text = ['begin;', 'create table public.probe_leak(id int);', leak, 'commit;', ''].join(nl);
    await assert.rejects(applyMigration(db, prepared('20991231000000_probe_leak.sql', text)), (e) => e instanceof MigrationRefused && /memberships or schema private CREATE/.test(e.message), leak);
  }
  assert.equal(await one(db, "select to_regclass('public.probe_leak')::text"), null);
  assert.equal(await one(db, "select has_schema_privilege('bagos_approval_command','private','CREATE')"), false);
}));

test('the apply tool refuses an unexpected ledger shape or hooks on the ledger, leaving nothing', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  const probe = () => prepared('20991231000000_probe_ledger.sql', ['begin;', 'create table public.probe_ledger(id int);', 'commit;', ''].join(nl));
  const nothingLeft = async () => {
    assert.equal(await one(db, "select to_regclass('public.probe_ledger')::text"), null);
    assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version='20991231000000'"), 0);
  };
  const cases = [
    ['create function public.ledger_warn() returns trigger language plpgsql as $f$ begin raise warning $w$ledger hook$w$; return new; end $f$; create trigger ledger_warn after insert on supabase_migrations.schema_migrations for each row execute function public.ledger_warn();',
      'drop trigger ledger_warn on supabase_migrations.schema_migrations; drop function public.ledger_warn();'],
    ['create function public.ledger_drop() returns trigger language plpgsql as $f$ begin return null; end $f$; create trigger ledger_drop before insert on supabase_migrations.schema_migrations for each row execute function public.ledger_drop();',
      'drop trigger ledger_drop on supabase_migrations.schema_migrations; drop function public.ledger_drop();'],
    ['create rule ledger_nothing as on insert to supabase_migrations.schema_migrations do instead nothing;',
      'drop rule ledger_nothing on supabase_migrations.schema_migrations;'],
    ['alter table supabase_migrations.schema_migrations alter column statements type text using statements::text;',
      'alter table supabase_migrations.schema_migrations alter column statements type text[] using array[statements];'],
    ['alter table supabase_migrations.schema_migrations drop constraint schema_migrations_pkey;',
      'alter table supabase_migrations.schema_migrations add primary key (version);'],
  ];
  for (const [install, remove] of cases) {
    await db.query(install);
    await assert.rejects(applyMigration(db, probe()), MigrationRefused, install);
    await nothingLeft();
    await db.query(remove);
  }
  await applyMigration(db, probe());
  assert.equal(await one(db, "select statements[1] from supabase_migrations.schema_migrations where version='20991231000000'"), probe().text);
}));

test('a session that suppresses WARNINGs cannot slip a skipped grant past the apply tool', () => withCluster({ authGrantOption: false }, async (db) => {
  // As if the role, the database or the URL had set it: without the tool's own setting no WARNING would arrive.
  await db.query('set client_min_messages = error');
  await assert.rejects(phaseB(db), (e) => e instanceof MigrationRefused && /no privileges were granted for "(auth|uid|jwt)"/.test(e.message));
  assert.equal(await ledgerCountOfSix(db), 0);
  // The tool's level was transaction-local; the session's own setting is untouched afterwards.
  assert.equal(await one(db, 'show client_min_messages'), 'error');
}));

test('each ledger row holds the whole reviewed file, so its digest matches the runbook', () => withCluster({}, async (db) => {
  await phaseA(db);
  const stored = await one(db, "select statements[1] from supabase_migrations.schema_migrations where version = '20261008120000'");
  assert.equal(sha256(stored), 'd7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25');
}));
