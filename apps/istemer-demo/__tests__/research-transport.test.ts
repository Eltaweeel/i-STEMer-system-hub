import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  RESEARCH_TASK_PATH, dispatchResearchTask, freshMetadata, signResearchRequest, signingInput, type SignedResearchRequest,
} from '../lib/workflow/research-transport';
import { RESPONSE_AUTH_HEADER, signResearchResponse } from '../lib/workflow/research-response-auth';

const key = randomBytes(32);
const body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));

describe('signResearchRequest', () => {
  it('produces a signature matching an independent HMAC computation over the same canonical input', () => {
    const metadata = freshMetadata('worker-key-1', 1_700_000_000_000);
    const signed = signResearchRequest(body, metadata, key);
    const expected = createHmac('sha256', key).update(signingInput(body, metadata)).digest('hex');
    expect(signed.signature).toBe(expected);
    expect(signed).toMatchObject(metadata);
  });

  it('rejects a signing key shorter than 32 bytes', () => {
    expect(() => signResearchRequest(body, freshMetadata('k', 0), randomBytes(16))).toThrow();
  });

  it('rejects an empty or oversized body', () => {
    const metadata = freshMetadata('k', 0);
    expect(() => signingInput(new Uint8Array(0), metadata)).toThrow();
    // One byte past the 2 MiB envelope ceiling, which exists so a 1 MiB
    // upstream artifact still fits alongside the task and handoff.
    expect(() => signingInput(new Uint8Array(2 * 1024 * 1024 + 1), metadata)).toThrow();
    expect(() => signingInput(new Uint8Array(2 * 1024 * 1024), metadata)).not.toThrow();
  });

  it('freshMetadata produces a nonce matching the verifier-required 64-hex-char format', () => {
    const metadata = freshMetadata('k', 0);
    expect(metadata.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.expiresAtMs - metadata.issuedAtMs).toBeLessThanOrEqual(60_000);
    expect(metadata.expiresAtMs).toBeGreaterThan(metadata.issuedAtMs);
  });

  it('rejects a window wider than the transport maximum', () => {
    expect(() => signingInput(body, { version: 'research-http.v1', keyId: 'k', nonce: 'a'.repeat(64),
      issuedAtMs: 0, expiresAtMs: 60_001 })).toThrow();
  });
});

