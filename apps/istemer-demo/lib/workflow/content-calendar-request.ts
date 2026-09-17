import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONTENT_CALENDAR_CONTRACT_VERSION, NourErrorSchema } from '@bagos/contracts';
import { readResearchAuthorization } from './authorization';

// Nour's published error contract binds every field to one task/run/attempt, which
// an HTTP boundary failure raised before a task is even resolved cannot supply. This
// envelope mirrors research's flatter wire shape while still drawing its codes from
// the canonical enum, so the two error vocabularies cannot drift apart independently.
const readErrorSchema = z.object({
  contractVersion: z.literal(CONTENT_CALENDAR_CONTRACT_VERSION),
  code: NourErrorSchema.shape.code,
  retryable: z.boolean(),
  message: z.string().min(1),
}).strict();
type ErrorCode = z.infer<typeof readErrorSchema>['code'];

export class ContentCalendarRequestError extends Error {
  constructor(readonly code: ErrorCode, readonly httpStatus: number, readonly retryable = false) {
    super(code);
  }
}

export function contentCalendarFailure(error: unknown) {
  // The HTTP boundary deliberately redacts unexpected database/transport errors.
  const failure = error instanceof ContentCalendarRequestError ? error
    : new ContentCalendarRequestError('persistence_failure', 503, true);
  return NextResponse.json({ error: readErrorSchema.parse({
    contractVersion: CONTENT_CALENDAR_CONTRACT_VERSION, code: failure.code,
    retryable: failure.retryable, message: failure.code,
  }) }, { status: failure.httpStatus, headers: { 'Cache-Control': 'no-store' } });
}

// This demo binds every agent to the same single brand tenant, so Nour's requests
// share Omar's membership/tenant/MFA verification rather than duplicating it, and
// only relabel the authorized result under Nour's own error vocabulary.
export async function authorizeContentCalendarRequest() {
  const authorization = await readResearchAuthorization();
  if (authorization.status === 'authorized') {
    return { status: 'authorized' as const, tenantId: authorization.tenantId, requesterId: authorization.requesterId };
  }
  if (authorization.status === 'signed-out') throw new ContentCalendarRequestError('unauthorized', 401);
  if (authorization.status === 'denied' || authorization.status === 'mfa-required') {
    throw new ContentCalendarRequestError('unauthorized', 403);
  }
  throw new ContentCalendarRequestError('persistence_failure', 503, true);
}
