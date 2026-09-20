import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrationNames as migrations } from './migration-inventory.mjs';

// Local SQL execution only; no credentials, URLs, Auth users or remote changes.
const db = new PGlite({ extensions: { pgcrypto } });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), otherTenant = id(2), owner = id(3), operator = id(4), outsider = id(5);
// Omar's revision id only ever lives inside jsonb provenance; it has no row of
// its own here because the claim command recovers it from Ziad's provenance,
// never from a second stored copy on the calendar brief.
const omarRevisionId = id(90);
const defaultBrief = (sourceRevisionId) => ({ idempotencyKey: id(20), objective: 'Draft a 7-day content calendar',
  sourceRevisionId, requestedPlatforms: ['instagram', 'facebook'] });
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
async function transactionAs(subject, action, role = 'authenticated', aal = 'aal1') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [subject ?? '', JSON.stringify({ sub: subject, aal, is_anonymous: false })]);
    await db.exec(`set session authorization ${role}`);
    return await action();
  } finally {
    await db.exec('rollback; set session authorization postgres; reset role');
  }
}
async function switchRole(role) {
  await db.exec('set session authorization postgres');
  await db.exec(`set session authorization ${role}`);
}
// The enqueue command is outside this boundary. Seed an immutable host brief
// and a stand-in for Ziad's completed revision under the command owner so
// every test exercises real lease/completion SQL, including lineage recovery.
// The analysis Nour plans from. The claim command reads this body server-side
// and hands it to the worker, so Ziad's revision needs a real stored body and
// not just a provenance pointer.
const ziadAnalysis = (binding) => ({ ...binding, producedBy: 'reel_analyst', sourceRevisionId: omarRevisionId,
  inspectedModalities: ['transcript'],
  findings: [{ ...binding, sourceRevisionId: omarRevisionId, modality: 'transcript',
    observation: 'Synthetic upstream transcript observation', interpretation: null, confidence: 'low', gaps: [] }],
  unavailableModalities: [] });
async function submit(build = defaultBrief, provenance = { schema_version: 1, source_revision_ids: [omarRevisionId] }, seedUpstream = true) {
  await switchRole('bagos_content_calendar_command');
  const campaign = await scalar("insert into public.campaigns(tenant_id,title,owner_membership_id) values ($1,'Calendar fixture',$2) returning id", [tenant,id(11)]);
  const objective = await scalar("insert into public.objectives(tenant_id,campaign_id,content,revision) values ($1,$2,'Draft calendar',1) returning id", [tenant,campaign]);
  const runId = await scalar(`insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values ($1,$2,$3,'content_calendar','queued','{"schema_version":1}',1) returning id`, [tenant,objective,id(11)]);
  const ziadArtifact = await scalar("insert into public.artifacts(tenant_id,campaign_id,type) values ($1,$2,'reel_analysis_evidence') returning id", [tenant,campaign]);
  const ziadRevisionId = await scalar(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,1,$3,'reel_analyst',$4,'{"schema_version":1}') returning id`,
    [tenant,ziadArtifact,'a'.repeat(64), JSON.stringify(provenance)]);
  // Only Ziad's command owner may write this row; Nour's new grant is select-only.
  const upstream = ziadAnalysis({ contractVersion: 'reel-analysis.v1', tenantId: tenant, taskId: id(80),
    runId: id(81), attemptId: id(82), liveEffects: false });
  if (seedUpstream) {
    await switchRole('bagos_reel_analysis_command');
    await db.query('insert into public.reel_analysis_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant,ziadRevisionId,upstream]);
    await switchRole('bagos_content_calendar_command');
  }
  const brief = build(ziadRevisionId);
  const artifact = await scalar("insert into public.artifacts(tenant_id,run_id,type) values ($1,$2,'content_calendar_brief') returning id", [tenant,runId]);
  const briefRevisionId = await scalar(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,1,$3,'orchestrator','{"schema_version":1}','{"schema_version":1}') returning id`, [tenant,artifact,'a'.repeat(64)]);
  await db.query('insert into public.content_calendar_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant,briefRevisionId,{brief}]);
  const taskId = await scalar(`insert into public.content_calendar_tasks(tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values ($1,$2,$3,$4,$5,$6) returning id`, [tenant,operator,runId,briefRevisionId,brief.idempotencyKey,'a'.repeat(64)]);
  await switchRole('authenticated');
  return { taskId, runId, briefRevisionId, ziadRevisionId, brief, upstream };
}
async function claim() {
  await switchRole('bagos_content_calendar_executor');
  return scalar('select private.claim_content_calendar_task()');
}
const failAttempt = (attemptId, code = 'provider_failure') => scalar('select private.fail_content_calendar_attempt($1,$2)', [attemptId, code]);
async function retryAttempt(attemptId) {
  await switchRole('authenticated');
  return scalar('select public.retry_content_calendar_attempt($1,$2)', [attemptId,tenant]);
}

