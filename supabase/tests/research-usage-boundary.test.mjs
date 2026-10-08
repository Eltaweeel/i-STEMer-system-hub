import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrationNames as migrations } from './migration-inventory.mjs';

// Local SQL execution only; no credentials, URLs, Auth users or remote changes.
const db = new PGlite({ extensions: { pgcrypto } });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), owner = id(3), operator = id(4);
const brief = (key) => ({ idempotencyKey: key, objective: 'Compare education programs', sources: ['https://example.org/about'] });
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];

async function rejectsFenced(run, matcher) {
  await db.exec('savepoint before_rejection');
  await assert.rejects(run, matcher);
  await db.exec('rollback to savepoint before_rejection');
}

async function switchRole(role) {
  await db.exec('set session authorization postgres');
  await db.exec(`set session authorization ${role}`);
}

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

const submit = (key, tenantId = tenant) => scalar('select public.submit_research_brief($1::jsonb,$2::uuid)', [JSON.stringify(brief(key)), tenantId]);
const submitFor = (tenantId, key) => scalar('select public.submit_research_brief($1::jsonb,$2::uuid)', [JSON.stringify(brief(key)), tenantId]);

async function seedAttemptFor(tenantId, attemptId, taskId, runId, state = 'succeeded') {
  await actAs(null, 'bagos_research_command');
  const errorCode = state === 'failed' ? 'provider_failure' : null;
  const finished = state === 'running' ? null : new Date().toISOString();
  await db.query(`insert into public.research_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at,finished_at,error_code)
    values ($1,$2,$3,$4,1,$5,now() - interval '1 minute',now() + interval '4 minutes',$6,$7)`,
    [attemptId, tenantId, taskId, runId, state, finished, errorCode]);
}

const seedAttempt = (attemptId, taskId, runId, state = 'succeeded') => seedAttemptFor(tenant, attemptId, taskId, runId, state);

const recordUsage = (attemptId, reportedTokens, usageReported) =>
  scalar('select private.record_research_usage($1,$2,$3)', [attemptId, reportedTokens, usageReported]);

const recordAgentUsage = (attemptId, agent, reportedTokens, usageReported) =>
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
  for (const [memberId, userId, role] of [[id(10), owner, 'owner'], [id(11), operator, 'operator']]) {
    await db.query("insert into public.memberships(id,tenant_id,user_id,role,status) values ($1,$2,$3,$4,'active')", [memberId, tenant, userId, role]);
  }
  await db.exec('set constraints all immediate');
  for (const trigger of triggers) await db.exec(`alter table public.memberships enable trigger "${trigger.tgname}"`);
  await db.exec("update public.tenants set status='active'");
  await db.query('insert into private.research_brand_binding(tenant_id) values ($1)', [tenant]);

  // Create the dedicated worker login exactly as staging will have it
  await db.exec('create role istemer_research_worker login');
  await db.exec('grant bagos_research_executor to istemer_research_worker');

  await db.exec('commit');
});

after(async () => db.close());

test('the worker login records usage for a research attempt of the bound tenant', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(300));
  const attemptId = id(301);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');

  await switchRole('istemer_research_worker');
  const recorded = await recordUsage(attemptId, 1500, true);
  assert.equal(recorded.attemptId, attemptId);
  assert.equal(recorded.reportedTokens, 1500);
  assert.equal(recorded.usageReported, true);

  await switchRole('postgres');
  const usageRecords = (await db.query('select * from public.usage_records where attempt_id=$1', [attemptId])).rows;
  assert.equal(usageRecords.length, 1);
  assert.equal(usageRecords[0].agent_id, 'competitor_analyst');
  assert.equal(usageRecords[0].requester_id, operator);
  assert.equal(usageRecords[0].tenant_id, tenant);
  assert.equal(usageRecords[0].run_id, submitted.runId);
  assert.equal(usageRecords[0].task_id, submitted.taskId);
  assert.equal(usageRecords[0].reported_tokens, 1500);

  const auditLogs = (await db.query(`select * from public.audit_log where event_type='agent_usage_recorded' and target_reference=$1`, [attemptId])).rows;
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].event_type, 'agent_usage_recorded');
  assert.equal(auditLogs[0].actor_kind, 'system');
  assert.equal(auditLogs[0].evidence['agent_id'], 'competitor_analyst');
}));