describe('dispatchResearchTask', () => {
  let server: Server;
  let port: number;
  const NOW = 1_700_000_000_000;
  const auth = { key, now: () => NOW };
  const makeRequest = () => signResearchRequest(body, freshMetadata('k', NOW - 60_000), key);
  const endpoint = () => ({ hostname: '127.0.0.1', port });

  /** Answers like the listener: signed for this very request unless a test overrides part of it. */
  function reply(request: IncomingMessage, response: ServerResponse, status: number, payload: string, options: {
    header?: string | null; key?: Uint8Array; nowMs?: number; signedStatus?: number; signedBody?: string; nonce?: string;
  } = {}) {
    const raw = Buffer.from(payload);
    const sent = JSON.parse(String(request.headers['x-istemer-auth'])) as SignedResearchRequest;
    const header = options.header !== undefined ? options.header : signResearchResponse({ key: options.key ?? key,
      request: { ...sent, ...(options.nonce ? { nonce: options.nonce } : {}) }, status: options.signedStatus ?? status,
      body: options.signedBody !== undefined ? Buffer.from(options.signedBody) : raw, nowMs: options.nowMs ?? NOW });
    response.writeHead(status, { 'Content-Type': 'application/json', ...(header ? { [RESPONSE_AUTH_HEADER]: header } : {}) });
    response.end(raw);
  }
  const artifactBody = JSON.stringify({ artifact: { marker: 'forged-or-not' } });

  beforeEach(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });
  afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it('resolves ok with the parsed artifact on an authenticated HTTP 200 with an artifact field', async () => {
    server.on('request', (request, response) => {
      expect(request.method).toBe('POST');
      expect(request.url).toBe(RESEARCH_TASK_PATH);
      expect(request.headers['x-istemer-auth']).toBeDefined();
      reply(request, response, 200, JSON.stringify({ artifact: { marker: 'value' } }));
    });
    const outcome = await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth);
    // A responder that reports no usage yields null, never a fabricated zero.
    expect(outcome).toEqual({ status: 'ok', artifact: { marker: 'value' }, reportedTokens: null });
  });

  it.each([
    ['a reported figure', 4321, 4321],
    ['a zero the responder actually measured', 0, 0],
    ['a non-numeric figure', 'lots', null],
    ['a negative figure', -5, null],
  ])('reads usage from the authenticated response body: %s', async (_name, sent, expected) => {
    server.on('request', (request, response) => {
      reply(request, response, 200, JSON.stringify({ artifact: { marker: 'value' }, reportedTokens: sent }));
    });
    const outcome = await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth);
    expect(outcome).toEqual({ status: 'ok', artifact: { marker: 'value' }, reportedTokens: expected });
  });

  it('resolves error with the parsed error field on an authenticated non-200 error envelope', async () => {
    server.on('request', (request, response) => {
      reply(request, response, 422, JSON.stringify({ error: { code: 'uninspected_source' } }));
    });
    const outcome = await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth);
    expect(outcome).toEqual({ status: 'error', error: { code: 'uninspected_source' } });
  });

  describe('forged or altered responses are never trusted (research-http-response.v1)', () => {
    const cases: [string, (request: IncomingMessage, response: ServerResponse) => void][] = [
      ['an unsigned artifact (a process squatting on the port)', (rq, rs) => reply(rq, rs, 200, artifactBody, { header: null })],
      ['an unsigned error envelope', (rq, rs) => reply(rq, rs, 422, JSON.stringify({ error: { code: 'uninspected_source' } }), { header: null })],
      ['an artifact signed with another key', (rq, rs) => reply(rq, rs, 200, artifactBody, { key: randomBytes(32) })],
      ['a body altered after signing', (rq, rs) => reply(rq, rs, 200, artifactBody, { signedBody: JSON.stringify({ artifact: { marker: 'original' } }) })],
      ['a success signed as an error status (status swap)', (rq, rs) => reply(rq, rs, 200, artifactBody, { signedStatus: 422 })],
      ['an error envelope signed as a success status (status swap)', (rq, rs) => reply(rq, rs, 422, JSON.stringify({ error: { code: 'unauthorized' } }), { signedStatus: 200 })],
      ['a token count altered after signing', (rq, rs) => reply(rq, rs, 200, JSON.stringify({ artifact: { marker: 'v' }, reportedTokens: 2_147_483_647 }),
        { signedBody: JSON.stringify({ artifact: { marker: 'v' }, reportedTokens: 5 }) })],
      ['a signed answer relayed under a different request signature', (rq, rs) => {
        const sent = JSON.parse(String(rq.headers['x-istemer-auth'])) as SignedResearchRequest;
        reply(rq, rs, 200, artifactBody, { header: signResearchResponse({ key, request: { ...sent, signature: 'c'.repeat(64) },
          status: 200, body: Buffer.from(artifactBody), nowMs: NOW }) });
      }],
      ['a response signed for a different request (captured and replayed)', (rq, rs) => reply(rq, rs, 200, artifactBody, { nonce: 'b'.repeat(64) })],
      ['a stale response (older than the freshness window)', (rq, rs) => reply(rq, rs, 200, artifactBody, { nowMs: NOW - 30_001 })],
      ['a response issued in the future', (rq, rs) => reply(rq, rs, 200, artifactBody, { nowMs: NOW + 5_001 })],
      ['a response that predates its own request', (rq, rs) => reply(rq, rs, 200, artifactBody, { nowMs: NOW - 60_001 })],
      ['a header that is not JSON', (rq, rs) => reply(rq, rs, 200, artifactBody, { header: 'not json' })],
      ['a header that is a JSON array', (rq, rs) => reply(rq, rs, 200, artifactBody, { header: '[]' })],
      ['a header with an unknown extra field', (rq, rs) => {
        const sent = JSON.parse(String(rq.headers['x-istemer-auth'])) as SignedResearchRequest;
        const good = JSON.parse(signResearchResponse({ key, request: sent, status: 200, body: Buffer.from(artifactBody), nowMs: NOW }));
        reply(rq, rs, 200, artifactBody, { header: JSON.stringify({ ...good, extra: 1 }) });
      }],
      ['a header with a wrong version', (rq, rs) => {
        const sent = JSON.parse(String(rq.headers['x-istemer-auth'])) as SignedResearchRequest;
        const good = JSON.parse(signResearchResponse({ key, request: sent, status: 200, body: Buffer.from(artifactBody), nowMs: NOW }));
        reply(rq, rs, 200, artifactBody, { header: JSON.stringify({ ...good, version: 'research-http-response.v0' }) });
      }],
      ['an oversized header', (rq, rs) => reply(rq, rs, 200, artifactBody, { header: JSON.stringify({ pad: 'x'.repeat(5000) }) })],
    ];
    it.each(cases)('resolves transport_failure for %s', async (_name, handler) => {
      server.on('request', handler);
      expect(await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth)).toEqual({ status: 'transport_failure' });
    });

    it('does not reuse a request signature as a response signature (domain separation)', async () => {
      server.on('request', (request, response) => {
        const sent = JSON.parse(String(request.headers['x-istemer-auth'])) as SignedResearchRequest;
        const asHeader = JSON.stringify({ version: 'research-http-response.v1', keyId: sent.keyId, requestNonce: sent.nonce,
          status: 200, issuedAtMs: NOW, signature: sent.signature });
        reply(request, response, 200, artifactBody, { header: asHeader });
      });
      expect(await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth)).toEqual({ status: 'transport_failure' });
    });

    it('rejects a response when the worker holds a different key than the listener (no unsigned or key-agnostic fallback)', async () => {
      server.on('request', (request, response) => reply(request, response, 200, artifactBody));
      const outcome = await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, { key: randomBytes(32), now: () => NOW });
      expect(outcome).toEqual({ status: 'transport_failure' });
    });
  });

  it('resolves transport_failure when the connection is refused', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth)).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure when the response exceeds the size cap', async () => {
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('x'.repeat(1024 * 1024 + 1));
    });
    expect(await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth)).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure on an authenticated response body that is not valid JSON', async () => {
    server.on('request', (request, response) => reply(request, response, 200, 'not json'));
    expect(await dispatchResearchTask(endpoint(), makeRequest(), body, 2000, auth)).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure when the server never responds before the timeout', async () => {
    server.on('request', () => { /* never respond */ });
    expect(await dispatchResearchTask(endpoint(), makeRequest(), body, 150, auth)).toEqual({ status: 'transport_failure' });
  });

  it('enforces a total deadline even when the response keeps trickling in', async () => {
    let trickle: ReturnType<typeof setInterval> | undefined;
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      // A byte every 40ms never trips an idle timeout, but never finishes either.
      trickle = setInterval(() => response.write(' '), 40);
      response.on('close', () => clearInterval(trickle));
    });
    const started = performance.now();
    const outcome = await dispatchResearchTask(endpoint(), makeRequest(), body, 300, auth);
    expect(outcome).toEqual({ status: 'transport_failure' });
    expect(performance.now() - started).toBeLessThan(1500);
    clearInterval(trickle);
  });

  it('resolves transport_failure without connecting when the endpoint is not loopback', async () => {
    expect(await dispatchResearchTask({ hostname: 'example.org', port: 80 }, makeRequest(), body, 100, auth)).toEqual({ status: 'transport_failure' });
  });
});
