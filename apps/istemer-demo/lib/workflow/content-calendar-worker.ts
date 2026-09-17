import 'server-only';
import { z } from 'zod';
import { NourTaskSchema, NourHandoffSchema, validateNourArtifact,
  type NourArtifact } from '@bagos/contracts';
import { freshMetadata, signContentCalendarRequest,
  type ContentCalendarEndpoint, type DispatchOutcome, type SignedContentCalendarRequest } from './content-calendar-transport';

// SQL accepts only these failure codes; wire-only expiry and replay errors
// must be translated before reaching the command port.
export type FailureCode = 'provider_failure' | 'timeout' | 'invalid_contract'
  | 'unrequested_platform' | 'unauthorized' | 'persistence_failure';
const FAILURE_CODES = new Set<FailureCode>(['provider_failure', 'timeout', 'invalid_contract',
  'unrequested_platform', 'unauthorized', 'persistence_failure']);

/** Private commands are granted only to bagos_content_calendar_executor, a
 * NOLOGIN role. A database-backed port requires an owner-provisioned worker
 * login; this module must not assume credentials or a connection. */
export interface ContentCalendarCommandPort {
  claim(): Promise<unknown>;
  fail(attemptId: string, code: FailureCode): Promise<unknown>;
  complete(attemptId: string, artifact: NourArtifact): Promise<unknown>;
}

export type ContentCalendarDispatcher = (
  endpoint: ContentCalendarEndpoint, signed: SignedContentCalendarRequest, body: Uint8Array, timeoutMs: number,
) => Promise<DispatchOutcome>;

const claimResultSchema = z.union([
  z.object({ status: z.literal('claimed'), task: NourTaskSchema, handoff: NourHandoffSchema }).strict(),
  z.object({ status: z.literal('failed'), runId: z.string().uuid(), code: z.string() }).strict(),
  z.null(),
]);

export type WorkerCycleResult =
  | { outcome: 'idle' }
  | { outcome: 'lease_reclaimed'; runId: string; code: string }
  | { outcome: 'lease_expired'; runId: string; attemptId: string }
  | { outcome: 'succeeded'; runId: string; attemptId: string }
  | { outcome: 'failed'; runId: string; attemptId: string; code: FailureCode }
  | { outcome: 'command_failed'; runId: string; attemptId: string; stage: 'fail' | 'complete' };

export interface ContentCalendarWorkerConfig {
  readonly port: ContentCalendarCommandPort;
  readonly dispatch: ContentCalendarDispatcher;
  readonly endpoint: ContentCalendarEndpoint;
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
      // Retrying a broken signing window or replay condition will not repair it.
      if (code === 'expired' || code === 'stale_attempt') return 'invalid_contract';
    }
  }
  return 'provider_failure';
}

export async function runContentCalendarWorkerCycle(config: ContentCalendarWorkerConfig): Promise<WorkerCycleResult> {
  const claimed = claimResultSchema.parse(await config.port.claim());
  if (claimed === null) return { outcome: 'idle' };
  if (claimed.status === 'failed') return { outcome: 'lease_reclaimed', runId: claimed.runId, code: claimed.code };
  const { task, handoff } = claimed;

  // fail() rejects an expired lease. The next claim reclaims it durably;
  // expiry takes precedence over every other pre-dispatch check.
  if (Date.parse(task.expiresAt) <= config.now()) {
    return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  }
  if (handoff.tenantId !== task.tenantId || handoff.taskId !== task.taskId
    || handoff.runId !== task.runId || handoff.attemptId !== task.attemptId
    || !handoff.inputRevisionIds.includes(task.brief.sourceRevisionId)) {
    return fail(config.port, task.runId, task.attemptId, 'invalid_contract');
  }

  const body = new TextEncoder().encode(JSON.stringify({ task, handoff }));
  const signed = signContentCalendarRequest(body, freshMetadata(config.keyId, config.now()), config.signingKey);
  const remaining = Date.parse(task.expiresAt) - config.now();
  if (remaining <= 0) return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  const outcome = await config.dispatch(config.endpoint, signed, body, Math.min(config.dispatchTimeoutMs ?? 20000, remaining));

  // Dispatch may consume the remaining lease; neither command can record an
  // outcome after expiry, so leave reconciliation to the next claim cycle.
  if (Date.parse(task.expiresAt) <= config.now()) {
    return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  }
  if (outcome.status === 'transport_failure') return fail(config.port, task.runId, task.attemptId, 'provider_failure');
  if (outcome.status === 'error') return fail(config.port, task.runId, task.attemptId, mapDispatchErrorCode(outcome.error));

  let artifact: NourArtifact;
  try {
    artifact = validateNourArtifact(outcome.artifact, task);
  } catch (error) {
    // unrequested_platform is the one validator failure NourErrorSchema gives
    // its own code, and validateNourArtifact throws a plain Error whose
    // message is exactly that string for it, so it is safe to distinguish.
    // Every other failure (shape, identity, ZodError) shares the terminal
    // invalid-contract path, matching Ziad's and Omar's precedent of not
    // trying to parse a validator's issue list for a finer-grained reason.
    const code = error instanceof Error && error.message === 'unrequested_platform' ? 'unrequested_platform' : 'invalid_contract';
    return fail(config.port, task.runId, task.attemptId, code);
  }
  try {
    await config.port.complete(task.attemptId, artifact);
  } catch {
    return { outcome: 'command_failed', runId: task.runId, attemptId: task.attemptId, stage: 'complete' };
  }
  return { outcome: 'succeeded', runId: task.runId, attemptId: task.attemptId };
}

async function fail(port: ContentCalendarCommandPort, runId: string, attemptId: string, code: FailureCode): Promise<WorkerCycleResult> {
  try {
    await port.fail(attemptId, code);
  } catch {
    // A concurrent lease reclaim can make a correctly issued command stale.
    return { outcome: 'command_failed', runId, attemptId, stage: 'fail' };
  }
  return { outcome: 'failed', runId, attemptId, code };
}
