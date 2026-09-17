import { EventEmitter } from 'node:events';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:http', () => ({ request }));
import { CONTENT_CALENDAR_TASK_PATH, dispatchContentCalendarTask, freshMetadata, signContentCalendarRequest, signingInput,
} from '../lib/workflow/content-calendar-transport';

const key = randomBytes(32);
const body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));

describe('signContentCalendarRequest', () => {
  it('produces a signature matching an independent HMAC computation over the same canonical input', () => {
    const metadata = freshMetadata('worker-key-1', 1_700_000_000_000);
    const signed = signContentCalendarRequest(body, metadata, key);
    const expected = createHmac('sha256', key).update([metadata.version, 'POST', '/v1/content-calendar/tasks', metadata.keyId, metadata.nonce,
      metadata.issuedAtMs, metadata.expiresAtMs, createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
    expect(signed.signature).toBe(expected);
    expect(signed).toMatchObject(metadata);
  });

  it('rejects a signing key shorter than 32 bytes', () => {
    expect(() => signContentCalendarRequest(body, freshMetadata('k', 0), randomBytes(16))).toThrow();
  });

  it('rejects an empty or oversized body', () => {
    const metadata = freshMetadata('k', 0);
    expect(() => signingInput(new Uint8Array(0), metadata)).toThrow();
    expect(() => signingInput(new Uint8Array(64 * 1024 + 1), metadata)).toThrow();
  });

  it('freshMetadata produces a nonce matching the verifier-required 64-hex-char format', () => {
    const metadata = freshMetadata('k', 0);
    expect(metadata.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.expiresAtMs - metadata.issuedAtMs).toBeLessThanOrEqual(60_000);
    expect(metadata.expiresAtMs).toBeGreaterThan(metadata.issuedAtMs);
  });

  it('rejects a window wider than the transport maximum', () => {
    expect(() => signingInput(body, { version: 'content-calendar-http.v1', keyId: 'k', nonce: 'a'.repeat(64),
      issuedAtMs: 0, expiresAtMs: 60_001 })).toThrow();
  });
});

describe('dispatchContentCalendarTask', () => {
  beforeEach(() => { request.mockReset(); });

  function exchange() {
    const response = Object.assign(new EventEmitter(), { statusCode: 200, destroy: vi.fn() });
    const outgoing = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    outgoing.destroy.mockImplementation(() => outgoing.emit('close'));
    request.mockReturnValue(outgoing);
    const signed = signContentCalendarRequest(body, freshMetadata('k', 0), key);
    const pending = dispatchContentCalendarTask({ hostname: '127.0.0.1', port: 4102 }, signed, body, 150);
    const [options, receive] = request.mock.calls[0]!;
    receive(response);
    return { pending, response, outgoing, options, signed };
  }

  it('sends the signed bytes to the content calendar listener and reads the artifact', async () => {
    const { pending, response, outgoing, options, signed } = exchange();
    expect(options).toMatchObject({ host: '127.0.0.1', port: 4102, method: 'POST', path: CONTENT_CALENDAR_TASK_PATH, timeout: 150,
      headers: { 'Content-Length': body.byteLength, 'X-Istemer-Auth': JSON.stringify(signed) } });
    expect(outgoing.end).toHaveBeenCalledWith(body);
    response.emit('data', Buffer.from('{"artifact":'));
    response.emit('data', Buffer.from('{"marker":true}}'));
    response.emit('end'); response.emit('close'); outgoing.emit('error', new Error('late close'));
    expect(await pending).toEqual({ status: 'ok', artifact: { marker: true } });
  });

  it.each([
    [422, '{"error":{"code":"unrequested_platform"}}', { status: 'error', error: { code: 'unrequested_platform' } }],
    [200, 'not JSON', { status: 'transport_failure' }],
    [200, '{}', { status: 'transport_failure' }],
    [500, '{"artifact":{}}', { status: 'transport_failure' }],
  ])('handles response %s %s', async (status, content, expected) => {
    const { pending, response } = exchange(); response.statusCode = status;
    response.emit('data', Buffer.from(content)); response.emit('end');
    expect(await pending).toEqual(expected);
  });

  it('bounds response bytes and ignores a later end event', async () => {
    const { pending, response } = exchange();
    response.emit('data', Buffer.alloc(1024 * 1024));
    response.emit('data', Buffer.from('x')); response.emit('end');
    expect(await pending).toEqual({ status: 'transport_failure' });
    expect(response.destroy).toHaveBeenCalledOnce();
  });

  it.each(['request_error','request_close','response_error','response_close','timeout'])('fails on %s', async (event) => {
    const { pending, response, outgoing } = exchange();
    if (event === 'timeout') outgoing.emit('timeout');
    else (event.startsWith('request') ? outgoing : response).emit(event.endsWith('error') ? 'error' : 'close', new Error('connection lost'));
    expect(await pending).toEqual({ status: 'transport_failure' });
    if (event === 'timeout') expect(outgoing.destroy).toHaveBeenCalledOnce();
  });

  it('rejects a non-loopback endpoint before creating a request', async () => {
    const signed = signContentCalendarRequest(body, freshMetadata('k', 0), key);
    expect(await dispatchContentCalendarTask({ hostname: 'example.org', port: 80 }, signed, body, 100)).toEqual({ status: 'transport_failure' });
    expect(request).not.toHaveBeenCalled();
  });
});
