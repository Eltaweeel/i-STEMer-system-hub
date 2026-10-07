import 'server-only';
import { runResearchWorkerCycle, type ResearchWorkerConfig, type WorkerCycleResult } from './research-worker';

export interface ResearchWorkerServiceOptions {
  readonly config: ResearchWorkerConfig;
  readonly intervalMs: number;
  /** Keep the process alive on this timer. Library callers inside Next leave it false; the standalone worker sets true. */
  readonly keepAlive?: boolean;
  /** Called after every cycle, success or failure. Never throw from this —
   * an exception here would otherwise escape the interval callback. */
  readonly onCycle?: (result: WorkerCycleResult) => void;
  /** Called only if a cycle itself rejects unexpectedly (a bug in the port/
   * observer/dispatch implementations, not a modeled WorkerCycleResult
   * outcome). The service keeps running regardless. */
  readonly onCycleError?: (error: unknown) => void;
}

export interface ResearchWorkerService {
  /** Stops scheduling and resolves once any in-flight cycle has settled. */
  stop(): Promise<void>;
  readonly running: boolean;
}

/** Runs runResearchWorkerCycle on a fixed interval until stopped. One profile
 * must not have simultaneous writers (see i-STEMer-agents-hub/src/research/server.ts's
 * own `busy` guard on the listener side) — this service enforces the matching
 * rule on the caller side by never starting a new cycle while one is still in
 * flight, rather than relying on setInterval's own re-entrancy behavior. */
export function startResearchWorkerService(options: ResearchWorkerServiceOptions): ResearchWorkerService {
  let stopped = false;
  let cycleInFlight = false;
  let inFlight: Promise<void> = Promise.resolve();

  const runCycle = () => {
    if (stopped || cycleInFlight) return;
    cycleInFlight = true;
    inFlight = runResearchWorkerCycle(options.config)
      .then((result) => { options.onCycle?.(result); })
      .catch((error: unknown) => { options.onCycleError?.(error); })
      .finally(() => { cycleInFlight = false; });
  };

  const timer = setInterval(runCycle, options.intervalMs);
  // Consistent with server.ts's `Connection: close` posture elsewhere in this
  // feature: don't let this interval alone keep a Node process alive if
  // everything else has already shut down.
  if (!options.keepAlive) timer.unref?.();

  return {
    get running() { return !stopped; },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
