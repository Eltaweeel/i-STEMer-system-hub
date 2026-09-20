import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrationNames as migrations } from './migration-inventory.mjs';

// Local SQL execution only; no credentials, URLs, Auth users or remote changes.
// Proves the missing approval backend: Nour's completion auto-creates exactly
// one pending strategy-stage approval bound to her revision; an owner at AAL2
// can approve or reject it and nobody else can; and a later revision of the
// same artifact invalidates a stale decision without touching any other one.
const db = new PGlite({ extensions: { pgcrypto } });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), owner = id(3), operator = id(4);
const omarRevisionId = id(90);

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
async function actAs(subject, aal) {
  await switchRole('postgres');
  await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
    [subject, JSON.stringify({ sub: subject, aal, is_anonymous: false })]);
  await switchRole('authenticated');
}

// Seeds a real Ziad revision (with a stored analysis body) and a real Nour
// brief bound to it, exactly the way content-calendar-packet.test.mjs does,
// so every test here exercises the genuine claim/complete SQL rather than a
// hand-rolled shortcut into content_calendar_outcomes.
const defaultBrief = (sourceRevisionId, idKey) => ({ idempotencyKey: idKey, objective: 'Draft a 7-day content calendar',
  sourceRevisionId, requestedPlatforms: ['instagram', 'facebook'] });
