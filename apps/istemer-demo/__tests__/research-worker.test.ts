import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { runResearchWorkerCycle, type ResearchCommandPort, type SourceObservation } from '../lib/workflow/research-worker';
import type { DispatchOutcome } from '../lib/workflow/research-transport';

const NOW0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const tenantId = '00000000-0000-4000-8000-000000000001';
const requesterId = '00000000-0000-4000-8000-000000000002';
const taskId = '00000000-0000-4000-8000-000000000003';
const runId = '00000000-0000-4000-8000-000000000004';
const attemptId = '00000000-0000-4000-8000-000000000005';
const revisionId = '00000000-0000-4000-8000-000000000006';
const receiptId = '00000000-0000-4000-8000-000000000007';
const sourceUrl = 'https://example.org/competitor';

function buildTask(expiresAt = iso(NOW0 + 5 * 60_000)) {
  return {
    contractVersion: 'research.v1', taskId, runId, attemptId, tenantId, requesterId,
    agentId: 'competitor_analyst', allowedScope: ['research:read'],
    issuedAt: iso(NOW0), expiresAt,
    brief: { idempotencyKey: '00000000-0000-4000-8000-000000000008', objective: 'Compare pricing pages', sources: [sourceUrl] },
    liveEffects: false,
  };
}
function buildHandoff() {
  return { contractVersion: 'research.v1', taskId, runId, attemptId, tenantId,
    fromAgentId: 'orchestrator', toAgentId: 'competitor_analyst', inputRevisionIds: [revisionId], liveEffects: false };
}
function buildReceipt(text: string) {
  return { contractVersion: 'research.v1' as const, tenantId, taskId, runId, attemptId, sourceUrl,
    inspectedAt: iso(NOW0 + 1000), receiptId, contentHash: createHash('sha256').update(text, 'utf8').digest('hex') };
}
function buildArtifact() {
  return {
    contractVersion: 'research.v1' as const, taskId, runId, attemptId, tenantId, producedBy: 'competitor_analyst' as const,
    sourceRevisionIds: [revisionId],
    evidence: [{ sourceUrl, inspectionReceiptId: receiptId, inspectedAt: iso(NOW0 + 1000),
      observation: 'Pricing page lists three tiers.', interpretation: null, confidence: 'medium' as const, gaps: [] }],
    gaps: [], liveEffects: false as const,
  };
}

function fakePort(overrides: Partial<ResearchCommandPort> = {}): ResearchCommandPort {
  return {
    claim: vi.fn().mockResolvedValue(null),
    fail: vi.fn().mockResolvedValue({ status: 'failed' }),
    complete: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    ...overrides,
  };
}
function inspectedObservation(text = 'hello world'): SourceObservation {
  return { status: 'inspected', snapshot: { receipt: buildReceipt(text), text }, gaps: [] };
}
function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    port: fakePort(),
    observe: vi.fn().mockResolvedValue(inspectedObservation()),
    dispatch: vi.fn().mockResolvedValue({ status: 'ok', artifact: buildArtifact() } satisfies DispatchOutcome),
    endpoint: { hostname: '127.0.0.1', port: 4100 },
    keyId: 'worker-key-1',
    signingKey: new Uint8Array(32).fill(7),
    now: () => NOW0 + 2000,
    ...overrides,
  };
}

