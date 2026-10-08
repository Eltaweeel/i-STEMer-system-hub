import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createSqlResearchCommandPort, type SqlClient } from '../lib/workflow/research-command-port';
import { assertDatabaseUrlUsesTls, buildResearchWorkerConfig, describeCycle, loadWorkerRuntimeConfig } from '../lib/workflow/research-worker-runtime';

const attempt = '30000000-0000-4000-8000-000000000001';
const noRows = (): SqlClient => ({ query: vi.fn().mockResolvedValue({ rows: [] }) });

describe('createSqlResearchCommandPort', () => {
  it('calls only fixed, parameterized private commands', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result: { status: 'ok' } }] });
    const port = createSqlResearchCommandPort({ query });
    await port.claim();
    await port.fail(attempt, 'timeout');
    await port.complete(attempt, { a: 1 } as never, [{ b: 2 }] as never);
    await port.recordUsage(attempt, 42);
    const statements = query.mock.calls.map(([text]) => text as string);
    expect(statements).toEqual([
      'select private.claim_research_task() as result',
      'select private.fail_research_attempt($1::uuid, $2::text) as result',
      'select private.complete_research_attempt($1::uuid, $2::jsonb, $3::jsonb) as result',
      'select private.record_agent_usage($1::uuid, $2::text, $3::integer, $4::boolean) as result',
    ]);
    expect(query.mock.calls[2]![1]).toEqual([attempt, '{"a":1}', '[{"b":2}]']);
    expect(query.mock.calls[3]![1]).toEqual([attempt, 'competitor_analyst', 42, true]);
  });

  it('returns the command result, or null when nothing is claimable', async () => {
    expect(await createSqlResearchCommandPort({ query: vi.fn().mockResolvedValue({ rows: [{ result: { status: 'claimed' } }] }) }).claim())
      .toEqual({ status: 'claimed' });
    expect(await createSqlResearchCommandPort(noRows()).claim()).toBeNull();
  });

  it('records unreported usage as unreported, never as a measured zero', async () => {
    const client = noRows();
    await createSqlResearchCommandPort(client).recordUsage(attempt, null);
    expect(vi.mocked(client.query).mock.calls[0]![1]).toEqual([attempt, 'competitor_analyst', null, false]);
  });

  it('refuses malformed identifiers and token figures before touching the database', async () => {
    const client = noRows();
    const port = createSqlResearchCommandPort(client);
    expect(() => port.fail("x'; drop table y;--", 'timeout')).toThrow('invalid_attempt_id');
    expect(() => port.recordUsage(attempt, -1)).toThrow('invalid_reported_tokens');
    expect(() => port.recordUsage(attempt, 1.5)).toThrow('invalid_reported_tokens');
    expect(() => port.recordUsage(attempt, 2_147_483_648)).toThrow('invalid_reported_tokens');
    expect(client.query).not.toHaveBeenCalled();
  });

  it('propagates database errors so the worker can classify them', async () => {
    const port = createSqlResearchCommandPort({ query: vi.fn().mockRejectedValue(new Error('stale_attempt')) });
    await expect(port.complete(attempt, {} as never, [])).rejects.toThrow('stale_attempt');
  });
});