async function submit(idKey = id(20)) {
  await switchRole('bagos_content_calendar_command');
  const campaign = await scalar("insert into public.campaigns(tenant_id,title,owner_membership_id) values ($1,'Calendar fixture',$2) returning id", [tenant, id(11)]);
  const objective = await scalar("insert into public.objectives(tenant_id,campaign_id,content,revision) values ($1,$2,'Draft calendar',1) returning id", [tenant, campaign]);
  const runId = await scalar(`insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values ($1,$2,$3,'content_calendar','queued','{"schema_version":1}',1) returning id`, [tenant, objective, id(11)]);
  const ziadArtifact = await scalar("insert into public.artifacts(tenant_id,campaign_id,type) values ($1,$2,'reel_analysis_evidence') returning id", [tenant, campaign]);
  const provenance = { schema_version: 1, source_revision_ids: [omarRevisionId] };
  const ziadRevisionId = await scalar(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,1,$3,'reel_analyst',$4,'{"schema_version":1}') returning id`,
    [tenant, ziadArtifact, 'a'.repeat(64), JSON.stringify(provenance)]);
  const binding = { contractVersion: 'reel-analysis.v1', tenantId: tenant, taskId: id(80), runId: id(81), attemptId: id(82), liveEffects: false };
  const upstream = { ...binding, producedBy: 'reel_analyst', sourceRevisionId: omarRevisionId, inspectedModalities: ['transcript'],
    findings: [{ ...binding, sourceRevisionId: omarRevisionId, modality: 'transcript', observation: 'Synthetic transcript observation',
      interpretation: null, confidence: 'low', gaps: [] }], unavailableModalities: [] };
  await switchRole('bagos_reel_analysis_command');
  await db.query('insert into public.reel_analysis_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant, ziadRevisionId, upstream]);
  await switchRole('bagos_content_calendar_command');
  const brief = defaultBrief(ziadRevisionId, idKey);
  const artifact = await scalar("insert into public.artifacts(tenant_id,run_id,type) values ($1,$2,'content_calendar_brief') returning id", [tenant, runId]);
  const briefRevisionId = await scalar(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,1,$3,'orchestrator','{"schema_version":1}','{"schema_version":1}') returning id`, [tenant, artifact, 'a'.repeat(64)]);
  await db.query('insert into public.content_calendar_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant, briefRevisionId, { brief }]);
  const taskId = await scalar(`insert into public.content_calendar_tasks(tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values ($1,$2,$3,$4,$5,$6) returning id`, [tenant, operator, runId, briefRevisionId, brief.idempotencyKey, 'a'.repeat(64)]);
  await switchRole('authenticated');
  return { taskId, runId, briefRevisionId, ziadRevisionId };
}
async function claim() {
  await switchRole('bagos_content_calendar_executor');
  return scalar('select private.claim_content_calendar_task()');
}
function calendarResult(lease, platforms = ['instagram', 'facebook']) {
  const binding = { contractVersion: 'content-calendar.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId, liveEffects: false, sourceRevisionId: lease.task.brief.sourceRevisionId };
  const formats = ['post', 'reel', 'story', 'carousel'];
  const entries = Array.from({ length: 7 }, (_, dayIndex) => ({ ...binding, dayIndex,
    platform: platforms[dayIndex % platforms.length], format: formats[dayIndex % formats.length], conceptTitle: `Concept for day ${dayIndex}` }));
  return { artifact: { ...binding, producedBy: 'content_creator', entries } };
}
const complete = (lease, result = calendarResult(lease)) => scalar('select private.complete_content_calendar_attempt($1,$2::jsonb)',
  [lease.task.attemptId, JSON.stringify(result.artifact)]);
async function submitClaimComplete(idKey) {
  await submit(idKey);
  const lease = await claim();
  return complete(lease);
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
  await db.query("insert into public.tenants(id,name) values ($1,'Approval tenant')", [tenant]);
  const triggers = (await db.query(`select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint
    where t.tgrelid='public.memberships'::regclass and c.confrelid='auth.users'::regclass`)).rows;
  for (const trigger of triggers) await db.exec(`alter table public.memberships disable trigger "${trigger.tgname}"`);
  for (const [memberId, userId, role] of [[id(10), owner, 'owner'], [id(11), operator, 'operator']]) {
    await db.query("insert into public.memberships(id,tenant_id,user_id,role,status) values ($1,$2,$3,$4,'active')", [memberId, tenant, userId, role]);
  }
  await db.exec('set constraints all immediate');
  for (const trigger of triggers) await db.exec(`alter table public.memberships enable trigger "${trigger.tgname}"`);
  await db.exec("update public.tenants set status='active'");
  await db.query('insert into private.content_calendar_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.exec('commit');
});
after(async () => db.close());

test('completing Nour creates exactly one pending strategy approval bound to the right revision with a matching digest, and a duplicate is refused by the database', async () => {
  await transactionAs(operator, async () => {
    const completed = await submitClaimComplete();
    await switchRole('authenticated');
    const approval = await scalar('select row_to_json(a) from public.approvals a where artifact_revision_id=$1', [completed.revisionId]);
    assert.equal(approval.tenant_id, tenant);
    assert.equal(approval.status, 'pending');
    assert.equal(approval.stage, 'strategy');
    assert.equal(approval.artifact_revision_id, completed.revisionId);
    const storedDigest = await scalar(`select encode(sha256(convert_to(b.body::text,'UTF8')),'hex')
      from public.content_calendar_revision_bodies b where b.revision_id=$1`, [completed.revisionId]);
    assert.equal(approval.action_digest, storedDigest);
    assert.equal(approval.action_digest, await scalar('select content_digest from public.artifact_revisions where id=$1', [completed.revisionId]));
    assert.equal(await scalar('select count(*)::int from public.approvals where artifact_revision_id=$1', [completed.revisionId]), 1);

    await switchRole('bagos_approval_command');
    await db.exec('savepoint before_duplicate_insert');
    await assert.rejects(db.query(`insert into public.approvals(tenant_id,artifact_revision_id,action_snapshot,action_digest,action_revision,tier,confirmation_required,status,stage,destination)
      values ($1,$2,'{"schema_version":1}',$3,1,1,true,'pending','strategy','{"schema_version":1}')`,
      [tenant, completed.revisionId, storedDigest]),
      (error) => error.code === '23505');
    await db.exec('rollback to savepoint before_duplicate_insert');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.approvals where artifact_revision_id=$1', [completed.revisionId]), 1);
  });
});

test('owner at AAL2 can approve; a non-owner and an AAL1 owner cannot; a second decision on a settled approval is refused', async () => {
  await transactionAs(operator, async () => {
    const completed = await submitClaimComplete();
    await switchRole('authenticated');
    const approvalId = await scalar('select id from public.approvals where artifact_revision_id=$1', [completed.revisionId]);
    const digest = await scalar('select content_digest from public.artifact_revisions where id=$1', [completed.revisionId]);

    for (const [subject, aal] of [[operator, 'aal2'], [owner, 'aal1']]) {
      await actAs(subject, aal);
      await db.exec('savepoint before_bad_decision');
      await assert.rejects(scalar('select private.approve_agent_revision($1,$2,$3)', [tenant, approvalId, digest]), (error) => error.code === '42501');
      await db.exec('rollback to savepoint before_bad_decision');
    }

    await actAs(owner, 'aal2');
    const approved = await scalar('select private.approve_agent_revision($1,$2,$3)', [tenant, approvalId, digest]);
    assert.equal(approved.status, 'approved');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalId]), 'approved');

    await db.exec('savepoint before_second_approve');
    await assert.rejects(scalar('select private.approve_agent_revision($1,$2,$3)', [tenant, approvalId, digest]), /approval is not pending/);
    await db.exec('rollback to savepoint before_second_approve');
    await assert.rejects(scalar("select private.reject_agent_revision($1,$2,$3,'too late')", [tenant, approvalId, digest]), /approval is not pending/);
  });
});

