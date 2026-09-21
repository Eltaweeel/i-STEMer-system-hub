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
const brief = { idempotencyKey: id(20), objective: 'Compare education programs', sources: ['https://example.org/about'] };
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
const submit = (payload = brief) => scalar('select public.submit_research_brief($1::jsonb,$2::uuid)', [JSON.stringify(payload),tenant]);
async function switchRole(role) {
  await db.exec('set session authorization postgres');
  await db.exec(`set session authorization ${role}`);
}
async function claim() {
  await switchRole('bagos_research_executor');
  return scalar('select private.claim_research_task()');
}
const failAttempt = (attemptId, code = 'provider_failure') => scalar('select private.fail_research_attempt($1,$2)', [attemptId, code]);
async function retryAttempt(attemptId) {
  await switchRole('authenticated');
  return scalar('select public.retry_research_attempt($1,$2)', [attemptId,tenant]);
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
  await db.query('insert into private.research_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.exec('commit');
});
after(async () => db.close());

test('submission persists task, real-mode queued run, immutable brief body and audit together', async () => {
  await transactionAs(operator, async () => {
    const receipt = await submit();
    assert.equal(receipt.tenantId, tenant); assert.equal(receipt.requesterId, operator);
    assert.equal(receipt.liveEffects, false);
    assert.equal(await scalar('select count(*)::int from public.agent_tasks'), 1);
    assert.equal(await scalar("select count(*)::int from public.agent_runs where mode='research' and state='queued'"), 1);
    assert.deepEqual(await scalar('select body->\'brief\' from public.research_revision_bodies'), brief);
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='research_task_created'"), 1);
  });
});
test('same idempotency key and input return the same task without duplicate rows', async () => {
  await transactionAs(operator, async () => {
    assert.deepEqual(await submit(), await submit());
    assert.equal(await scalar('select count(*)::int from public.agent_runs'), 1);
    assert.equal(await scalar('select count(*)::int from public.artifact_revisions'), 1);
  });
});
test('changed objective under the same key is a conflict', async () => {
  await transactionAs(operator, async () => {
    await submit();
    await assert.rejects(submit({ ...brief, objective: 'Different objective' }), /idempotency_conflict/);
  });
});
test('outsider cannot submit for the server-bound tenant', async () => {
  await transactionAs(outsider, () => assert.rejects(submit(), /unauthorized/));
});