describe('worker runtime configuration', () => {
  const base = { RESEARCH_WORKER_DATABASE_URL_FILE: '/etc/istemer/db-url', RESEARCH_WORKER_SIGNING_KEY_FILE: '/etc/istemer/key',
    RESEARCH_WORKER_KEY_ID: 'worker-key', RESEARCH_WORKER_AGENT_PORT: '8787',
    RESEARCH_WORKER_APPROVED_SOURCES: 'https://www.engineeringforkids.com/international-locations/egypt/' };

  it('loads required values and applies bounded defaults', () => {
    expect(loadWorkerRuntimeConfig(base)).toEqual({ databaseUrlFile: '/etc/istemer/db-url', signingKeyFile: '/etc/istemer/key',
      keyId: 'worker-key', agentPort: 8787, intervalMs: 5000, dispatchTimeoutMs: 200000,
      approvedSources: new Set(['https://www.engineeringforkids.com/international-locations/egypt/']) });
  });

  it.each([
    [{ RESEARCH_WORKER_DATABASE_URL_FILE: '' }, 'RESEARCH_WORKER_DATABASE_URL_FILE'],
    [{ RESEARCH_WORKER_SIGNING_KEY_FILE: 'key.bin' }, 'absolute'],
    [{ RESEARCH_WORKER_DATABASE_URL_FILE: 'db.txt' }, 'absolute'],
    [{ RESEARCH_WORKER_KEY_ID: 'bad id!' }, 'KEY_ID'],
    [{ RESEARCH_WORKER_AGENT_PORT: '80' }, 'AGENT_PORT'],
    [{ RESEARCH_WORKER_AGENT_PORT: 'abc' }, 'AGENT_PORT'],
    [{ RESEARCH_WORKER_INTERVAL_MS: '10' }, 'INTERVAL_MS'],
    [{ RESEARCH_WORKER_DISPATCH_TIMEOUT_MS: '999999' }, 'DISPATCH_TIMEOUT_MS'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: undefined }, 'at least one URL'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: '  ' }, 'at least one URL'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: 'http://www.engineeringforkids.com/international-locations/egypt/' }, 'canonical https'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: 'https://user:pw@example.org/a' }, 'canonical https'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: 'https://example.org:8443/a' }, 'canonical https'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: 'https://example.org/a#frag' }, 'canonical https'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: 'https://EXAMPLE.org/a' }, 'canonical https'],
    [{ RESEARCH_WORKER_APPROVED_SOURCES: 'not-a-url' }, 'entry 1 is not a URL'],
  ])('rejects invalid configuration %j', (override, message) => {
    expect(() => loadWorkerRuntimeConfig({ ...base, ...override })).toThrow(message);
  });

  it('never accepts secret values through the environment names it reads', () => {
    expect(Object.keys(loadWorkerRuntimeConfig(base))).not.toContain('databaseUrl');
  });

  it('wires loopback-only dispatch and refuses a short signing key', () => {
    const runtime = loadWorkerRuntimeConfig(base);
    const port = createSqlResearchCommandPort(noRows());
    const config = buildResearchWorkerConfig({ runtime, port, signingKey: new Uint8Array(32), now: () => 0 });
    expect(config.endpoint).toEqual({ hostname: '127.0.0.1', port: 8787 });
    expect(config.dispatchTimeoutMs).toBe(200000);
    expect([...config.approvedSources]).toEqual(['https://www.engineeringforkids.com/international-locations/egypt/']);
    expect(() => buildResearchWorkerConfig({ runtime, port, signingKey: new Uint8Array(16), now: () => 0 })).toThrow('32 bytes');
  });
});

describe('assertDatabaseUrlUsesTls', () => {
  it('accepts sslmode=verify-full', () => {
    expect(() => assertDatabaseUrlUsesTls('postgresql://u:p@db.example.com:5432/postgres?sslmode=verify-full')).not.toThrow();
  });
  it.each(['postgresql://u:p@db.example.com:5432/postgres', 'postgresql://u:p@db.example.com/postgres?sslmode=disable',
    'postgresql://u:p@db.example.com/postgres?sslmode=require', 'postgresql://u:p@db.example.com/postgres?sslmode=verify-ca',
    'postgresql://u:p@db.example.com/postgres?sslmode=verify-full&sslmode=disable',
    'postgresql://u:p@db.example.com/postgres?sslmode=verify-full&sslmode=no-verify',
    'postgresql://u:p@db.example.com/postgres?sslmode=verify-full&ssl=0',
    'postgresql://u:p@db.example.com/postgres?sslmode=prefer'])('refuses %s without leaking the URL', (url) => {
    expect(() => assertDatabaseUrlUsesTls(url)).toThrow(/sslmode=verify-full|repeat a parameter/);
    try { assertDatabaseUrlUsesTls(url); } catch (error) { expect(String((error as Error).message)).not.toContain('u:p'); }
  });
  it('refuses a value that is not a URL without echoing it', () => {
    expect(() => assertDatabaseUrlUsesTls('not a url secret-token')).toThrow(/valid PostgreSQL connection URL/);
  });
});

describe('describeCycle', () => {
  const ids = { runId: 'r', attemptId: 'a' };
  it('is silent for idle cycles and identifier-only otherwise', () => {
    expect(describeCycle({ outcome: 'idle' })).toBeNull();
    expect(describeCycle({ outcome: 'succeeded', ...ids })).toEqual({ event: 'cycle', outcome: 'succeeded', runId: 'r', attemptId: 'a' });
    expect(describeCycle({ outcome: 'failed', ...ids, code: 'timeout' })).toMatchObject({ code: 'timeout' });
    expect(describeCycle({ outcome: 'command_failed', ...ids, stage: 'complete' })).toMatchObject({ stage: 'complete' });
    expect(describeCycle({ outcome: 'lease_reclaimed', runId: 'r', code: 'timeout' })).toEqual({ event: 'cycle', outcome: 'lease_reclaimed', runId: 'r', code: 'timeout' });
  });
});
