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

const ack = { status: 'succeeded', runId, attemptId, revisionId: '00000000-0000-4000-8000-000000000009' };
function fakePort(overrides: Partial<ResearchCommandPort> = {}): ResearchCommandPort {
  return {
    claim: vi.fn().mockResolvedValue(null),
    fail: vi.fn().mockResolvedValue({ status: 'failed' }),
    complete: vi.fn().mockResolvedValue(ack), recordUsage: vi.fn().mockResolvedValue({}),
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
    approvedSources: new Set([sourceUrl]),
    ...overrides,
  };
}

describe('runResearchWorkerCycle', () => {
  it('is idle when there is nothing to claim', async () => {
    const result = await runResearchWorkerCycle(baseConfig());
    expect(result).toEqual({ outcome: 'idle' });
  });

  it.each([
    ['no brief source is approved', new Set(['https://example.org/other'])],
    ['only some brief sources are approved', new Set([sourceUrl])],
  ])('refuses the whole attempt before any fetch when %s', async (_case, approvedSources) => {
    const task = { ...buildTask(), brief: { ...buildTask().brief, sources: [sourceUrl, 'https://example.org/unlisted'] } };
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task, handoff: buildHandoff() }) });
    const config = baseConfig({ port, approvedSources });
    const result = await runResearchWorkerCycle(config);
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'uninspected_source' });
    expect(config.observe).not.toHaveBeenCalled();
    expect(config.dispatch).not.toHaveBeenCalled();
  });

  it('does not treat a differently spelled URL as approved', async () => {
    const task = { ...buildTask(), brief: { ...buildTask().brief, sources: ['https://EXAMPLE.org/competitor'] } };
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task, handoff: buildHandoff() }) });
    const config = baseConfig({ port });
    expect(await runResearchWorkerCycle(config)).toMatchObject({ outcome: 'failed', code: 'uninspected_source' });
    expect(config.observe).not.toHaveBeenCalled();
  });

  it('reports lease_reclaimed and takes no further action when claim already terminated a stale attempt', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'failed', runId, code: 'timeout' }) });
    const result = await runResearchWorkerCycle(baseConfig({ port }));
    expect(result).toEqual({ outcome: 'lease_reclaimed', runId, code: 'timeout' });
    expect(port.fail).not.toHaveBeenCalled();
    expect(port.complete).not.toHaveBeenCalled();
  });

  it.each(['tenantId', 'taskId', 'runId', 'attemptId'] as const)('fails with invalid_contract and never dispatches on mismatched handoff %s', async (field) => {
    const handoff = { ...buildHandoff(), [field]: '00000000-0000-4000-8000-000000000099' };
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff }) });
    const observe = vi.fn();
    const dispatch = vi.fn();
    const result = await runResearchWorkerCycle(baseConfig({ port, observe, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(observe).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'invalid_contract');
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
    const approvedSources = new Set(multiSource.brief.sources);
    const result = await runResearchWorkerCycle(baseConfig({ port, observe, now, approvedSources }));
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
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch, completeRetryDelayMs: 0 }));
    expect(result).toEqual({ outcome: 'command_failed', runId, attemptId, stage: 'complete' });
    expect(port.complete).toHaveBeenCalledTimes(3);
  });
});

