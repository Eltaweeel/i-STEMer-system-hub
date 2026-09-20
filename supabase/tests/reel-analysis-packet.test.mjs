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
const brief = { idempotencyKey: id(20), objective: 'Analyze supplied transcript', sourceRevisionId: id(91),
  requestedModalities: ['transcript','audio'], suppliedModalities: ['transcript'] };
// Stands in for the evidence Omar durably persisted at brief.sourceRevisionId.
// The claim command now reads this body and hands it to the worker, so the
// revision the brief names has to be a real row, not a bare identifier.
const omarEvidence = { contractVersion: 'research.v1', taskId: id(80), runId: id(81), attemptId: id(82),
  tenantId: tenant, producedBy: 'competitor_analyst', sourceRevisionIds: [id(83)],
  evidence: [{ sourceUrl: 'https://example.org/about', inspectionReceiptId: id(84), inspectedAt: '2026-01-01T00:00:00.000Z',
    observation: 'Synthetic upstream observation', interpretation: null, confidence: 'low', gaps: [] }],
  gaps: [], liveEffects: false };
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
// The enqueue command is outside this boundary. Seed an immutable host brief
// under the command owner so every test exercises real lease/completion SQL.
async function submit(payload = brief) {
  await switchRole('bagos_reel_analysis_command');
  const campaign = await scalar("insert into public.campaigns(tenant_id,title,owner_membership_id) values ($1,'Reel fixture',$2) returning id", [tenant,id(11)]);
  const objective = await scalar("insert into public.objectives(tenant_id,campaign_id,content,revision) values ($1,$2,'Analyze',1) returning id", [tenant,campaign]);
  const runId = await scalar(`insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values ($1,$2,$3,'reel_analysis','queued','{"schema_version":1}',1) returning id`, [tenant,objective,id(11)]);
  const artifact = await scalar("insert into public.artifacts(tenant_id,run_id,type) values ($1,$2,'reel_analysis_brief') returning id", [tenant,runId]);
  const briefRevisionId = await scalar(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,1,$3,'orchestrator','{"schema_version":1}','{"schema_version":1}') returning id`, [tenant,artifact,'a'.repeat(64)]);
  await db.query('insert into public.reel_analysis_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant,briefRevisionId,{brief:payload}]);
  const taskId = await scalar(`insert into public.reel_analysis_tasks(tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values ($1,$2,$3,$4,$5,$6) returning id`, [tenant,operator,runId,briefRevisionId,payload.idempotencyKey,'a'.repeat(64)]);
  await switchRole('authenticated');
  return {taskId,runId,briefRevisionId};
}
async function switchRole(role) {
  await db.exec('set session authorization postgres');
  await db.exec(`set session authorization ${role}`);
}
async function claim() {
  await switchRole('bagos_reel_analyst_executor');
  return scalar('select private.claim_reel_analysis_task()');
}
const failAttempt = (attemptId, code = 'provider_failure') => scalar('select private.fail_reel_analysis_attempt($1,$2)', [attemptId, code]);
async function retryAttempt(attemptId) {
  await switchRole('authenticated');
  return scalar('select public.retry_reel_analysis_attempt($1,$2)', [attemptId,tenant]);
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
  await db.query("insert into public.tenants(id,name) values ($1,'Research tenant'),($2,'Other tenant')", [tenant, otherTenant]);
  const triggers = (await db.query(`select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint
    where t.tgrelid='public.memberships'::regclass and c.confrelid='auth.users'::regclass`)).rows;
  for (const trigger of triggers) await db.exec(`alter table public.memberships disable trigger "${trigger.tgname}"`);
  for (const [memberId, tenantId, userId, role] of [[id(10), tenant, owner, 'owner'], [id(11), tenant, operator, 'operator'], [id(12), otherTenant, outsider, 'owner']]) {
    await db.query("insert into public.memberships(id,tenant_id,user_id,role,status) values ($1,$2,$3,$4,'active')", [memberId,tenantId,userId,role]);
  }
  await db.exec('set constraints all immediate');
  for (const trigger of triggers) await db.exec(`alter table public.memberships enable trigger "${trigger.tgname}"`);
  await db.exec("update public.tenants set status='active'");
  await db.query('insert into private.reel_analysis_brand_binding(tenant_id) values ($1)', [tenant]);
  // Seeded under Omar's command owner, the only role permitted to write these
  // rows: Ziad's new grant is select-only and must never be able to forge one.
  await db.exec('set session authorization bagos_research_command');
  const omarCampaign = await scalar("insert into public.campaigns(tenant_id,title,owner_membership_id) values ($1,'Omar fixture',$2) returning id", [tenant,id(11)]);
  const omarArtifact = await scalar("insert into public.artifacts(tenant_id,campaign_id,type) values ($1,$2,'research_evidence') returning id", [tenant,omarCampaign]);
  await db.query(`insert into public.artifact_revisions(id,tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,$3,1,$4,'competitor_analyst','{"schema_version":1}','{"schema_version":1}')`, [brief.sourceRevisionId,tenant,omarArtifact,'a'.repeat(64)]);
  await db.query('insert into public.research_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant,brief.sourceRevisionId,omarEvidence]);
  await db.exec('set session authorization postgres');
  await db.exec('commit');
});
after(async () => db.close());

test('worker claims once and returns attempt-bound task and handoff', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit();
    const lease = await claim();
    assert.equal(lease.status, 'claimed');
    assert.equal(lease.task.taskId, submitted.taskId);
    assert.equal(lease.task.requesterId, operator);
    assert.equal(lease.task.agentId, 'reel_analyst');
    assert.equal(lease.task.liveEffects, false);
    assert.deepEqual(lease.handoff.inputRevisionIds, [brief.sourceRevisionId]);
    assert.equal(lease.task.brief.attemptId, lease.task.attemptId);
    assert.equal(lease.task.brief.sourceRevisionId, brief.sourceRevisionId);
    assert.equal(lease.handoff.attemptId, lease.task.attemptId);
    assert.equal(Date.parse(lease.task.expiresAt) - Date.parse(lease.task.issuedAt), 300000);
    assert.equal(await claim(), null);
  });
});
test('claim carries Omar evidence body, read server-side from the revision the brief names', async () => {
  await transactionAs(operator, async () => {
    await submit();
    const lease = await claim();
    assert.deepEqual(lease.sourceArtifact, omarEvidence);
    // The executor role deliberately has no grant on Omar's bodies: only the
    // security-definer claim command may read them. Verify the stored row from
    // a role that can, rather than widening the executor's reach.
    await switchRole('postgres');
    assert.deepEqual(lease.sourceArtifact,
      await scalar('select body from public.research_revision_bodies where tenant_id=$1 and revision_id=$2', [tenant,brief.sourceRevisionId]));
  });
});
test('claim fails closed when the upstream evidence body is missing, leaving no attempt behind', async () => {
  await transactionAs(operator, async () => {
    await submit({ ...brief, idempotencyKey: id(22), sourceRevisionId: id(92) });
    await switchRole('bagos_reel_analyst_executor');
    // The raise aborts the surrounding transaction, so fence it: the point of
    // the test is that no attempt survives, which cannot be read afterwards
    // from an aborted block.
    await db.exec('savepoint before_missing_source');
    await assert.rejects(scalar('select private.claim_reel_analysis_task()'), /missing_source_artifact/);
    await db.exec('rollback to savepoint before_missing_source');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_attempts'), 0);
    assert.equal(await scalar("select state from public.agent_runs where mode='reel_analysis'"), 'queued');
  });
});
test('the upstream evidence grant is select-only and reaches nothing else in Omar schema', async () => {
  assert.equal(await scalar("select has_table_privilege('bagos_reel_analysis_command','public.research_revision_bodies','SELECT')"), true);
  for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    assert.equal(await scalar("select has_table_privilege('bagos_reel_analysis_command','public.research_revision_bodies',$1)", [privilege]), false);
  }
  // agent_tasks is the one other cross-domain read Ziad already had, for
  // requester/run lineage during fan-out; nothing else in Omar's schema opens.
  for (const table of ['public.research_outcomes','public.research_attempts','private.research_brand_binding']) {
    for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
      assert.equal(await scalar("select has_table_privilege('bagos_reel_analysis_command',$1,$2)", [table,privilege]), false);
    }
  }
  // The executor login that actually calls the command still sees no table.
  for (const role of ['bagos_reel_analyst_executor','anon','authenticated','service_role']) {
    assert.equal(await scalar("select has_table_privilege($1,'public.research_revision_bodies','INSERT')", [role]), false);
  }
  assert.equal(await scalar("select has_table_privilege('bagos_reel_analyst_executor','public.research_revision_bodies','SELECT')"), false);
  assert.equal(await scalar(`select count(*)::int from pg_policies where schemaname='public' and tablename='research_revision_bodies'
    and 'bagos_reel_analysis_command' = any(roles) and cmd <> 'SELECT'`), 0);
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
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='reel_analysis_retry_requested'"), 1);
    assert.equal(await scalar("select state from public.agent_runs where id=$1", [first.task.runId]), 'running');
  });
});
test('invalid evidence is terminal and retry cannot override it', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    assert.equal((await failAttempt(lease.task.attemptId, 'uninspected_modality')).retryable, false);
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
    await switchRole('bagos_reel_analysis_command');
    await db.query(`insert into public.reel_analysis_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at)
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
  assert.equal(await scalar("select has_table_privilege('bagos_reel_analyst_executor','public.reel_analysis_attempts','SELECT')"), false);
  assert.equal(await scalar("select has_table_privilege('bagos_reel_analyst_executor','public.agent_runs','UPDATE')"), false);
  assert.equal(await scalar("select pg_has_role('bagos_reel_analyst_executor','bagos_reel_analysis_command','MEMBER')"), false);
  await transactionAs(operator, () => assert.rejects(scalar('select private.claim_reel_analysis_task()'), (error) => error.code === '42501'));
  await transactionAs(operator, () => assert.rejects(failAttempt(id(80)), (error) => error.code === '42501'));
});

