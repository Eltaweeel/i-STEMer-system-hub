import { createHash, createHmac, randomBytes } from 'node:crypto';

// Pure signing math, deliberately free of the 'server-only' guard that
// research-transport.ts carries: this module has no I/O and is imported
// directly (including across the repository boundary, by
// i-STEMer-agents-hub/src/research/transport-parity.test.ts) to prove this
// signer produces a signature the agents-hub verifier actually accepts.

export const RESEARCH_TRANSPORT_VERSION = 'research-http.v1' as const;
export const RESEARCH_TASK_PATH = '/v1/research/tasks' as const;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_WINDOW_MS = 60_000;
const SIGNATURE_WINDOW_MS = 30_000;

export interface SignedResearchRequest {
  readonly version: typeof RESEARCH_TRANSPORT_VERSION;
  readonly keyId: string;
  readonly nonce: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly signature: string;
}
type UnsignedRequest = Omit<SignedResearchRequest, 'signature'>;

function validateMetadata(value: UnsignedRequest): void {
  if (!value || typeof value !== 'object' || value.version !== RESEARCH_TRANSPORT_VERSION
    || typeof value.keyId !== 'string' || typeof value.nonce !== 'string'
    || !/^[A-Za-z0-9_-]{1,64}$/.test(value.keyId)
    || !/^[a-f0-9]{64}$/.test(value.nonce)
    || !Number.isSafeInteger(value.issuedAtMs) || !Number.isSafeInteger(value.expiresAtMs)
    || value.issuedAtMs < 0 || value.expiresAtMs <= value.issuedAtMs
    || value.expiresAtMs - value.issuedAtMs > MAX_WINDOW_MS) {
    throw new Error('invalid_signing_metadata');
  }
}

// This must byte-for-byte match the verifier's signing input in the agents-hub
// repository (src/research/authenticated-request.ts, function `signingInput`).
// That file is separately reviewed/tested and is not imported here across the
// repository boundary. Parity is proven, not assumed:
// i-STEMer-agents-hub/src/research/transport-parity.test.ts imports this exact
// module and verifies its output with the unmodified agents authenticateResearchRequest.
export function signingInput(body: Uint8Array, metadata: UnsignedRequest): string {
  validateMetadata(metadata);
  if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) throw new Error('invalid_signing_body');
  return [metadata.version, 'POST', RESEARCH_TASK_PATH, metadata.keyId, metadata.nonce,
    metadata.issuedAtMs, metadata.expiresAtMs, createHash('sha256').update(body).digest('hex')].join('\n');
}

export function signResearchRequest(body: Uint8Array, metadata: UnsignedRequest, key: Uint8Array): SignedResearchRequest {
  if (key.byteLength < 32) throw new Error('signing_key_too_short');
  const signature = createHmac('sha256', key).update(signingInput(body, metadata)).digest('hex');
  return { ...metadata, signature };
}

/** A fresh, single-use signing window. The nonce is 32 random bytes, matching
 * the verifier's `/^[a-f0-9]{64}$/` requirement; the window is intentionally
 * far short of the transport's 60s ceiling so clock skew cannot be exploited. */
export function freshMetadata(keyId: string, now: number): UnsignedRequest {
  return { version: RESEARCH_TRANSPORT_VERSION, keyId, nonce: randomBytes(32).toString('hex'),
    issuedAtMs: now, expiresAtMs: now + SIGNATURE_WINDOW_MS };
}
