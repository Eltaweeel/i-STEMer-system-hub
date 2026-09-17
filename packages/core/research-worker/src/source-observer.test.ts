import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { IncomingMessage, type ClientRequest, type IncomingHttpHeaders } from 'node:http';
import type { RequestOptions } from 'node:https';
import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeSource } from './source-observer.js';
import type { SourceNetwork } from './public-source.js';

const now = Date.parse('2026-09-16T12:00:00Z');
const source = 'https://research.example.org/about';
const task = {
  contractVersion: 'research.v1', taskId: '10000000-0000-4000-8000-000000000001',
  runId: '10000000-0000-4000-8000-000000000002', attemptId: '10000000-0000-4000-8000-000000000003',
  tenantId: '10000000-0000-4000-8000-000000000004', requesterId: '10000000-0000-4000-8000-000000000005',
  agentId: 'competitor_analyst', allowedScope: ['research:read'], liveEffects: false,
  issuedAt: '2026-09-16T11:59:00Z', expiresAt: '2026-09-16T12:04:00Z',
  brief: { idempotencyKey: '10000000-0000-4000-8000-000000000006', objective: 'Compare education programs', sources: [source] },
};

// Only OS/network boundaries are doubled. The parser, contracts, timing policy,
// address filtering, stream limits and receipt generation remain real.
function networkFixture(input: { body?: string | Buffer; status?: number; headers?: IncomingHttpHeaders } = {}) {
  const response = new IncomingMessage(new Socket());
  response.statusCode = input.status ?? 200;
  response.headers = input.headers ?? { 'content-type': 'text/html; charset=utf-8' };
  const requests: RequestOptions[] = [];
  const request = ((options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    requests.push(options);
    return Object.assign(new EventEmitter(), { end() {
      queueMicrotask(() => {
        callback(response);
        response.push(input.body ?? '<h1>Robotics &amp; science</h1>');
        response.push(null);
      });
    } }) as ClientRequest;
  }) as SourceNetwork['request'];
  const resolve = vi.fn<SourceNetwork['resolve']>().mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
  return { io: { request, resolve }, requests, response };
}

function inspect(network: SourceNetwork, sourceUrl = source) {
  return observeSource({ task: { ...task, brief: { ...task.brief, sources: [sourceUrl] } },
    sourceUrl, now: () => now, signal: new AbortController().signal, network });
}

afterEach(() => vi.useRealTimers());