function reelResult(lease) {
  const binding = { contractVersion: 'reel-analysis.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId, liveEffects: false, sourceRevisionId: brief.sourceRevisionId };
  return { artifact: { ...binding, producedBy: 'reel_analyst', inspectedModalities: ['transcript'],
    findings: [{ ...binding, modality: 'transcript', observation: 'Synthetic transcript observation', interpretation: null,
      confidence: 'low', gaps: [] }],
    unavailableModalities: [{ ...binding, modality: 'audio', reason: 'Audio was not supplied' }] } };
}
const complete = (lease, result = reelResult(lease)) => scalar('select private.complete_reel_analysis_attempt($1,$2::jsonb)',
  [lease.task.attemptId,JSON.stringify(result.artifact)]);

test('completion persists source-linked body, command receipt, digest, revision and audit atomically', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = reelResult(lease);
    const completed = await complete(lease, result);
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.attemptId, lease.task.attemptId);
    await switchRole('authenticated');
    assert.deepEqual(await scalar('select body from public.reel_analysis_revision_bodies where revision_id=$1', [completed.revisionId]), result.artifact);

    assert.equal(await scalar(`select v.content_digest = encode(sha256(convert_to(b.body::text,'UTF8')),'hex')
      from public.artifact_revisions v join public.reel_analysis_revision_bodies b on b.revision_id=v.id where v.id=$1`, [completed.revisionId]), true);
    assert.equal(await scalar('select state from public.agent_runs where id=$1', [lease.task.runId]), 'succeeded');
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='reel_analysis_attempt_completed'"), 1);
    await switchRole('postgres');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [outsider]);
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_revision_bodies'), 0);
  });
});
test('completion replay is digest-bound without duplicate artifacts', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = reelResult(lease);
    assert.deepEqual(await complete(lease,result), await complete(lease,result));
    await switchRole('authenticated');
    // 4: the seeded Omar evidence artifact this suite now needs so the brief's
    // sourceRevisionId names a real row, the reel-analysis brief artifact, the
    // reel-analysis output artifact, and (since
    // 20260918070100_adam_nour_auto_enqueue.sql) the content-calendar brief
    // artifact the completion's reel_analysis_outcomes insert auto-enqueues.
    assert.equal(await scalar('select count(*)::int from public.artifacts'), 4);
    await switchRole('postgres');
    assert.equal(await scalar("select count(*)::int from public.command_receipts where command_kind='complete_reel_analysis_attempt'"), 1);
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='reel_analysis_attempt_completed'"), 1);
    await switchRole('bagos_reel_analyst_executor');
    result.artifact.findings[0].observation = 'Changed output';
    await assert.rejects(complete(lease,result), /idempotency_conflict/);
  });
});
test('completion rejects mismatched identity, lineage, effects and uninspected evidence', async () => {
  const mutations = [
    (result) => { result.artifact.tenantId = otherTenant; },
    (result) => { result.artifact.attemptId = id(99); },
    (result) => { result.artifact.sourceRevisionId = id(99); },
    (result) => { result.artifact.liveEffects = true; },
    (result) => { result.artifact.inspectedModalities = ['video_frames']; },
    (result) => { result.artifact.inspectedModalities = ['transcript','transcript']; },
    (result) => { result.artifact.findings[0].tenantId = otherTenant; },
    (result) => { result.artifact.findings[0].sourceRevisionId = id(99); },
    (result) => { result.artifact.findings[0].modality = 'audio'; },
    (result) => { result.artifact.findings[0].confidence = 'certain'; },
    (result) => { result.artifact.findings[0].observation = ''; },
    (result) => { result.artifact.findings[0].extra = true; },
    (result) => { result.artifact.unavailableModalities = []; },
    (result) => { result.artifact.unavailableModalities.push(result.artifact.unavailableModalities[0]); },
    (result) => { result.artifact.unavailableModalities[0].modality = 'transcript'; },
    (result) => { result.artifact.unavailableModalities[0].reason = ''; },
    (result) => { result.artifact.unavailableModalities[0].attemptId = id(99); },
    (result) => { result.artifact.extra = true; },
  ];
  for (const mutate of mutations) {
    await transactionAs(operator, async () => {
      await submit(); const lease = await claim(); const result = reelResult(lease); mutate(result);
      await assert.rejects(complete(lease,result), (error) => error.code === '22023');
    });
  }
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
    await switchRole('bagos_reel_analyst_executor');
    await assert.rejects(complete(lease), /unauthorized/);
  });
});
test('late completion audit failure preserves running state and creates no partial output', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    await switchRole('postgres');
    await db.exec("alter table public.audit_log add constraint test_reject_completion check (event_type <> 'reel_analysis_attempt_completed')");
    await switchRole('bagos_reel_analyst_executor');
    await db.exec('savepoint before_completion');
    await assert.rejects(complete(lease), (error) => error.code === '23514');
    await db.exec('rollback to savepoint before_completion');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_outcomes'), 0);
    // 2 apiece: the seeded Omar evidence artifact/revision plus this test's own
    // brief; the rolled-back completion contributes nothing.
    assert.equal(await scalar('select count(*)::int from public.artifacts'), 2);
    assert.equal(await scalar('select count(*)::int from public.artifact_revisions'), 2);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_revision_bodies'), 1);
    assert.equal(await scalar('select state from public.reel_analysis_attempts'), 'running');
    assert.equal(await scalar('select state from public.agent_runs'), 'running');
  });
});
test('browsers and service role cannot complete and stored output is immutable', async () => {
  for (const role of ['authenticated','service_role']) {
    await transactionAs(operator, () => assert.rejects(scalar('select private.complete_reel_analysis_attempt($1,$2)', [id(80),{}]),
      (error) => error.code === '42501'), role);
  }
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await complete(lease);
    await switchRole('postgres');
    await assert.rejects(db.exec("update public.reel_analysis_outcomes set completion_digest=repeat('b',64)"), (error) => error.code === '23514');
  });
});

