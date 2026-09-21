import { createServer, type Server } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  RESEARCH_TASK_PATH, dispatchResearchTask, freshMetadata, signResearchRequest, signingInput,
} from '../lib/workflow/research-transport';

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

  beforeEach(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });
  afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it('resolves ok with the parsed artifact on HTTP 200 with an artifact field', async () => {
    server.on('request', (request, response) => {
      expect(request.method).toBe('POST');
      expect(request.url).toBe(RESEARCH_TASK_PATH);
      expect(request.headers['x-istemer-auth']).toBeDefined();
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ artifact: { marker: 'value' } }));
    });
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 2000);
    // A responder that reports no usage yields null, never a fabricated zero.
    expect(outcome).toEqual({ status: 'ok', artifact: { marker: 'value' }, reportedTokens: null });
  });

  it.each([
    ['a reported figure', 4321, 4321],
    ['a zero the responder actually measured', 0, 0],
    ['a non-numeric figure', 'lots', null],
    ['a negative figure', -5, null],
  ])('reads usage from the response body: %s', async (_name, sent, expected) => {
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ artifact: { marker: 'value' }, reportedTokens: sent }));
    });
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 2000);
    expect(outcome).toEqual({ status: 'ok', artifact: { marker: 'value' }, reportedTokens: expected });
  });

  it('resolves error with the parsed error field on a non-200 error envelope', async () => {
    server.on('request', (_request, response) => {
      response.writeHead(422, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'uninspected_source' } }));
    });
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 2000);
    expect(outcome).toEqual({ status: 'error', error: { code: 'uninspected_source' } });
  });

  it('resolves transport_failure when the connection is refused', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 2000);
    expect(outcome).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure when the response exceeds the size cap', async () => {
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('x'.repeat(1024 * 1024 + 1));
    });
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 2000);
    expect(outcome).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure on response body that is not valid JSON', async () => {
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('not json');
    });
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 2000);
    expect(outcome).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure when the server never responds before the timeout', async () => {
    server.on('request', () => { /* never respond */ });
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    const outcome = await dispatchResearchTask({ hostname: '127.0.0.1', port }, signed, body, 150);
    expect(outcome).toEqual({ status: 'transport_failure' });
  });

  it('resolves transport_failure without connecting when the endpoint is not loopback', async () => {
    const signed = signResearchRequest(body, freshMetadata('k', 0), key);
    expect(await dispatchResearchTask({ hostname: 'example.org', port: 80 }, signed, body, 100)).toEqual({ status: 'transport_failure' });
  });
});

