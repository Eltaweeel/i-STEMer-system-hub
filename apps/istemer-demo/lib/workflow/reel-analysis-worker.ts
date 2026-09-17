import 'server-only';
import { z } from 'zod';
import { ReelAnalysisTaskSchema, ReelAnalysisHandoffSchema, validateReelAnalysisArtifact,
  type ReelAnalysisArtifact } from '@bagos/contracts';
import { freshMetadata, signReelAnalysisRequest,
  type ReelAnalysisEndpoint, type DispatchOutcome, type SignedReelAnalysisRequest } from './reel-analysis-transport';

// SQL accepts only these failure codes; wire-only expiry and replay errors
// must be translated before reaching the command port.
export type FailureCode = 'provider_failure' | 'timeout' | 'invalid_contract'
  | 'uninspected_modality' | 'unauthorized' | 'persistence_failure';
const FAILURE_CODES = new Set<FailureCode>(['provider_failure', 'timeout', 'invalid_contract',
  'uninspected_modality', 'unauthorized', 'persistence_failure']);

/** Private commands are granted only to bagos_reel_analyst_executor, a NOLOGIN
 * role. A database-backed port requires an owner-provisioned worker login;
 * this module must not assume credentials or a connection. */
export interface ReelAnalysisCommandPort {
  claim(): Promise<unknown>;
  fail(attemptId: string, code: FailureCode): Promise<unknown>;
  complete(attemptId: string, artifact: ReelAnalysisArtifact): Promise<unknown>;
}

export type ReelAnalysisDispatcher = (
  endpoint: ReelAnalysisEndpoint, signed: SignedReelAnalysisRequest, body: Uint8Array, timeoutMs: number,
) => Promise<DispatchOutcome>;

const claimResultSchema = z.union([
  z.object({ status: z.literal('claimed'), task: ReelAnalysisTaskSchema, handoff: ReelAnalysisHandoffSchema }).strict(),
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

export interface ReelAnalysisWorkerConfig {
  readonly port: ReelAnalysisCommandPort;
  readonly dispatch: ReelAnalysisDispatcher;
  readonly endpoint: ReelAnalysisEndpoint;
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

export async function runReelAnalysisWorkerCycle(config: ReelAnalysisWorkerConfig): Promise<WorkerCycleResult> {
  const claimed = claimResultSchema.parse(await config.port.claim());
  if (claimed === null) return { outcome: 'idle' };
  if (claimed.status === 'failed') return { outcome: 'lease_reclaimed', runId: claimed.runId, code: claimed.code };
  const { task, handoff } = claimed;

  // fail() rejects an expired lease. The next claim reclaims it durably;
  // expiry takes precedence even if no modalities were supplied.
  if (Date.parse(task.expiresAt) <= config.now()) {
    return { outcome: 'lease_expired', runId: task.runId, attemptId: task.attemptId };
  }
  if (task.brief.suppliedModalities.length === 0) {
    return fail(config.port, task.runId, task.attemptId, 'uninspected_modality');
  }
  if (handoff.tenantId !== task.tenantId || handoff.taskId !== task.taskId
    || handoff.runId !== task.runId || handoff.attemptId !== task.attemptId
    || !handoff.inputRevisionIds.includes(task.brief.sourceRevisionId)) {
    return fail(config.port, task.runId, task.attemptId, 'invalid_contract');
  }

  const body = new TextEncoder().encode(JSON.stringify({ task, handoff }));
  const signed = signReelAnalysisRequest(body, freshMetadata(config.keyId, config.now()), config.signingKey);
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

  let artifact: ReelAnalysisArtifact;
  try {
    artifact = validateReelAnalysisArtifact(outcome.artifact, task);
  } catch {
    // Shape and evidence failures share the terminal invalid-contract path;
    // the validator does not expose a structured failure discriminator.
    return fail(config.port, task.runId, task.attemptId, 'invalid_contract');
  }
  try {
    await config.port.complete(task.attemptId, artifact);
  } catch {
    return { outcome: 'command_failed', runId: task.runId, attemptId: task.attemptId, stage: 'complete' };
  }
  return { outcome: 'succeeded', runId: task.runId, attemptId: task.attemptId };
}

async function fail(port: ReelAnalysisCommandPort, runId: string, attemptId: string, code: FailureCode): Promise<WorkerCycleResult> {
  try {
    await port.fail(attemptId, code);
  } catch {
    // A concurrent lease reclaim can make a correctly issued command stale.
    return { outcome: 'command_failed', runId, attemptId, stage: 'fail' };
  }
  return { outcome: 'failed', runId, attemptId, code };
}