test('research and reel queues cannot claim each other work', async () => {
  await transactionAs(operator, async () => {
    const reel = await submit();
    await switchRole('postgres');
    await db.query('insert into private.research_brand_binding(tenant_id) values ($1)', [tenant]);
    await switchRole('bagos_research_executor');
    assert.equal(await scalar('select private.claim_research_task()'), null);
    await switchRole('authenticated');
    const research = await scalar('select public.submit_research_brief($1,$2)',
      [{idempotencyKey:id(45), objective:'Research fixture', sources:['https://example.org']},tenant]);
    assert.equal((await claim()).task.taskId, reel.taskId);
    assert.equal(await claim(), null);
    await switchRole('bagos_research_executor');
    assert.equal((await scalar('select private.claim_research_task()')).task.taskId, research.taskId);
    assert.equal(await scalar('select private.claim_research_task()'), null);
  });
});

test('executor is NOLOGIN, owns no tables and has only the three private command grants', async () => {
  assert.deepEqual((await db.query("select rolcanlogin,rolbypassrls,rolinherit from pg_roles where rolname='bagos_reel_analyst_executor'")).rows[0],
    {rolcanlogin:false, rolbypassrls:false, rolinherit:false});
  for (const role of ['bagos_reel_analyst_executor','bagos_reel_analysis_command']) {
    assert.equal(await scalar('select count(*)::int from pg_tables where tableowner=$1', [role]), 0);
  }
  for (const table of ['reel_analysis_tasks','reel_analysis_attempts','reel_analysis_outcomes','reel_analysis_revision_bodies','command_receipts']) {
    for (const operation of ['SELECT','INSERT','UPDATE','DELETE']) {
      assert.equal(await scalar('select has_table_privilege($1,$2,$3)', ['bagos_reel_analyst_executor',`public.${table}`,operation]), false);
    }
  }
  const commands = ['claim_reel_analysis_task()','fail_reel_analysis_attempt(uuid,text)','complete_reel_analysis_attempt(uuid,jsonb)'];
  for (const command of commands) {
    for (const role of ['anon','authenticated','service_role','bagos_research_executor']) {
      assert.equal(await scalar('select has_function_privilege($1,$2,$3)', [role,`private.${command}`,'EXECUTE']), false);
    }
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['bagos_reel_analyst_executor',`private.${command}`,'EXECUTE']), true);
    const details = (await db.query("select prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=$1::regprocedure", [`private.${command}`])).rows[0];
    assert.equal(details.prosecdef, true);
    assert.deepEqual(details.proconfig, ['search_path=""']);
    assert.equal(details.owner, 'bagos_reel_analysis_command');
  }
});

