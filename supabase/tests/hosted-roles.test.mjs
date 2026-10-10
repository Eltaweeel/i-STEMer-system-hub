// Rehearses the pending migrations on real PostgreSQL 17.6 as a NON-superuser postgres (see hosted-pg.mjs).
// These results are separate from the PGlite suites, which run as a superuser and cannot see these failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { migrationNames } from './migration-inventory.mjs';
import { loadApplyToolMutation } from './apply-tool-mutation.mjs';
import { applyRecorded, catalogSnapshot, readMigration, startHostedLikeCluster } from './hosted-pg.mjs';
import { applyMigration, applyMigrations, applyQuarantine, MigrationRefused, prepareMigration, preparePostcheck,
  PHASE_B, quarantineInEffect } from '../ops/apply-migration.mjs';

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
const quarantine = (db, options = {}) => applyQuarantine(db, postcheck('phase-b-quarantine.sql'), options);
// The Phase B batch alone; the quarantine must already be in effect (as in the runbook, a separate step).
const phaseB = (db, options = {}) => applyMigrations(db, pendingSix.map((name) => prepared(name)),
  { requirePresent: [LEDGER_HEAD], postcheck: postcheck('phase-b-postcheck.sql'), reopen: postcheck('phase-b-reopen.sql'), ...options });
const quarantineThenPhaseB = async (db, options = {}) => { await quarantine(db); return phaseB(db, options); };
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
/** The same call inside the caller's open transaction (e.g. after SET LOCAL ROLE authenticated); a savepoint keeps it usable. */
async function outsiderApproveIn(db, claims) {
  const subject = '00000000-0000-4000-8000-0000000000aa';
  await db.query('savepoint approve_call');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [subject, JSON.stringify({ sub: subject, role: 'authenticated', ...claims })]);
    await db.query("select public.approve_agent_revision(gen_random_uuid(), gen_random_uuid(), null)");
    return { code: null, message: 'accepted' };
  } catch (error) {
    await db.query('rollback to savepoint approve_call');
    return { code: error.code, message: error.message };
  }
}
/** A client session acting as `authenticated`, the way PostgREST runs an API call. */
async function apiCaller(cluster) {
  const caller = await cluster.connect('supabase_admin');
  const call = async (claims, { lockTimeout = '2s' } = {}) => {
    await caller.query('begin');
    try {
      await caller.query('set local role authenticated');
      await caller.query(`set local lock_timeout = '${lockTimeout}'`);
      return await outsiderApproveIn(caller, claims);
    } finally { await caller.query('rollback'); }
  };
  return { call, end: () => caller.end() };
}
// Preflight P7 exactly as in docs/STAGING_MIGRATION_RUNBOOK.md.
const P7 = `select r.role, c.what, case c.what
    when 'usage on schema auth' then has_schema_privilege(r.role, 'auth', 'USAGE')
    when 'execute auth.uid()' then has_function_privilege(r.role, 'auth.uid()', 'EXECUTE')
    when 'execute auth.jwt()' then has_function_privilege(r.role, 'auth.jwt()', 'EXECUTE') end as ok
  from (values ('bagos_research_command'), ('bagos_membership_reader'), ('bagos_platform_reader')) r(role)
  cross join (values ('usage on schema auth'), ('execute auth.uid()'), ('execute auth.jwt()')) c(what) order by 1, 2`;
const runbook = readFileSync(new URL('../../docs/STAGING_MIGRATION_RUNBOOK.md', import.meta.url), 'utf8');
const P12 = runbook.match(/<!-- P12 owner-access query:[^\n]*\n```sql\n([\s\S]*?)\n```/)[1];

test('P12 regression: indirect inherited owner access must refuse B0', () => withCluster({}, async (db, cluster) => {
  const platform = await cluster.connect('supabase_admin');
  try {
    await platform.query(`create role quarantine_bridge;
      grant postgres to quarantine_bridge with inherit true, set false;
      grant quarantine_bridge to authenticated with inherit true, set false;`);
    assert.equal(await one(db, "select pg_has_role('authenticated','postgres','USAGE')"), true);
    // Reproduce the old ACL-only B0 on local PG: revoke succeeds, but the vulnerable body is still reached.
    await platform.query('begin');
    await platform.query('set local role postgres');
    await platform.query(opsText('phase-b-quarantine.sql'));
    await platform.query('set local role authenticated');
    assert.deepEqual(await outsiderApproveIn(platform, { aal: 'aal2' }), { code: '23503', message: 'approval not found' });
    await platform.query('rollback');
    await assert.rejects(quarantine(db), /quarantine did not take effect/);
  } finally { await platform.end(); }
}));

