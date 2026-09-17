import 'server-only';
import { runContentCalendarWorkerCycle, type ContentCalendarWorkerConfig, type WorkerCycleResult } from './content-calendar-worker';

export interface ContentCalendarWorkerServiceOptions {
  readonly config: ContentCalendarWorkerConfig;
  readonly intervalMs: number;
  /** Called after every cycle, success or failure. Never throw from this —
   * an exception here would otherwise escape the interval callback. */
  readonly onCycle?: (result: WorkerCycleResult) => void;
  /** Called only if a cycle itself rejects unexpectedly (a bug in the port/
   * dispatch implementations, not a modeled WorkerCycleResult
   * outcome). The service keeps running regardless. */
  readonly onCycleError?: (error: unknown) => void;
}

export interface ContentCalendarWorkerService {
  stop(): void;
  readonly running: boolean;
}

/** One agent profile must not have simultaneous writers. The in-flight guard
 * keeps slow cycles from overlapping subsequent interval ticks. */
export function startContentCalendarWorkerService(options: ContentCalendarWorkerServiceOptions): ContentCalendarWorkerService {
  let stopped = false;
  let cycleInFlight = false;

  const runCycle = () => {
    if (stopped || cycleInFlight) return;
    cycleInFlight = true;
    runContentCalendarWorkerCycle(options.config)
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
