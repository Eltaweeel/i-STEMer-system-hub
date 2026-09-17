import 'server-only';
import { runResearchWorkerCycle, type ResearchWorkerConfig, type WorkerCycleResult } from './research-worker';

export interface ResearchWorkerServiceOptions {
  readonly config: ResearchWorkerConfig;
  readonly intervalMs: number;
  /** Called after every cycle, success or failure. Never throw from this —
   * an exception here would otherwise escape the interval callback. */
  readonly onCycle?: (result: WorkerCycleResult) => void;
  /** Called only if a cycle itself rejects unexpectedly (a bug in the port/
   * observer/dispatch implementations, not a modeled WorkerCycleResult
   * outcome). The service keeps running regardless. */
  readonly onCycleError?: (error: unknown) => void;
}

export interface ResearchWorkerService {
  stop(): void;
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

  const runCycle = () => {
    if (stopped || cycleInFlight) return;
    cycleInFlight = true;
    runResearchWorkerCycle(options.config)
      .then((result) => { options.onCycle?.(result); })
      .catch((error: unknown) => { options.onCycleError?.(error); })
      .finally(() => { cycleInFlight = false; });
  };

  const timer = setInterval(runCycle, options.intervalMs);
  // Consistent with server.ts's `Connection: close` posture elsewhere in this
  // feature: don't let this interval alone keep a Node process alive if
  // everything else has already shut down.
  timer.unref?.();

  return {
    get running() { return !stopped; },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
