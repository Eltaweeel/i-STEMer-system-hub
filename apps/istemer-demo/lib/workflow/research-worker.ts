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
const completionAcknowledgementSchema = z.object({ status: z.literal('succeeded'), attemptId: z.string().uuid() }).passthrough();

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
  /** Exact source URLs an operator approved for this deployment. The SSRF guard only keeps the worker off private
   * networks; this list is what keeps it on pages someone chose. A brief naming anything else is refused before any
   * fetch. Required, so a deployment without an approved list cannot fetch at all. */
  readonly approvedSources: ReadonlySet<string>;
  readonly dispatchTimeoutMs?: number;
  /** Lease time held back from dispatch so a completed artifact can still be persisted. Default 45s: room for
   * two cold database calls (the standalone worker caps connecting at 10s and a query at 10s, so ~40s) plus a
   * 500ms backoff. A third attempt may overrun the lease; it is then simply refused. */
  readonly completionMarginMs?: number;
  /** Total attempts for port.complete while the lease lasts (the SQL command is idempotent by digest). Default 3. */
  readonly completeAttempts?: number;
  readonly completeRetryDelayMs?: number;
  /** Backoff timer; injectable so tests can move the clock while waiting. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_COMPLETION_MARGIN_MS = 45_000;

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
  // All or nothing, and before any network contact: a partly approved brief is not run on its approved part,
  // because the requester asked for the whole set and a silent subset would read as a complete answer.
  if (!task.brief.sources.every((sourceUrl) => config.approvedSources.has(sourceUrl))) {
    return fail(config.port, task.runId, task.attemptId, 'uninspected_source');
  }
  const controller = new AbortController();
  const snapshots: { receipt: SourceInspection; text: string }[] = [];
  try {
    for (const sourceUrl of task.brief.sources) {
      if (Date.parse(task.expiresAt) - config.now() <= 0) { controller.abort(); break; }
      const observation = await config.observe({ task, sourceUrl, now: config.now, signal: controller.signal });
      if (observation.status === 'inspected') snapshots.push(observation.snapshot);
    }
  } catch {
    // An unexpected observer error (e.g. a host clock behind the database clock: task_outside_lease) happens before any
    // paid dispatch. Record it now instead of leaving the attempt running until the lease is reclaimed as a timeout.
    return fail(config.port, task.runId, task.attemptId, 'uninspected_source');
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
  const margin = config.completionMarginMs ?? DEFAULT_COMPLETION_MARGIN_MS;
  // Not enough lease left to both run the agent and persist its answer: do not start a paid run.
  if (remaining - margin <= 0) return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  const body = new TextEncoder().encode(JSON.stringify({ task, handoff, snapshots }));
  const metadata = freshMetadata(config.keyId, config.now());
  const signed = signResearchRequest(body, metadata, config.signingKey);
  const timeoutMs = Math.min(config.dispatchTimeoutMs ?? 20000, remaining - margin);
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

  const completion = await completeWithRetry(config, task.attemptId, parsedArtifact.data, receipts, Date.parse(task.expiresAt));
  // The database refused this exact artifact; repeating or waiting out the lease cannot help, so say so instead of
  // letting it surface later as a retryable timeout that invites another paid run. Both codes are non-retryable.
  if (completion === 'unauthorized' || completion === 'invalid_contract') {
    return fail(config.port, task.runId, task.attemptId, completion);
  }
  if (completion !== 'ok') {
    return { outcome: 'command_failed', runId: task.runId, attemptId: task.attemptId, stage: 'complete' };
  }
  // Metering is recorded after the artifact is durable and deliberately cannot
  // undo it: losing a usage row is a reporting gap, while failing an attempt
  // that genuinely produced evidence would be a far worse lie. The gap is
  // visible either way, because an unrecorded attempt is not counted as zero.
  await recordUsage(config, task.attemptId, outcome.reportedTokens ?? null);
  return { outcome: 'succeeded', runId: task.runId, attemptId: task.attemptId };
}

/** complete_research_attempt is idempotent for an identical artifact/receipt digest, so a lost
 * acknowledgement or dropped connection is safe to repeat while the lease is still open. */
// SQLSTATEs for which the same call can never succeed: invalid parameter value, NUL in jsonb text, object not in the
// required state. 42501 is separate: complete_research_attempt raises it when the requester's membership or the tenant
// was revoked during the run, which is an authorization outcome, not a defect in the artifact. (A worker login missing
// EXECUTE also yields 42501, but the startup login check refuses to run in that state.)
const INVALID_SQLSTATES = new Set(['22023', '22P05', '55000']);

async function completeWithRetry(config: ResearchWorkerConfig, attemptId: string, artifact: ResearchArtifact,
  receipts: readonly SourceInspection[], expiresAtMs: number): Promise<'ok' | 'exhausted' | 'unauthorized' | 'invalid_contract'> {
  const attempts = config.completeAttempts ?? 3;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // The lease is re-checked immediately before every call, not only after a rejection: a call made after
    // expiry can only be refused, and the next claim reclaims the attempt regardless.
    if (config.now() >= expiresAtMs) return 'exhausted';
    let acknowledgement: unknown;
    try { acknowledgement = await config.port.complete(attemptId, artifact, receipts); }
    catch (error) {
      const sqlstate = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
      if (sqlstate === '42501') return 'unauthorized';
      if (typeof sqlstate === 'string' && INVALID_SQLSTATES.has(sqlstate)) return 'invalid_contract';
      if (attempt === attempts) return 'exhausted';
      // Never sleep past the lease.
      const remaining = expiresAtMs - config.now();
      if (remaining <= 0) return 'exhausted';
      await sleep(Math.min(config.completeRetryDelayMs ?? 500, remaining));
      continue;
    }
    // Only the database's own statement that this attempt succeeded counts. Anything else is reported as a failed
    // command, never as success; the attempt's true state is whatever the database holds, and the UI reads that.
    return completionAcknowledgementSchema.safeParse(acknowledgement).data?.attemptId === attemptId ? 'ok' : 'exhausted';
  }
  return 'exhausted';
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