test('WARNING regression: an unpinned file suppressing its own warning must be refused', () => withCluster({}, async (db) => {
  const text = `begin;
create table public.suppressed_warning_probe(id int);
select set_config('client_min_messages','error',true);
do $w$ begin raise warning 'hidden-warning'; end $w$;
commit;
`;
  const probe = prepared('20991231000000_suppressed_warning.sql', text);
  // Parsing succeeds; resetting the level BEFORE this string cannot protect its runtime warning.
  await db.query('begin');
  await db.query('set local client_min_messages = warning');
  const before = db.warnings.length;
  await db.query(probe.body);
  assert.equal(db.warnings.length, before);
  await db.query('rollback');
  await assert.rejects(applyMigration(db, probe), /only the reviewed Phase A or Phase B/);
  assert.equal(await one(db, "select to_regclass('public.suppressed_warning_probe')::text"), null);
  assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version='20991231000000'"), 0);
}));

test('exported API regression: overridden map cannot commit extra SQL behind pinned ledger text', () => withCluster({}, async (db) => {
  const reviewed = prepared(OMAR);
  const list = [reviewed];
  list.map = () => [{ ...reviewed, body: `${reviewed.body}
create table public.exported_api_map_probe(id int);
select set_config('client_min_messages','error',true);
do $w$ begin raise warning 'exported-api-hidden-warning'; end $w$;` }];
  assert.equal(await one(db, "select rolsuper from pg_roles where rolname = current_user"), false);
  assert.deepEqual(await applyMigrations(db, list, {
    requirePresent: [LEDGER_HEAD], postcheck: postcheck('phase-a-postcheck.sql'),
  }), { versions: [reviewed.version], committed: true });
  const ledger = (await db.query('select version, name, statements from supabase_migrations.schema_migrations where version=$1', [reviewed.version])).rows;
  assert.deepEqual(ledger, [{ version: reviewed.version, name: reviewed.name, statements: [reviewed.text] }]);
  assert.equal(db.warnings.includes('exported-api-hidden-warning'), false);
  assert.equal(await one(db, "select to_regclass('public.exported_api_map_probe')::text"), null);
}));

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
  assert.deepEqual(await quarantineThenPhaseB(db), { versions: pendingSix.map((n) => n.slice(0, 14)), committed: true });
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

/** Starts the Phase B batch and holds it, every check passed, just before COMMIT; returns controls for the test. */
function pausedPhaseB(db, options = {}) {
  let reached; let release;
  const atPause = new Promise((r) => { reached = r; });
  const held = new Promise((r) => { release = r; });
  const run = phaseB(db, { ...options, beforeCommit: async () => { reached(); await held; } });
  run.catch(() => undefined);
  return { run, atPause, release };
}
const blockedBy = (observer, pid) => one(observer, 'select count(*)::int from pg_stat_activity where $1 = any(pg_blocking_pids(pid))', [pid]);
const PERMISSION_DENIED = { code: '42501', message: 'permission denied for function approve_agent_revision' };

test('the quarantine stops new approval calls before Phase B, and Phase B refuses to start without it', () => withCluster({}, async (db, cluster) => {
  await assert.rejects(phaseB(db), (e) => e instanceof MigrationRefused && /quarantine is not in effect/.test(e.message));
  assert.equal(await ledgerCountOfSix(db), 0);
  const api = await apiCaller(cluster);
  try {
    assert.deepEqual(await api.call({ aal: 'aal2' }), { code: '23503', message: 'approval not found' }, 'pre-Phase-B body reachable before the quarantine');
    assert.deepEqual(await quarantine(db), { quarantine: true, committed: true });
    assert.deepEqual(await api.call({ aal: 'aal2' }), PERMISSION_DENIED, 'refused at call start once quarantined');
  } finally {
    await api.end();
  }
}));