describe('failures that must be recorded, not left to expire', () => {
  const claimed = () => ({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });

  it('records uninspected_source when the observer itself throws (e.g. host clock behind the database)', async () => {
    const port = fakePort(claimed());
    const observe = vi.fn().mockRejectedValue(new Error('task_outside_lease'));
    const result = await runResearchWorkerCycle(baseConfig({ port, observe }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'uninspected_source' });
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'uninspected_source');
  });

  it('records a requester revoked during the run as unauthorized, not as a contract defect', async () => {
    const port = fakePort({ ...claimed(), complete: vi.fn().mockRejectedValue(Object.assign(new Error('unauthorized'), { code: '42501' })) });
    const result = await runResearchWorkerCycle(baseConfig({ port, completeRetryDelayMs: 0 }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'unauthorized' });
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'unauthorized');
  });

  it.each([null, {}, { status: 'succeeded' }, { ...ack, attemptId: runId }])('does not report success on acknowledgement %j', async (reply) => {
    const port = fakePort({ ...claimed(), complete: vi.fn().mockResolvedValue(reply) });
    const result = await runResearchWorkerCycle(baseConfig({ port }));
    expect(result).toEqual({ outcome: 'command_failed', runId, attemptId, stage: 'complete' });
    expect(port.fail).not.toHaveBeenCalled();
    expect(port.recordUsage).not.toHaveBeenCalled();
  });

  it.each(['22023', '22P05', '55000'])('does not repeat a completion the database rejects with SQLSTATE %s', async (code) => {
    const port = fakePort({ ...claimed(), complete: vi.fn().mockRejectedValue(Object.assign(new Error('rejected'), { code })) });
    const result = await runResearchWorkerCycle(baseConfig({ port, completeRetryDelayMs: 0 }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(port.fail).toHaveBeenCalledWith(attemptId, 'invalid_contract');
  });

  it('still retries a connection-class failure', async () => {
    const complete = vi.fn().mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' })).mockResolvedValue(ack);
    const result = await runResearchWorkerCycle(baseConfig({ port: fakePort({ ...claimed(), complete }), completeRetryDelayMs: 0 }));
    expect(result).toEqual({ outcome: 'succeeded', runId, attemptId });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('deadlines and completion recovery', () => {
  const claimed = () => ({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });

  it('repeats complete after a transient failure and still reports success', async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(ack);
    const port = fakePort({ ...claimed(), complete });
    const result = await runResearchWorkerCycle(baseConfig({ port, completeRetryDelayMs: 0 }));
    expect(result).toEqual({ outcome: 'succeeded', runId, attemptId });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]).toEqual(complete.mock.calls[1]);
  });

  it('does not repeat complete once the lease has lapsed', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('stale_attempt'));
    const port = fakePort({ ...claimed(), complete });
    // Clock jumps past the 5 minute lease once the first complete attempt has been made.
    const now = () => (complete.mock.calls.length > 0 ? NOW0 + 6 * 60_000 : NOW0 + 2000);
    const result = await runResearchWorkerCycle(baseConfig({ port, now, completeRetryDelayMs: 0 }));
    expect(result).toEqual({ outcome: 'command_failed', runId, attemptId, stage: 'complete' });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('does not call complete again when the lease expires during the backoff', async () => {
    let clock = NOW0 + 2000;
    const complete = vi.fn().mockRejectedValue(new Error('connection reset'));
    const port = fakePort({ ...claimed(), complete });
    // The wait itself moves the clock past the 5 minute lease; nothing else does.
    const sleep = vi.fn(async () => { clock = NOW0 + 5 * 60_000 + 1; });
    const result = await runResearchWorkerCycle(baseConfig({ port, now: () => clock, sleep, completeRetryDelayMs: 500 }));
    expect(result).toEqual({ outcome: 'command_failed', runId, attemptId, stage: 'complete' });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('caps the backoff to the time left in the lease', async () => {
    let clock = NOW0 + 2000;
    const complete = vi.fn().mockImplementationOnce(async () => { clock = NOW0 + 5 * 60_000 - 100; throw new Error('slow failure'); })
      .mockResolvedValue({ status: 'succeeded' });
    const sleep = vi.fn(async () => undefined);
    const port = fakePort({ ...claimed(), complete });
    await runResearchWorkerCycle(baseConfig({ port, now: () => clock, sleep, completeRetryDelayMs: 500 }));
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('never starts a paid dispatch when the lease cannot cover the run plus the completion margin', async () => {
    const task = buildTask(iso(NOW0 + 10_000));
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task, handoff: buildHandoff() }) });
    const dispatch = vi.fn();
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(dispatch).not.toHaveBeenCalled();
    expect(port.fail).not.toHaveBeenCalled();
  });

  it('caps the dispatch timeout so the completion margin stays available', async () => {
    const task = buildTask(iso(NOW0 + 60_000));
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task, handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: buildArtifact() });
    await runResearchWorkerCycle(baseConfig({ port, dispatch, dispatchTimeoutMs: 200_000, completionMarginMs: 15_000 }));
    // lease remaining at claim time is 58s; 15s is held back.
    expect(dispatch.mock.calls[0]?.[3]).toBe(43_000);
  });

  it.each([
    ['agent timeout', { status: 'error', error: { code: 'timeout' } }, 'timeout'],
    ['agent provider failure', { status: 'error', error: { code: 'provider_failure' } }, 'provider_failure'],
    ['agent replay refusal', { status: 'error', error: { code: 'stale_attempt' } }, 'invalid_contract'],
    ['wrong tenant at the agent', { status: 'error', error: { code: 'unauthorized' } }, 'unauthorized'],
    ['unreachable agent', { status: 'transport_failure' }, 'provider_failure'],
  ] as const)('records %s as a failed attempt and recovers on the next cycle', async (_name, outcome, code) => {
    const claim = vi.fn().mockResolvedValueOnce({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }).mockResolvedValue(null);
    const port = fakePort({ claim });
    const dispatch = vi.fn().mockResolvedValue(outcome);
    const first = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(first).toEqual({ outcome: 'failed', runId, attemptId, code });
    expect(port.complete).not.toHaveBeenCalled();
    expect(await runResearchWorkerCycle(baseConfig({ port, dispatch }))).toEqual({ outcome: 'idle' });
  });

  it.each([
    ['a different receipt id', (a: ReturnType<typeof buildArtifact>) => ({ ...a, evidence: [{ ...a.evidence[0], inspectionReceiptId: '00000000-0000-4000-8000-0000000000ff' }] })],
    ['a different revision', (a: ReturnType<typeof buildArtifact>) => ({ ...a, sourceRevisionIds: ['00000000-0000-4000-8000-0000000000fe'] })],
    ['a different tenant', (a: ReturnType<typeof buildArtifact>) => ({ ...a, tenantId: '00000000-0000-4000-8000-0000000000fd' })],
    ['a different task', (a: ReturnType<typeof buildArtifact>) => ({ ...a, taskId: '00000000-0000-4000-8000-0000000000fc' })],
  ])('rejects an artifact citing %s even when the agent accepted it', async (_name, tamper) => {
    const port = fakePort(claimed());
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: tamper(buildArtifact()) });
    const result = await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(result).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(port.complete).not.toHaveBeenCalled();
  });
});

