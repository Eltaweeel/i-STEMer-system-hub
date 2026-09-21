import 'server-only';
import { z } from 'zod';
import { ResearchTaskSchema, ResearchHandoffSchema, ResearchArtifactSchema,
  validateResearchArtifact,
  type ResearchArtifact, type SourceInspection } from '@bagos/contracts';
import { freshMetadata, signResearchRequest,
  type ResearchEndpoint, type DispatchOutcome, type SignedResearchRequest } from './research-transport';

type ResearchHandoff = z.infer<typeof ResearchHandoffSchema>;

/** The exact set `private.fail_research_attempt`'s CHECK constraint accepts
 * (supabase/migrations/20260916060831_adam_omar_attempt_leases.sql). This is
 * deliberately a narrower, explicit literal set rather than derived from
 * `ResearchErrorSchema`'s wire error-code enum: that enum also contains
 * 'expired', 'stale_attempt' and 'idempotency_conflict', none of which the SQL
 * function accepts as a `failure_code` argument. Keep the two in sync by hand;
 * a schema-derived subtype would silently accept invalid SQL inputs. */
export type FailureCode = 'provider_failure' | 'timeout' | 'invalid_contract'
  | 'uninspected_source' | 'unauthorized' | 'persistence_failure';
const FAILURE_CODES = new Set<FailureCode>(['provider_failure', 'timeout', 'invalid_contract',
  'uninspected_source', 'unauthorized', 'persistence_failure']);

/** Wraps the private.claim_research_task / fail_research_attempt /
 * complete_research_attempt SQL commands (see supabase/migrations
 * 20260916060831_adam_omar_attempt_leases.sql and
 * 20260916061530_adam_omar_research_completion.sql). Deliberately an
 * injected port, not a hardcoded `pg` connection: those functions are
 * `private` schema, granted only to the NOLOGIN `bagos_research_executor`
 * role, and calling them for real requires a dedicated worker login that has
 * not been provisioned. That is a credential/staging decision for the
 * project owner, not something this module should assume. */
export interface ResearchCommandPort {
  claim(): Promise<unknown>;
  fail(attemptId: string, code: FailureCode): Promise<unknown>;
  complete(attemptId: string, artifact: ResearchArtifact, receipts: readonly SourceInspection[]): Promise<unknown>;
  /** Records what this attempt consumed. reportedTokens is null when the
   * provider returned no figure, which is the normal case while inference is a
   * double -- and it must stay distinguishable from a measured zero, because an
   * allowance computed from silent zeroes would read as "nothing was spent". */
  recordUsage(attemptId: string, reportedTokens: number | null): Promise<unknown>;
}

/** Mirrors packages/core/research-worker/src/public-source.ts's SourceGapCode.
 * Not a type import: @bagos/research-worker has no package.json "exports" and
 * no vitest.config.ts alias today, so it isn't actually resolvable as an
 * import target from apps/istemer-demo yet. Wiring that up is a separate,
 * larger change; keep this literal union in sync with public-source.ts by
 * hand until it is. */
type SourceGapCode = 'blocked_address' | 'unsupported_url' | 'unavailable' | 'timeout'
  | 'redirect' | 'http_status' | 'unsupported_content' | 'too_large' | 'empty_content';

export type SourceObservation =
  | { status: 'inspected'; snapshot: { receipt: SourceInspection; text: string }; gaps: readonly string[] }
  | { status: 'uninspected'; sourceUrl: string; code: SourceGapCode; gaps: readonly string[] };

export type SourceObserver = (input: {
  task: unknown; sourceUrl: string; now: () => number; signal: AbortSignal;
}) => Promise<SourceObservation>;

export type ResearchDispatcher = (
  endpoint: ResearchEndpoint, signed: SignedResearchRequest, body: Uint8Array, timeoutMs: number,
) => Promise<DispatchOutcome>;

const claimedSchema = z.object({
  status: z.literal('claimed'), task: ResearchTaskSchema, handoff: ResearchHandoffSchema,
}).strict();
const reclaimedSchema = z.object({
  status: z.literal('failed'), runId: z.string().uuid(), code: z.string(),
}).strict();
const claimResultSchema = z.union([claimedSchema, reclaimedSchema, z.null()]);

export type WorkerCycleResult =
  | { outcome: 'idle' }
  | { outcome: 'lease_reclaimed'; runId: string; code: string }
  /** The task's lease expired on our own clock. Deliberately does NOT call
   * port.fail(): private.fail_research_attempt rejects with 'stale_attempt'
   * once expires_at <= now() (see the migration above), and the SQL claim
   * function already reclaims an expired-but-running attempt as its own
   * side effect on the *next* claim() call. Calling fail() here would just
   * throw. */
  | { outcome: 'lease_expired'; runId: string; attemptId: string }
  | { outcome: 'succeeded'; runId: string; attemptId: string }
  | { outcome: 'failed'; runId: string; attemptId: string; code: FailureCode }
  /** port.fail()/port.complete() itself rejected (e.g. the attempt was
   * concurrently reclaimed as stale by the time the call reached the
   * database). This is an expected race under a real connection, not a
   * crash: the next claim() cycle will reconcile the attempt's true state. */
  | { outcome: 'command_failed'; runId: string; attemptId: string; stage: 'fail' | 'complete' };

export interface ResearchWorkerConfig {
  readonly port: ResearchCommandPort;
  readonly observe: SourceObserver;
  readonly dispatch: ResearchDispatcher;
  readonly endpoint: ResearchEndpoint;
  readonly keyId: string;
  readonly signingKey: Uint8Array;
  readonly now: () => number;
  readonly dispatchTimeoutMs?: number;
}

