import 'server-only';
import { NextResponse } from 'next/server';
import { ResearchErrorSchema } from '@bagos/contracts';
import type { z } from 'zod';
import { readResearchAuthorization } from './authorization';

type ErrorCode = z.infer<typeof ResearchErrorSchema>['code'];

export class ResearchRequestError extends Error {
  constructor(readonly code: ErrorCode, readonly httpStatus: number, readonly retryable = false) {
    super(code);
  }
}

export function researchFailure(error: unknown) {
  // The HTTP boundary deliberately redacts unexpected database/transport errors.
  const failure = error instanceof ResearchRequestError ? error
    : new ResearchRequestError('persistence_failure', 503, true);
  return NextResponse.json({ error: ResearchErrorSchema.parse({
    contractVersion: 'research.v1', code: failure.code,
    retryable: failure.retryable, message: failure.code,
  }) }, { status: failure.httpStatus, headers: { 'Cache-Control': 'no-store' } });
}

export async function authorizeResearchRequest() {
  const authorization = await readResearchAuthorization();
  if (authorization.status === 'authorized') return authorization;
  if (authorization.status === 'signed-out') throw new ResearchRequestError('unauthorized', 401);
  if (authorization.status === 'denied' || authorization.status === 'mfa-required') {
    throw new ResearchRequestError('unauthorized', 403);
  }
  throw new ResearchRequestError('persistence_failure', 503, true);
}

export async function readResearchInput(request: Request): Promise<unknown> {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new ResearchRequestError('unauthorized', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json' || !request.body) {
    throw new ResearchRequestError('invalid_contract', 400);
  }
  const bytes = await boundedRequestBody(request.body);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ResearchRequestError('invalid_contract', 400); }
}

async function boundedRequestBody(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        throw new ResearchRequestError('invalid_contract', 413);
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, length);
  } finally { reader.releaseLock(); }
}
