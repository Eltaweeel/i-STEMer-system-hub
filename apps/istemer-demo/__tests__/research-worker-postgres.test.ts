import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { ResearchArtifact, SourceInspection } from '@bagos/contracts';
import { observeSource } from '../../../packages/core/research-worker/src/source-observer';
import { createSqlResearchCommandPort, verifyWorkerLogin, type SqlClient } from '../lib/workflow/research-command-port';
import { runResearchWorkerCycle, type ResearchDispatcher, type ResearchWorkerConfig, type SourceObserver } from '../lib/workflow/research-worker';
import type { DispatchOutcome } from '../lib/workflow/research-transport';

// The real command port and worker cycle against the real migrations, connected as a dedicated LOGIN role whose only
// authority is membership in bagos_research_executor -- the shape the staging worker login must have. Only the source
// network and the Omar listener are doubled. Local PGlite only: no credentials, no remote database.
const supabaseDir = resolve(import.meta.dirname, '../../../supabase');
const APPROVED = 'https://www.engineeringforkids.com/international-locations/egypt/';
const WORKER = 'istemer_research_worker';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), owner = id(3), operator = id(4);

const db = new PGlite({ extensions: { pgcrypto } });
const one = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})[0] as T;

/** A connection that runs every statement as `role`, the way a pool connected with that login would. */
function connectionAs(role: string): SqlClient {
  return {
    async query(text, values) {
      await db.exec(`set session authorization ${role}`);
      try { return { rows: (await db.query<Record<string, unknown>>(text, [...values])).rows }; }
      finally { await db.exec('set session authorization postgres'); }
    },
  };
}

/** Commits as a signed-in operator, like the browser API does through PostgREST. */
async function asOperator<T>(sql: string, params: unknown[]): Promise<T> {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [operator, JSON.stringify({ sub: operator, aal: 'aal1', is_anonymous: false })]);
    await db.exec('set session authorization authenticated');
    const value = await one<T>(sql, params);
    await db.exec('commit');
    return value;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  } finally {
    await db.exec('set session authorization postgres');
  }
}
const submit = (sources = [APPROVED]) => asOperator<{ taskId: string; runId: string }>(
  'select public.submit_research_brief($1::jsonb,$2::uuid)',
  [JSON.stringify({ idempotencyKey: randomUUID(), objective: 'Summarise the Egypt locations page', sources }), tenant]);
const requestRetry = (attemptId: string) => asOperator('select public.retry_research_attempt($1::uuid,$2::uuid)', [attemptId, tenant]);

/** Moves one attempt's lease into the past, standing in for five minutes of a dead worker. Test-only time travel. */
async function ageLease(attemptId: string) {
  await db.exec('alter table public.research_attempts disable trigger research_attempt_guard');
  await db.query(`update public.research_attempts set issued_at = issued_at - interval '10 minutes',
    expires_at = expires_at - interval '10 minutes' where id = $1`, [attemptId]);
  await db.exec('alter table public.research_attempts enable trigger research_attempt_guard');
}
/** Ends a lease 2 ms after it started, keeping its start: an answer observed in that window stays well-formed, so
 * only the stale-attempt rule can refuse it. */
async function expireLeaseInPlace(attemptId: string) {
  await db.exec('alter table public.research_attempts disable trigger research_attempt_guard');
  await db.query("update public.research_attempts set expires_at = issued_at + interval '2 milliseconds' where id = $1", [attemptId]);
  await db.exec('alter table public.research_attempts enable trigger research_attempt_guard');
}
const setMembership = (status: 'active' | 'revoked') =>
  db.query('update public.memberships set status=$1 where tenant_id=$2 and user_id=$3', [status, tenant, operator]);
const attemptRow = (runId: string) => db.query<{ id: string; state: string; error_code: string | null; retryable: boolean }>(
  'select id, state, error_code, retryable from public.research_attempts where run_id=$1 order by attempt_number', [runId]).then((r) => r.rows);