test('legacy commands cannot mutate reel runs or attach fabricated artifacts', async () => {
  for (const command of ['fail','retry','artifacts']) {
    await transactionAs(operator, async () => {
      const submitted = await submit();
      const calls = {
        fail: ['select private.fail_agent_workflow($1,$2,$3)', [tenant,submitted.runId,{schema_version:1,message:'forged'}]],
        retry: ['select private.retry_agent_workflow($1,$2)', [tenant,submitted.runId]],
        artifacts: ['select private.record_agent_artifacts($1,$2,$3::jsonb,$4::jsonb)',
          [tenant,submitted.runId,JSON.stringify([{id:id(30),kind:'reel_analysis',data:{}}]),'[]']],
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
      await assert.rejects(scalar('select public.retry_reel_analysis_attempt($1,$2)', [lease.task.attemptId,expected]), /unauthorized/);
    });
  }
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await failAttempt(lease.task.attemptId,'invalid_contract');
    await assert.rejects(retryAttempt(lease.task.attemptId), /not_retryable/);
  });
});

// An honest "nothing was inspectable" result is a real artifact, not a failed
// attempt, and it is the only shape a no-media brief can ever produce: the
// modality rules below still refuse every alternative.
test('SQL accepts an honest unavailable-media completion when nothing was supplied', async () => {
  await transactionAs(operator, async () => {
    await submit({...brief,suppliedModalities:[]}); const lease = await claim();
    const result = reelResult(lease); result.artifact.inspectedModalities = []; result.artifact.findings = [];
    result.artifact.unavailableModalities.push({...result.artifact.unavailableModalities[0],modality:'transcript'});
    const completed = await complete(lease,result);
    assert.equal(completed.status, 'succeeded');
    await switchRole('postgres');
    assert.deepEqual(await scalar('select body from public.reel_analysis_revision_bodies where revision_id=$1', [completed.revisionId]), result.artifact);
  });
});
test('a no-media brief still cannot claim an inspection, carry a finding, or drop a requested modality', async () => {
  for (const mutate of [
    (result, honest) => { result.artifact.inspectedModalities = ['transcript']; result.artifact.unavailableModalities = [honest.unavailableModalities[0]]; },
    (result, honest) => { result.artifact.findings = honest.findings; },
    (result) => { result.artifact.unavailableModalities.pop(); },
  ]) {
    await transactionAs(operator, async () => {
      await submit({...brief,suppliedModalities:[]}); const lease = await claim();
      const honest = reelResult(lease).artifact;
      const result = reelResult(lease); result.artifact.inspectedModalities = []; result.artifact.findings = [];
      result.artifact.unavailableModalities.push({...result.artifact.unavailableModalities[0],modality:'transcript'});
      mutate(result, honest);
      await assert.rejects(complete(lease,result), /uninspected_modality|invalid_contract/);
    });
  }
});

