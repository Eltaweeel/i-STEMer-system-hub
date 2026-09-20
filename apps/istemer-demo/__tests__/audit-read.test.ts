import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const actorReference = '00000000-0000-4000-8000-000000000002';
const targetReference = '00000000-0000-4000-8000-000000000003';
const commandId = '00000000-0000-4000-8000-000000000004';

const boundary = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], error: null as { code: string } | null }));

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010', tenant_id: tenantId, actor_kind: 'human',
    actor_reference: actorReference, event_type: 'agent_workflow_created', target_reference: targetReference,
    target_revision: 1, command_id: commandId, created_at: '2026-09-20T00:00:00.000Z', ...overrides,
  };
}

// Doubles only the PostgREST boundary, matching the other read-module suites.
// .order() and .limit() are recorded but do not reorder/reshape `boundary.rows`
// -- each test supplies rows already in the order the production query would
// return them, since the ordering itself is the database's job, not this
// module's.
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  from: (table: string) => {
    if (table !== 'audit_log') throw new Error(`unexpected table ${table}`);
    const filters: [string, unknown][] = [];
    const resolve = async () => (boundary.error
      ? { data: null, error: boundary.error }
      : { data: boundary.rows.filter((candidate) => filters.every(([column, value]) => candidate[column] === value)), error: null });
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      order: () => query,
      limit: resolve,
    };
    return query;
  },
}) }));

const { readTenantAuditLog } = await import('../lib/workflow/audit-read');

beforeEach(() => { boundary.rows = [row()]; boundary.error = null; });

describe('readTenantAuditLog', () => {
  it('returns entries newest first, parsed into the client-safe shape', async () => {
    boundary.rows = [
      row({ id: '00000000-0000-4000-8000-000000000011', event_type: 'research_attempt_completed', created_at: '2026-09-20T02:00:00.000Z' }),
      row({ id: '00000000-0000-4000-8000-000000000010', event_type: 'agent_workflow_created', created_at: '2026-09-20T01:00:00.000Z' }),
    ];
    const result = await readTenantAuditLog(tenantId);
    expect(result.schemaVersion).toBe(1);
    expect(result.entries.map((entry) => entry.eventType)).toEqual(['research_attempt_completed', 'agent_workflow_created']);
    expect(result.entries[0]!.actorReference).toBe(actorReference);
    expect(result.entries[0]!.targetRevision).toBe(1);
  });

  it('returns an explicit empty result for a tenant with no history, not an error', async () => {
    boundary.rows = [];
    const result = await readTenantAuditLog(tenantId);
    expect(result.entries).toEqual([]);
  });

  it('surfaces a database error as a persistence failure rather than an empty list', async () => {
    boundary.error = { code: '57014' };
    await expect(readTenantAuditLog(tenantId)).rejects.toMatchObject({ code: 'persistence_failure', httpStatus: 503 });
  });

  it('rejects a malformed tenant id before touching the database', async () => {
    await expect(readTenantAuditLog('not-a-uuid')).rejects.toMatchObject({ code: 'invalid_contract', httpStatus: 400 });
  });

  it('still returns an entry whose event type is not one this codebase recognises', async () => {
    boundary.rows = [row({ event_type: 'a_future_command_nobody_has_written_yet' })];
    const result = await readTenantAuditLog(tenantId);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.eventType).toBe('a_future_command_nobody_has_written_yet');
  });

  it('scopes the query to the requested tenant', async () => {
    boundary.rows = [row({ tenant_id: '00000000-0000-4000-8000-000000000099' })];
    const result = await readTenantAuditLog(tenantId);
    expect(result.entries).toEqual([]);
  });
});
