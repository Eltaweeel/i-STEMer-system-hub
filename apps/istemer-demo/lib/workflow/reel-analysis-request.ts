import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { REEL_ANALYSIS_CONTRACT_VERSION, ReelAnalysisErrorSchema } from '@bagos/contracts';
import { readResearchAuthorization } from './authorization';

// Ziad's published error contract binds every field to one task/run/attempt, which
// an HTTP boundary failure raised before a task is even resolved cannot supply. This
// envelope mirrors research's flatter wire shape while still drawing its codes from
// the canonical enum, so the two error vocabularies cannot drift apart independently.
const readErrorSchema = z.object({
  contractVersion: z.literal(REEL_ANALYSIS_CONTRACT_VERSION),
  code: ReelAnalysisErrorSchema.shape.code,
  retryable: z.boolean(),
  message: z.string().min(1),
}).strict();
type ErrorCode = z.infer<typeof readErrorSchema>['code'];

export class ReelAnalysisRequestError extends Error {
  constructor(readonly code: ErrorCode, readonly httpStatus: number, readonly retryable = false) {
    super(code);
  }
}

export function reelAnalysisFailure(error: unknown) {
  // The HTTP boundary deliberately redacts unexpected database/transport errors.
  const failure = error instanceof ReelAnalysisRequestError ? error
    : new ReelAnalysisRequestError('persistence_failure', 503, true);
  return NextResponse.json({ error: readErrorSchema.parse({
    contractVersion: REEL_ANALYSIS_CONTRACT_VERSION, code: failure.code,
    retryable: failure.retryable, message: failure.code,
  }) }, { status: failure.httpStatus, headers: { 'Cache-Control': 'no-store' } });
}

// This demo binds every agent to the same single brand tenant, so Ziad's requests
// share Omar's membership/tenant/MFA verification rather than duplicating it, and
// only relabel the authorized result under Ziad's own error vocabulary.
export async function authorizeReelAnalysisRequest() {
  const authorization = await readResearchAuthorization();
  if (authorization.status === 'authorized') {
    return { status: 'authorized' as const, tenantId: authorization.tenantId, requesterId: authorization.requesterId };
  }
  if (authorization.status === 'signed-out') throw new ReelAnalysisRequestError('unauthorized', 401);
  if (authorization.status === 'denied' || authorization.status === 'mfa-required') {
    throw new ReelAnalysisRequestError('unauthorized', 403);
  }
  throw new ReelAnalysisRequestError('persistence_failure', 503, true);
}
