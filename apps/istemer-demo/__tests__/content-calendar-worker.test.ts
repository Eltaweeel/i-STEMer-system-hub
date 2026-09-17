import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { runContentCalendarWorkerCycle, type ContentCalendarCommandPort } from '../lib/workflow/content-calendar-worker';
import { signContentCalendarRequest } from '../lib/workflow/content-calendar-signing';
import type { NourArtifact, NourTask } from '@bagos/contracts';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const binding = { contractVersion: 'content-calendar.v1' as const, tenantId: id(1), taskId: id(2),
  runId: id(3), attemptId: id(4), liveEffects: false as const };
const { runId, attemptId } = binding;
const sourceRevisionId = id(5);
const omarRevisionId = id(8);
const key = new Uint8Array(32).fill(7);
function task(): NourTask {
  return { ...binding, requesterId: id(6), agentId: 'content_creator', allowedScope: ['content-calendar:write'],
    issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + 300000).toISOString(),
    brief: { ...binding, idempotencyKey: id(7), objective: 'Draft a 7-day content calendar', sourceRevisionId,
      requestedPlatforms: ['instagram', 'facebook'] } };
}
function artifact(): NourArtifact {
  const formats = ['post', 'reel', 'story', 'carousel'] as const;
  const platforms = ['instagram', 'facebook'] as const;
  return { ...binding, producedBy: 'content_creator', sourceRevisionId,
    entries: Array.from({ length: 7 }, (_, dayIndex) => ({ ...binding, sourceRevisionId, dayIndex,
      platform: platforms[dayIndex % platforms.length]!, format: formats[dayIndex % formats.length]!,
      conceptTitle: `Concept for day ${dayIndex}` })) };
}
function claimed(claimedTask = task()) {
  return { status: 'claimed', task: claimedTask, handoff: { ...binding, fromAgentId: 'orchestrator',
    toAgentId: 'content_creator', inputRevisionIds: [omarRevisionId, sourceRevisionId] } };
}
function config(claim: unknown = claimed()) {
  return { port: { claim: vi.fn().mockResolvedValue(claim), fail: vi.fn().mockResolvedValue({ status: 'failed' }),
    complete: vi.fn().mockResolvedValue({ status: 'succeeded' }) } satisfies ContentCalendarCommandPort,
  dispatch: vi.fn().mockResolvedValue({ status: 'ok', artifact: artifact() }),
  endpoint: { hostname: '127.0.0.1', port: 4102 }, keyId: 'worker-key-1', signingKey: key, now: () => NOW + 2000 };
}