test('during Phase B no caller can start or block on an old approval body, and after COMMIT callers meet the repaired one', () => withCluster({}, async (db, cluster) => {
  const observer = await cluster.connect('postgres');
  const api = await apiCaller(cluster);
  try {
    const callAsAuthenticated = () => api.call({ aal: 'aal2' });
    await quarantine(db);
    const pid = await one(db, 'select pg_backend_pid()');
    const appliedApprove = await bodySha(observer, APPROVE);
    const batch = pausedPhaseB(db);
    await batch.atPause;
    // The batch holds its locks and has passed every check; nothing of it is visible yet.
    assert.equal(await bodySha(observer, APPROVE), appliedApprove, 'B5 body visible before COMMIT');
    assert.equal(await ledgerCountOfSix(observer), 0, 'ledger rows visible before COMMIT');
    // The reviewer's scenario: a call made now. It is refused at call start (quarantine), so it never waits on the
    // batch's locks and so can never resume the old body after COMMIT.
    assert.deepEqual(await callAsAuthenticated(), PERMISSION_DENIED);
    assert.equal(await blockedBy(observer, pid), 0, 'nothing is waiting on the batch');
    batch.release();
    assert.deepEqual(await batch.run, { versions: pendingSix.map((n) => n.slice(0, 14)), committed: true });
    assert.deepEqual(await callAsAuthenticated(), { code: '42501', message: 'owner approval required' }, 'access restored with the repaired body');
  } finally {
    await api.end();
    await observer.end();
  }
}));

test('an interrupted Phase B leaves nothing behind and keeps the quarantine', () => withCluster({}, async (db, cluster) => {
  const observer = await cluster.connect('postgres');
  try {
    await quarantine(db);
    const appliedApprove = await bodySha(observer, APPROVE);
    const membersBefore = await membershipsOfPostgres(observer);
    const pid = await one(db, 'select pg_backend_pid()');
    const batch = pausedPhaseB(db);
    await batch.atPause;
    // The operator's process dies just before COMMIT. (The dead client also emits an 'error' event; expected here.)
    db.on('error', () => undefined);
    assert.equal(await one(observer, 'select pg_terminate_backend($1)', [pid]), true);
    batch.release();
    await assert.rejects(batch.run);
    assert.equal(await ledgerCountOfSix(observer), 0);
    assert.equal(await bodySha(observer, APPROVE), appliedApprove);
    assert.equal(await one(observer, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
    assert.deepEqual(await membershipsOfPostgres(observer), membersBefore);
    assert.equal(await one(observer, "select has_function_privilege('authenticated','public.approve_agent_revision(uuid,uuid,text)','EXECUTE')"), false,
      'quarantine still in effect');
  } finally {
    await observer.end();
  }
}));

test('Phase B waits for transactions older than itself and refuses if they do not finish', () => withCluster({}, async (db, cluster) => {
  await quarantine(db);
  const older = await cluster.connect('postgres');
  try {
    await older.query('begin'); await older.query('select 1');
    await assert.rejects(phaseB(db, { drainTimeoutMs: 1500 }), (e) => e instanceof MigrationRefused && /older than Phase B/.test(e.message));
    assert.equal(await ledgerCountOfSix(db), 0);
    await older.query('commit');
    assert.equal((await phaseB(db)).committed, true);
  } finally {
    await older.end();
  }
}));

test('Phase B cannot be applied one file at a time, partly, with an unreviewed file, or without its reviewed steps', () => withCluster({}, async (db) => {
  await quarantine(db);
  const six = pendingSix.map((name) => prepared(name));
  const b = { postcheck: postcheck('phase-b-postcheck.sql'), reopen: postcheck('phase-b-reopen.sql') };
  const edited = prepared(pendingSix[0], `${readMigration(pendingSix[0])}-- edited\n`);
  for (const [list, opts] of [
    [six.slice(0, 1), b],
    [six.slice(0, 5), b],
    [six, {}],
    [six, { postcheck: b.postcheck }],
    [six, { ...b, postcheck: postcheck('phase-a-postcheck.sql') }],
    [six, { ...b, reopen: postcheck('phase-b-quarantine.sql') }],
    [[edited, ...six.slice(1)], b],
    [[...six, prepared(OMAR)], b],
  ]) {
    await assert.rejects(applyMigrations(db, list, { requirePresent: [LEDGER_HEAD], ...opts }), MigrationRefused);
  }
  assert.equal(await ledgerCountOfSix(db), 0);
  assert.equal(await one(db, "select to_regclass('public.finished_post_revision_bodies')::text"), null);
}));

test('without GRANT OPTION on auth, Phase B is refused at 090000 and records nothing', () => withCluster({ authGrantOption: false }, async (db) => {
  // The same condition already made applied history skip its auth grants silently (hence preflights P6 and P7).
  assert.ok(db.historyWarnings.some((w) => /no privileges were granted for "uid"/.test(w)));
  await assert.rejects(quarantineThenPhaseB(db), (e) => e instanceof MigrationRefused && /no privileges were granted for "(auth|uid|jwt)"/.test(e.message));
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
    await quarantineThenPhaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] });
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
  await quarantineThenPhaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] });
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
  await db.query('begin');
  await db.query('grant execute on function public.approve_agent_revision(uuid,uuid,text) to authenticated with grant option');
  await assert.rejects(db.query(opsText('phase-b-postcheck.sql')), /approve_agent_revision\(uuid,uuid,text\) differs/);
  await db.query('rollback');
}));

