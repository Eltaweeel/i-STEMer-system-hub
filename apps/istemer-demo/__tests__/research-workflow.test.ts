import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const requesterId = '00000000-0000-4000-8000-000000000002';
const runId = '00000000-0000-4000-8000-000000000003';
const taskId = '00000000-0000-4000-8000-000000000004';
const attemptId = '00000000-0000-4000-8000-000000000005';
const brief = { idempotencyKey: taskId, objective: 'Compare education programs', sources: ['https://example.org'] };
const boundary = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null, member: null as Record<string, unknown> | null,
  tenant: null as Record<string, unknown> | null, level: 'aal2',
  commands: [] as { name: string; parameters: Record<string, unknown> }[],
  response: null as unknown, error: null as { code: string; message: string } | null,
  throws: false, rows: {} as Record<string, Record<string, unknown>[]>,
}));

// Only the Auth/PostgREST boundary is doubled here. Transactional semantics are
// exercised separately by the full-migration SQL suite, not by this HTTP suite.
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  auth: {
    getUser: async () => ({ data: { user: boundary.user }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: boundary.level }, error: null }) },
  },
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    const read = async () => ({ data: table === 'memberships' ? boundary.member : table === 'tenants' ? boundary.tenant
      : (boundary.rows[table] ?? []).find((row) => filters.every(([column, value]) => row[column] === value)) ?? null, error: null });
    const query = { select: () => query, eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      order: () => query, limit: () => query, maybeSingle: read, single: read };
    return query;
  },
  rpc: async (name: string, parameters: Record<string, unknown>) => {
    boundary.commands.push({ name, parameters });
    if (boundary.throws) throw new Error('private connection detail');
    return { data: boundary.response, error: boundary.error };
  },
}) }));
import { POST as submit } from '../app/api/workflows/route';
import { POST as retry } from '../app/api/workflows/retry/route';
import { GET as retrieve } from '../app/api/workflows/[runId]/route';