test('owner at AAL2 can reject with a recorded reason', async () => {
  await transactionAs(operator, async () => {
    const completed = await submitClaimComplete();
    await switchRole('authenticated');
    const approvalId = await scalar('select id from public.approvals where artifact_revision_id=$1', [completed.revisionId]);
    const digest = await scalar('select content_digest from public.artifact_revisions where id=$1', [completed.revisionId]);

    await actAs(owner, 'aal2');
    const rejected = await scalar("select private.reject_agent_revision($1,$2,$3,'Wrong tone for the brand')", [tenant, approvalId, digest]);
    assert.equal(rejected.status, 'rejected');
    const row = await scalar('select row_to_json(a) from public.approvals a where id=$1', [approvalId]);
    assert.equal(row.status, 'rejected');
    assert.equal(row.action_snapshot.reason, 'Wrong tone for the brand');
    assert.equal(row.action_snapshot.rejected_by, owner);
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='agent_artifact_rejected' and target_reference=$1", [completed.revisionId]), 1);
  });
});

test('digest mismatch and an empty reason are refused before any state changes', async () => {
  await transactionAs(operator, async () => {
    const completed = await submitClaimComplete();
    await switchRole('authenticated');
    const approvalId = await scalar('select id from public.approvals where artifact_revision_id=$1', [completed.revisionId]);

    await actAs(owner, 'aal2');
    await db.exec('savepoint before_bad_digest');
    await assert.rejects(scalar('select private.approve_agent_revision($1,$2,$3)', [tenant, approvalId, 'b'.repeat(64)]), /approval digest mismatch/);
    await db.exec('rollback to savepoint before_bad_digest');
    const digest = await scalar('select content_digest from public.artifact_revisions where id=$1', [completed.revisionId]);
    await db.exec('savepoint before_empty_reason');
    await assert.rejects(scalar("select private.reject_agent_revision($1,$2,$3,'')", [tenant, approvalId, digest]), /rejection reason required/);
    await db.exec('rollback to savepoint before_empty_reason');
    await switchRole('authenticated');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalId]), 'pending');
  });
});

test('a new revision of the same artifact invalidates a prior pending approval and a prior approved approval, with audit rows, while leaving other artifacts untouched', async () => {
  await transactionAs(operator, async () => {
    const completedA = await submitClaimComplete(id(30));
    const completedB = await submitClaimComplete(id(31));
    await switchRole('authenticated');
    const approvalAId = await scalar('select id from public.approvals where artifact_revision_id=$1', [completedA.revisionId]);
    const approvalBId = await scalar('select id from public.approvals where artifact_revision_id=$1', [completedB.revisionId]);
    const digestB = await scalar('select content_digest from public.artifact_revisions where id=$1', [completedB.revisionId]);
    await actAs(owner, 'aal2');
    await scalar('select private.approve_agent_revision($1,$2,$3)', [tenant, approvalBId, digestB]);
    await switchRole('authenticated');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalAId]), 'pending');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalBId]), 'approved');

    const artifactA = await scalar('select artifact_id from public.artifact_revisions where id=$1', [completedA.revisionId]);
    const artifactB = await scalar('select artifact_id from public.artifact_revisions where id=$1', [completedB.revisionId]);

    // A new revision on artifact A must invalidate the pending approval bound
    // to A's old revision, and must not touch B's unrelated, still-approved one.
    await switchRole('bagos_content_calendar_command');
    await db.query(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
      values ($1,$2,2,$3,'content_creator','{"schema_version":1}','{"schema_version":1}')`, [tenant, artifactA, 'c'.repeat(64)]);
    await switchRole('authenticated');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalAId]), 'invalidated');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalBId]), 'approved');
    assert.equal(await scalar(`select count(*)::int from public.audit_log
      where event_type='agent_artifact_approval_invalidated' and target_reference=$1`, [completedA.revisionId]), 1);
    assert.equal(await scalar(`select count(*)::int from public.audit_log
      where event_type='agent_artifact_approval_invalidated' and target_reference=$1`, [completedB.revisionId]), 0);

    // A new revision on artifact B now invalidates the previously-approved
    // approval too, and A's already-invalidated row is left exactly as it was.
    await switchRole('bagos_content_calendar_command');
    await db.query(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
      values ($1,$2,2,$3,'content_creator','{"schema_version":1}','{"schema_version":1}')`, [tenant, artifactB, 'd'.repeat(64)]);
    await switchRole('authenticated');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalAId]), 'invalidated');
    assert.equal(await scalar('select status from public.approvals where id=$1', [approvalBId]), 'invalidated');
    assert.equal(await scalar(`select count(*)::int from public.audit_log
      where event_type='agent_artifact_approval_invalidated' and target_reference=$1`, [completedB.revisionId]), 1);
    assert.equal(await scalar("select count(*)::int from public.audit_log where event_type='agent_artifact_approval_invalidated'"), 2);
  });
});

