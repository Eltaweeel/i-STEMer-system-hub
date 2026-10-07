import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { RESEARCH_TASK_PATH, type SignedResearchRequest } from './research-signing';

// Pure response-authentication math (research-http-response.v1), free of the 'server-only' guard like research-signing.ts so
// the agents-hub parity test can import it across the repository boundary. Specification and rationale: see
// i-STEMer-agents-hub/src/research/authenticated-response.ts. The listener signs; the worker verifies BEFORE parsing.
// The signing input must stay byte-for-byte identical to that file; transport-parity.test.ts proves it in both directions.
//
// Error behaviour: every failure (missing, malformed, wrong key id / nonce / status, stale, from the future, tampered body)
// throws the same opaque Error('invalid_response_auth'); the caller treats it as a transport failure and never reads the body.

export const RESEARCH_RESPONSE_VERSION = 'research-http-response.v1' as const;
export const RESPONSE_AUTH_HEADER = 'x-istemer-response-auth' as const;
/** A response must have been issued no earlier than this long before it is verified (same host clock). */
const MAX_AGE_MS = 30_000;
/** Allowed clock skew into the future (loopback, same host: effectively zero, kept small for scheduling jitter). */
const MAX_FUTURE_MS = 5_000;
/** A response cannot predate its request and cannot take longer than the largest dispatch window (240 s) plus slack. */
const MAX_PROCESSING_MS = 300_000;
const MAX_HEADER_CHARS = 4096;

type RequestBinding = Pick<SignedResearchRequest, 'keyId' | 'nonce' | 'signature' | 'issuedAtMs'>;

function signingInput(request: Pick<SignedResearchRequest, 'keyId' | 'nonce' | 'signature'>, status: number, issuedAtMs: number,
  body: Uint8Array): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(request.keyId) || !/^[a-f0-9]{64}$/.test(request.nonce)
    || !/^[a-f0-9]{64}$/.test(request.signature) || !Number.isInteger(status) || status < 100 || status > 599
    || !Number.isSafeInteger(issuedAtMs) || issuedAtMs < 0) throw new Error('invalid_response_signing_input');
  return [RESEARCH_RESPONSE_VERSION, 'RESPONSE', 'POST', RESEARCH_TASK_PATH, request.keyId, request.nonce, request.signature,
    status, issuedAtMs, createHash('sha256').update(body).digest('hex')].join('\n');
}

/** Signing half, used by tests and by the parity proof. The production signer is the listener in the agents-hub repository. */
export function signResearchResponse(input: {
  key: Uint8Array; request: Pick<SignedResearchRequest, 'keyId' | 'nonce' | 'signature'>;
  status: number; body: Uint8Array; nowMs: number;
}): string {
  if (input.key.byteLength < 32) throw new Error('signing_key_too_short');
  const signature = createHmac('sha256', input.key).update(signingInput(input.request, input.status, input.nowMs, input.body)).digest('hex');
  return JSON.stringify({ version: RESEARCH_RESPONSE_VERSION, keyId: input.request.keyId, requestNonce: input.request.nonce,
    status: input.status, issuedAtMs: input.nowMs, signature });
}

const reject = () => new Error('invalid_response_auth');

/** Throws Error('invalid_response_auth') unless `header` authenticates exactly this status and these body bytes as the answer
 * to exactly this request. There is deliberately no "unsigned is acceptable" mode. */
export function verifyResearchResponse(input: {
  key: Uint8Array; request: RequestBinding; status: number; body: Uint8Array; header: unknown; nowMs: number;
}): void {
  const { key, request, header } = input;
  if (key.byteLength < 32 || typeof header !== 'string' || header.length === 0 || header.length > MAX_HEADER_CHARS) throw reject();
  let parsed: unknown;
  try { parsed = JSON.parse(header); } catch { throw reject(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw reject();
  const meta = parsed as Record<string, unknown>;
  if (Object.keys(meta).sort().join(',') !== 'issuedAtMs,keyId,requestNonce,signature,status,version') throw reject();
  const { version, keyId, requestNonce, status, issuedAtMs, signature } = meta;
  if (version !== RESEARCH_RESPONSE_VERSION || keyId !== request.keyId || requestNonce !== request.nonce
    || status !== input.status || typeof issuedAtMs !== 'number' || !Number.isSafeInteger(issuedAtMs)
    || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) throw reject();
  if (issuedAtMs < request.issuedAtMs || issuedAtMs - request.issuedAtMs > MAX_PROCESSING_MS
    || issuedAtMs > input.nowMs + MAX_FUTURE_MS || input.nowMs - issuedAtMs > MAX_AGE_MS) throw reject();
  let message: string;
  try { message = signingInput(request, input.status, issuedAtMs, input.body); } catch { throw reject(); }
  const expected = createHmac('sha256', input.key).update(message).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw reject();
}
