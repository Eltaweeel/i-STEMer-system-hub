import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrationNames as migrations } from './migration-inventory.mjs';

// Local SQL execution only; no credentials, URLs, Auth users or remote changes.
// This suite proves the Adam -> Ziad and Ziad -> Nour fan-out triggers: Hadeer
// only ever submits the research brief; every downstream task must appear on
// its own, atomically with the upstream completion that produced it.
const db = new PGlite({ extensions: { pgcrypto } });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), owner = id(3), operator = id(4);
const researchBrief = { idempotencyKey: id(20), objective: 'Compare education programs', sources: ['https://example.org/about'] };
// Stands in for evidence Omar persisted outside this transaction, for the
// fixtured tasks that do not run a real research completion first.
const omarEvidence = { contractVersion: 'research.v1', taskId: id(80), runId: id(81), attemptId: id(82),
  tenantId: tenant, producedBy: 'competitor_analyst', sourceRevisionIds: [id(83)],
  evidence: [{ sourceUrl: researchBrief.sources[0], inspectionReceiptId: id(84), inspectedAt: '2026-01-01T00:00:00.000Z',
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
async function switchRole(role) {
  await db.exec('set session authorization postgres');
  await db.exec(`set session authorization ${role}`);
}

const submitResearch = (payload = researchBrief) =>
  scalar('select public.submit_research_brief($1::jsonb,$2::uuid)', [JSON.stringify(payload), tenant]);
async function claimResearch() { await switchRole('bagos_research_executor'); return scalar('select private.claim_research_task()'); }
function researchResult(lease) {
  const binding = { contractVersion: 'research.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId };
  const receipt = { ...binding, receiptId: id(90), sourceUrl: researchBrief.sources[0], inspectedAt: lease.task.issuedAt, contentHash: 'a'.repeat(64) };
  return { receipts: [receipt], artifact: { ...binding, producedBy: 'competitor_analyst', sourceRevisionIds: lease.handoff.inputRevisionIds,
    evidence: [{ sourceUrl: receipt.sourceUrl, inspectionReceiptId: receipt.receiptId, inspectedAt: receipt.inspectedAt,
      observation: 'Synthetic SQL test observation', interpretation: null, confidence: 'low', gaps: ['Synthetic fixture; no network inspection'] }],
    gaps: [], liveEffects: false } };
}
const completeResearch = (lease, result = researchResult(lease)) =>
  scalar('select private.complete_research_attempt($1,$2::jsonb,$3::jsonb)',
    [lease.task.attemptId, JSON.stringify(result.artifact), JSON.stringify(result.receipts)]);

async function claimReel() { await switchRole('bagos_reel_analyst_executor'); return scalar('select private.claim_reel_analysis_task()'); }
// The auto-enqueued brief always carries an empty suppliedModalities (no real
// media exists yet), so this is the only artifact shape SQL will accept from
// it: every requested modality reported honestly as unavailable. It is a
// successful artifact, which is what lets the chain keep moving to Nour.
function unavailableReelResult(lease) {
  const binding = { contractVersion: 'reel-analysis.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId, liveEffects: false, sourceRevisionId: lease.task.brief.sourceRevisionId };
  return { artifact: { ...binding, producedBy: 'reel_analyst', inspectedModalities: [], findings: [],
    unavailableModalities: lease.task.brief.requestedModalities.map((modality) => ({ ...binding, modality, reason: 'No media has been attached to this task yet' })) } };
}
const completeReel = (lease, result) =>
  scalar('select private.complete_reel_analysis_attempt($1,$2::jsonb)', [lease.task.attemptId, JSON.stringify(result.artifact)]);

async function claimCalendar() { await switchRole('bagos_content_calendar_executor'); return scalar('select private.claim_content_calendar_task()'); }

// A directly-fixtured reel-analysis task with real supplied media, for the
// cases that need a Ziad completion carrying actual findings. sourceRevisionId
// must name a real research_revision_bodies row: the claim command reads that
// body and refuses the lease without it.
async function seedResearchEvidence(revisionId) {
  await switchRole('bagos_research_command');
  if (await scalar('select count(*)::int from public.research_revision_bodies where tenant_id=$1 and revision_id=$2', [tenant, revisionId]) > 0) return;
  const campaign = await scalar("insert into public.campaigns(tenant_id,title,owner_membership_id) values ($1,'Omar fixture',$2) returning id", [tenant, id(11)]);
  const artifact = await scalar("insert into public.artifacts(tenant_id,campaign_id,type) values ($1,$2,'research_evidence') returning id", [tenant, campaign]);
  await db.query(`insert into public.artifact_revisions(id,tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,$3,1,$4,'competitor_analyst','{"schema_version":1}','{"schema_version":1}')`, [revisionId, tenant, artifact, 'a'.repeat(64)]);
  await db.query('insert into public.research_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant, revisionId, omarEvidence]);
}
async function fixtureReelTask(sourceRevisionId) {
  await seedResearchEvidence(sourceRevisionId);
  await switchRole('bagos_reel_analysis_command');
  const campaign = await scalar("insert into public.campaigns(tenant_id,title,owner_membership_id) values ($1,'Reel fixture',$2) returning id", [tenant, id(11)]);
  const objective = await scalar("insert into public.objectives(tenant_id,campaign_id,content,revision) values ($1,$2,'Analyze',1) returning id", [tenant, campaign]);
  const runId = await scalar(`insert into public.agent_runs(tenant_id,objective_id,requester_membership_id,mode,state,input_snapshot,authorization_version)
    values ($1,$2,$3,'reel_analysis','queued','{"schema_version":1}',1) returning id`, [tenant, objective, id(11)]);
  const artifact = await scalar("insert into public.artifacts(tenant_id,run_id,type) values ($1,$2,'reel_analysis_brief') returning id", [tenant, runId]);
  const briefRevisionId = await scalar(`insert into public.artifact_revisions(tenant_id,artifact_id,revision,content_digest,producer_reference,provenance,qa)
    values ($1,$2,1,$3,'orchestrator','{"schema_version":1}','{"schema_version":1}') returning id`, [tenant, artifact, 'a'.repeat(64)]);
  const brief = { idempotencyKey: id(21), objective: 'Analyze supplied transcript', sourceRevisionId,
    requestedModalities: ['transcript'], suppliedModalities: ['transcript'] };
  await db.query('insert into public.reel_analysis_revision_bodies(tenant_id,revision_id,body) values ($1,$2,$3)', [tenant, briefRevisionId, { brief }]);
  const taskId = await scalar(`insert into public.reel_analysis_tasks(tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
    values ($1,$2,$3,$4,$5,$6) returning id`, [tenant, operator, runId, briefRevisionId, brief.idempotencyKey, 'a'.repeat(64)]);
  await switchRole('authenticated');
  return { taskId, runId, briefRevisionId, brief };
}
function fixtureReelResult(lease) {
  const binding = { contractVersion: 'reel-analysis.v1', tenantId: lease.task.tenantId, taskId: lease.task.taskId,
    runId: lease.task.runId, attemptId: lease.task.attemptId, liveEffects: false, sourceRevisionId: lease.task.brief.sourceRevisionId };
  return { artifact: { ...binding, producedBy: 'reel_analyst', inspectedModalities: ['transcript'],
    findings: [{ ...binding, modality: 'transcript', observation: 'Synthetic transcript observation', interpretation: null, confidence: 'low', gaps: [] }],
    unavailableModalities: [] } };
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
  await db.query("insert into public.tenants(id,name) values ($1,'Fanout tenant')", [tenant]);
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
  await db.query('insert into private.reel_analysis_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.query('insert into private.content_calendar_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.exec('commit');
});
after(async () => db.close());

test('completing research auto-enqueues a claimable reel-analysis task with the correct source revision and empty supplied modalities', async () => {
  await transactionAs(operator, async () => {
    await submitResearch(); const lease = await claimResearch();
    await switchRole('bagos_research_executor');
    const completed = await completeResearch(lease);
    const reelLease = await claimReel();
    assert.equal(reelLease.status, 'claimed');
    assert.equal(reelLease.task.requesterId, operator);
    assert.equal(reelLease.task.brief.sourceRevisionId, completed.revisionId);
    assert.deepEqual(reelLease.task.brief.requestedModalities, ['video_frames', 'audio', 'transcript']);
    assert.deepEqual(reelLease.task.brief.suppliedModalities, []);
    assert.deepEqual(reelLease.handoff.inputRevisionIds, [completed.revisionId]);
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_tasks'), 1);
    assert.equal(await claimReel(), null);
  });
});

test('the auto-enqueued reel-analysis task completes with an explicit unavailable-media artifact instead of dead-ending', async () => {
  await transactionAs(operator, async () => {
    await submitResearch(); const lease = await claimResearch();
    await switchRole('bagos_research_executor'); await completeResearch(lease);
    const reelLease = await claimReel();
    await switchRole('bagos_reel_analyst_executor');
    const result = unavailableReelResult(reelLease);
    const completed = await completeReel(reelLease, result);
    assert.equal(completed.status, 'succeeded');
    await switchRole('authenticated');
    assert.deepEqual(await scalar('select body from public.reel_analysis_revision_bodies where revision_id=$1', [completed.revisionId]), result.artifact);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_outcomes'), 1);
    // The honest limitation is on the record, not invented analysis.
    assert.deepEqual(await scalar('select body->>\'inspectedModalities\' from public.reel_analysis_revision_bodies where revision_id=$1', [completed.revisionId]), '[]');
    assert.equal(await scalar('select jsonb_array_length(body->\'unavailableModalities\') from public.reel_analysis_revision_bodies where revision_id=$1', [completed.revisionId]), 3);
  });
});

test('completing a reel-analysis attempt auto-enqueues a claimable content-calendar task with the correct source revision', async () => {
  await transactionAs(operator, async () => {
    const omarRevisionId = id(95);
    await fixtureReelTask(omarRevisionId);
    const reelLease = await claimReel();
    await switchRole('bagos_reel_analyst_executor');
    const completed = await completeReel(reelLease, fixtureReelResult(reelLease));
    const calendarLease = await claimCalendar();
    assert.equal(calendarLease.status, 'claimed');
    assert.equal(calendarLease.task.requesterId, operator);
    assert.equal(calendarLease.task.brief.sourceRevisionId, completed.revisionId);
    assert.deepEqual(calendarLease.task.brief.requestedPlatforms, ['instagram', 'facebook']);
    assert.deepEqual(calendarLease.handoff.inputRevisionIds, [omarRevisionId, completed.revisionId]);
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.content_calendar_tasks'), 1);
  });
});

// The full pipeline, wired end to end with real SQL calls at every hop and no
// fixtured shortcut: one human research brief, both triggers firing inside the
// completions that drive them, and every upstream artifact body travelling
// with the lease that consumes it.
test('the full chain runs from one research brief to a claimable content-calendar task carrying both upstream artifacts', async () => {
  await transactionAs(operator, async () => {
    await submitResearch(); const researchLease = await claimResearch();
    await switchRole('bagos_research_executor');
    const researchCompleted = await completeResearch(researchLease);

    const reelLease = await claimReel();
    assert.equal(reelLease.task.brief.sourceRevisionId, researchCompleted.revisionId);
    assert.deepEqual(reelLease.sourceArtifact, researchResult(researchLease).artifact);
    await switchRole('bagos_reel_analyst_executor');
    const reelResult = unavailableReelResult(reelLease);
    const reelCompleted = await completeReel(reelLease, reelResult);
    assert.equal(reelCompleted.status, 'succeeded');

    const calendarLease = await claimCalendar();
    assert.equal(calendarLease.status, 'claimed');
    assert.equal(calendarLease.task.requesterId, operator);
    assert.equal(calendarLease.task.brief.sourceRevisionId, reelCompleted.revisionId);
    assert.deepEqual(calendarLease.handoff.inputRevisionIds, [researchCompleted.revisionId, reelCompleted.revisionId]);
    assert.deepEqual(calendarLease.sourceArtifact, reelResult.artifact);
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.content_calendar_tasks'), 1);
  });
});

test('a second reel-analysis task cannot be fanned out for the same completed research attempt', async () => {
  await transactionAs(operator, async () => {
    await submitResearch(); const lease = await claimResearch();
    await switchRole('bagos_research_executor'); await completeResearch(lease);
    await switchRole('authenticated');
    const existing = await scalar('select row_to_json(t) from public.reel_analysis_tasks t');
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_tasks'), 1);
    // Reuse the exact (tenant, requester, idempotency_key) triple the trigger
    // used -- a stand-in for the trigger somehow firing twice for the same
    // source -- and confirm the database itself refuses the duplicate row.
    await switchRole('bagos_reel_analysis_command');
    await db.exec('savepoint before_duplicate_insert');
    await assert.rejects(db.query(`insert into public.reel_analysis_tasks(tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
      values ($1,$2,$3,$4,$5,$6)`,
      [tenant, operator, existing.run_id, existing.brief_revision_id, lease.task.attemptId, 'b'.repeat(64)]),
      (error) => error.code === '23505');
    await db.exec('rollback to savepoint before_duplicate_insert');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_tasks'), 1);
  });
});

test('a second content-calendar task cannot be fanned out for the same completed reel-analysis attempt', async () => {
  await transactionAs(operator, async () => {
    await fixtureReelTask(id(96));
    const reelLease = await claimReel();
    await switchRole('bagos_reel_analyst_executor');
    await completeReel(reelLease, fixtureReelResult(reelLease));
    await switchRole('authenticated');
    const existing = await scalar('select row_to_json(t) from public.content_calendar_tasks t');
    await switchRole('bagos_content_calendar_command');
    await db.exec('savepoint before_duplicate_insert');
    await assert.rejects(db.query(`insert into public.content_calendar_tasks(tenant_id,requester_id,run_id,brief_revision_id,idempotency_key,input_digest)
      values ($1,$2,$3,$4,$5,$6)`,
      [tenant, operator, existing.run_id, existing.brief_revision_id, reelLease.task.attemptId, 'b'.repeat(64)]),
      (error) => error.code === '23505');
    await db.exec('rollback to savepoint before_duplicate_insert');
    await switchRole('authenticated');
    assert.equal(await scalar('select count(*)::int from public.content_calendar_tasks'), 1);
  });
});

// transactionAs's own rollback undoes the whole attempt (including the
// submit/claim steps run earlier in the same callback), so the state checks
// run afterward, in a fresh statement, exactly like the equivalent
// "late audit failure" tests in research-packet.test.mjs and
// reel-analysis-packet.test.mjs.
test('a failure inside the Ziad fan-out trigger rolls back the research completion in the same transaction', async () => {
  await switchRole('postgres');
  await db.exec("alter table public.audit_log add constraint test_reject_reel_fanout_audit check (event_type <> 'reel_analysis_task_auto_enqueued')");
  try {
    await transactionAs(operator, async () => {
      await submitResearch(); const lease = await claimResearch();
      await switchRole('bagos_research_executor');
      await assert.rejects(completeResearch(lease), (error) => error.code === '23514');
    });
    assert.equal(await scalar('select count(*)::int from public.research_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_tasks'), 0);
    assert.equal(await scalar("select count(*)::int from public.agent_runs where mode='reel_analysis'"), 0);
    assert.equal(await scalar('select count(*)::int from public.agent_tasks'), 0);
  } finally {
    await switchRole('postgres');
    await db.exec('alter table public.audit_log drop constraint test_reject_reel_fanout_audit');
  }
});

test('a failure inside the Nour fan-out trigger rolls back the reel-analysis completion in the same transaction', async () => {
  await switchRole('postgres');
  await db.exec("alter table public.audit_log add constraint test_reject_calendar_fanout_audit check (event_type <> 'content_calendar_task_auto_enqueued')");
  try {
    await transactionAs(operator, async () => {
      await fixtureReelTask(id(97));
      const reelLease = await claimReel();
      await switchRole('bagos_reel_analyst_executor');
      await assert.rejects(completeReel(reelLease, fixtureReelResult(reelLease)), (error) => error.code === '23514');
    });
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_outcomes'), 0);
    assert.equal(await scalar('select count(*)::int from public.content_calendar_tasks'), 0);
    assert.equal(await scalar("select count(*)::int from public.agent_runs where mode='content_calendar'"), 0);
    assert.equal(await scalar('select count(*)::int from public.reel_analysis_tasks'), 0);
  } finally {
    await switchRole('postgres');
    await db.exec('alter table public.audit_log drop constraint test_reject_calendar_fanout_audit');
  }
});

test('trigger functions cannot be invoked directly and browsers cannot forge fanned-out task rows', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await transactionAs(operator, () => assert.rejects(
      scalar('select private.enqueue_reel_analysis_after_research()'), (error) => error.code === '42501'), role);
    await transactionAs(operator, () => assert.rejects(
      scalar('select private.enqueue_content_calendar_after_reel_analysis()'), (error) => error.code === '42501'), role);
    assert.equal(await scalar("select has_table_privilege($1,'public.reel_analysis_tasks','INSERT')", [role]), false);
    assert.equal(await scalar("select has_table_privilege($1,'public.content_calendar_tasks','INSERT')", [role]), false);
    assert.equal(await scalar("select has_function_privilege($1,'private.enqueue_reel_analysis_after_research()','EXECUTE')", [role]), false);
    assert.equal(await scalar("select has_function_privilege($1,'private.enqueue_content_calendar_after_reel_analysis()','EXECUTE')", [role]), false);
  }
  // Neither command role may reach into the other agent's fan-out privilege.
  for (const role of ['bagos_research_command', 'bagos_reel_analyst_executor']) {
    assert.equal(await scalar("select has_function_privilege($1,'private.enqueue_reel_analysis_after_research()','EXECUTE')", [role]), false);
  }
  for (const role of ['bagos_reel_analysis_command', 'bagos_content_calendar_executor']) {
    assert.equal(await scalar("select has_function_privilege($1,'private.enqueue_content_calendar_after_reel_analysis()','EXECUTE')", [role]), false);
  }
  const ziadOwner = (await db.query("select pg_get_userbyid(proowner) as owner, prosecdef from pg_proc where oid='private.enqueue_reel_analysis_after_research()'::regprocedure")).rows[0];
  assert.equal(ziadOwner.owner, 'bagos_reel_analysis_command'); assert.equal(ziadOwner.prosecdef, true);
  const nourOwner = (await db.query("select pg_get_userbyid(proowner) as owner, prosecdef from pg_proc where oid='private.enqueue_content_calendar_after_reel_analysis()'::regprocedure")).rows[0];
  assert.equal(nourOwner.owner, 'bagos_content_calendar_command'); assert.equal(nourOwner.prosecdef, true);
});