test('a failure inside Phase B rolls back every file, every ledger row and every temporary grant, and keeps the quarantine', () => withCluster({}, async (db) => {
  // Pre-existing drift the reviewed post-check must catch, after all six exact reviewed files have run.
  await db.query('grant execute on function public.read_tenant_approvals(uuid) to anon');
  await quarantine(db);
  const before = await catalogSnapshot(db);
  await assert.rejects(phaseB(db), /read_tenant_approvals\(uuid\) differs from the reviewed definition/);
  assert.deepEqual(await catalogSnapshot(db), before);
  assert.equal(await ledgerCountOfSix(db), 0);
}));

test('the post-checks refuse a grant option present before the phase (delegation authority)', () => withCluster({}, async (db) => {
  await db.query('grant execute on function private.record_agent_usage(uuid,text,integer,boolean) to bagos_reel_analyst_executor with grant option');
  await assert.rejects(phaseA(db), /record_agent_usage\(uuid,text,integer,boolean\) differs/);
  assert.equal(await one(db, "select to_regprocedure('private.record_research_usage(uuid,integer,boolean)')::text"), null);
  await db.query('revoke grant option for execute on function private.record_agent_usage(uuid,text,integer,boolean) from bagos_reel_analyst_executor');
  await phaseA(db);
  await db.query('grant execute on function public.read_tenant_approvals(uuid) to authenticated with grant option');
  await assert.rejects(quarantineThenPhaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] }), /read_tenant_approvals\(uuid\) differs/);
  assert.equal(await ledgerCountOfSix(db), 0);
}));