before(async () => {
  await db.exec('create schema extensions; create extension pgcrypto with schema extensions');
  await db.exec(await readFile(new URL('./platform-stubs.sql', import.meta.url), 'utf8'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
    grant execute on function auth.jwt() to authenticated;`);
  assert.deepEqual((await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort(), migrations);
  for (const filename of migrations) await db.exec(await readFile(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
  await db.exec('begin');
  await db.query("insert into public.tenants(id,name) values ($1,'Calendar tenant'),($2,'Other tenant')", [tenant, otherTenant]);
  const triggers = (await db.query(`select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint
    where t.tgrelid='public.memberships'::regclass and c.confrelid='auth.users'::regclass`)).rows;
  for (const trigger of triggers) await db.exec(`alter table public.memberships disable trigger "${trigger.tgname}"`);
  for (const [memberId, tenantId, userId, role] of [[id(10), tenant, owner, 'owner'], [id(11), tenant, operator, 'operator'], [id(12), otherTenant, outsider, 'owner']]) {
    await db.query("insert into public.memberships(id,tenant_id,user_id,role,status) values ($1,$2,$3,$4,'active')", [memberId,tenantId,userId,role]);
  }
  await db.exec('set constraints all immediate');
  for (const trigger of triggers) await db.exec(`alter table public.memberships enable trigger "${trigger.tgname}"`);
  await db.exec("update public.tenants set status='active'");
  await db.query('insert into private.content_calendar_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.exec('commit');
});
after(async () => db.close());

test('worker claims once and returns attempt-bound task and two-hop handoff lineage', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit();
    const lease = await claim();
    assert.equal(lease.status, 'claimed');
    assert.equal(lease.task.taskId, submitted.taskId);
    assert.equal(lease.task.requesterId, operator);
    assert.equal(lease.task.agentId, 'content_creator');
    assert.deepEqual(lease.task.allowedScope, ['content-calendar:write']);
    assert.equal(lease.task.liveEffects, false);
    assert.deepEqual(lease.handoff.inputRevisionIds, [omarRevisionId, submitted.ziadRevisionId]);
    assert.equal(lease.task.brief.attemptId, lease.task.attemptId);
    assert.equal(lease.task.brief.sourceRevisionId, submitted.ziadRevisionId);
    assert.equal(lease.handoff.attemptId, lease.task.attemptId);
    assert.equal(Date.parse(lease.task.expiresAt) - Date.parse(lease.task.issuedAt), 300000);
    assert.equal(await claim(), null);
  });
});
test('claim fails hard when Ziad revision carries no recoverable lineage', async () => {
  await transactionAs(operator, async () => {
    await submit(defaultBrief, { schema_version: 1 });
    await switchRole('bagos_content_calendar_executor');
    await assert.rejects(scalar('select private.claim_content_calendar_task()'), /missing_lineage/);
  });
});
test('claim carries Ziad analysis body, read server-side from the revision the brief names', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit();
    const lease = await claim();
    assert.deepEqual(lease.sourceArtifact, submitted.upstream);
    // The executor role deliberately has no grant on Ziad's bodies: only the
    // security-definer claim command may read them. Verify the stored row from
    // a role that can, rather than widening the executor's reach.
    await switchRole('postgres');
    assert.deepEqual(lease.sourceArtifact,
      await scalar('select body from public.reel_analysis_revision_bodies where tenant_id=$1 and revision_id=$2', [tenant,submitted.ziadRevisionId]));
  });
});
test('claim fails closed when the upstream analysis body is missing, leaving no attempt behind', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit(defaultBrief, { schema_version: 1, source_revision_ids: [omarRevisionId] }, false);
    await switchRole('bagos_content_calendar_executor');
    // The raise aborts the surrounding transaction, so fence it: the point of
    // the test is that no attempt survives, which cannot be read afterwards
    // from an aborted block.
    await db.exec('savepoint before_missing_source');
    await assert.rejects(scalar('select private.claim_content_calendar_task()'), /missing_source_artifact/);
    await db.exec('rollback to savepoint before_missing_source');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.content_calendar_attempts'), 0);
    assert.equal(await scalar('select state from public.agent_runs where id=$1', [submitted.runId]), 'queued');
  });
});
test('the upstream analysis grant is select-only and reaches nothing else in Ziad schema', async () => {
  assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_command','public.reel_analysis_revision_bodies','SELECT')"), true);
  for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_command','public.reel_analysis_revision_bodies',$1)", [privilege]), false);
  }
  // reel_analysis_tasks is the one other cross-domain read Nour already had,
  // for requester/run lineage during fan-out; nothing else in Ziad's opens.
  for (const table of ['public.reel_analysis_outcomes','public.reel_analysis_attempts','private.reel_analysis_brand_binding']) {
    for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
      assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_command',$1,$2)", [table,privilege]), false);
    }
  }
  for (const role of ['bagos_content_calendar_executor','anon','authenticated','service_role']) {
    assert.equal(await scalar("select has_table_privilege($1,'public.reel_analysis_revision_bodies','INSERT')", [role]), false);
  }
  assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_executor','public.reel_analysis_revision_bodies','SELECT')"), false);
  assert.equal(await scalar(`select count(*)::int from pg_policies where schemaname='public' and tablename='reel_analysis_revision_bodies'
    and 'bagos_content_calendar_command' = any(roles) and cmd <> 'SELECT'`), 0);
});
test('provider failure is durable and retry is explicit, idempotent and attempt-bound', async () => {
  await transactionAs(operator, async () => {
    await submit(); const first = await claim();
    const failure = await failAttempt(first.task.attemptId);
    assert.equal(failure.retryable, true);
    assert.deepEqual(await failAttempt(first.task.attemptId), failure);
    assert.equal(await claim(), null);
    const retried = await retryAttempt(first.task.attemptId);
    assert.deepEqual(await retryAttempt(first.task.attemptId), retried);
    const second = await claim();
    assert.notEqual(second.task.attemptId, first.task.attemptId);
    assert.equal(second.task.runId, first.task.runId);
    await retryAttempt(first.task.attemptId);
    assert.equal(await claim(), null);
    await switchRole('authenticated');
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='content_calendar_retry_requested'"), 1);
    assert.equal(await scalar("select state from public.agent_runs where id=$1", [first.task.runId]), 'running');
  });
});
test('invalid evidence is terminal and retry cannot override it', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    assert.equal((await failAttempt(lease.task.attemptId, 'unrequested_platform')).retryable, false);
    await assert.rejects(retryAttempt(lease.task.attemptId), /not_retryable/);
  });
});
test('retry stops after three failed attempts', async () => {
  await transactionAs(operator, async () => {
    await submit();
    let lease;
    for (let count = 1; count <= 3; count++) {
      lease = await claim();
      assert.equal((await failAttempt(lease.task.attemptId)).retryable, count < 3);
      if (count < 3) await retryAttempt(lease.task.attemptId);
    }
    await assert.rejects(retryAttempt(lease.task.attemptId), /not_retryable/);
  });
});
test('expired worker lease becomes a visible timeout requiring explicit retry', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit();
    await switchRole('bagos_content_calendar_command');
    await db.query(`insert into public.content_calendar_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at)
      values ($1,$2,$3,$4,1,'running',clock_timestamp()-interval '6 minutes',clock_timestamp()-interval '1 minute')`,
    [id(80),tenant,submitted.taskId,submitted.runId]);
    await db.query("update public.agent_runs set state='running' where id=$1", [submitted.runId]);
    assert.deepEqual(await claim(), { status: 'failed', runId: submitted.runId, code: 'timeout' });
    assert.equal(await claim(), null);
    await retryAttempt(id(80));
    const recovered = await claim();
    assert.equal(recovered.task.taskId, submitted.taskId);
    assert.notEqual(recovered.task.attemptId, id(80));
    await assert.rejects(failAttempt(id(80), 'provider_failure'), /stale_attempt/);
  });
});
test('worker rechecks requester membership before execution', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit();
    await switchRole('postgres');
    await db.query("update public.memberships set status='revoked' where tenant_id=$1 and user_id=$2", [tenant,operator]);
    assert.deepEqual(await claim(), { status: 'failed', runId: submitted.runId, code: 'unauthorized' });
  });
});
test('tenant owners cannot retry another requester task', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await failAttempt(lease.task.attemptId);
    await switchRole('postgres');
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [owner,JSON.stringify({aal:'aal2'})]);
    await assert.rejects(retryAttempt(lease.task.attemptId), /unauthorized/);
  });
});
test('worker role has command-only access and browser cannot claim or fail attempts', async () => {
  assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_executor','public.content_calendar_attempts','SELECT')"), false);
  assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_executor','public.agent_runs','UPDATE')"), false);
  assert.equal(await scalar("select pg_has_role('bagos_content_calendar_executor','bagos_content_calendar_command','MEMBER')"), false);
  await transactionAs(operator, () => assert.rejects(scalar('select private.claim_content_calendar_task()'), (error) => error.code === '42501'));
  await transactionAs(operator, () => assert.rejects(failAttempt(id(80)), (error) => error.code === '42501'));
});

function calendarResult(lease, platforms = ['instagram', 'facebook']) {
  const binding = { contractVersion: 'content-calendar.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId, liveEffects: false, sourceRevisionId: lease.task.brief.sourceRevisionId };
  const formats = ['post', 'reel', 'story', 'carousel'];
  const entries = Array.from({ length: 7 }, (_, dayIndex) => ({ ...binding, dayIndex,
    platform: platforms[dayIndex % platforms.length], format: formats[dayIndex % formats.length],
    conceptTitle: `Concept for day ${dayIndex}` }));
  return { artifact: { ...binding, producedBy: 'content_creator', entries } };
}
const complete = (lease, result = calendarResult(lease)) => scalar('select private.complete_content_calendar_attempt($1,$2::jsonb)',
  [lease.task.attemptId,JSON.stringify(result.artifact)]);

test('completion persists source-linked body, command receipt, digest, revision and audit atomically', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = calendarResult(lease);
    const completed = await complete(lease, result);
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.attemptId, lease.task.attemptId);
    await switchRole('authenticated');
    assert.deepEqual(await scalar('select body from public.content_calendar_revision_bodies where revision_id=$1', [completed.revisionId]), result.artifact);
    assert.equal(await scalar(`select v.content_digest = encode(sha256(convert_to(b.body::text,'UTF8')),'hex')
      from public.artifact_revisions v join public.content_calendar_revision_bodies b on b.revision_id=v.id where v.id=$1`, [completed.revisionId]), true);
    assert.equal(await scalar('select state from public.agent_runs where id=$1', [lease.task.runId]), 'succeeded');
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='content_calendar_attempt_completed'"), 1);
    await switchRole('postgres');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [outsider]);
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.content_calendar_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.content_calendar_revision_bodies'), 0);
  });
});
test('completion replay is digest-bound without duplicate artifacts', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = calendarResult(lease);
    assert.deepEqual(await complete(lease,result), await complete(lease,result));
    await switchRole('authenticated');
    // submit() itself seeds two artifacts (Ziad's stand-in revision and the
    // calendar brief); only one more is added by the single real completion.
    assert.equal(await scalar('select count(*)::int from public.artifacts'), 3);
    await switchRole('postgres');
    assert.equal(await scalar("select count(*)::int from public.command_receipts where command_kind='complete_content_calendar_attempt'"), 1);
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='content_calendar_attempt_completed'"), 1);
    await switchRole('bagos_content_calendar_executor');
    result.artifact.entries[0].conceptTitle = 'Changed output';
    await assert.rejects(complete(lease,result), /idempotency_conflict/);
  });
});
test('completion rejects mismatched identity, lineage, effects and shape', async () => {
  const mutations = [
    (result) => { result.artifact.tenantId = otherTenant; },
    (result) => { result.artifact.attemptId = id(99); },
    (result) => { result.artifact.sourceRevisionId = id(99); },
    (result) => { result.artifact.liveEffects = true; },
    (result) => { result.artifact.producedBy = 'content_analyst'; },
    (result) => { result.artifact.entries.pop(); },
    (result) => { result.artifact.entries[0].tenantId = otherTenant; },
    (result) => { result.artifact.entries[0].sourceRevisionId = id(99); },
    (result) => { result.artifact.entries[0].format = 'thread'; },
    (result) => { result.artifact.entries[0].conceptTitle = ''; },
    (result) => { result.artifact.entries[0].extra = true; },
    (result) => { result.artifact.entries[0].dayIndex = result.artifact.entries[1].dayIndex; },
    (result) => { result.artifact.entries[0].dayIndex = -1; },
    (result) => { result.artifact.entries[0].dayIndex = 1.5; },
    (result) => { result.artifact.extra = true; },
  ];
  for (const mutate of mutations) {
    await transactionAs(operator, async () => {
      await submit(); const lease = await claim(); const result = calendarResult(lease); mutate(result);
      await assert.rejects(complete(lease,result), (error) => error.code === '22023');
    });
  }
});
test('SQL refuses completion when an entry uses a platform outside the requested set', async () => {
  await transactionAs(operator, async () => {
    await submit((sourceRevisionId) => ({ ...defaultBrief(sourceRevisionId), requestedPlatforms: ['instagram'] }));
    const lease = await claim();
    const result = calendarResult(lease, ['instagram']);
    result.artifact.entries[3].platform = 'facebook';
    await assert.rejects(complete(lease,result), /unrequested_platform/);
  });
});
test('completion permits a calendar drawn entirely from a single requested platform', async () => {
  await transactionAs(operator, async () => {
    await submit((sourceRevisionId) => ({ ...defaultBrief(sourceRevisionId), requestedPlatforms: ['facebook'] }));
    const lease = await claim();
    const result = calendarResult(lease, ['facebook']);
    assert.equal((await complete(lease,result)).status, 'succeeded');
  });
});
test('failed attempt cannot complete after a new attempt was claimed', async () => {
  await transactionAs(operator, async () => {
    await submit(); const old = await claim(); await failAttempt(old.task.attemptId); await retryAttempt(old.task.attemptId);
    const fresh = await claim(); assert.notEqual(old.task.attemptId,fresh.task.attemptId);
    await assert.rejects(complete(old), /stale_attempt/);
  });
});
test('completion rechecks revoked membership, not just the original lease', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    await switchRole('postgres');
    await db.query("update public.memberships set status='revoked' where tenant_id=$1 and user_id=$2", [tenant,operator]);
    await switchRole('bagos_content_calendar_executor');
    await assert.rejects(complete(lease), /unauthorized/);
  });
});
test('late completion audit failure preserves running state and creates no partial output', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    await switchRole('postgres');
    await db.exec("alter table public.audit_log add constraint test_reject_completion check (event_type <> 'content_calendar_attempt_completed')");
    await switchRole('bagos_content_calendar_executor');
    await db.exec('savepoint before_completion');
    await assert.rejects(complete(lease), (error) => error.code === '23514');
    await db.exec('rollback to savepoint before_completion');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.content_calendar_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.artifacts'), 2);
    assert.equal(await scalar('select count(*)::int from public.artifact_revisions'), 2);
    assert.equal(await scalar('select count(*)::int from public.content_calendar_revision_bodies'), 1);
    assert.equal(await scalar("select state from public.content_calendar_attempts where task_id=$1", [lease.task.taskId]), 'running');
    assert.equal(await scalar('select state from public.agent_runs where id=$1', [lease.task.runId]), 'running');
  });
});
test('browsers and service role cannot complete and stored output is immutable', async () => {
  for (const role of ['authenticated','service_role']) {
    await transactionAs(operator, () => assert.rejects(scalar('select private.complete_content_calendar_attempt($1,$2)', [id(80),{}]),
      (error) => error.code === '42501'), role);
  }
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await complete(lease);
    await switchRole('postgres');
    await assert.rejects(db.exec("update public.content_calendar_outcomes set completion_digest=repeat('b',64)"), (error) => error.code === '23514');
  });
});

test('executor is NOLOGIN, owns no tables and has only the three private command grants', async () => {
  assert.deepEqual((await db.query("select rolcanlogin,rolbypassrls,rolinherit from pg_roles where rolname='bagos_content_calendar_executor'")).rows[0],
    {rolcanlogin:false, rolbypassrls:false, rolinherit:false});
  for (const role of ['bagos_content_calendar_executor','bagos_content_calendar_command']) {
    assert.equal(await scalar('select count(*)::int from pg_tables where tableowner=$1', [role]), 0);
  }
  for (const table of ['content_calendar_tasks','content_calendar_attempts','content_calendar_outcomes','content_calendar_revision_bodies','command_receipts']) {
    for (const operation of ['SELECT','INSERT','UPDATE','DELETE']) {
      assert.equal(await scalar('select has_table_privilege($1,$2,$3)', ['bagos_content_calendar_executor',`public.${table}`,operation]), false);
    }
  }
  const commands = ['claim_content_calendar_task()','fail_content_calendar_attempt(uuid,text)','complete_content_calendar_attempt(uuid,jsonb)'];
  for (const command of commands) {
    for (const role of ['anon','authenticated','service_role','bagos_reel_analyst_executor']) {
      assert.equal(await scalar('select has_function_privilege($1,$2,$3)', [role,`private.${command}`,'EXECUTE']), false);
    }
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['bagos_content_calendar_executor',`private.${command}`,'EXECUTE']), true);
    const details = (await db.query("select prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=$1::regprocedure", [`private.${command}`])).rows[0];
    assert.equal(details.prosecdef, true);
    assert.deepEqual(details.proconfig, ['search_path=""']);
    assert.equal(details.owner, 'bagos_content_calendar_command');
  }
});

test('legacy commands cannot mutate content_calendar runs or attach fabricated artifacts', async () => {
  for (const command of ['fail','retry','artifacts']) {
    await transactionAs(operator, async () => {
      const submitted = await submit();
      const calls = {
        fail: ['select private.fail_agent_workflow($1,$2,$3)', [tenant,submitted.runId,{schema_version:1,message:'forged'}]],
        retry: ['select private.retry_agent_workflow($1,$2)', [tenant,submitted.runId]],
        artifacts: ['select private.record_agent_artifacts($1,$2,$3::jsonb,$4::jsonb)',
          [tenant,submitted.runId,JSON.stringify([{id:id(30),kind:'content_calendar',data:{}}]),'[]']],
      };
      const [sql, params] = calls[command];
      await assert.rejects(db.query(sql,params), (error) => ['42501','55000'].includes(error.code));
    });
  }
});

test('retry requires the bound tenant and remains terminal for invalid-contract failures', async () => {
  for (const expected of [otherTenant,null]) {
    await transactionAs(operator, async () => {
      await submit(); const lease = await claim(); await failAttempt(lease.task.attemptId);
      await switchRole('authenticated');
      await assert.rejects(scalar('select public.retry_content_calendar_attempt($1,$2)', [lease.task.attemptId,expected]), /unauthorized/);
    });
  }
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await failAttempt(lease.task.attemptId,'invalid_contract');
    await assert.rejects(retryAttempt(lease.task.attemptId), /not_retryable/);
  });
});

test('expired running attempts reject fail and completion before a later claim reclaims them', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit(); await switchRole('bagos_content_calendar_command');
    await db.query(`insert into public.content_calendar_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at)
      values ($1,$2,$3,$4,1,'running',clock_timestamp()-interval '6 minutes',clock_timestamp()-interval '1 minute')`,
      [id(80),tenant,submitted.taskId,submitted.runId]);
    await db.query("update public.agent_runs set state='running' where id=$1", [submitted.runId]);
    await switchRole('bagos_content_calendar_executor');
    const lease = {task:{tenantId:tenant,taskId:submitted.taskId,runId:submitted.runId,attemptId:id(80),brief:submitted.brief}};
    for (const invoke of [() => failAttempt(id(80)), () => complete(lease)]) {
      await db.exec('savepoint expired_command');
      await assert.rejects(invoke(), /stale_attempt/);
      await db.exec('rollback to savepoint expired_command');
    }
    assert.equal((await claim()).code, 'timeout');
  });
});

for (const stage of ['claim','fail','retry']) {
  test(`late ${stage} audit failure rolls back its state transition`, async () => {
    await transactionAs(operator, async () => {
      await submit();
      const lease = stage === 'claim' ? null : await claim();
      if (stage === 'retry') await failAttempt(lease.task.attemptId);
      const event = {claim:'content_calendar_attempt_started',fail:'content_calendar_attempt_failed',retry:'content_calendar_retry_requested'}[stage];
      await switchRole('postgres');
      await db.exec(`alter table public.audit_log add constraint reject_transition_audit check (event_type <> '${event}')`);
      await db.exec('savepoint before_transition');
      await assert.rejects((async () => {
        if (stage === 'claim') return claim();
        if (stage === 'retry') return retryAttempt(lease.task.attemptId);
        await switchRole('bagos_content_calendar_executor'); return failAttempt(lease.task.attemptId);
      })(), (error) => error.code === '23514');
      await db.exec('rollback to savepoint before_transition'); await switchRole('postgres');
      assert.equal(await scalar('select state from public.agent_runs'), {claim:'queued',fail:'running',retry:'failed'}[stage]);
      assert.equal(await scalar('select count(*)::int from public.audit_log where event_type=$1', [event]), 0);
      if (stage === 'claim') assert.equal(await scalar('select count(*)::int from public.content_calendar_attempts'), 0);
      if (stage === 'retry') assert.equal(await scalar('select retry_requested_at from public.content_calendar_attempts'), null);
    });
  });
}

test('receipt persistence failure rolls back the completion audit and every output row', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await switchRole('postgres');
    await db.exec("alter table public.command_receipts add constraint reject_calendar_receipt check (command_kind <> 'complete_content_calendar_attempt')");
    await switchRole('bagos_content_calendar_executor'); await db.exec('savepoint before_receipt');
    await assert.rejects(complete(lease), (error) => error.code === '23514');
    await db.exec('rollback to savepoint before_receipt'); await switchRole('postgres');
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='content_calendar_attempt_completed'"), 0);
    assert.equal(await scalar('select count(*)::int from public.command_receipts'), 0);
    assert.equal(await scalar('select count(*)::int from public.content_calendar_outcomes'), 0);
    for (const table of ['artifacts','artifact_revisions','content_calendar_revision_bodies']) {
      assert.equal(await scalar(`select count(*)::int from public.${table}`), table === 'content_calendar_revision_bodies' ? 1 : 2);
    }
    assert.equal(await scalar('select state from public.content_calendar_attempts'), 'running');
    assert.equal(await scalar('select state from public.agent_runs'), 'running');
  });
});