describe('runResearchWorkerCycle', () => {
  it('is idle when there is nothing to claim', async () => {
    const result = await runResearchWorkerCycle(baseConfig());
    expect(result).toEqual({ outcome: 'idle' });
  });

  it('reports lease_reclaimed and takes no further action when claim already terminated a stale attempt', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'failed', runId, code: 'timeout' }) });
    const result = await runResearchWorkerCycle(baseConfig({ port }));
    expect(result).toEqual({ outcome: 'lease_reclaimed', runId, code: 'timeout' });
    expect(port.fail).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
  });

  it('fails with uninspected_source and never dispatches when every source comes back uninspected', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const observe = vi.fn().mockResolvedValue({ status: 'uninspected', sourceUrl, code: 'unavailable', gaps: [] });
    const dispatch = vi.fn();
    const result = await runResearchWorkerCycle(baseConfig({ port, observe, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'uninspected_source' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'uninspected_source');
  });

  it('reports lease_expired and never calls port.fail when the task has already expired before dispatch', async () => {
    // private.fail_research_attempt rejects once expires_at <= now() (see
    // supabase/migrations/20260916060831_adam_omar_attempt_leases.sql); the
    // worker must not call it for a self-detected expiry, only the next
    // claim() cycle reclaims a stale running attempt.
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(iso(NOW0 + 1000)), handoff: buildHandoff() }) });
    const dispatch = vi.fn();
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch, now: () => NOW0 + 5000 }));
    expect(result).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(dispatch).not.toHaveBeenCalled();
    expect(port.fail).not.toHaveBeenCalled();
  });

  it('reports lease_expired rather than uninspected_source when both conditions coincide', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(iso(NOW0 + 1000)), handoff: buildHandoff() }) });
    const observe = vi.fn().mockResolvedValue({ status: 'uninspected', sourceUrl, code: 'unavailable', gaps: [] });
    const result = await runResearchWorkerCycle(baseConfig({ port, observe, now: () => NOW0 + 5000 }));
    expect(result).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(port.fail).not.toHaveBeenCalled();
  });

  it('stops observing further sources once the lease expires mid-loop', async () => {
    const task = buildTask(iso(NOW0 + 1500));
    const multiSource = { ...task, brief: { ...task.brief, sources: [sourceUrl, 'https://example.org/second'] } };
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: multiSource, handoff: buildHandoff() }) });
    let calls = 0;
    const observe = vi.fn().mockImplementation(async () => { calls += 1; return inspectedObservation(); });
    // now() advances past expiry only after the first source is observed.
    const now = vi.fn().mockReturnValueOnce(NOW0 + 100).mockReturnValue(NOW0 + 2000);
    const result = await runResearchWorkerCycle(baseConfig({ port, observe, now }));
    expect(result).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(calls).toBe(1);
  });

  it('signs and dispatches the envelope, then completes on a valid artifact', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: buildArtifact() });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'succeeded', runId, attemptId });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [, signed, body] = dispatch.mock.calls[0]!;
    expect(signed.keyId).toBe('worker-key-1');
    expect(JSON.parse(Buffer.from(body).toString('utf8'))).toMatchObject({ task: buildTask(), handoff: buildHandoff() });
    expect(port.complete).toHaveBeenCalledWith(attemptId, buildArtifact(), [buildReceipt('hello world')]);
    expect(port.fail).not.toHaveBeenCalled();
  });

  it('maps a transport_failure dispatch outcome to a retryable provider_failure', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'transport_failure' });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'provider_failure' });
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'provider_failure');
  });

  it('passes through a recognized error code from the listener', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'error', error: { code: 'unauthorized' } });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'unauthorized' });
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'unauthorized');
  });

  it.each(['expired', 'stale_attempt'])(
    'maps a transport-layer %s error to the non-retryable invalid_contract, not provider_failure',
    async (code) => {
      const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
      const dispatch = vi.fn().mockResolvedValue({ status: 'error', error: { code } });
      const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
      expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
      expect(port.fail).toHaveBeenCalledWith(attemptId, 'invalid_contract');
    },
  );

  it('falls back to provider_failure for an unrecognized or missing error code', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'error', error: { code: 'not_a_real_code' } });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'provider_failure' });
  });

  it('rejects a dispatch response whose artifact fails contract validation', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: { not: 'an artifact' } });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(port.complete).not.toHaveBeenCalled();
  });

  it('rejects an artifact whose evidence is not backed by an inspected receipt', async () => {
    // validateResearchArtifact throws a plain Error for both 'invalid_contract'
    // and 'uninspected_source' conditions; this module intentionally does not
    // try to distinguish them by message text (matches the same catch-all
    // i-STEMer-agents-hub/src/research/execution.ts already uses around the
    // same validator), so both map to invalid_contract here.
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const forged = { ...buildArtifact(), evidence: [{ sourceUrl, inspectionReceiptId: '00000000-0000-4000-8000-000000000099',
      inspectedAt: iso(NOW0 + 1000), observation: 'fabricated', interpretation: null, confidence: 'low', gaps: [] }] };
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: forged });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(port.complete).not.toHaveBeenCalled();
  });

  it('reports command_failed without throwing when port.fail itself rejects (e.g. a concurrent reclaim)', async () => {
    const port = fakePort({
      claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }),
      fail: vi.fn().mockRejectedValue(new Error('stale_attempt')),
    });
    const dispatch = vi.fn().mockResolvedValue({ status: 'transport_failure' });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'command_failed', runId, attemptId, stage: 'fail' });
  });

  it('reports command_failed without throwing when port.complete itself rejects', async () => {
    const port = fakePort({
      claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }),
      complete: vi.fn().mockRejectedValue(new Error('stale_attempt')),
    });
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: buildArtifact() });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'command_failed', runId, attemptId, stage: 'complete' });
  });
});