test('the apply tool refuses a wrong digest, a missing prerequisite, a recorded version, and rehearses without committing', () => withCluster({}, async (db) => {
  assert.throws(() => prepareMigration({ fileName: OMAR, text: readMigration(OMAR), expectedSha256: 'f'.repeat(64) }), MigrationRefused);
  await assert.rejects(quarantineThenPhaseB(db, { requirePresent: [LEDGER_HEAD, '20261008120000'] }),
    (e) => e instanceof MigrationRefused && /required versions not recorded: 20261008120000/.test(e.message));
  assert.deepEqual(await phaseA(db, { rehearse: true }), { version: '20261008120000', committed: false });
  assert.equal(await one(db, "select to_regprocedure('private.record_research_usage(uuid,integer,boolean)')::text"), null);
  assert.deepEqual(await quarantineThenPhaseB(db, { rehearse: true }), { versions: pendingSix.map((n) => n.slice(0, 14)), committed: false });
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

test('an unpinned migration proposing a role membership or schema CREATE leak is refused', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  for (const leak of ['grant bagos_approval_command to postgres with inherit true, set false;', 'grant create on schema private to bagos_approval_command;']) {
    const text = ['begin;', 'create table public.probe_leak(id int);', leak, 'commit;', ''].join(nl);
    await assert.rejects(applyMigration(db, prepared('20991231000000_probe_leak.sql', text)), (e) => e instanceof MigrationRefused && /only the reviewed Phase A or Phase B/.test(e.message), leak);
  }
  assert.equal(await one(db, "select to_regclass('public.probe_leak')::text"), null);
  assert.equal(await one(db, "select has_schema_privilege('bagos_approval_command','private','CREATE')"), false);
}));

test('the apply tool refuses an unexpected ledger shape or hooks on the ledger, leaving nothing', () => withCluster({}, async (db) => {
  const nothingLeft = async () => {
    assert.equal(await one(db, "select to_regprocedure('private.record_research_usage(uuid,integer,boolean)')::text"), null);
    assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version='20261008120000'"), 0);
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
    await assert.rejects(phaseA(db), (e) => e instanceof MigrationRefused && /ledger/.test(e.message), install);
    await nothingLeft();
    await db.query(remove);
  }
  await phaseA(db);
  assert.equal(await one(db, "select statements[1] from supabase_migrations.schema_migrations where version='20261008120000'"), readMigration(OMAR));
}));

test('a session that suppresses WARNINGs cannot slip a skipped grant past the apply tool', () => withCluster({ authGrantOption: false }, async (db) => {
  // As if the role, the database or the URL had set it: without the tool's own setting no WARNING would arrive.
  await db.query('set client_min_messages = error');
  await assert.rejects(quarantineThenPhaseB(db), (e) => e instanceof MigrationRefused && /no privileges were granted for "(auth|uid|jwt)"/.test(e.message));
  assert.equal(await ledgerCountOfSix(db), 0);
  // The tool's level was transaction-local; the session's own setting is untouched afterwards.
  assert.equal(await one(db, 'show client_min_messages'), 'error');
}));

test('each ledger row holds the whole reviewed file, so its digest matches the runbook', () => withCluster({}, async (db) => {
  await phaseA(db);
  const stored = await one(db, "select statements[1] from supabase_migrations.schema_migrations where version = '20261008120000'");
  assert.equal(sha256(stored), 'd7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25');
}));

// ---------------------------------------------------------------------------------------------------------------
// Regressions for the round-3 review of 93dbec7.

test('unpinned files changing string parsing are refused, so --rehearse commits nothing', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  const bs = String.fromCharCode(92); // a backslash, written without escapes
  // File 1 turns standard_conforming_strings off in a way no scan can see; file 2 is innocent with it on, but with it
  // off PostgreSQL would read  select '\''; commit; -- '  as a string, a COMMIT and a comment.
  const first = prepared('20991231000001_probe_one.sql', ['begin;', 'create table public.probe_one(id int);',
    "select set_config('standard_conforming_strings', 'off', false);", 'set escape_string_warning = off;', 'commit;', ''].join(nl));
  const second = prepared('20991231000002_probe_two.sql', ['begin;', 'create table public.probe_two(id int);',
    `select '${bs}''; commit; -- '`, ';', 'commit;', ''].join(nl));
  await assert.rejects(applyMigrations(db, [first, second], { rehearse: true }), /only the reviewed Phase A or Phase B/);
  assert.equal(await one(db, "select to_regclass('public.probe_one')::text"), null);
  assert.equal(await one(db, "select to_regclass('public.probe_two')::text"), null);
  assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version like '2099%'"), 0);
}));

test('without pg_read_all_stats the Phase B drain refuses, even though other sessions are connected', () => withCluster({ readAllStats: false }, async (db, cluster) => {
  const other = await cluster.connect('supabase_admin'); // a session postgres cannot see into, like PostgREST's
  try {
    await other.query('begin'); await other.query('select 1');
    await quarantine(db);
    await assert.rejects(phaseB(db, { drainTimeoutMs: 1500 }), (e) => e instanceof MigrationRefused && /pg_read_all_stats/.test(e.message));
    assert.equal(await ledgerCountOfSix(db), 0);
  } finally {
    await other.query('rollback').catch(() => undefined);
    await other.end();
  }
}));

