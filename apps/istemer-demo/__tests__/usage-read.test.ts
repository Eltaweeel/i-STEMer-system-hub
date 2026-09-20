import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const viewerId = '00000000-0000-4000-8000-000000000002';

const boundary = vi.hoisted(() => ({
  data: null as unknown, error: null as { code: string } | null,
}));

vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  rpc: async () => ({ data: boundary.data, error: boundary.error }),
}) }));

const { readUsageSummary } = await import('../lib/workflow/usage-read');

function summary(member: Record<string, unknown> = {}) {
  return { schemaVersion: 1, tenantId, periodStart: '2026-09-01', viewerId, viewerRole: 'operator',
    providerBalance: 'unavailable',
    members: [{ userId: viewerId, role: 'operator', limitTokens: 400, consumedTokens: 100,
      unreportedRuns: 0, remainingTokens: 300, ...member }] };
}

beforeEach(() => { boundary.data = summary(); boundary.error = null; });

describe('readUsageSummary', () => {
  it('returns the parsed summary for a member', async () => {
    const result = await readUsageSummary(tenantId);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]!.remainingTokens).toBe(300);
  });

  it('carries the provider balance as an explicit unavailable state, never a number', async () => {
    expect((await readUsageSummary(tenantId)).providerBalance).toBe('unavailable');
    boundary.data = { ...summary(), providerBalance: 0 };
    await expect(readUsageSummary(tenantId)).rejects.toMatchObject({ code: 'invalid_contract' });
  });

  it('keeps an unconfigured allowance null rather than collapsing it to zero', async () => {
    boundary.data = summary({ limitTokens: null, remainingTokens: null });
    const member = (await readUsageSummary(tenantId)).members[0]!;
    expect(member.limitTokens).toBeNull();
    expect(member.remainingTokens).toBeNull();
  });

  it('keeps unreported runs distinct from consumed tokens', async () => {
    boundary.data = summary({ consumedTokens: 0, unreportedRuns: 3 });
    const member = (await readUsageSummary(tenantId)).members[0]!;
    expect(member.consumedTokens).toBe(0);
    expect(member.unreportedRuns).toBe(3);
  });

  it('surfaces a membership denial as unauthorized rather than an empty summary', async () => {
    boundary.error = { code: '42501' };
    await expect(readUsageSummary(tenantId)).rejects.toMatchObject({ code: 'unauthorized', httpStatus: 403 });
  });

  it('surfaces any other database error as a retryable persistence failure', async () => {
    boundary.error = { code: '57014' };
    await expect(readUsageSummary(tenantId)).rejects.toMatchObject({ code: 'persistence_failure' });
  });

  it('rejects a malformed tenant id before calling the database', async () => {
    await expect(readUsageSummary('not-a-uuid')).rejects.toMatchObject({ httpStatus: 400 });
  });
});
