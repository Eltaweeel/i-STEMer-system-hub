import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { runReelAnalysisWorkerCycle, type ReelAnalysisCommandPort } from '../lib/workflow/reel-analysis-worker';
import { signReelAnalysisRequest } from '../lib/workflow/reel-analysis-signing';
import type { ReelAnalysisArtifact, ReelAnalysisTask } from '@bagos/contracts';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const binding = { contractVersion: 'reel-analysis.v1' as const, tenantId: id(1), taskId: id(2),
  runId: id(3), attemptId: id(4), liveEffects: false as const };
const { runId, attemptId } = binding;
const sourceRevisionId = id(5);
const key = new Uint8Array(32).fill(7);
function task(): ReelAnalysisTask {
  return { ...binding, requesterId: id(6), agentId: 'reel_analyst', allowedScope: ['reel-analysis:read'],
    issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + 300000).toISOString(),
    brief: { ...binding, idempotencyKey: id(7), objective: 'Analyze transcript', sourceRevisionId,
      requestedModalities: ['transcript', 'audio'], suppliedModalities: ['transcript'] } };
}
function artifact(): ReelAnalysisArtifact {
  return { ...binding, producedBy: 'reel_analyst', sourceRevisionId, inspectedModalities: ['transcript'],
    findings: [{ ...binding, sourceRevisionId, modality: 'transcript', observation: 'A question opens the transcript.',
      interpretation: null, confidence: 'medium', gaps: [] }],
    unavailableModalities: [{ ...binding, sourceRevisionId, modality: 'audio', reason: 'Audio was not supplied.' }] };
}
// Omar's evidence, as the claim command now reads it out of the revision the
// brief names and hands to the worker.
function upstreamArtifact() {
  return { contractVersion: 'research.v1' as const, tenantId: id(1), taskId: id(80), runId: id(81),
    attemptId: id(82), producedBy: 'competitor_analyst' as const, sourceRevisionIds: [id(83)],
    evidence: [{ sourceUrl: 'https://example.org/pricing', inspectionReceiptId: id(84),
      inspectedAt: new Date(NOW).toISOString(), observation: 'Upstream observation',
      interpretation: null, confidence: 'low' as const, gaps: [] }],
    gaps: [], liveEffects: false as const };
}
function claimed(claimedTask = task()) {
  return { status: 'claimed', task: claimedTask, sourceArtifact: upstreamArtifact(),
    handoff: { ...binding, fromAgentId: 'orchestrator',
    toAgentId: 'reel_analyst', inputRevisionIds: [sourceRevisionId] } };
}
function config(claim: unknown = claimed()) {
  return { port: { claim: vi.fn().mockResolvedValue(claim), fail: vi.fn().mockResolvedValue({ status: 'failed' }),
    complete: vi.fn().mockResolvedValue({ status: 'succeeded' }) } satisfies ReelAnalysisCommandPort,
  dispatch: vi.fn().mockResolvedValue({ status: 'ok', artifact: artifact() }),
  endpoint: { hostname: '127.0.0.1', port: 4101 }, keyId: 'worker-key-1', signingKey: key, now: () => NOW + 2000 };
}