test('unreported usage stays unreported, never zero', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted1 = await submit(id(310));
  const attemptId = id(311);

  const submitted2 = await submit(id(312));
  const attempt2 = id(313);

  const submitted3 = await submit(id(314));
  const attempt3 = id(315);

  await seedAttempt(attemptId, submitted1.taskId, submitted1.runId, 'succeeded');
  await seedAttempt(attempt2, submitted2.taskId, submitted2.runId, 'succeeded');
  await seedAttempt(attempt3, submitted3.taskId, submitted3.runId, 'succeeded');

  await switchRole('istemer_research_worker');

  // (attempt, null, false) succeeds
  const unreported = await recordUsage(attemptId, null, false);
  assert.equal(unreported.reportedTokens, null);
  assert.equal(unreported.usageReported, false);

  await switchRole('postgres');
  const row1 = (await db.query('select * from public.usage_records where attempt_id=$1', [attemptId])).rows[0];
  assert.equal(row1.reported_tokens, null);
  assert.equal(row1.usage_reported, false);

  await switchRole('istemer_research_worker');

  // (attempt2, null, true) is rejected with error.code '22023'
  await rejectsFenced(() => recordUsage(attempt2, null, true), (error) => error.code === '22023');

  // (attempt3, 5, false) is rejected with error.code '22023'
  await rejectsFenced(() => recordUsage(attempt3, 5, false), (error) => error.code === '22023');
}));

test('a replay is idempotent and a different figure conflicts', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(320));
  const attemptId = id(321);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');

  await switchRole('istemer_research_worker');
  const first = await recordUsage(attemptId, 2000, true);

  // Same call twice returns deepEqual results
  const second = await recordUsage(attemptId, 2000, true);
  assert.deepEqual(first, second);

  // Only one row stored
  await switchRole('postgres');
  assert.equal(await scalar('select count(*)::int from public.usage_records where attempt_id=$1', [attemptId]), 1);

  await switchRole('istemer_research_worker');
  // Different figure conflicts
  await rejectsFenced(() => recordUsage(attemptId, 3000, true), (error) => error.code === '22023' && /idempotency_conflict/.test(error.message));
}));

test('a running research attempt cannot be metered', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(330));
  const attemptId = id(331);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'running');

  await switchRole('istemer_research_worker');
  await rejectsFenced(() => recordUsage(attemptId, 100, true), (error) => error.code === '55000');
}));

