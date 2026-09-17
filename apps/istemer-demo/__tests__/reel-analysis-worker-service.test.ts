import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { startReelAnalysisWorkerService } from '../lib/workflow/reel-analysis-worker-service';
import type { ReelAnalysisCommandPort } from '../lib/workflow/reel-analysis-worker';

function fakeConfig(claim: ReelAnalysisCommandPort['claim']) {
  return {
    port: { claim, fail: vi.fn(), complete: vi.fn() },
    dispatch: vi.fn(),
    endpoint: { hostname: '127.0.0.1', port: 4100 },
    keyId: 'worker-key-1',
    signingKey: new Uint8Array(32).fill(7),
    now: () => 0,
  };
}

describe('startReelAnalysisWorkerService', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs a cycle on every tick and reports each result via onCycle', async () => {
    const claim = vi.fn().mockResolvedValue(null);
    const onCycle = vi.fn();
    const service = startReelAnalysisWorkerService({ config: fakeConfig(claim), intervalMs: 1000, onCycle });
    await vi.advanceTimersByTimeAsync(3500);
    service.stop();
    expect(claim).toHaveBeenCalledTimes(3);
    expect(onCycle).toHaveBeenCalledTimes(3);
    expect(onCycle).toHaveBeenCalledWith({ outcome: 'idle' });
  });

  it('never starts a new cycle while one is still in flight, even across several ticks', async () => {
    let resolveClaim: (() => void) | undefined;
    const claim = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveClaim = () => resolve(null);
    }));
    const service = startReelAnalysisWorkerService({ config: fakeConfig(claim), intervalMs: 100 });
    // Five ticks elapse while the first claim() call is still pending.
    await vi.advanceTimersByTimeAsync(500);
    expect(claim).toHaveBeenCalledTimes(1);
    resolveClaim?.();
    await vi.advanceTimersByTimeAsync(0);
    // Once the first cycle finishes, the next tick starts a second one.
    await vi.advanceTimersByTimeAsync(100);
    expect(claim).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it('stops scheduling further cycles once stopped, and running reflects that', async () => {
    const claim = vi.fn().mockResolvedValue(null);
    const service = startReelAnalysisWorkerService({ config: fakeConfig(claim), intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(service.running).toBe(true);
    service.stop();
    expect(service.running).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('calling stop twice is a harmless no-op', async () => {
    const service = startReelAnalysisWorkerService({ config: fakeConfig(vi.fn().mockResolvedValue(null)), intervalMs: 1000 });
    service.stop();
    expect(() => service.stop()).not.toThrow();
  });

  it('reports a rejecting cycle via onCycleError instead of throwing, and keeps running', async () => {
    const claim = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(null);
    const onCycleError = vi.fn();
    const onCycle = vi.fn();
    const service = startReelAnalysisWorkerService({ config: fakeConfig(claim), intervalMs: 100, onCycle, onCycleError });
    await vi.advanceTimersByTimeAsync(250);
    service.stop();
    expect(onCycleError).toHaveBeenCalledTimes(1);
    expect(onCycleError).toHaveBeenCalledWith(expect.any(Error));
    expect(onCycle).toHaveBeenCalledWith({ outcome: 'idle' });
  });
});