describe('runContentCalendarWorkerCycle', () => {
  it.each([
    [null, { outcome: 'idle' }],
    [{ status: 'failed', runId, code: 'timeout' }, { outcome: 'lease_reclaimed', runId, code: 'timeout' }],
  ])('does nothing after a non-claimed result %j', async (claim, expected) => {
    const options = config(claim);
    expect(await runContentCalendarWorkerCycle(options)).toEqual(expected);
    expect(options.dispatch).not.toHaveBeenCalled();
    expect(options.port.fail).not.toHaveBeenCalled();
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it('reports pre-dispatch expiry without fail', async () => {
    const expired = task();
    const options = config(claimed(expired)); options.now = () => NOW + 300000;
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(options.dispatch).not.toHaveBeenCalled();
    expect(options.port.fail).not.toHaveBeenCalled();
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it.each(['ok', 'transport_failure', 'error'])('reports expiry after %s dispatch without issuing stale commands', async (status) => {
    const options = config(); let now = NOW + 2000; options.now = () => now;
    options.dispatch.mockImplementation(async () => { now = NOW + 300000; return { status, artifact: artifact(), error: { code: 'timeout' } }; });
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'lease_expired', runId, attemptId });
    expect(options.port.fail).not.toHaveBeenCalled();
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it('signs exactly the supplied envelope and completes a validated artifact', async () => {
    const options = config();
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'succeeded', runId, attemptId });
    const [endpoint, signed, body, timeout] = options.dispatch.mock.calls[0]!;
    expect(endpoint).toEqual(options.endpoint);
    expect(JSON.parse(Buffer.from(body).toString('utf8'))).toEqual({ task: task(), handoff: claimed().handoff });
    expect(signed.signature).toBe(signContentCalendarRequest(body, signed, key).signature);
    expect(timeout).toBe(20000);
    expect(options.port.complete).toHaveBeenCalledWith(attemptId, artifact());
    expect(options.port.fail).not.toHaveBeenCalled();
  });

  it('caps dispatch timeout to remaining lease', async () => {
    const options = config(); options.now = () => NOW + 299000;
    await runContentCalendarWorkerCycle({ ...options, dispatchTimeoutMs: 5000 });
    expect(options.dispatch.mock.calls[0]![3]).toBe(1000);
  });

  it.each([
    [{ status: 'transport_failure' }, 'provider_failure'],
    ...['provider_failure','timeout','invalid_contract','unrequested_platform','unauthorized','persistence_failure'].map((code) => [{ status: 'error', error: { code } }, code] as const),
    ...['expired','stale_attempt'].map((code) => [{ status: 'error', error: { code } }, 'invalid_contract'] as const),
    [{ status: 'error', error: { code: 'unknown' } }, 'provider_failure'],
    [{ status: 'error', error: null }, 'provider_failure'],
  ] as const)('records dispatch failure %j as %s', async (outcome, code) => {
    const options = config(); options.dispatch.mockResolvedValue(outcome);
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code });
    expect(options.port.fail).toHaveBeenCalledWith(attemptId, code);
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['shape', () => ({ invalid: true })],
    ['identity', () => ({ ...artifact(), attemptId: id(99) })],
    ['source revision', () => ({ ...artifact(), sourceRevisionId: id(99) })],
    ['duplicate day index', () => { const a = artifact(); a.entries[1] = { ...a.entries[1]!, dayIndex: a.entries[0]!.dayIndex }; return a; }],
    ['wrong entry count', () => ({ ...artifact(), entries: artifact().entries.slice(0, 6) })],
  ])('rejects invalid artifact %s as invalid_contract', async (_name, build) => {
    const options = config(); options.dispatch.mockResolvedValue({ status: 'ok', artifact: build() });
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it('rejects an artifact using a platform outside the requested set as unrequested_platform', async () => {
    const options = config();
    const bad = artifact(); bad.entries[0] = { ...bad.entries[0]!, platform: 'facebook' };
    options.dispatch.mockResolvedValue({ status: 'ok', artifact: bad });
    const solePlatform = task(); solePlatform.brief.requestedPlatforms = ['instagram'];
    options.port.claim.mockResolvedValue(claimed(solePlatform));
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code: 'unrequested_platform' });
    expect(options.port.fail).toHaveBeenCalledWith(attemptId, 'unrequested_platform');
    expect(options.port.complete).not.toHaveBeenCalled();
  });

  it.each(['tenantId','taskId','runId','attemptId','inputRevisionIds'] as const)('does not dispatch mismatched handoff %s', async (field) => {
    const claim = claimed();
    if (field === 'inputRevisionIds') claim.handoff[field] = [id(99)]; else claim.handoff[field] = id(99);
    const options = config(claim);
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'failed', runId, attemptId, code: 'invalid_contract' });
    expect(options.dispatch).not.toHaveBeenCalled();
  });

  it.each(['fail','complete'] as const)('reports command_failed if %s rejects', async (stage) => {
    const options = config(); options.port[stage].mockRejectedValue(new Error('stale_attempt'));
    if (stage === 'fail') options.dispatch.mockResolvedValue({ status: 'transport_failure' });
    expect(await runContentCalendarWorkerCycle(options)).toEqual({ outcome: 'command_failed', runId, attemptId, stage });
  });

  it('lets unexpected dispatch rejections reach service error reporting without retrying', async () => {
    const options = config(); options.dispatch.mockRejectedValue(new Error('dispatcher bug'));
    await expect(runContentCalendarWorkerCycle(options)).rejects.toThrow('dispatcher bug');
    expect(options.port.fail).not.toHaveBeenCalled();
  });
});