describe('runReelAnalysisWorkerCycle', () => {
  it.each([
    [null, { outcome: 'idle' }],
    [{ status: 'failed', runId, code: 'timeout' }, { outcome: 'lease_reclaimed', runId, code: 'timeout' }],
  ])('does nothing after a non-claimed result %j', async (claim, expected) => {
    const options = config(claim);
    expect(await runReelAnalysisWorkerCycle(options)).toEqual(expected);
    expect(options.dispatch).not.toHaveBeenCalled();
    expect(options.port.fail).not.toHaveBeenCalled();
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it('completes empty supplied modalities honestly without dispatching or spending a model call', async () => {
    const empty = task(); empty.brief.suppliedModalities = [];
    const options = config(claimed(empty));
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'succeeded', runId, attemptId });
    expect(options.dispatch).not.toHaveBeenCalled();
    expect(options.port.fail).not.toHaveBeenCalled();
    const [, artifact] = options.port.complete.mock.calls[0]!;
    expect(artifact.inspectedModalities).toEqual([]);
    expect(artifact.findings).toEqual([]);
    // Every requested modality is accounted for as explicitly not inspected,
    // which is what stops the honest path from reading as a real analysis.
    expect(artifact.unavailableModalities.map((entry: { modality: string }) => entry.modality))
      .toEqual(empty.brief.requestedModalities);
    for (const entry of artifact.unavailableModalities) expect(entry.reason).toMatch(/no media was supplied/i);
  });

  it.each([false, true])('reports pre-dispatch expiry without fail, even with empty modalities: %s', async (empty) => {
    const expired = task(); if (empty) expired.brief.suppliedModalities = [];
    const options = config(claimed(expired)); options.now = () => NOW + 300000;
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(options.dispatch).not.toHaveBeenCalled();
    expect(options.port.fail).not.toHaveBeenCalled();
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it.each(['ok', 'transport_failure', 'error'])('reports expiry after %s dispatch without issuing stale commands', async (status) => {
    const options = config(); let now = NOW + 2000; options.now = () => now;
    options.dispatch.mockImplementation(async () => { now = NOW + 300000; return { status, artifact: artifact(), error: { code: 'timeout' } }; });
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(options.port.fail).not.toHaveBeenCalled();
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it('signs exactly the supplied envelope and completes a validated artifact', async () => {
    const options = config();
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'succeeded', runId, attemptId });
    const [endpoint, signed, body, timeout] = options.dispatch.mock.calls[0]!;
    expect(endpoint).toEqual(options.endpoint);
    expect(JSON.parse(Buffer.from(body).toString('utf8'))).toEqual({ task: task(), handoff: claimed().handoff, sourceArtifact: upstreamArtifact() });
    expect(signed.signature).toBe(signReelAnalysisRequest(body, signed, key).signature);
    expect(timeout).toBe(20000);
    expect(options.port.complete).toHaveBeenCalledWith(attemptId, artifact());
    expect(options.port.fail).not.toHaveBeenCalled();
  });

  it('caps dispatch timeout to remaining lease', async () => {
    const options = config(); options.now = () => NOW + 299000;
    await runReelAnalysisWorkerCycle({ ...options, dispatchTimeoutMs: 5000 });
    expect(options.dispatch.mock.calls[0]![3]).toBe(1000);
  });

  it.each([
    [{ status: 'transport_failure' }, 'provider_failure'],
    ...['provider_failure','timeout','invalid_contract','uninspected_modality','unauthorized','persistence_failure'].map((code) => [{ status: 'error', error: { code } }, code] as const),
    ...['expired','stale_attempt'].map((code) => [{ status: 'error', error: { code } }, 'invalid_contract'] as const),
    [{ status: 'error', error: { code: 'unknown' } }, 'provider_failure'],
    [{ status: 'error', error: null }, 'provider_failure'],
  ] as const)('records dispatch failure %j as %s', async (outcome, code) => {
    const options = config(); options.dispatch.mockResolvedValue(outcome);
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code });
    expect(options.port.fail).toHaveBeenCalledWith(attemptId, code);
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['shape', () => ({ invalid: true })],
    ['identity', () => ({ ...artifact(), attemptId: id(99) })],
    ['source revision', () => ({ ...artifact(), sourceRevisionId: id(99) })],
    ['unsupplied inspection', () => ({ ...artifact(), inspectedModalities: ['transcript','audio'], unavailableModalities: [] })],
    ['missing modality gap', () => ({ ...artifact(), unavailableModalities: [] })],
  ])('rejects invalid artifact %s', async (_name, build) => {
    const options = config(); options.dispatch.mockResolvedValue({ status: 'ok', artifact: build() });
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it.each(['tenantId','taskId','runId','attemptId','inputRevisionIds'] as const)('does not dispatch mismatched handoff %s', async (field) => {
    const claim = claimed();
    if (field === 'inputRevisionIds') claim.handoff[field] = [id(99)]; else claim.handoff[field] = id(99);
    const options = config(claim);
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(options.dispatch).not.toHaveBeenCalled();
  });

  it.each(['fail','complete'] as const)('reports command_failed if %s rejects', async (stage) => {
    const options = config(); options.port[stage].mockRejectedValue(new Error('stale_attempt'));
    if (stage === 'fail') options.dispatch.mockResolvedValue({ status: 'transport_failure' });
    expect(await runReelAnalysisWorkerCycle(options)).toEqual({ outcome: 'command_failed', runId, attemptId, stage });
  });

  it('lets unexpected dispatch rejections reach service error reporting without retrying', async () => {
    const options = config(); options.dispatch.mockRejectedValue(new Error('dispatcher bug'));
    await expect(runReelAnalysisWorkerCycle(options)).rejects.toThrow('dispatcher bug');
    expect(options.port.fail).not.toHaveBeenCalled();
  });
});