test('the worker login cannot call the broad function at all', () => withTransaction(async () => {
  await actAs(operator, 'authenticated', 'aal1');
  const submitted = await submit(id(340));
  const attemptId = id(341);
  await seedAttempt(attemptId, submitted.taskId, submitted.runId, 'succeeded');

  await switchRole('istemer_research_worker');

  // Cannot call for competitor_analyst
  await rejectsFenced(() => recordAgentUsage(attemptId, 'competitor_analyst', 1, true), (error) => error.code === '42501');

  // Cannot call for reel_analyst
  await rejectsFenced(() => recordAgentUsage(attemptId, 'reel_analyst', 1, true), (error) => error.code === '42501');

  // Cannot call for content_creator
  await rejectsFenced(() => recordAgentUsage(attemptId, 'content_creator', 1, true), (error) => error.code === '42501');

  await switchRole('postgres');

  // Worker cannot execute broad function
  assert.equal(
    await scalar(`select has_function_privilege('istemer_research_worker','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    false
  );

  // bagos_research_executor cannot execute it either (revoked in migration)
  assert.equal(
    await scalar(`select has_function_privilege('bagos_research_executor','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    false
  );

  // anon, authenticated, service_role have no execute
  assert.equal(
    await scalar(`select has_function_privilege('anon','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    false
  );
  assert.equal(
    await scalar(`select has_function_privilege('authenticated','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    false
  );
  assert.equal(
    await scalar(`select has_function_privilege('service_role','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    false
  );

  // No one in PUBLIC has privileges on research_usage_command or record_agent_usage
  assert.equal(
    await scalar(`select count(*)::int from information_schema.routine_privileges
      where routine_schema='private' and routine_name in ('record_agent_usage','record_research_usage') and grantee='PUBLIC'`),
    0
  );

  // anon, authenticated, service_role have no execute on record_research_usage
  assert.equal(
    await scalar(`select has_function_privilege('anon','private.record_research_usage(uuid,integer,boolean)','EXECUTE')`),
    false
  );
  assert.equal(
    await scalar(`select has_function_privilege('authenticated','private.record_research_usage(uuid,integer,boolean)','EXECUTE')`),
    false
  );
  assert.equal(
    await scalar(`select has_function_privilege('service_role','private.record_research_usage(uuid,integer,boolean)','EXECUTE')`),
    false
  );
}));

test('an attempt id from another pipeline is refused', () => withTransaction(async () => {
  // Try with a random uuid that is not a research attempt (id(950))
  await switchRole('istemer_research_worker');
  await rejectsFenced(() => recordUsage(id(950), 1, true), (error) => error.code === '55000');

  await switchRole('postgres');
  assert.equal(await scalar('select count(*)::int from public.usage_records where attempt_id=$1', [id(950)]), 0);

  // A real, finished Ziad attempt is covered with the worker login in
  // apps/istemer-demo/__tests__/research-worker-postgres.test.ts; this fixture never creates one.
}));

test('a research attempt of another tenant is refused', () => withTransaction(async () => {
  // Create a second tenant
  const tenant2 = id(2);
  const user7 = id(7);

  // All infrastructure setup as postgres
  await switchRole('postgres');
  // auth.users stays empty in this harness (platform-stubs.sql); skip its FK triggers as before() does.
  await db.query("insert into public.tenants(id,name) values ($1,'Other')", [tenant2]);
  const fkTriggers = (await db.query(`select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint
    where t.tgrelid='public.memberships'::regclass and c.confrelid='auth.users'::regclass`)).rows;
  for (const trigger of fkTriggers) await db.exec(`alter table public.memberships disable trigger "${trigger.tgname}"`);
  await db.query(`insert into public.memberships(id,tenant_id,user_id,role,status)
    values ($1,$2,$3,'owner','active'), ($4,$2,$5,'operator','active')`, [id(21), tenant2, id(8), id(20), user7]);
  await db.exec('set constraints all immediate');
  for (const trigger of fkTriggers) await db.exec(`alter table public.memberships enable trigger "${trigger.tgname}"`);
  await db.query("update public.tenants set status=$1 where id=$2", ['active', tenant2]);

  // Get trigger names and disable them
  const bindingTriggers = (await db.query(`select t.tgname from pg_trigger t
    where t.tgrelid='private.research_brand_binding'::regclass`)).rows;
  for (const trigger of bindingTriggers) {
    await db.exec(`alter table private.research_brand_binding disable trigger "${trigger.tgname}"`);
  }

  // Update research_brand_binding to tenant2 temporarily
  await db.query('update private.research_brand_binding set tenant_id=$1 where singleton=true', [tenant2]);

  // Re-enable triggers
  for (const trigger of bindingTriggers) {
    await db.exec(`alter table private.research_brand_binding enable trigger "${trigger.tgname}"`);
  }

  // Submit from tenant2 as user7
  await actAs(user7, 'authenticated', 'aal1');
  const submitted = await submitFor(tenant2, id(360));
  const attemptId = id(361);
  await seedAttemptFor(tenant2, attemptId, submitted.taskId, submitted.runId, 'succeeded');

  // Switch back to postgres to change binding
  await switchRole('postgres');

  // Disable trigger again to switch binding back
  for (const trigger of bindingTriggers) {
    await db.exec(`alter table private.research_brand_binding disable trigger "${trigger.tgname}"`);
  }

  // Set binding back to original tenant
  await db.query('update private.research_brand_binding set tenant_id=$1 where singleton=true', [tenant]);

  // Re-enable triggers
  for (const trigger of bindingTriggers) {
    await db.exec(`alter table private.research_brand_binding enable trigger "${trigger.tgname}"`);
  }

  // Not vacuous: the broad function, which the executor held before this migration, accepts this very attempt.
  await db.exec('savepoint broad_would_accept');
  assert.equal((await recordAgentUsage(attemptId, 'competitor_analyst', 10, true)).attemptId, attemptId);
  await db.exec('rollback to savepoint broad_would_accept');

  // Now test the rejection as the worker
  await switchRole('istemer_research_worker');
  await rejectsFenced(() => recordUsage(attemptId, 10, true), (error) => error.code === '55000');

  await switchRole('postgres');
  assert.equal(await scalar('select count(*)::int from public.usage_records where attempt_id=$1', [attemptId]), 0);
}));

test('the reel and calendar executors keep their own usage grant', () => withTransaction(async () => {
  await switchRole('postgres');

  // bagos_reel_analyst_executor has execute on record_agent_usage
  assert.equal(
    await scalar(`select has_function_privilege('bagos_reel_analyst_executor','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    true
  );

  // bagos_content_calendar_executor has execute on record_agent_usage
  assert.equal(
    await scalar(`select has_function_privilege('bagos_content_calendar_executor','private.record_agent_usage(uuid,text,integer,boolean)','EXECUTE')`),
    true
  );

  // Neither has execute on record_research_usage
  assert.equal(
    await scalar(`select has_function_privilege('bagos_reel_analyst_executor','private.record_research_usage(uuid,integer,boolean)','EXECUTE')`),
    false
  );
  assert.equal(
    await scalar(`select has_function_privilege('bagos_content_calendar_executor','private.record_research_usage(uuid,integer,boolean)','EXECUTE')`),
    false
  );
}));
