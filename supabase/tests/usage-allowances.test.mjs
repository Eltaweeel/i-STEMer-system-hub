import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrationNames as migrations } from './migration-inventory.mjs';

// Local SQL execution only; no credentials, URLs, Auth users or remote changes.
const db = new PGlite({ extensions: { pgcrypto } });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), owner = id(3), operator = id(4), operatorTwo = id(6);
const brief = (key) => ({ idempotencyKey: key, objective: 'Compare education programs', sources: ['https://example.org/about'] });
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];

// Each rejection below is a real SQL exception, which aborts the surrounding
// transaction; fence it so the assertions that follow can still read.
async function rejectsFenced(run, matcher) {
  await db.exec('savepoint before_rejection');
  await assert.rejects(run, matcher);
  await db.exec('rollback to savepoint before_rejection');
}
async function switchRole(role) {
  await db.exec('set session authorization postgres');
  await db.exec(`set session authorization ${role}`);
}
// Every scenario runs inside exactly one open transaction so intermediate,
// uncommitted writes (an allowance, a seeded attempt, recorded usage) remain
// visible to later steps of the same test, then the whole thing is discarded
// -- isolating each test from every other without ever touching real commits.
async function withTransaction(action) {
  await db.exec('begin');
  try { return await action(); }
  finally { await db.exec('rollback; set session authorization postgres; reset role'); }
}
async function actAs(subject, role, aal = 'aal1') {
  await switchRole('postgres');
  await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
    [subject ?? '', JSON.stringify({ sub: subject, aal, is_anonymous: false })]);
  await switchRole(role);
}
const submit = (key) => scalar('select public.submit_research_brief($1::jsonb,$2::uuid)', [JSON.stringify(brief(key)), tenant]);
const setAllowance = (memberUser, limitTokens) => scalar('select private.set_usage_allowance($1,$2,current_date,$3)', [tenant, memberUser, limitTokens]);
async function seedAttempt(attemptId, taskId, runId, state = 'succeeded') {
  await actAs(null, 'bagos_research_command');
  const errorCode = state === 'failed' ? 'provider_failure' : null;
  const finished = state === 'running' ? null : new Date().toISOString();
  await db.query(`insert into public.research_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at,finished_at,error_code)
    values ($1,$2,$3,$4,1,$5,now() - interval '1 minute',now() + interval '4 minutes',$6,$7)`,
    [attemptId, tenant, taskId, runId, state, finished, errorCode]);
}
const recordUsage = (attemptId, reportedTokens, usageReported, agent = 'competitor_analyst') =>
  scalar('select private.record_agent_usage($1,$2,$3,$4)', [attemptId, agent, reportedTokens, usageReported]);