const runState = (runId: string) => one<string>('select state from public.agent_runs where id=$1', [runId]);
const auditEvents = (runId: string) => db.query<{ event_type: string }>(`select a.event_type from public.audit_log a
  join public.research_attempts r on r.id = a.command_id where r.run_id = $1 order by a.created_at, a.id`, [runId])
  .then((r) => r.rows.map((row) => row.event_type));
const count = (sql: string, params: unknown[] = []) => one<number>(sql, params);

// The worker's injected clock follows the database: each claim sets it just after the issued lease start, and a test
// can move it to model a slow run. The process clock is never read.
let clockMs = 0;
const port = createSqlResearchCommandPort(connectionAs(WORKER));
const trackedPort = {
  ...port,
  async claim() {
    const claimed = await port.claim() as { status?: string; task?: { issuedAt: string } } | null;
    if (claimed?.status === 'claimed' && claimed.task) clockMs = Date.parse(claimed.task.issuedAt) + 1;
    return claimed;
  },
};

type Held = { task: { attemptId: string } & Record<string, unknown>; handoff: Record<string, unknown> };
/** Claims as the worker would and keeps the lease without running it: a worker that is busy or has just died. */
async function claimAndHold(): Promise<Held> {
  const claimed = await trackedPort.claim();
  if (claimed?.status !== 'claimed') throw new Error('expected a claimable task');
  return claimed as unknown as Held;
}

/** What a correct worker would persist for a held claim: the observer's receipt and the listener's artifact. */
async function answerFor(held: Held): Promise<{ artifact: ResearchArtifact; receipts: SourceInspection[] }> {
  const observed = await fakeObserve({ task: held.task, sourceUrl: APPROVED, now: () => clockMs, signal: new AbortController().signal });
  if (observed.status !== 'inspected') throw new Error('expected an inspected source');
  const body = new TextEncoder().encode(JSON.stringify({ ...held, snapshots: [observed.snapshot] }));
  // The implementation, not the spy: building a fixture is not a dispatch the worker made.
  const outcome = await validAnswer.getMockImplementation()!({ hostname: '127.0.0.1', port: 0 }, {} as never, body, 0);
  if (outcome.status !== 'ok') throw new Error('expected an artifact');
  return { artifact: outcome.artifact as ResearchArtifact, receipts: [observed.snapshot.receipt] };
}

const fakeObserve: SourceObserver = async ({ task, sourceUrl, now }) => {
  const t = task as { tenantId: string; taskId: string; runId: string; attemptId: string };
  const text = 'Engineering For Kids Egypt lists its programmes and contact details.';
  return { status: 'inspected', gaps: [], snapshot: { text, receipt: {
    contractVersion: 'research.v1', tenantId: t.tenantId, taskId: t.taskId, runId: t.runId, attemptId: t.attemptId,
    sourceUrl, inspectedAt: new Date(now()).toISOString(), receiptId: randomUUID(),
    contentHash: createHash('sha256').update(text, 'utf8').digest('hex') } } };
};

/** Stands in for the authenticated Omar listener: answers from the signed body it was sent. */
function listener(answer: (body: { task: Record<string, unknown>; handoff: { inputRevisionIds: string[] };
  snapshots: { receipt: Record<string, string> }[] }) => DispatchOutcome | Promise<DispatchOutcome>) {
  return vi.fn<ResearchDispatcher>(async (_endpoint, _signed, body) => answer(JSON.parse(new TextDecoder().decode(body))));
}
const validAnswer = listener(({ task, handoff, snapshots }) => ({ status: 'ok', artifact: {
  contractVersion: 'research.v1', taskId: task.taskId, runId: task.runId, attemptId: task.attemptId, tenantId: task.tenantId,
  producedBy: 'competitor_analyst', sourceRevisionIds: handoff.inputRevisionIds, gaps: [], liveEffects: false,
  evidence: snapshots.map(({ receipt }) => ({ sourceUrl: receipt.sourceUrl, inspectionReceiptId: receipt.receiptId,
    inspectedAt: receipt.inspectedAt, observation: 'The page describes the Egypt programme.', interpretation: null,
    confidence: 'low', gaps: [] })),
} }));