describe('usage metering', () => {
  it('records an unreported figure as unreported rather than as a measured zero', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    // The double returns no usage, which is every response until a real
    // provider is wired. Recording that as 0 would make an allowance read as
    // "nothing was spent" on work that certainly cost something.
    const result = await runResearchWorkerCycle(baseConfig({ port }));
    expect(result).toEqual({ outcome: 'succeeded', runId, attemptId });
    expect(port.recordUsage).toHaveBeenCalledWith(attemptId, null);
  });

  it('passes a reported figure through unchanged when the responder gives one', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'ok', artifact: buildArtifact(), reportedTokens: 1234 });
    await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(port.recordUsage).toHaveBeenCalledWith(attemptId, 1234);
  });

  it('keeps a completed artifact durable even when metering itself fails', async () => {
    const port = fakePort({
      claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }),
      recordUsage: vi.fn().mockRejectedValue(new Error('metering unavailable')),
    });
    // Losing a usage row is a reporting gap; failing an attempt that genuinely
    // produced evidence would be the worse lie.
    expect(await runResearchWorkerCycle(baseConfig({ port }))).toEqual({ outcome: 'succeeded', runId, attemptId });
    expect(port.complete).toHaveBeenCalled();
  });

  it('records nothing for an attempt that failed instead of completing', async () => {
    const port = fakePort({ claim: vi.fn().mockResolvedValue({ status: 'claimed', task: buildTask(), handoff: buildHandoff() }) });
    const dispatch = vi.fn().mockResolvedValue({ status: 'transport_failure' });
    await runResearchWorkerCycle(baseConfig({ port, dispatch }));
    expect(port.recordUsage).not.toHaveBeenCalled();
  });
});