test('completion permits honest unavailable modalities without fabricated findings', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = reelResult(lease);
    result.artifact.inspectedModalities = []; result.artifact.findings = [];
    result.artifact.unavailableModalities.push({...result.artifact.unavailableModalities[0],modality:'transcript'});
    assert.equal((await complete(lease,result)).status, 'succeeded');
  });
});

test('expired running attempts reject fail and completion before a later claim reclaims them', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit(); await switchRole('bagos_reel_analysis_command');
    await db.query(`insert into public.reel_analysis_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at)
      values ($1,$2,$3,$4,1,'running',clock_timestamp()-interval '6 minutes',clock_timestamp()-interval '1 minute')`,
      [id(80),tenant,submitted.taskId,submitted.runId]);
    await db.query("update public.agent_runs set state='running' where id=$1", [submitted.runId]);
    await switchRole('bagos_reel_analyst_executor');
    const lease = {task:{tenantId:tenant,taskId:submitted.taskId,runId:submitted.runId,attemptId:id(80)}};
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
      const event = {claim:'reel_analysis_attempt_started',fail:'reel_analysis_attempt_failed',retry:'reel_analysis_retry_requested'}[stage];
      await switchRole('postgres');
      await db.exec(`alter table public.audit_log add constraint reject_transition_audit check (event_type <> '${event}')`);
      await db.exec('savepoint before_transition');
      await assert.rejects((async () => {
        if (stage === 'claim') return claim();
        if (stage === 'retry') return retryAttempt(lease.task.attemptId);
        await switchRole('bagos_reel_analyst_executor'); return failAttempt(lease.task.attemptId);
      })(), (error) => error.code === '23514');
      await db.exec('rollback to savepoint before_transition'); await switchRole('postgres');
      assert.equal(await scalar('select state from public.agent_runs'), {claim:'queued',fail:'running',retry:'failed'}[stage]);
      assert.equal(await scalar('select count(*)::int from public.audit_log where event_type=$1', [event]), 0);
      if (stage === 'claim') assert.equal(await scalar('select count(*)::int from public.reel_analysis_attempts'), 0);
      if (stage === 'retry') assert.equal(await scalar('select retry_requested_at from public.reel_analysis_attempts'), null);
    });
  });
}

test('receipt persistence failure rolls back the completion audit and every output row', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await switchRole('postgres');
    await db.exec("alter table public.command_receipts add constraint reject_reel_receipt check (command_kind <> 'complete_reel_analysis_attempt')");
    await switchRole('bagos_reel_analyst_executor'); await db.exec('savepoint before_receipt');
    await assert.rejects(complete(lease), (error) => error.code === '23514');
    await db.exec('rollback to savepoint before_receipt'); await switchRole('postgres');
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='reel_analysis_attempt_completed'"), 0);
    assert.equal(await scalar('select count(*)::int from public.command_receipts'), 0);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_outcomes'), 0);
    // artifacts/artifact_revisions are 2 because this suite seeds Omar's
    // evidence revision so the brief's sourceRevisionId names a real row; only
    // the reel-analysis brief body belongs to this run.
    for (const table of ['artifacts','artifact_revisions']) assert.equal(await scalar(`select count(*)::int from public.${table}`), 2);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_revision_bodies'), 1);
    assert.equal(await scalar('select state from public.reel_analysis_attempts'), 'running');
    assert.equal(await scalar('select state from public.agent_runs'), 'running');
  });
});