describe('trusted source observation', () => {
  it('records retrieved static text, removes executable content, and hashes the exact excerpt', async () => {
    const fixture = networkFixture({ body: '<head><title>ignore</title></head><h1>Robotics &amp; science</h1>'
      + '<script>doBadThings()</script><style>secret</style><template><div>hidden</div></template><p>ورش تعليمية</p>' });
    const observation = await inspect(fixture.io);
    expect(observation.status).toBe('inspected');
    if (observation.status !== 'inspected') throw new Error('missing_inspection');
    expect(observation.snapshot.text).toBe('Robotics & science ورش تعليمية');
    expect(observation.snapshot.receipt).toMatchObject({ tenantId: task.tenantId, taskId: task.taskId,
      attemptId: task.attemptId, runId: task.runId, sourceUrl: source, inspectedAt: new Date(now).toISOString(),
      contentHash: createHash('sha256').update(observation.snapshot.text).digest('hex') });
    expect(observation.gaps).toEqual(['Static HTTP text only; no authenticated access, browser rendering, images, video or engagement verification.']);
    expect(fixture.response.destroyed).toBe(true);
    const options = fixture.requests[0]!;
    expect(options).toMatchObject({ hostname: 'research.example.org', servername: 'research.example.org',
      family: 4, agent: false, rejectUnauthorized: true, port: 443, method: 'GET', path: '/about' });
    expect(options.headers).toEqual({ Accept: 'text/html, text/plain', 'Accept-Encoding': 'identity',
      'User-Agent': 'BusinessAgentOS-Research/1.0', Connection: 'close' });
    const pinned = await new Promise((resolve, reject) => options.lookup!('research.example.org', {}, (error, address) => {
      if (error) reject(error); else resolve(address);
    }));
    expect(pinned).toBe('93.184.215.14');
  });

  it.each(['https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://[::1]/',
    'https://[::ffff:127.0.0.1]/', 'https://localhost/', 'https://app.internal/',
    'https://example.org:444/', 'https://example.org./', 'https://example.org/#fragment',
  ])('rejects unsupported target %s before DNS or a socket', async (url) => {
    const fixture = networkFixture();
    expect(await inspect(fixture.io, url)).toMatchObject({ status: 'uninspected', code: 'unsupported_url' });
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.io.resolve).not.toHaveBeenCalled();
  });

  it.each(['0.1.2.3', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.0.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '255.255.255.255', '::ffff:127.0.0.1',
  ])('rejects DNS containing reserved address %s even with a public answer', async (address) => {
    const fixture = networkFixture();
    fixture.io.resolve.mockResolvedValue([{ address: '93.184.215.14', family: 4 }, { address, family: 4 }]);
    expect(await inspect(fixture.io)).toMatchObject({ status: 'uninspected', code: 'blocked_address' });
    expect(fixture.requests).toHaveLength(0);
  });

  it.each([
    { status: 302, headers: { location: 'https://127.0.0.1/' }, code: 'redirect' },
    { status: 401, code: 'http_status' },
    { headers: { 'content-type': 'application/json' }, code: 'unsupported_content' },
    { headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, code: 'unsupported_content' },
    { headers: { 'content-type': 'text/plain; charset=windows-1252' }, code: 'unsupported_content' },
    { body: Buffer.from([0xff]), code: 'unsupported_content' },
    { body: '<script>not evidence</script>', code: 'empty_content' },
    { body: 'x'.repeat(1024 * 1024 + 1), code: 'too_large' },
  ])('returns a gap without a receipt for $code ($status)', async ({ code, ...input }) => {
    const fixture = networkFixture(input);
    const observation = await inspect(fixture.io);
    expect(observation).toEqual({ status: 'uninspected', sourceUrl: source, code,
      gaps: [`Source not inspected (${code}): ${source}`] });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.response.destroyed).toBe(true);
  });

  it('marks truncation and does not split a Unicode character at the excerpt cap', async () => {
    const fixture = networkFixture({ body: 'x'.repeat(15999) + '🔬more', headers: { 'content-type': 'text/plain' } });
    const observation = await inspect(fixture.io);
    if (observation.status !== 'inspected') throw new Error('missing_inspection');
    expect(observation.snapshot.text).toBe('x'.repeat(15999));
    expect(observation.gaps[1]).toBe(`Source excerpt truncated to 15999 characters: ${source}`);
    expect(observation.snapshot.receipt.contentHash).toBe(createHash('sha256').update('x'.repeat(15999)).digest('hex'));
  });

  it('times out unresolved DNS and never opens a socket when DNS finishes late', async () => {
    vi.useFakeTimers();
    const fixture = networkFixture();
    let finishDns!: (addresses: { address: string; family: number }[]) => void;
    fixture.io.resolve.mockReturnValue(new Promise((resolve) => { finishDns = resolve; }));
    const pending = inspect(fixture.io);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({ status: 'uninspected', code: 'timeout' });
    finishDns([{ address: '93.184.215.14', family: 4 }]);
    await Promise.resolve();
    expect(fixture.requests).toHaveLength(0);
  });

  it('cancels a hanging HTTPS connection and returns no receipt', async () => {
    vi.useFakeTimers();
    const fixture = networkFixture();
    fixture.io.request = ((options: RequestOptions) => {
      const outgoing = Object.assign(new EventEmitter(), { end() {} });
      options.signal!.addEventListener('abort', () => outgoing.emit('error', new Error('ABORT_ERR')), { once: true });
      return outgoing as ClientRequest;
    }) as SourceNetwork['request'];
    const pending = inspect(fixture.io);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({ status: 'uninspected', code: 'timeout' });
  });

  it('rejects an out-of-scope URL and an expired task without any request', async () => {
    const fixture = networkFixture();
    const input = { task, now: () => now, signal: new AbortController().signal, network: fixture.io };
    await expect(observeSource({ ...input, sourceUrl: 'https://other.example.org/' })).rejects.toThrow('source_outside_task');
    await expect(observeSource({ ...input, sourceUrl: source, now: () => Date.parse(task.expiresAt) })).rejects.toThrow('task_outside_lease');
    expect(fixture.requests).toHaveLength(0);
  });

  it('does not issue a receipt if the lease expires while retrieving text', async () => {
    const fixture = networkFixture();
    const clock = vi.fn().mockReturnValueOnce(now).mockReturnValue(Date.parse(task.expiresAt));
    expect(await observeSource({ task, sourceUrl: source, now: clock,
      signal: new AbortController().signal, network: fixture.io })).toMatchObject({ status: 'uninspected', code: 'timeout' });
  });
});