test('no authenticated subject -- the shape of an agent call -- cannot approve or reject; agents hold no execute grant on either command', async () => {
  await transactionAs(null, async () => {
    await assert.rejects(scalar('select private.approve_agent_revision($1,$2,$3)', [tenant, id(999), 'a'.repeat(64)]), (error) => error.code === '42501');
  });
  await transactionAs(null, async () => {
    await assert.rejects(scalar("select private.reject_agent_revision($1,$2,$3,'no')", [tenant, id(999), 'a'.repeat(64)]), (error) => error.code === '42501');
  });
  for (const role of ['bagos_content_calendar_executor', 'bagos_content_calendar_command', 'bagos_reel_analyst_executor', 'bagos_research_executor', 'bagos_approval_command']) {
    assert.equal(await scalar("select has_function_privilege($1,'private.approve_agent_revision(uuid,uuid,text)','EXECUTE')", [role]), false);
    assert.equal(await scalar("select has_function_privilege($1,'private.reject_agent_revision(uuid,uuid,text,text)','EXECUTE')", [role]), false);
  }
});

test('browsers, anon and service role cannot call the reject command', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await transactionAs(operator, () => assert.rejects(
      scalar("select private.reject_agent_revision($1,$2,$3,'no')", [tenant, id(999), 'a'.repeat(64)]),
      (error) => error.code === '42501'), role);
  }
});

test('the auto-create and invalidation triggers cannot be invoked directly, and their command role is narrowly scoped and NOLOGIN', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await transactionAs(operator, () => assert.rejects(
      scalar('select private.create_strategy_approval_after_content_calendar_outcome()'), (error) => error.code === '42501'), role);
    await transactionAs(operator, () => assert.rejects(
      scalar('select private.invalidate_approvals_on_new_revision()'), (error) => error.code === '42501'), role);
  }
  assert.deepEqual((await db.query("select rolcanlogin,rolbypassrls,rolinherit from pg_roles where rolname='bagos_approval_command'")).rows[0],
    { rolcanlogin: false, rolbypassrls: false, rolinherit: false });
  assert.equal(await scalar('select count(*)::int from pg_tables where tableowner=$1', ['bagos_approval_command']), 0);
  const owners = (await db.query(`select proname,pg_get_userbyid(proowner) as owner,prosecdef,proconfig from pg_proc
    where oid in ('private.create_strategy_approval_after_content_calendar_outcome()'::regprocedure,
                  'private.invalidate_approvals_on_new_revision()'::regprocedure)`)).rows;
  assert.equal(owners.length, 2);
  for (const row of owners) {
    assert.equal(row.owner, 'bagos_approval_command');
    assert.equal(row.prosecdef, true);
    assert.deepEqual(row.proconfig, ['search_path=""']);
  }
  // Neither the upstream completion role nor the executor gains any new reach
  // beyond what firing the trigger implicitly requires.
  for (const table of ['approvals']) {
    for (const privilege of ['UPDATE', 'DELETE']) {
      assert.equal(await scalar("select has_table_privilege('bagos_content_calendar_command',$1,$2)", [`public.${table}`, privilege]), false);
    }
  }
});

test('any active member can read pending approvals but only an owner may decide', async () => {
  await transactionAs(operator, async () => {
    const completed = await submitClaimComplete();
    await switchRole('authenticated');
    const digest = await scalar('select content_digest from public.artifact_revisions where id=$1', [completed.revisionId]);

    await actAs(operator, 'aal1');
    const asOperator = await scalar('select private.read_tenant_approvals($1)', [tenant]);
    assert.equal(asOperator.canDecide, false);
    assert.equal(asOperator.approvals.length, 1);
    assert.equal(asOperator.approvals[0].artifactRevisionId, completed.revisionId);
    // The digest travels with the row so a decision binds to the exact revision
    // the caller was shown, rather than to whatever is current when they act.
    assert.equal(asOperator.approvals[0].contentDigest, digest);
    assert.equal(asOperator.approvals[0].stage, 'strategy');

    await actAs(owner, 'aal2');
    assert.equal((await scalar('select private.read_tenant_approvals($1)', [tenant])).canDecide, true);
  });
});

test('a caller with no active membership cannot read approvals', async () => {
  await transactionAs(operator, async () => {
    await actAs(id(998), 'aal2');
    await db.exec('savepoint before_denied_read');
    await assert.rejects(scalar('select private.read_tenant_approvals($1)', [tenant]), (error) => error.code === '42501');
    await db.exec('rollback to savepoint before_denied_read');
  });
});