before(async () => {
  await db.exec('create schema extensions; create extension pgcrypto with schema extensions');
  await db.exec(await readFile(new URL('./platform-stubs.sql', import.meta.url), 'utf8'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
    grant execute on function auth.jwt() to authenticated;`);
  assert.deepEqual((await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort(), migrations);
  for (const filename of migrations) await db.exec(await readFile(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
  await db.exec('begin');
  await db.query("insert into public.tenants(id,name) values ($1,'Usage tenant')", [tenant]);
  const triggers = (await db.query(`select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint
    where t.tgrelid='public.memberships'::regclass and c.confrelid='auth.users'::regclass`)).rows;
  for (const trigger of triggers) await db.exec(`alter table public.memberships disable trigger "${trigger.tgname}"`);
  for (const [memberId, userId, role] of [[id(10), owner, 'owner'], [id(11), operator, 'operator'], [id(12), operatorTwo, 'operator']]) {
    await db.query("insert into public.memberships(id,tenant_id,user_id,role,status) values ($1,$2,$3,$4,'active')", [memberId, tenant, userId, role]);
  }
  await db.exec('set constraints all immediate');
  for (const trigger of triggers) await db.exec(`alter table public.memberships enable trigger "${trigger.tgname}"`);
  await db.exec("update public.tenants set status='active'");
  await db.query('insert into private.research_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.exec('commit');
});
after(async () => db.close());

test('owner can set an allowance and a non-owner cannot', () => withTransaction(async () => {
  await actAs(owner, 'authenticated', 'aal2');
  const allowance = await setAllowance(operator, 1000);
  assert.equal(allowance.memberUserId, operator);
  assert.equal(allowance.tokenLimit, 1000);
  assert.equal(await scalar('select count(*)::int from public.usage_allowances'), 1);
  await actAs(operator, 'authenticated', 'aal2');
  await rejectsFenced(() => setAllowance(operatorTwo, 500), (error) => error.code === '42501');
}));

test('an owner not verified at AAL2 is refused', () => withTransaction(async () => {
  await actAs(owner, 'authenticated', 'aal1');
  await rejectsFenced(() => setAllowance(operator, 500), (error) => error.code === '42501');
  assert.equal(await scalar('select count(*)::int from public.usage_allowances'), 0);
}));

test('usage records are attributed per attempt and cannot be duplicated', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(200));
  const attemptId = id(201);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');

  await actAs(null, 'bagos_research_executor');
  const recorded = await recordUsage(attemptId, 1500, true);
  assert.equal(recorded.attemptId, attemptId);
  assert.equal(recorded.reportedTokens, 1500);
  // The executor may record usage but has no select grant on the table, so
  // verify the stored row from a role that can.
  await switchRole('postgres');
  assert.equal(await scalar('select count(*)::int from public.usage_records'), 1);
  assert.equal(await scalar('select requester_id from public.usage_records where attempt_id=$1', [attemptId]), operator);
  await switchRole('bagos_research_executor');

  // A byte-identical replay is idempotent: same row, not a second one.
  assert.deepEqual(await recordUsage(attemptId, 1500, true), recorded);
  await switchRole('postgres');
  assert.equal(await scalar('select count(*)::int from public.usage_records'), 1);
  await switchRole('bagos_research_executor');
  // A conflicting replay for the same attempt is rejected outright.
  await rejectsFenced(() => recordUsage(attemptId, 2000, true), /idempotency_conflict/);

  // The unique constraint on attempt_id -- not an application check -- forbids
  // a second row for the same attempt even for a privileged direct insert.
  await switchRole('postgres');
  await rejectsFenced(() => db.query(`insert into public.usage_records(attempt_id,tenant_id,run_id,task_id,agent_id,requester_id,reported_tokens,usage_reported)
    values ($1,$2,$3,$4,'competitor_analyst',$5,999,true)`, [attemptId, tenant, submitted.runId, submitted.taskId, operator]),
    (error) => error.code === '23505');
}));

test('submission is refused once the allowance is consumed and permitted when under it', () => withTransaction(async () => {
  await actAs(owner, 'authenticated', 'aal2');
  await setAllowance(operator, 100);

  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(210));
  const attemptId = id(211);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');
  await actAs(null, 'bagos_research_executor');
  await recordUsage(attemptId, 150, true);

  await actAs(operator, 'authenticated', 'aal1');
  await rejectsFenced(() => submit(id(212)), (error) => error.code === '53400');
  // The exhausted requester creates no orphaned rows for the refused submission.
  assert.equal(await scalar("select count(*)::int from public.agent_tasks where idempotency_key=$1", [id(212)]), 0);

  // Raising the limit above what was actually consumed permits new work again.
  await actAs(owner, 'authenticated', 'aal2');
  await setAllowance(operator, 500);
  await actAs(operator, 'authenticated', 'aal1');
  const allowed = await submit(id(213));
  assert.equal(allowed.requesterId, operator);
}));

test('a requester with no allowance row configured is unlimited', () => withTransaction(async () => {
  await actAs(operatorTwo, 'authenticated', 'aal1');
  const submitted = await submit(id(220));
  assert.equal(submitted.requesterId, operatorTwo);
  assert.equal(await scalar('select count(*)::int from public.usage_allowances where member_user_id=$1', [operatorTwo]), 0);
}));

test('authenticated, anon and service_role cannot call record_agent_usage directly', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(230));
  const attemptId = id(231);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');
  for (const role of ['authenticated', 'anon', 'service_role']) {
    await actAs(null, role);
    await rejectsFenced(() => recordUsage(attemptId, 10, true), (error) => error.code === '42501');
  }
  await switchRole('postgres');
  assert.equal(await scalar('select count(*)::int from public.usage_records'), 0);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await scalar("select has_function_privilege($1,'private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')", [role]), false);
  }
}));

test('a non-owner cannot read another member\'s allowance or usage figures', () => withTransaction(async () => {
  await actAs(owner, 'authenticated', 'aal2');
  await setAllowance(operator, 1000);
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(240));
  const attemptId = id(241);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');
  await actAs(null, 'bagos_research_executor');
  await recordUsage(attemptId, 42, true);

  await actAs(operatorTwo, 'authenticated', 'aal1');
  assert.equal(await scalar('select count(*)::int from public.usage_allowances where member_user_id=$1', [operator]), 0);
  assert.equal(await scalar('select count(*)::int from public.usage_records where requester_id=$1', [operator]), 0);
  await actAs(owner, 'authenticated', 'aal2');
  assert.equal(await scalar('select count(*)::int from public.usage_allowances where member_user_id=$1', [operator]), 1);
  assert.equal(await scalar('select count(*)::int from public.usage_records where requester_id=$1', [operator]), 1);
}));

test('the usage summary shows a member only themselves and an owner everyone', () => withTransaction(async () => {
  await actAs(owner, 'authenticated', 'aal2');
  await setAllowance(operator, 400);

  await actAs(operator, 'authenticated', 'aal1');
  const mine = await scalar('select private.read_usage_summary($1)', [tenant]);
  assert.equal(mine.members.length, 1);
  assert.equal(mine.members[0].userId, operator);
  assert.equal(mine.members[0].limitTokens, 400);
  assert.equal(mine.members[0].remainingTokens, 400);
  // The upstream subscription balance is absent by construction, never a number.
  assert.equal(mine.providerBalance, 'unavailable');

  await actAs(owner, 'authenticated', 'aal2');
  const all = await scalar('select private.read_usage_summary($1)', [tenant]);
  assert.ok(all.members.length > 1);
  assert.ok(all.members.some((entry) => entry.userId === operator));
}));

test('an unreported run is counted separately and never folded in as zero cost', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(240));
  const attemptId = id(241);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');
  await actAs(null, 'bagos_research_executor');
  await recordUsage(attemptId, null, false);

  await actAs(operator, 'authenticated', 'aal1');
  const summary = await scalar('select private.read_usage_summary($1)', [tenant]);
  const self = summary.members.find((entry) => entry.userId === operator);
  assert.equal(self.consumedTokens, 0);
  assert.equal(self.unreportedRuns, 1);
}));

test('a caller with no active membership cannot read the usage summary', () => withTransaction(async () => {
  await actAs(id(999), 'authenticated', 'aal2');
  await rejectsFenced(() => scalar('select private.read_usage_summary($1)', [tenant]), (error) => error.code === '42501');
}));
