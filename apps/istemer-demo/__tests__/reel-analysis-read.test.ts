import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const requesterId = '00000000-0000-4000-8000-000000000002';
const runId = '00000000-0000-4000-8000-000000000003';
const taskId = '00000000-0000-4000-8000-000000000004';
const attemptId = '00000000-0000-4000-8000-000000000005';
const briefRevisionId = '00000000-0000-4000-8000-000000000006';
const revisionId = '00000000-0000-4000-8000-000000000007';
const sourceRevisionId = '00000000-0000-4000-8000-000000000008';
const boundary = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null, member: null as Record<string, unknown> | null,
  tenant: null as Record<string, unknown> | null, level: 'aal2',
  rows: {} as Record<string, Record<string, unknown>[]>,
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
}) }));
import { GET as retrieve } from '../app/api/workflows/reel-analysis/[runId]/route';

function artifactFixture() {
  return { contractVersion: 'reel-analysis.v1', tenantId, taskId, runId, attemptId, liveEffects: false,
    producedBy: 'reel_analyst', sourceRevisionId, inspectedModalities: ['transcript'],
    unavailableModalities: [], findings: [{ contractVersion: 'reel-analysis.v1', tenantId, taskId, runId, attemptId,
      liveEffects: false, sourceRevisionId, modality: 'transcript', observation: 'Synthetic test observation',
      interpretation: null, confidence: 'low', gaps: [] }] };
}

beforeEach(() => {
  vi.stubEnv('ISTEMER_RESEARCH_TENANT_ID', tenantId);
  boundary.user = { id: requesterId, is_anonymous: false, email_confirmed_at: 'confirmed' };
  boundary.member = { tenant_id: tenantId, user_id: requesterId, status: 'active', role: 'operator' };
  boundary.tenant = { id: tenantId, status: 'active' };
  boundary.level = 'aal2';
  boundary.rows = {
    reel_analysis_tasks: [{ id: taskId, tenant_id: tenantId, requester_id: requesterId, run_id: runId, brief_revision_id: briefRevisionId }],
    agent_runs: [{ id: runId, tenant_id: tenantId, mode: 'reel_analysis', state: 'queued' }],
  };
});
afterEach(() => vi.unstubAllEnvs());

describe('reel-analysis retrieval HTTP boundary', () => {
  const get = () => retrieve(new Request(`https://staging.example.org/api/workflows/reel-analysis/${runId}`), { params: Promise.resolve({ runId }) });
  it('reads queued state without fabricating an artifact or attempt', async () => {
    const response = await get();
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ contractVersion: 'reel-analysis.v1', runId, taskId, status: 'queued',
      attempt: null, artifact: null, revisionId: null, liveEffects: false });
  });
  it.each(['tenant_id', 'requester_id'])('denies a run owned by another %s', async (field) => {
    boundary.rows.reel_analysis_tasks![0]![field] = attemptId;
    expect((await get()).status).toBe(404);
  });
  it('reports persisted failures with explicit retry eligibility', async () => {
    boundary.rows.agent_runs![0]!.state = 'failed';
    boundary.rows.reel_analysis_attempts = [{ id: attemptId, tenant_id: tenantId, task_id: taskId,
      state: 'failed', error_code: 'timeout', retryable: true, retry_requested_at: null }];
    expect((await (await get()).json()).attempt).toEqual({ id: attemptId, state: 'failed', errorCode: 'timeout', retryable: true });
    boundary.rows.reel_analysis_attempts[0]!.retry_requested_at = '2026-09-16T12:00:00Z';
    expect((await (await get()).json()).attempt.retryable).toBe(false);
  });
  it('does not report a succeeded run when the committed artifact is missing', async () => {
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
    const artifact = artifactFixture();
    boundary.rows.agent_runs![0]!.state = 'succeeded';
    boundary.rows.reel_analysis_attempts = [{ id: attemptId, tenant_id: tenantId, task_id: taskId,
      state: 'succeeded', error_code: null, retryable: false, retry_requested_at: null }];
    boundary.rows.reel_analysis_outcomes = [{ tenant_id: tenantId, task_id: taskId, artifact_revision_id: revisionId }];
    boundary.rows.reel_analysis_revision_bodies = [
      { tenant_id: tenantId, revision_id: briefRevisionId, body: { brief: { sourceRevisionId } } },
      { tenant_id: tenantId, revision_id: revisionId, body: artifact },
    ];
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'succeeded', artifact, revisionId });
    // Every finding shares the artifact's binding (enforced by the contract's own
    // superRefine), so a tampered identity field must be applied consistently for
    // the mutated artifact to still parse; only the read's row-identity cross-check
    // may then catch the mismatch.
    const rebind = (patch: Partial<ReturnType<typeof artifactFixture>>) => ({ ...artifact, ...patch,
      findings: artifact.findings.map((finding) => ({ ...finding, ...patch })) });
    for (const change of [rebind({ runId: attemptId }), rebind({ attemptId: taskId }), rebind({ sourceRevisionId: taskId })]) {
      boundary.rows.reel_analysis_revision_bodies[1]!.body = change;
      const rejected = await get();
      expect(rejected.status).toBe(503); expect((await rejected.json()).error.code).toBe('invalid_contract');
    }
  });
  it('rejects a completed artifact whose brief no longer names the same upstream revision', async () => {
    const artifact = artifactFixture();
    boundary.rows.agent_runs![0]!.state = 'succeeded';
    boundary.rows.reel_analysis_attempts = [{ id: attemptId, tenant_id: tenantId, task_id: taskId,
      state: 'succeeded', error_code: null, retryable: false, retry_requested_at: null }];
    boundary.rows.reel_analysis_outcomes = [{ tenant_id: tenantId, task_id: taskId, artifact_revision_id: revisionId }];
    boundary.rows.reel_analysis_revision_bodies = [
      { tenant_id: tenantId, revision_id: briefRevisionId, body: { brief: { sourceRevisionId: taskId } } },
      { tenant_id: tenantId, revision_id: revisionId, body: artifact },
    ];
    const rejected = await get();
    expect(rejected.status).toBe(503); expect((await rejected.json()).error.code).toBe('invalid_contract');
  });
});
