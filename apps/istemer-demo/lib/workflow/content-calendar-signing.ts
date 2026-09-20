import { createHash, createHmac, randomBytes } from 'node:crypto';

// Kept free of server-only so a listener can verify signing parity without I/O.

export const CONTENT_CALENDAR_TRANSPORT_VERSION = 'content-calendar-http.v1' as const;
export const CONTENT_CALENDAR_TASK_PATH = '/v1/content-calendar/tasks' as const;
// 2 MiB, derived rather than picked: the completion commands cap a stored
// artifact at 1 MiB (octet_length(artifact::text) in the completion
// validations), and an envelope carries the task, the handoff and one upstream
// artifact of that size. The signer and the verifier must stay identical --
// a mismatch here rejects every dispatch -- so all six copies move together.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_WINDOW_MS = 60_000;
const SIGNATURE_WINDOW_MS = 30_000;

export interface SignedContentCalendarRequest {
  readonly version: typeof CONTENT_CALENDAR_TRANSPORT_VERSION;
  readonly keyId: string;
  readonly nonce: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly signature: string;
}
type UnsignedRequest = Omit<SignedContentCalendarRequest, 'signature'>;

function validateMetadata(value: UnsignedRequest): void {
  if (!value || typeof value !== 'object' || value.version !== CONTENT_CALENDAR_TRANSPORT_VERSION
    || typeof value.keyId !== 'string' || typeof value.nonce !== 'string'
    || !/^[A-Za-z0-9_-]{1,64}$/.test(value.keyId)
    || !/^[a-f0-9]{64}$/.test(value.nonce)
    || !Number.isSafeInteger(value.issuedAtMs) || !Number.isSafeInteger(value.expiresAtMs)
    || value.issuedAtMs < 0 || value.expiresAtMs <= value.issuedAtMs
    || value.expiresAtMs - value.issuedAtMs > MAX_WINDOW_MS) {
    throw new Error('invalid_signing_metadata');
  }
}

// The path and version are signed to prevent replay across agent listeners.
export function signingInput(body: Uint8Array, metadata: UnsignedRequest): string {
  validateMetadata(metadata);
  if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) throw new Error('invalid_signing_body');
  return [metadata.version, 'POST', CONTENT_CALENDAR_TASK_PATH, metadata.keyId, metadata.nonce,
    metadata.issuedAtMs, metadata.expiresAtMs, createHash('sha256').update(body).digest('hex')].join('\n');
}

export function signContentCalendarRequest(body: Uint8Array, metadata: UnsignedRequest, key: Uint8Array): SignedContentCalendarRequest {
  if (key.byteLength < 32) throw new Error('signing_key_too_short');
  const signature = createHmac('sha256', key).update(signingInput(body, metadata)).digest('hex');
  return { ...metadata, signature };
}

/** A fresh, single-use signing window. The nonce is 32 random bytes, matching
 * the verifier's `/^[a-f0-9]{64}$/` requirement; the window is intentionally
 * far short of the transport's 60s ceiling so clock skew cannot be exploited. */
export function freshMetadata(keyId: string, now: number): UnsignedRequest {
  return { version: CONTENT_CALENDAR_TRANSPORT_VERSION, keyId, nonce: randomBytes(32).toString('hex'),
    issuedAtMs: now, expiresAtMs: now + SIGNATURE_WINDOW_MS };
}