test('with pg_read_all_stats the drain sees another role\'s older transaction and waits for it', () => withCluster({}, async (db, cluster) => {
  const other = await cluster.connect('supabase_admin');
  try {
    await quarantine(db);
    await other.query('begin'); await other.query('select 1');
    const started = Date.now();
    const finishes = new Promise((r) => setTimeout(r, 1500)).then(() => other.query('commit'));
    // The batch starts while the older transaction is open, waits, and proceeds once it has committed.
    const result = await phaseB(db, { drainTimeoutMs: 8000 });
    await finishes;
    assert.equal(result.committed, true);
    assert.ok(Date.now() - started >= 1400, 'the batch waited for the older transaction');
  } finally {
    await other.end();
  }
}));

test('the quarantine requires its owner to be the only EXECUTE holder, whoever else holds it', () => withCluster({}, async (db) => {
  // A grant to a role that is neither PUBLIC nor a client role would have passed a client-roles-only check.
  await db.query('grant execute on function private.approve_agent_revision(uuid,uuid,text) to bagos_research_executor');
  await assert.rejects(quarantine(db), /executable by a role other than its owner/);
  await db.query('revoke execute on function private.approve_agent_revision(uuid,uuid,text) from bagos_research_executor');
  assert.equal((await quarantine(db)).committed, true);
}));

// Regressions from the round-4 review of 9a261fe.
test('the reviewer\'s continued E-string file is refused before anything runs', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  const bs = String.fromCharCode(92);
  const text = ['begin;', 'create table public.probe_e(id int);', "select E'a'", `'${bs}' ' ; commit; select '`, "--'", ';', 'commit;', ''].join(nl);
  assert.throws(() => prepared('20991231000010_probe_e.sql', text), (e) => e instanceof MigrationRefused && /E'' strings/.test(e.message));
  assert.equal(await one(db, "select to_regclass('public.probe_e')::text"), null);
}));

test('unpinned files changing encoding are refused, and --rehearse commits nothing', () => withCluster({}, async (db) => {
  const nl = String.fromCharCode(10);
  // This historical attack used set_config, which the scan cannot see. Pinning now refuses it before execution.
  const first = prepared('20991231000011_probe_s1.sql', ['begin;', 'create table public.probe_s1(id int);',
    "select set_config('client_encoding', 'SJIS', false);", 'commit;', ''].join(nl));
  const second = prepared('20991231000012_probe_s2.sql', ['begin;', 'create table public.probe_s2(id int);', 'commit;', ''].join(nl));
  const checkText = "do $c$ begin if current_setting('client_encoding') <> 'UTF8' then raise exception 'encoding not restored'; end if; end $c$;";
  const check = preparePostcheck({ fileName: 'probe-encoding-check.sql', text: checkText, expectedSha256: sha256(checkText) });
  await assert.rejects(applyMigrations(db, [first, second], { rehearse: true, postcheck: check }), /only the reviewed Phase A or Phase B/);
  assert.equal(await one(db, "select to_regclass('public.probe_s1')::text"), null);
  assert.equal(await one(db, "select to_regclass('public.probe_s2')::text"), null);
  assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version like '2099%'"), 0);
}));

test('Phase B refuses when access is granted again after the quarantine committed (the tool\'s own check)', () => withCluster({}, async (db) => {
  await quarantine(db);
  await db.query('grant execute on function private.approve_agent_revision(uuid,uuid,text) to bagos_research_executor');
  await assert.rejects(phaseB(db), (e) => e instanceof MigrationRefused && /quarantine is not in effect/.test(e.message));
  assert.equal(await ledgerCountOfSix(db), 0);
}));