function config(overrides: Partial<ResearchWorkerConfig> = {}): ResearchWorkerConfig {
  return { port: trackedPort, observe: fakeObserve, dispatch: validAnswer, endpoint: { hostname: '127.0.0.1', port: 4100 },
    keyId: 'worker-key', signingKey: new Uint8Array(32).fill(9), now: () => clockMs, approvedSources: new Set([APPROVED]),
    completeRetryDelayMs: 0, ...overrides };
}

beforeAll(async () => {
  await db.exec('create schema extensions; create extension pgcrypto with schema extensions');
  await db.exec(await readFile(resolve(supabaseDir, 'tests/platform-stubs.sql'), 'utf8'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
    grant execute on function auth.jwt() to authenticated;`);
  const migrations = (await readdir(resolve(supabaseDir, 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  for (const name of migrations) await db.exec(await readFile(resolve(supabaseDir, 'migrations', name), 'utf8'));
  await db.exec('begin');
  await db.query("insert into public.tenants(id,name) values ($1,'Staging tenant')", [tenant]);
  const triggers = (await db.query<{ tgname: string }>(`select t.tgname from pg_trigger t join pg_constraint c on c.oid=t.tgconstraint
    where t.tgrelid='public.memberships'::regclass and c.confrelid='auth.users'::regclass`)).rows;
  for (const { tgname } of triggers) await db.exec(`alter table public.memberships disable trigger "${tgname}"`);
  await db.query(`insert into public.memberships(id,tenant_id,user_id,role,status)
    values ($1,$2,$3,'owner','active'), ($4,$2,$5,'operator','active')`, [id(10), tenant, owner, id(11), operator]);
  await db.exec('set constraints all immediate');
  for (const { tgname } of triggers) await db.exec(`alter table public.memberships enable trigger "${tgname}"`);
  await db.exec("update public.tenants set status='active'");
  await db.query('insert into private.research_brand_binding(tenant_id) values ($1)', [tenant]);
  await db.exec('commit');
  // The provisioning the runbook asks the owner to perform, here only against local PGlite.
  await db.exec(`create role ${WORKER} login; grant bagos_research_executor to ${WORKER};`);
}, 120_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await setMembership('active'); validAnswer.mockClear(); });

describe('worker login check against the real grants', () => {
  it('accepts a login whose only authority is the executor role', async () => {
    await expect(verifyWorkerLogin(connectionAs(WORKER))).resolves.toBeUndefined();
  });

  it.each([
    ['the postgres superuser', 'postgres', '', 'reserved_login'],
    ['a capability role used directly', 'bagos_research_executor', '', 'reserved_login'],
    ['a login with no executor membership', 'worker_bare', '', 'unexpected_memberships'],
    ['a login that is also authenticated', 'worker_extra', 'grant bagos_research_executor, authenticated to worker_extra;', 'unexpected_memberships'],
    ['a login that can grant the executor role', 'worker_admin', 'grant bagos_research_executor to worker_admin with admin option;', 'unexpected_memberships'],
    ['a login with CREATEDB', 'worker_createdb', 'alter role worker_createdb createdb; grant bagos_research_executor to worker_createdb;', 'elevated_attributes'],
    ['a login with BYPASSRLS', 'worker_bypass', 'alter role worker_bypass bypassrls; grant bagos_research_executor to worker_bypass;', 'elevated_attributes'],
    ['a login that does not inherit the executor', 'worker_noinherit', 'alter role worker_noinherit noinherit; grant bagos_research_executor to worker_noinherit;', 'executor_not_inherited'],
    ['a login with direct table access', 'worker_reader', 'grant bagos_research_executor to worker_reader; grant select on public.memberships to worker_reader;', 'direct_table_access'],
    ['a login with a single column grant', 'worker_column', 'grant bagos_research_executor to worker_column; grant select (user_id) on public.memberships to worker_column;', 'direct_table_access'],
    ['a login granted a table outside public/private', 'worker_storage', 'grant bagos_research_executor to worker_storage; grant select on storage.buckets to worker_storage;', 'direct_grant'],
    ['a login granted a function directly', 'worker_fn', 'grant bagos_research_executor to worker_fn; grant execute on function auth.uid() to worker_fn;', 'direct_grant'],
    ['a login granted a schema directly', 'worker_schema', 'grant bagos_research_executor to worker_schema; grant usage on schema auth to worker_schema;', 'direct_grant'],
  ])('refuses %s', async (_case, role, setup, reason) => {
    if (role.startsWith('worker_')) await db.exec(`create role ${role} login; ${setup}`);
    await expect(verifyWorkerLogin(connectionAs(role))).rejects.toThrow(`worker_login_rejected:${reason}`);
  });

  it('refuses a session whose current role is not its login, even when that role is not reserved', async () => {
    await db.exec('create role worker_target nologin; create role worker_hop login; grant worker_target to worker_hop;');
    const hopped: SqlClient = { async query(text, values) {
      await db.exec('set session authorization worker_hop; set role worker_target');
      try { return { rows: (await db.query<Record<string, unknown>>(text, [...values])).rows }; }
      finally { await db.exec('reset role; set session authorization postgres'); }
    } };
    await expect(verifyWorkerLogin(hopped)).rejects.toThrow('worker_login_rejected:escalated_session');
  });

  it('refuses a session that switched to the executor role after connecting', async () => {
    await db.exec(`create role worker_switch login; grant bagos_research_executor to worker_switch;`);
    const switched: SqlClient = { async query(text, values) {
      await db.exec('set session authorization worker_switch; set role bagos_research_executor');
      try { return { rows: (await db.query<Record<string, unknown>>(text, [...values])).rows }; }
      finally { await db.exec('reset role; set session authorization postgres'); }
    } };
    await expect(verifyWorkerLogin(switched)).rejects.toThrow('worker_login_rejected:reserved_login');
  });

  it('refuses to start when a command is missing, e.g. a migration that was never applied', async () => {
    await db.exec('begin; revoke execute on function private.record_research_usage(uuid,integer,boolean) from bagos_research_executor');
    try {
      await expect(verifyWorkerLogin(connectionAs(WORKER))).rejects.toThrow('worker_login_rejected:missing_command_privilege');
    } finally { await db.exec('rollback'); }
    await expect(verifyWorkerLogin(connectionAs(WORKER))).resolves.toBeUndefined();
  });

  it('cannot claim at all without the executor grant', async () => {
    await expect(createSqlResearchCommandPort(connectionAs('worker_bare')).claim()).rejects.toMatchObject({ code: '42501' });
  });

  it('gives the worker login no direct read of tenant data', async () => {
    await expect(connectionAs(WORKER).query('select count(*) from public.research_attempts', [])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('research worker cycle on the real SQL commands', () => {
  // Observer and listener are doubles here; the signed HTTP path and real fetching are covered by research-slice-e2e.
  it('completes one Omar task through the real SQL commands with artifact, receipts, unreported usage and audit', async () => {
    const { runId } = await submit();
    const result = await runResearchWorkerCycle(config());
    expect(result).toMatchObject({ outcome: 'succeeded', runId });
    expect(validAnswer).toHaveBeenCalledTimes(1);
    expect(await runState(runId)).toBe('succeeded');
    const [attempt] = await attemptRow(runId);
    expect(attempt).toMatchObject({ state: 'succeeded', error_code: null });
    const stored = await one<{ evidence: { sourceUrl: string }[]; liveEffects: boolean }>(`select b.body from public.research_outcomes o
      join public.research_revision_bodies b on b.revision_id = o.artifact_revision_id where o.attempt_id = $1`, [attempt!.id]);
    expect(stored.liveEffects).toBe(false);
    expect(stored.evidence.map((e) => e.sourceUrl)).toEqual([APPROVED]);
    expect(await one('select usage_reported from public.usage_records where attempt_id=$1', [attempt!.id])).toBe(false);
    // reel_analysis_task_auto_enqueued is the known side effect of 20260918070000_adam_ziad_auto_enqueue: a queued Ziad
    // task in the same transaction, which no deployed process runs.
    // Rows written in one transaction share created_at, so compare without order.
    expect((await auditEvents(runId)).sort()).toEqual(['agent_usage_recorded', 'reel_analysis_task_auto_enqueued',
      'research_attempt_completed', 'research_attempt_started']);
    expect(await count('select count(*)::int from public.reel_analysis_tasks')).toBe(1);
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'idle' });
  });

  it('records a provider failure as retryable, never retries it by itself, and runs again only on the requester retry', async () => {
    const { runId } = await submit();
    const down = listener(() => ({ status: 'transport_failure' }));
    expect(await runResearchWorkerCycle(config({ dispatch: down }))).toMatchObject({ outcome: 'failed', code: 'provider_failure' });
    const [first] = await attemptRow(runId);
    expect(first).toMatchObject({ state: 'failed', error_code: 'provider_failure', retryable: true });
    expect(await runState(runId)).toBe('failed');
    expect(await auditEvents(runId)).toEqual(['research_attempt_started', 'research_attempt_failed']);
    expect(await runResearchWorkerCycle(config({ dispatch: down }))).toEqual({ outcome: 'idle' });
    expect(down).toHaveBeenCalledTimes(1);

    await requestRetry(first!.id);
    expect(await runResearchWorkerCycle(config())).toMatchObject({ outcome: 'succeeded', runId });
    expect((await attemptRow(runId)).map((a) => a.state)).toEqual(['failed', 'succeeded']);
  });

  it('records the dispatcher timeout outcome as a provider failure, not a success', async () => {
    const { runId } = await submit();
    // dispatchResearchTask reports its own total deadline as transport_failure; that deadline itself is proven in
    // research-transport.test.ts ("enforces a total deadline ..."). This covers what the worker and SQL do with it.
    const slow = listener(() => ({ status: 'transport_failure' }));
    expect(await runResearchWorkerCycle(config({ dispatch: slow }))).toMatchObject({ outcome: 'failed', code: 'provider_failure' });
    expect(await count('select count(*)::int from public.research_outcomes o join public.research_attempts a on a.id=o.attempt_id where a.run_id=$1', [runId])).toBe(0);
  });

  it('rejects a listener answer that fails validation and stores nothing', async () => {
    const { runId } = await submit();
    const forged = listener(({ task, handoff }) => ({ status: 'ok', artifact: {
      contractVersion: 'research.v1', taskId: task.taskId, runId: task.runId, attemptId: task.attemptId, tenantId: task.tenantId,
      producedBy: 'competitor_analyst', sourceRevisionIds: handoff.inputRevisionIds, gaps: [], liveEffects: false,
      evidence: [{ sourceUrl: APPROVED, inspectionReceiptId: randomUUID(), inspectedAt: new Date(clockMs).toISOString(),
        observation: 'Cites a receipt the observer never issued.', interpretation: null, confidence: 'high', gaps: [] }] } }));
    expect(await runResearchWorkerCycle(config({ dispatch: forged }))).toMatchObject({ outcome: 'failed', code: 'invalid_contract' });
    expect((await attemptRow(runId))[0]).toMatchObject({ error_code: 'invalid_contract', retryable: false });
  });

  it('fails a source-fetch failure through the real observer before any paid dispatch', async () => {
    const { runId } = await submit();
    const unreachable: SourceObserver = (input) => observeSource({ ...input,
      network: { resolve: async () => { throw new Error('ENOTFOUND'); }, request: (() => { throw new Error('unreachable'); }) as never } });
    expect(await runResearchWorkerCycle(config({ observe: unreachable }))).toMatchObject({ outcome: 'failed', code: 'uninspected_source' });
    expect(validAnswer).not.toHaveBeenCalled();
    expect((await attemptRow(runId))[0]).toMatchObject({ error_code: 'uninspected_source', retryable: false });
  });

  it('refuses a brief naming an unapproved source without fetching it', async () => {
    const { runId } = await submit([APPROVED, 'https://engineeringforkids.com/international-locations/egypt/']);
    const observe = vi.fn(fakeObserve);
    expect(await runResearchWorkerCycle(config({ observe }))).toMatchObject({ outcome: 'failed', code: 'uninspected_source' });
    expect(observe).not.toHaveBeenCalled();
    expect(validAnswer).not.toHaveBeenCalled();
    expect(await runState(runId)).toBe('failed');
  });

  it('does not run a task whose requester was revoked before the claim', async () => {
    const { runId } = await submit();
    await setMembership('revoked');
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'lease_reclaimed', runId, code: 'unauthorized' });
    expect(validAnswer).not.toHaveBeenCalled();
    expect(await auditEvents(runId)).toEqual(['research_authorization_revoked']);
  });

  it('does not store the answer when the requester is revoked during the run, and says why', async () => {
    const { runId } = await submit();
    const revokingListener = listener(async (body) => {
      await setMembership('revoked');
      return validAnswer.getMockImplementation()!(undefined as never, undefined as never, new TextEncoder().encode(JSON.stringify(body)), 0);
    });
    expect(await runResearchWorkerCycle(config({ dispatch: revokingListener }))).toMatchObject({ outcome: 'failed', code: 'unauthorized' });
    expect((await attemptRow(runId))[0]).toMatchObject({ state: 'failed', error_code: 'unauthorized', retryable: false });
    expect(await count('select count(*)::int from public.research_outcomes o join public.research_attempts a on a.id=o.attempt_id where a.run_id=$1', [runId])).toBe(0);
  });
});

describe('duplicates and restart recovery on the real SQL commands', () => {
  it('never hands a running attempt to a second worker, and accepts only the identical completion twice', async () => {
    const { runId } = await submit();
    const held = await claimAndHold();
    // A second worker (or a restarted one) while the lease is live: nothing to claim, nothing dispatched.
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'idle' });
    expect(validAnswer).not.toHaveBeenCalled();

    // The first worker finishes, then repeats its completion as it would after a lost acknowledgement.
    const { artifact, receipts } = await answerFor(held);
    const first = await port.complete(held.task.attemptId, artifact, receipts);
    expect(first).toMatchObject({ status: 'succeeded', attemptId: held.task.attemptId });
    expect(await port.complete(held.task.attemptId, artifact, receipts)).toEqual(first);
    await expect(port.complete(held.task.attemptId, { ...artifact, gaps: ['A different answer'] }, receipts))
      .rejects.toMatchObject({ code: '22023' });
    expect(await count('select count(*)::int from public.research_outcomes o join public.research_attempts a on a.id=o.attempt_id where a.run_id=$1', [runId])).toBe(1);
  });

  // A restart is modelled as a new cycle on the same database after the old worker stopped; no process is restarted.
  it('recovers a task whose worker died mid-run as a visible timeout, and never lets the dead attempt complete', async () => {
    const { runId } = await submit();
    const orphan = await claimAndHold();
    // The worker process dies here. A restarted worker finds nothing claimable while the lease is live...
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'idle' });
    // The dead worker had already produced an answer inside its lease; it surfaces only after the lease is gone.
    const late = await answerFor(orphan);
    // ...and once the lease lapses, the next claim fails it as a retryable timeout instead of running it again.
    await expireLeaseInPlace(orphan.task.attemptId);
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'lease_reclaimed', runId, code: 'timeout' });
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'idle' });
    expect(validAnswer).not.toHaveBeenCalled();
    expect((await attemptRow(runId))[0]).toMatchObject({ state: 'failed', error_code: 'timeout', retryable: true });
    expect(await auditEvents(runId)).toEqual(['research_attempt_started', 'research_lease_expired']);

    await requestRetry(orphan.task.attemptId);
    expect(await runResearchWorkerCycle(config())).toMatchObject({ outcome: 'succeeded', runId });
    // A zombie of the dead worker cannot complete (or fail) the old attempt, even with a fully valid answer.
    await expect(port.complete(orphan.task.attemptId, late.artifact, late.receipts))
      .rejects.toMatchObject({ code: '55000', message: 'stale_attempt' });
    await expect(port.fail(orphan.task.attemptId, 'provider_failure')).rejects.toMatchObject({ code: '55000' });
    expect(await count('select count(*)::int from public.research_outcomes where attempt_id=$1', [orphan.task.attemptId])).toBe(0);
    expect((await attemptRow(runId)).map((a) => a.state)).toEqual(['failed', 'succeeded']);
  });

  it('leaves the attempt to the lease when the run outlasts it, without recording a false outcome', async () => {
    const { runId } = await submit();
    const overrun = listener(async (body) => {
      clockMs = Date.parse(String(body.task.expiresAt)) + 1;
      return validAnswer.getMockImplementation()!(undefined as never, undefined as never, new TextEncoder().encode(JSON.stringify(body)), 0);
    });
    const result = await runResearchWorkerCycle(config({ dispatch: overrun }));
    expect(result).toMatchObject({ outcome: 'lease_expired', runId });
    const [attempt] = await attemptRow(runId);
    expect(attempt).toMatchObject({ state: 'running' });
    await ageLease(attempt!.id);
    expect(await runResearchWorkerCycle(config())).toEqual({ outcome: 'lease_reclaimed', runId, code: 'timeout' });
    expect(await count('select count(*)::int from public.research_outcomes o join public.research_attempts a on a.id=o.attempt_id where a.run_id=$1', [runId])).toBe(0);
  });
});

describe('usage boundary for the worker login (migration 20261008120000)', () => {
  it('refuses to start while the login can still run the broad usage command, as before the migration', async () => {
    await db.exec('begin; grant execute on function private.record_agent_usage(uuid,text,integer,boolean) to bagos_research_executor');
    try {
      await expect(verifyWorkerLogin(connectionAs(WORKER))).rejects.toThrow('worker_login_rejected:broad_usage_command');
    } finally { await db.exec('rollback'); }
  });

  it('cannot call the broad usage command for any category', async () => {
    for (const agent of ['competitor_analyst', 'reel_analyst', 'content_creator']) {
      await expect(connectionAs(WORKER).query('select private.record_agent_usage($1::uuid,$2::text,1,true)', [id(960), agent]))
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('cannot meter a real, finished Ziad attempt, which its own executor still can', async () => {
    // A completed Omar task queues a Ziad task (see the success test above); claim and fail it as Ziad's executor.
    await db.query('insert into private.reel_analysis_brand_binding(tenant_id) values ($1) on conflict do nothing', [tenant]);
    await db.exec('set session authorization bagos_reel_analyst_executor');
    let claimed: { status: string; task: { attemptId: string } };
    try { claimed = await one('select private.claim_reel_analysis_task()'); }
    finally { await db.exec('set session authorization postgres'); }
    expect(claimed.status).toBe('claimed');
    const reelAttempt = claimed.task.attemptId;
    await db.exec('set session authorization bagos_reel_analyst_executor');
    try { await db.query("select private.fail_reel_analysis_attempt($1,'provider_failure')", [reelAttempt]); }
    finally { await db.exec('set session authorization postgres'); }

    await expect(port.recordUsage(reelAttempt, 0)).rejects.toMatchObject({ code: '55000' });
    expect(await count('select count(*)::int from public.usage_records where attempt_id=$1', [reelAttempt])).toBe(0);

    await db.exec('set session authorization bagos_reel_analyst_executor');
    try {
      expect(await one("select private.record_agent_usage($1,'reel_analyst',7,true)", [reelAttempt]))
        .toMatchObject({ attemptId: reelAttempt, reportedTokens: 7, usageReported: true });
    } finally { await db.exec('set session authorization postgres'); }
    expect(await one('select agent_id from public.usage_records where attempt_id=$1', [reelAttempt])).toBe('reel_analyst');
  });
});
