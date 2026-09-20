import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const approvalId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';

const boundary = vi.hoisted(() => ({ data: null as unknown, error: null as { code: string } | null }));

vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  rpc: async () => ({ data: boundary.data, error: boundary.error }),
}) }));

const { readTenantApprovals } = await import('../lib/workflow/approvals-read');

function payload(row: Record<string, unknown> = {}, top: Record<string, unknown> = {}) {
  return { schemaVersion: 1, tenantId, viewerRole: 'owner', canDecide: true, ...top,
    approvals: [{ approvalId, stage: 'strategy', status: 'pending', artifactRevisionId: revisionId,
      contentDigest: 'a'.repeat(64), revision: 1, createdAt: '2026-09-20T00:00:00.000Z', ...row }] };
}

beforeEach(() => { boundary.data = payload(); boundary.error = null; });

describe('readTenantApprovals', () => {
  it('returns the pending approval with the digest a decision must echo back', async () => {
    const result = await readTenantApprovals(tenantId);
    expect(result.canDecide).toBe(true);
    expect(result.approvals[0]!.contentDigest).toBe('a'.repeat(64));
    expect(result.approvals[0]!.stage).toBe('strategy');
  });

  it('reports a non-owner as unable to decide while still listing the approval', async () => {
    boundary.data = payload({}, { viewerRole: 'operator', canDecide: false });
    const result = await readTenantApprovals(tenantId);
    expect(result.canDecide).toBe(false);
    expect(result.approvals).toHaveLength(1);
  });

  it('accepts every settled status the command can record', async () => {
    for (const status of ['approved', 'rejected', 'invalidated'] as const) {
      boundary.data = payload({ status });
      expect((await readTenantApprovals(tenantId)).approvals[0]!.status).toBe(status);
    }
  });

  it('rejects a status outside the contract rather than rendering it', async () => {
    boundary.data = payload({ status: 'probably_fine' });
    await expect(readTenantApprovals(tenantId)).rejects.toMatchObject({ code: 'invalid_contract' });
  });

  it('surfaces a membership denial as unauthorized, never as an empty list', async () => {
    boundary.error = { code: '42501' };
    await expect(readTenantApprovals(tenantId)).rejects.toMatchObject({ code: 'unauthorized', httpStatus: 403 });
  });

  it('surfaces any other database error as a retryable persistence failure', async () => {
    boundary.error = { code: '57014' };
    await expect(readTenantApprovals(tenantId)).rejects.toMatchObject({ code: 'persistence_failure' });
  });

  it('rejects a malformed tenant id before calling the database', async () => {
    await expect(readTenantApprovals('not-a-uuid')).rejects.toMatchObject({ httpStatus: 400 });
  });
});