test('P12 and B0/B entry checks cover direct and multi-hop INHERIT/SET combinations', (t) => withCluster({}, async (db, cluster) => {
  const platform = await cluster.connect('supabase_admin');
  try {
    await platform.query('create role quarantine_bridge; create role custom_client; create role supabase_untrusted;');
    await quarantine(db);
    const flags = [false, true].flatMap((inherit) => [false, true].map((set) => ({ inherit, set })));
    const ownerActors = async () => {
      const rows = (await db.query(P12)).rows;
      return new Set(rows.map((r) => r.actor));
    };
    for (const actor of ['anon', 'authenticated', 'service_role', 'custom_client', 'supabase_untrusted']) {
      for (const edge of flags) {
        await t.test(`${actor} -> postgres INHERIT=${edge.inherit} SET=${edge.set}`, async () => {
          await platform.query(`grant postgres to ${actor} with inherit ${edge.inherit}, set ${edge.set}`);
          try {
            const unsafe = edge.inherit || edge.set;
            assert.equal((await ownerActors()).has(actor), unsafe);
            assert.equal(await quarantineInEffect(db, PHASE_B.gated), !unsafe);
            if (unsafe) {
              for (const rehearse of [false, true]) {
                await assert.rejects(quarantine(db, { rehearse }), /quarantine did not take effect/);
                await assert.rejects(phaseB(db, { rehearse }), /quarantine is not in effect/);
              }
            } else assert.equal((await quarantine(db, { rehearse: true })).committed, false);
          } finally { await platform.query(`revoke postgres from ${actor}`); }
        });
      }
    }
    for (const upper of flags) for (const lower of flags) {
      await t.test(`authenticated -> bridge (${lower.inherit}/${lower.set}) -> postgres (${upper.inherit}/${upper.set})`, async () => {
        await platform.query(`grant postgres to quarantine_bridge with inherit ${upper.inherit}, set ${upper.set};
          grant quarantine_bridge to authenticated with inherit ${lower.inherit}, set ${lower.set};`);
        try {
          const actors = await ownerActors();
          const clientAccess = (lower.inherit && upper.inherit) || (lower.set && (upper.inherit || upper.set));
          assert.equal(actors.has('authenticated'), clientAccess);
          // The bridge is itself non-platform, even if NOLOGIN or unreachable from authenticated.
          assert.equal(actors.has('quarantine_bridge'), upper.inherit || upper.set);
          assert.equal(await quarantineInEffect(db, PHASE_B.gated), !(upper.inherit || upper.set));
          if (upper.inherit || upper.set) {
            await assert.rejects(quarantine(db), /quarantine did not take effect/);
            await assert.rejects(phaseB(db), /quarantine is not in effect/);
          } else assert.equal((await quarantine(db, { rehearse: true })).committed, false);
        } finally {
          await platform.query('revoke quarantine_bridge from authenticated; revoke postgres from quarantine_bridge;');
        }
      });
    }
    assert.deepEqual([...await ownerActors()], []);
    assert.equal(await ledgerCountOfSix(db), 0);
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), true, 'hosted-like automatic creator ADMIN memberships are safe');
  } finally { await platform.end(); }
}));

test('quarantine refuses PUBLIC, unexpected superusers, missing functions and owner drift', () => withCluster({}, async (db, cluster) => {
  const platform = await cluster.connect('supabase_admin');
  try {
    await quarantine(db);
    await db.query('begin');
    await db.query(`grant execute on function ${APPROVE} to public`);
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), false);
    await db.query('rollback');
    await platform.query('create role unexpected_superuser superuser');
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), false);
    await platform.query('drop role unexpected_superuser');
    await db.query('begin');
    await db.query('drop function public.approve_agent_revision(uuid,uuid,text)');
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), false);
    await db.query('rollback');
    await platform.query(`alter function ${APPROVE} owner to supabase_admin`);
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), false);
    await platform.query(`alter function ${APPROVE} owner to postgres`);
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), true);
  } finally { await platform.end(); }
}));

test('B0 rehearsal restores ACLs; a refused B0 rolls back its revokes', () => withCluster({}, async (db, cluster) => {
  const platform = await cluster.connect('supabase_admin');
  const before = await catalogSnapshot(db);
  try {
    assert.equal((await quarantine(db, { rehearse: true })).committed, false);
    assert.deepEqual(await catalogSnapshot(db), before);
    await platform.query('grant postgres to authenticated with inherit false, set true');
    await assert.rejects(quarantine(db), /quarantine did not take effect/);
    assert.deepEqual(await catalogSnapshot(db), before);
  } finally { await platform.end(); }
}));