function request(payload: unknown, origin = 'https://staging.example.org') {
  return new Request('https://staging.example.org/api/workflows', { method: 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}
beforeEach(() => {
  vi.stubEnv('ISTEMER_RESEARCH_TENANT_ID', tenantId);
  boundary.user = { id: requesterId, is_anonymous: false, email_confirmed_at: 'confirmed' };
  boundary.member = { tenant_id: tenantId, user_id: requesterId, status: 'active', role: 'operator' };
  boundary.tenant = { id: tenantId, status: 'active' };
  boundary.level = 'aal2'; boundary.commands = []; boundary.error = null; boundary.throws = false;
  boundary.rows = {};
  boundary.response = { contractVersion: 'research.v1', taskId, runId, tenantId, requesterId,
    briefRevisionId: attemptId, liveEffects: false };
});

describe('research retrieval HTTP boundary', () => {
  const get = () => retrieve(new Request(`https://staging.example.org/api/workflows/${runId}`), { params: Promise.resolve({ runId }) });
  beforeEach(() => {
    boundary.rows = {
      agent_tasks: [{ id: taskId, tenant_id: tenantId, requester_id: requesterId, run_id: runId, brief_revision_id: attemptId }],
      agent_runs: [{ id: runId, tenant_id: tenantId, mode: 'research', state: 'queued' }],
    };
  });
  it('reads queued state without fabricating an artifact or attempt', async () => {
    const response = await get();
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ contractVersion: 'research.v1', runId, taskId, status: 'queued',
      attempt: null, artifact: null, revisionId: null, liveEffects: false });
  });
  it.each(['tenant_id', 'requester_id'])('denies a run owned by another %s', async (field) => {
    boundary.rows.agent_tasks![0]![field] = attemptId;
    expect((await get()).status).toBe(404);
  });
  it('reports persisted failures with explicit retry eligibility', async () => {
    boundary.rows.agent_runs![0]!.state = 'failed';
    boundary.rows.research_attempts = [{ id: attemptId, tenant_id: tenantId, task_id: taskId,
      state: 'failed', error_code: 'timeout', retryable: true, retry_requested_at: null }];
    expect((await (await get()).json()).attempt).toEqual({ id: attemptId, state: 'failed', errorCode: 'timeout', retryable: true });
    boundary.rows.research_attempts[0]!.retry_requested_at = '2026-09-16T12:00:00Z';
    expect((await (await get()).json()).attempt.retryable).toBe(false);
  });
  it('does not report successful research when the committed artifact is missing', async () => {
    boundary.rows.agent_runs![0]!.state = 'succeeded';
    const response = await get();
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe('persistence_failure');
  });
  it('requires authentication and a valid resource identifier on GET', async () => {
    boundary.user = null;
    expect((await get()).status).toBe(401);
    boundary.user = { id: requesterId, is_anonymous: false, email_confirmed_at: 'confirmed' };
    expect((await retrieve(new Request('https://staging.example.org'), { params: Promise.resolve({ runId: 'invalid' }) })).status).toBe(400);
  });
  it('returns the committed revision and rejects mutated identity or lineage', async () => {
    const artifact = { contractVersion: 'research.v1', taskId, runId, tenantId, attemptId,
      producedBy: 'competitor_analyst', sourceRevisionIds: [attemptId], liveEffects: false, gaps: ['Fixture only'],
      evidence: [{ sourceUrl: 'https://example.org', inspectionReceiptId: taskId, inspectedAt: '2026-09-16T12:00:00Z',
        observation: 'Synthetic test observation', interpretation: null, confidence: 'low', gaps: ['No live inspection'] }] };
    boundary.rows.agent_runs![0]!.state = 'succeeded';
    boundary.rows.research_attempts = [{ id: attemptId, tenant_id: tenantId, task_id: taskId,
      state: 'succeeded', error_code: null, retryable: false, retry_requested_at: null }];
    boundary.rows.research_outcomes = [{ tenant_id: tenantId, task_id: taskId, artifact_revision_id: taskId }];
    boundary.rows.research_revision_bodies = [{ tenant_id: tenantId, revision_id: taskId, body: artifact }];
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'succeeded', artifact, revisionId: taskId });
    for (const change of [{ runId: attemptId }, { sourceRevisionIds: [taskId] }, { attemptId: taskId }]) {
      boundary.rows.research_revision_bodies[0]!.body = { ...artifact, ...change };
      const rejected = await get();
      expect(rejected.status).toBe(503); expect((await rejected.json()).error.code).toBe('invalid_contract');
    }
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('authenticated research commands', () => {
  it('returns durable acceptance, not simulated results or approvals', async () => {
    const response = await submit(request(brief));
    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ accepted: boundary.response, liveEffects: false });
    expect(boundary.commands).toEqual([{ name: 'submit_research_brief', parameters: { brief, expected_tenant: tenantId } }]);
  });
  it.each(['tenantId', 'requesterId', 'role', 'agentId'])('rejects browser-supplied %s before any command', async (field) => {
    const response = await submit(request({ ...brief, [field]: 'forged' }));
    expect(response.status).toBe(400); expect(boundary.commands).toEqual([]);
  });
  it.each(['signed-out', 'wrong-tenant', 'wrong-requester', 'revoked', 'viewer', 'owner-without-mfa'])(
    'denies %s without enqueueing', async (scenario) => {
      if (scenario === 'signed-out') boundary.user = null;
      if (scenario === 'wrong-tenant') boundary.member = { ...boundary.member, tenant_id: taskId };
      if (scenario === 'wrong-requester') boundary.member = { ...boundary.member, user_id: taskId };
      if (scenario === 'revoked') boundary.member = { ...boundary.member, status: 'revoked' };
      if (scenario === 'viewer') boundary.member = { ...boundary.member, role: 'viewer' };
      if (scenario === 'owner-without-mfa') { boundary.member = { ...boundary.member, role: 'owner' }; boundary.level = 'aal1'; }
      const response = await submit(request(brief));
      expect(response.status).toBe(scenario === 'signed-out' ? 401 : 403);
      expect((await response.json()).error.code).toBe('unauthorized'); expect(boundary.commands).toEqual([]);
    });
  it.each(['', 'https://attacker.example.org'])('rejects missing or cross-origin Origin (%s)', async (origin) => {
    expect((await submit(request(brief, origin))).status).toBe(403); expect(boundary.commands).toEqual([]);
  });
  it('rejects oversized streamed bodies even without content-length', async () => {
    expect((await submit(request({ ...brief, objective: 'x'.repeat(65537) }))).status).toBe(413);
    expect(boundary.commands).toEqual([]);
  });
  it.each([
    ['22023', 'idempotency_conflict', 409, 'idempotency_conflict'],
    ['42501', 'private denied detail', 403, 'unauthorized'],
    ['XX000', 'private database detail', 503, 'persistence_failure'],
  ])('maps database failure %s/%s to a typed failure', async (code, message, status, expected) => {
    boundary.error = { code, message };
    const response = await submit(request(brief));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { contractVersion: 'research.v1', code: expected,
      message: expected, retryable: status === 503 } });
  });
  it('redacts thrown transport failures and malformed successful database responses', async () => {
    boundary.throws = true;
    expect((await submit(request(brief))).status).toBe(503);
    boundary.throws = false; boundary.response = { status: 'success', secret: 'private detail' };
    const response = await submit(request(brief));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('private detail');
  });
  it('requests an explicit attempt-bound retry and never runs agents in the HTTP request', async () => {
    boundary.response = { status: 'retry_requested', runId };
    expect((await retry(request({ attemptId }))).status).toBe(202);
    expect(boundary.commands).toEqual([{ name: 'retry_research_attempt', parameters: { wanted_attempt: attemptId, expected_tenant: tenantId } }]);
    boundary.commands = [];
    expect((await retry(request({ attemptId, tenantId }))).status).toBe(400);
    expect(boundary.commands).toEqual([]);
  });
});