test('server and database tenant bindings must match before any writes', async () => {
  for (const expected of [otherTenant, null]) {
    await transactionAs(operator, async () => {
      await db.exec('savepoint mismatched_binding');
      await assert.rejects(scalar('select public.submit_research_brief($1,$2)', [brief,expected]), /unauthorized/);
      await db.exec('rollback to savepoint mismatched_binding');
      assert.equal(await scalar('select count(*)::int from public.agent_tasks'), 0);
      await submit(); const lease = await claim(); await failAttempt(lease.task.attemptId);
      await switchRole('authenticated');
      await db.exec('savepoint mismatched_retry');
      await assert.rejects(scalar('select public.retry_research_attempt($1,$2)', [lease.task.attemptId,expected]), /unauthorized/);
      await db.exec('rollback to savepoint mismatched_retry');
      assert.equal(await scalar('select state from public.agent_runs'), 'failed');
    });
  }
});
test('owner requires MFA while an operator can submit at AAL1', async () => {
  await transactionAs(owner, () => assert.rejects(submit(), /unauthorized/));
  await transactionAs(owner, async () => assert.equal((await submit()).requesterId, owner), 'authenticated', 'aal2');
});
test('caller authority fields are rejected by the database command', async () => {
  for (const field of ['tenantId', 'requesterId', 'role', 'agentId']) {
    await transactionAs(operator, () => assert.rejects(submit({ ...brief, [field]: outsider }), /invalid_contract/));
  }
});
test('invalid input creates no durable records', async () => {
  for (const payload of [null, {}, { ...brief, objective: '' }, { ...brief, sources: [] }, { ...brief, sources: ['http://example.org'] }]) {
    await transactionAs(operator, () => assert.rejects(submit(payload), /invalid_contract/));
  }
  assert.equal(await scalar('select count(*)::int from public.agent_tasks'), 0);
  assert.equal(await scalar('select count(*)::int from public.agent_runs'), 0);
});
test('anonymous and service roles cannot invoke the command or write tables', async () => {
  for (const role of ['anon','service_role']) {
    await transactionAs(null, () => assert.rejects(submit(), (error) => error.code === '42501'), role);
  }
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal(await scalar("select has_table_privilege($1,'public.agent_tasks','INSERT')", [role]), false);
    assert.equal(await scalar("select has_table_privilege($1,'public.research_revision_bodies','UPDATE')", [role]), false);
    assert.equal(await scalar("select pg_has_role($1,'bagos_research_command','MEMBER')", [role]), false);
  }
  assert.deepEqual((await db.query("select rolcanlogin,rolbypassrls from pg_roles where rolname='bagos_research_command'")).rows[0],
    { rolcanlogin: false, rolbypassrls: false });
});
test('legacy commands cannot fail, retry or attach fabricated artifacts to research runs', async () => {
  for (const command of ['fail', 'retry', 'artifacts']) {
    await transactionAs(operator, async () => {
      const receipt = await submit();
      const calls = {
        fail: ['select private.fail_agent_workflow($1,$2,$3)', [tenant,receipt.runId,{ schema_version: 1, message: 'forged' }]],
        retry: ['select private.retry_agent_workflow($1,$2)', [tenant,receipt.runId]],
        artifacts: ['select private.record_agent_artifacts($1,$2,$3::jsonb,$4::jsonb)',
          [tenant,receipt.runId,JSON.stringify([{ id: id(30), kind: 'research', data: {} }]),'[]']],
      };
      const [sql, params] = calls[command];
      // retry rejects queued runs before the state-mutation guard; both fail closed.
      await assert.rejects(db.query(sql, params), (error) => ['42501','55000'].includes(error.code));
    });
  }
});
test('late audit failure rolls back every row created by the command', async () => {
  await db.exec("alter table public.audit_log add constraint test_reject_research_audit check (event_type <> 'research_task_created')");
  try {
    await transactionAs(operator, () => assert.rejects(submit(), (error) => error.code === '23514'));
    for (const table of ['agent_tasks','agent_runs','campaigns','objectives','artifacts','artifact_revisions','research_revision_bodies','audit_log']) {
      assert.equal(await scalar(`select count(*)::int from public.${table}`), 0, table);
    }
  } finally {
    await db.exec('alter table public.audit_log drop constraint test_reject_research_audit');
  }
});
test('worker claims once and returns attempt-bound task and handoff', async () => {
  await transactionAs(operator, async () => {
    const submitted = await submit();
    const lease = await claim();
    assert.equal(lease.status, 'claimed');
    assert.equal(lease.task.taskId, submitted.taskId);
    assert.equal(lease.task.requesterId, operator);
    assert.equal(lease.task.agentId, 'competitor_analyst');
    assert.equal(lease.task.liveEffects, false);
    assert.deepEqual(lease.handoff.inputRevisionIds, [submitted.briefRevisionId]);
    assert.equal(lease.handoff.attemptId, lease.task.attemptId);
    assert.equal(Date.parse(lease.task.expiresAt) - Date.parse(lease.task.issuedAt), 300000);
    assert.equal(await claim(), null);
  });
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
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='research_retry_requested'"), 1);
    assert.equal(await scalar("select state from public.agent_runs where id=$1", [first.task.runId]), 'running');
  });
});
test('invalid evidence is terminal and retry cannot override it', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    assert.equal((await failAttempt(lease.task.attemptId, 'uninspected_source')).retryable, false);
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
    await switchRole('bagos_research_command');
    await db.query(`insert into public.research_attempts(id,tenant_id,task_id,run_id,attempt_number,state,issued_at,expires_at)
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
  assert.equal(await scalar("select has_table_privilege('bagos_research_executor','public.research_attempts','SELECT')"), false);
  assert.equal(await scalar("select has_table_privilege('bagos_research_executor','public.agent_runs','UPDATE')"), false);
  assert.equal(await scalar("select pg_has_role('bagos_research_executor','bagos_research_command','MEMBER')"), false);
  await transactionAs(operator, () => assert.rejects(scalar('select private.claim_research_task()'), (error) => error.code === '42501'));
  await transactionAs(operator, () => assert.rejects(failAttempt(id(80)), (error) => error.code === '42501'));
});

function researchResult(lease) {
  const binding = { contractVersion: 'research.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId };
  const receipt = { ...binding, receiptId: id(90), sourceUrl: brief.sources[0], inspectedAt: lease.task.issuedAt, contentHash: 'a'.repeat(64) };
  return { receipts: [receipt], artifact: { ...binding, producedBy: 'competitor_analyst', sourceRevisionIds: lease.handoff.inputRevisionIds,
    evidence: [{ sourceUrl: receipt.sourceUrl, inspectionReceiptId: receipt.receiptId, inspectedAt: receipt.inspectedAt,
      observation: 'Synthetic SQL test observation', interpretation: null, confidence: 'low', gaps: ['Synthetic fixture; no network inspection'] }],
    gaps: [], liveEffects: false } };
}
const complete = (lease, result = researchResult(lease)) => scalar('select private.complete_research_attempt($1,$2::jsonb,$3::jsonb)',
  [lease.task.attemptId,JSON.stringify(result.artifact),JSON.stringify(result.receipts)]);

test('completion persists source-linked body, receipts, digest, revision and audit atomically', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = researchResult(lease);
    const completed = await complete(lease, result);
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.attemptId, lease.task.attemptId);
    await switchRole('authenticated');
    assert.deepEqual(await scalar('select body from public.research_revision_bodies where revision_id=$1', [completed.revisionId]), result.artifact);
    assert.deepEqual(await scalar('select inspection_receipts from public.research_outcomes'), result.receipts);
    assert.equal(await scalar(`select v.content_digest = encode(sha256(convert_to(b.body::text,'UTF8')),'hex')
      from public.artifact_revisions v join public.research_revision_bodies b on b.revision_id=v.id where v.id=$1`, [completed.revisionId]), true);
    assert.equal(await scalar('select state from public.agent_runs where id=$1', [lease.task.runId]), 'succeeded');
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='research_attempt_completed'"), 1);
    await switchRole('postgres');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [outsider]);
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.research_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.research_revision_bodies'), 0);
  });
});
test('completion replay is digest-bound without duplicate artifacts', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); const result = researchResult(lease);
    assert.deepEqual(await complete(lease,result), await complete(lease,result));
    await switchRole('authenticated');
    // 3, not 2: the brief artifact, the evidence artifact, and (since
    // 20260918070000_adam_ziad_auto_enqueue.sql) the reel-analysis brief
    // artifact the completion's research_outcomes insert auto-enqueues.
    assert.equal(await scalar('select count(*)::int from public.artifacts'), 3);
    await switchRole('bagos_research_executor');
    result.artifact.evidence[0].observation = 'Changed output';
    await assert.rejects(complete(lease,result), /idempotency_conflict/);
  });
});
test('completion rejects mismatched identity, lineage, effects and uninspected evidence', async () => {
  const mutations = [
    (result) => { result.artifact.tenantId = otherTenant; },
    (result) => { result.artifact.attemptId = id(99); },
    (result) => { result.artifact.sourceRevisionIds = [id(99)]; },
    (result) => { result.artifact.liveEffects = true; },
    (result) => { result.receipts = []; },
    (result) => { result.receipts[0].tenantId = otherTenant; },
    (result) => { result.artifact.evidence[0].inspectionReceiptId = id(99); },
    (result) => { result.receipts[0].sourceUrl = 'https://unrequested.example.org'; },
    (result) => { result.receipts.push(result.receipts[0]); },
    (result) => { result.artifact.evidence[0].confidence = 'certain'; },
  ];
  for (const mutate of mutations) {
    await transactionAs(operator, async () => {
      await submit(); const lease = await claim(); const result = researchResult(lease); mutate(result);
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
    await switchRole('bagos_research_executor');
    await assert.rejects(complete(lease), /unauthorized/);
  });
});
test('late completion audit failure preserves running state and creates no partial output', async () => {
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim();
    await switchRole('postgres');
    await db.exec("alter table public.audit_log add constraint test_reject_completion check (event_type <> 'research_attempt_completed')");
    await switchRole('bagos_research_executor');
    await db.exec('savepoint before_completion');
    await assert.rejects(complete(lease), (error) => error.code === '23514');
    await db.exec('rollback to savepoint before_completion');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.research_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.artifacts'), 1);
    assert.equal(await scalar('select count(*)::int from public.artifact_revisions'), 1);
    assert.equal(await scalar('select count(*)::int from public.research_revision_bodies'), 1);
    assert.equal(await scalar('select state from public.research_attempts'), 'running');
    assert.equal(await scalar('select state from public.agent_runs'), 'running');
  });
});
test('browsers and service role cannot complete and stored output is immutable', async () => {
  for (const role of ['authenticated','service_role']) {
    await transactionAs(operator, () => assert.rejects(scalar('select private.complete_research_attempt($1,$2,$3)', [id(80),{},[]]),
      (error) => error.code === '42501'), role);
  }
  await transactionAs(operator, async () => {
    await submit(); const lease = await claim(); await complete(lease);
    await switchRole('postgres');
    await assert.rejects(db.exec("update public.research_outcomes set inspection_receipts='[]'::jsonb"), (error) => error.code === '23514');
  });
});

// `select state into current_state ... where id = wanted_run` leaves NULL when
// no such run exists, and `NULL <> 'failed'` is NULL, which plpgsql's IF treats
// as false. The guard was therefore skipped for a run id that matches nothing:
// the UPDATE touched no row, but an audit entry was still written and the
// caller was told the run had been queued.
test('retrying a run that does not exist is refused, and writes no audit entry claiming otherwise', async () => {
  await transactionAs(operator, async () => {
    const missingRun = id(9001);
    // The raised exception aborts the transaction, so the audit check below
    // needs a savepoint to roll back to.
    await db.exec('savepoint before_missing_retry');
    await assert.rejects(scalar('select private.retry_agent_workflow($1,$2)', [tenant, missingRun]),
      (error) => ['42501', '55000', '23503'].includes(error.code));
    await db.exec('rollback to savepoint before_missing_retry');
    // The audit trail is the record Hadeer is asked to trust. An entry for a
    // run that never existed is worse than a refusal.
    assert.equal(await scalar(
      "select count(*)::int from public.audit_log where target_reference = $1", [missingRun]), 0);
  });
});