test('mutation: reverting effective-access enforcement lets inherited callers survive B0', () => withCluster({}, async (db, cluster) => {
  const mutant = await loadApplyToolMutation('acl-only');
  const platform = await cluster.connect('supabase_admin');
  try {
    await platform.query(`create role mutation_bridge;
      grant postgres to mutation_bridge with inherit true, set false;
      grant mutation_bridge to authenticated with inherit false, set true;`);
    await assert.rejects(quarantine(db), /quarantine did not take effect/);
    const requireRefusal = (tool) => assert.rejects(tool.applyQuarantine(db, postcheck('phase-b-quarantine.sql')), /quarantine did not take effect/);
    // The same security assertion is killed by reverting this fix (the mutant commits).
    await assert.rejects(requireRefusal(mutant), assert.AssertionError);
    assert.equal(await mutant.quarantineInEffect(db, PHASE_B.gated), true);
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), false);
    await platform.query('set session authorization authenticated');
    await platform.query('set role mutation_bridge');
    assert.deepEqual(await outsiderApprove(platform, { aal: 'aal2' }), { code: '23503', message: 'approval not found' });
    await assert.rejects(phaseB(db), /quarantine is not in effect/);
    assert.equal(await ledgerCountOfSix(db), 0);
  } finally { await platform.end(); }
}));

test('mutation: restoring unpinned execution commits a file whose runtime WARNING is invisible', () => withCluster({}, async (db) => {
  const mutant = await loadApplyToolMutation('allow-unpinned');
  const probe = prepared('20991231000000_mutation_warning.sql', `begin;
create table public.mutation_warning(id int);
select set_config('client_min_messages','error',true);
do $$ begin raise warning 'mutation-hidden-warning'; end $$;
commit;
`);
  await assert.rejects(applyMigration(db, probe), /only the reviewed Phase A or Phase B/);
  await assert.rejects(applyMigration(db, probe, { rehearse: true }), /only the reviewed Phase A or Phase B/);
  const before = db.warnings.length;
  const requireRefusal = (tool) => assert.rejects(tool.applyMigration(db, probe), /only the reviewed Phase A or Phase B/);
  await assert.rejects(requireRefusal(mutant), assert.AssertionError);
  assert.deepEqual(db.warnings.slice(before), ['apply-migration-probe'], 'only the initial probe arrived');
  assert.equal(await one(db, "select to_regclass('public.mutation_warning')::text"), 'mutation_warning');
  assert.equal(await one(db, "select count(*)::int from supabase_migrations.schema_migrations where version='20991231000000'"), 1);
}));

test('inherited ownership is refused even when the owner has revoked its own EXECUTE', () => withCluster({}, async (db, cluster) => {
  const platform = await cluster.connect('supabase_admin');
  try {
    await quarantine(db);
    await platform.query('grant postgres to authenticated with inherit true, set false');
    for (const fn of PHASE_B.gated) await db.query(`revoke execute on function ${fn} from postgres`);
    assert.equal(await one(db, 'select has_function_privilege(\'authenticated\',$1,\'EXECUTE\')', [APPROVE]), false);
    assert.equal(await quarantineInEffect(db, PHASE_B.gated), false);
    assert.ok((await db.query(P12)).rows.some((r) => r.actor === 'authenticated'));
    await assert.rejects(quarantine(db), /quarantine did not take effect/);
    await assert.rejects(phaseB(db), /quarantine is not in effect/);
  } finally { await platform.end(); }
}));

test('safe hosted-like PostgreSQL 17.6 with postgres inheriting API roles passes B0 and Phase B', () => withCluster({ platformMembers: true }, async (db) => {
  assert.equal(await one(db, 'show server_version_num'), '170006');
  assert.equal(await one(db, 'select rolsuper from pg_roles where rolname=current_user'), false);
  assert.deepEqual((await db.query(P12)).rows, []);
  assert.equal((await quarantine(db)).committed, true);
  assert.equal(await quarantineInEffect(db, PHASE_B.gated), true);
  assert.equal((await phaseB(db)).committed, true);
  assert.equal(await ledgerCountOfSix(db), 6);
}));