function mapDispatchErrorCode(error: unknown): FailureCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') {
      if (FAILURE_CODES.has(code as FailureCode)) return code as FailureCode;
      // A lapsed signing window or a replayed nonce is a client-side
      // transport/protocol defect, not a transient provider outage, and
      // fail_research_attempt's CHECK constraint doesn't accept either code
      // directly. Route both to the non-retryable 'invalid_contract' rather
      // than silently defaulting to the retryable 'provider_failure' below:
      // retrying without fixing the clock/replay condition would not help.
      if (code === 'expired' || code === 'stale_attempt') return 'invalid_contract';
    }
  }
  return 'provider_failure';
}

/** One claim -> observe -> sign -> dispatch -> complete/fail cycle. Callers
 * schedule repeated cycles (e.g. on an interval); this function does not
 * loop or retry by itself, matching the project rule that the worker must
 * never auto-retry ambiguous execution. */
export async function runResearchWorkerCycle(config: ResearchWorkerConfig): Promise<WorkerCycleResult> {
  const claimed = claimResultSchema.parse(await config.port.claim());
  if (claimed === null) return { outcome: 'idle' };
  if (claimed.status === 'failed') return { outcome: 'lease_reclaimed', runId: claimed.runId, code: claimed.code };

  const { task, handoff } = claimed as { task: z.infer<typeof ResearchTaskSchema>; handoff: ResearchHandoff };
  if (handoff.tenantId !== task.tenantId || handoff.taskId !== task.taskId
    || handoff.runId !== task.runId || handoff.attemptId !== task.attemptId) {
    return fail(config.port, task.runId, task.attemptId, 'invalid_contract');
  }
  const controller = new AbortController();
  const snapshots: { receipt: SourceInspection; text: string }[] = [];
  for (const sourceUrl of task.brief.sources) {
    if (Date.parse(task.expiresAt) - config.now() <= 0) { controller.abort(); break; }
    const observation = await config.observe({ task, sourceUrl, now: config.now, signal: controller.signal });
    if (observation.status === 'inspected') snapshots.push(observation.snapshot);
  }

  // Checked before the uninspected-source branch below so a task that both
  // ran out of time AND failed to inspect every source is reported as
  // lease_expired, not uninspected_source — expiry is the proximate cause.
  if (Date.parse(task.expiresAt) - config.now() <= 0) {
    return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  }

  if (snapshots.length === 0) {
    return fail(config.port, task.runId, task.attemptId, 'uninspected_source');
  }

  const remaining = Date.parse(task.expiresAt) - config.now();
  const body = new TextEncoder().encode(JSON.stringify({ task, handoff, snapshots }));
  const metadata = freshMetadata(config.keyId, config.now());
  const signed = signResearchRequest(body, metadata, config.signingKey);
  const timeoutMs = Math.min(config.dispatchTimeoutMs ?? 20000, remaining);
  const outcome = await config.dispatch(config.endpoint, signed, body, timeoutMs);

  // Dispatch can legitimately consume most of the remaining lease. Re-check
  // before calling fail()/complete() for the same reason as above: once the
  // lease has actually expired, the SQL command rejects rather than
  // recording the outcome, and the next claim() reclaims it regardless.
  if (Date.parse(task.expiresAt) - config.now() <= 0) {
    return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  }

  if (outcome.status === 'transport_failure') {
    return fail(config.port, task.runId, task.attemptId, 'provider_failure');
  }
  if (outcome.status === 'error') {
    return fail(config.port, task.runId, task.attemptId, mapDispatchErrorCode(outcome.error));
  }

  const parsedArtifact = ResearchArtifactSchema.safeParse(outcome.artifact);
  if (!parsedArtifact.success) {
    return fail(config.port, task.runId, task.attemptId, 'invalid_contract');
  }
  const receipts = snapshots.map((snapshot) => snapshot.receipt);
  try {
    validateResearchArtifact(parsedArtifact.data, task, receipts, handoff.inputRevisionIds);
  } catch {
    // Matches i-STEMer-agents-hub/src/research/execution.ts's own catch-all
    // around the same validator: it does not distinguish failure reasons
    // either, and this module shouldn't infer more than the validator states.
    return fail(config.port, task.runId, task.attemptId, 'invalid_contract');
  }

  try {
    await config.port.complete(task.attemptId, parsedArtifact.data, receipts);
  } catch {
    return { outcome: 'command_failed', runId: task.runId, attemptId: task.attemptId, stage: 'complete' };
  }
  // Metering is recorded after the artifact is durable and deliberately cannot
  // undo it: losing a usage row is a reporting gap, while failing an attempt
  // that genuinely produced evidence would be a far worse lie. The gap is
  // visible either way, because an unrecorded attempt is not counted as zero.
  await recordUsage(config, task.attemptId, outcome.reportedTokens ?? null);
  return { outcome: 'succeeded', runId: task.runId, attemptId: task.attemptId };
}

async function recordUsage(config: ResearchWorkerConfig, attemptId: string, reportedTokens: number | null) {
  try { await config.port.recordUsage(attemptId, reportedTokens); }
  catch { /* Reporting only; the artifact is already durable and stays so. */ }
}

async function fail(port: ResearchCommandPort, runId: string, attemptId: string, code: FailureCode): Promise<WorkerCycleResult> {
  try {
    await port.fail(attemptId, code);
  } catch {
    return { outcome: 'command_failed', runId, attemptId, stage: 'fail' };
  }
  return { outcome: 'failed', runId, attemptId, code };
}
