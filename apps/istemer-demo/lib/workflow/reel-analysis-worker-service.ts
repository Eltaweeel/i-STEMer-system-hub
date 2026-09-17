import 'server-only';
import { runReelAnalysisWorkerCycle, type ReelAnalysisWorkerConfig, type WorkerCycleResult } from './reel-analysis-worker';

export interface ReelAnalysisWorkerServiceOptions {
  readonly config: ReelAnalysisWorkerConfig;
  readonly intervalMs: number;
  /** Called after every cycle, success or failure. Never throw from this —
   * an exception here would otherwise escape the interval callback. */
  readonly onCycle?: (result: WorkerCycleResult) => void;
  /** Called only if a cycle itself rejects unexpectedly (a bug in the port/
   * dispatch implementations, not a modeled WorkerCycleResult
   * outcome). The service keeps running regardless. */
  readonly onCycleError?: (error: unknown) => void;
}

export interface ReelAnalysisWorkerService {
  stop(): void;
  readonly running: boolean;
}

/** One agent profile must not have simultaneous writers. The in-flight guard
 * keeps slow cycles from overlapping subsequent interval ticks. */
export function startReelAnalysisWorkerService(options: ReelAnalysisWorkerServiceOptions): ReelAnalysisWorkerService {
  let stopped = false;
  let cycleInFlight = false;

  const runCycle = () => {
    if (stopped || cycleInFlight) return;
    cycleInFlight = true;
    runReelAnalysisWorkerCycle(options.config)
      .then((result) => { options.onCycle?.(result); })
      .catch((error: unknown) => { options.onCycleError?.(error); })
      .finally(() => { cycleInFlight = false; });
  };

  const timer = setInterval(runCycle, options.intervalMs);
  // An idle scheduler must not keep an otherwise finished process alive.
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
