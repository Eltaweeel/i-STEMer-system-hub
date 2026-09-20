import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const tenantId = '00000000-0000-4000-8000-000000000001';
const requesterId = '00000000-0000-4000-8000-000000000002';
const otherRequesterId = '00000000-0000-4000-8000-000000000099';
const researchRunId = '00000000-0000-4000-8000-000000000003';
const omarTaskId = '00000000-0000-4000-8000-000000000004';
const reelRunId = '00000000-0000-4000-8000-000000000005';
const reelTaskId = '00000000-0000-4000-8000-000000000006';
const calendarRunId = '00000000-0000-4000-8000-000000000007';
const calendarTaskId = '00000000-0000-4000-8000-000000000008';

const boundary = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  failingTable: null as string | null,
}));

// Doubles only the PostgREST boundary, matching the other read-module suites;
// the real filter semantics this module depends on (tenant + requester scoping)
// are reproduced faithfully by matching every applied .eq() against the row.
vi.mock('../lib/supabase/server', () => ({ createClient: async () => ({
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    const read = async () => (boundary.failingTable === table
      ? { data: null, error: { message: 'boom' } }
      : { data: (boundary.rows[table] ?? []).find((row) => filters.every(([column, value]) => row[column] === value)) ?? null, error: null });
    const query = { select: () => query, eq: (column: string, value: unknown) => { filters.push([column, value]); return query; }, maybeSingle: read, single: read };
    return query;
  },
}) }));

const { readWorkflowChain } = await import('../lib/workflow/chain-read');
const authorization = { status: 'authorized' as const, tenantId, requesterId,
  agentId: 'competitor_analyst' as const, allowedScope: ['research:read'] as const, liveEffects: false as const };

function omarTask(owner = requesterId) {
  return { id: omarTaskId, tenant_id: tenantId, requester_id: owner, run_id: researchRunId };
}
function downstreamRun(id: string, mode: string, sourceTaskId: string, state = 'succeeded') {
  return { id, state, tenant_id: tenantId, mode, 'input_snapshot->>source_task_id': sourceTaskId };
}
function downstreamTask(id: string, runId: string, owner = requesterId) {
  return { id, tenant_id: tenantId, requester_id: owner, run_id: runId };
}

beforeEach(() => {
  boundary.rows = {};
  boundary.failingTable = null;
});

describe('readWorkflowChain', () => {
  it('walks the trigger breadcrumb to both downstream runs', async () => {
    boundary.rows = {
      agent_tasks: [omarTask()],
      agent_runs: [downstreamRun(reelRunId, 'reel_analysis', omarTaskId),
        downstreamRun(calendarRunId, 'content_calendar', reelTaskId, 'running')],
      reel_analysis_tasks: [downstreamTask(reelTaskId, reelRunId)],
      content_calendar_tasks: [downstreamTask(calendarTaskId, calendarRunId)],
    };
    expect(await readWorkflowChain(researchRunId, authorization)).toEqual({
      researchRunId,
      reelAnalysis: { runId: reelRunId, status: 'succeeded' },
      contentCalendar: { runId: calendarRunId, status: 'running' },
    });
  });

  it('reports nulls for stages the triggers have not created yet', async () => {
    boundary.rows = { agent_tasks: [omarTask()], agent_runs: [] };
    expect(await readWorkflowChain(researchRunId, authorization)).toEqual({
      researchRunId, reelAnalysis: null, contentCalendar: null,
    });
  });

  it('stops at Ziad when Nour has not been enqueued', async () => {
    boundary.rows = {
      agent_tasks: [omarTask()],
      agent_runs: [downstreamRun(reelRunId, 'reel_analysis', omarTaskId)],
      reel_analysis_tasks: [downstreamTask(reelTaskId, reelRunId)],
    };
    const summary = await readWorkflowChain(researchRunId, authorization);
    expect(summary.reelAnalysis).toEqual({ runId: reelRunId, status: 'succeeded' });
    expect(summary.contentCalendar).toBeNull();
  });

  it('denies a research run belonging to another requester in the same tenant', async () => {
    boundary.rows = { agent_tasks: [omarTask(otherRequesterId)] };
    await expect(readWorkflowChain(researchRunId, authorization)).rejects.toMatchObject({ httpStatus: 404, code: 'unauthorized' });
  });

  it('fails closed when a downstream run has no task owned by this requester', async () => {
    boundary.rows = {
      agent_tasks: [omarTask()],
      agent_runs: [downstreamRun(reelRunId, 'reel_analysis', omarTaskId)],
      reel_analysis_tasks: [downstreamTask(reelTaskId, reelRunId, otherRequesterId)],
    };
    await expect(readWorkflowChain(researchRunId, authorization)).rejects.toMatchObject({ code: 'invalid_contract' });
  });

  it('rejects a malformed run id before touching the database', async () => {
    await expect(readWorkflowChain('not-a-uuid', authorization)).rejects.toMatchObject({ httpStatus: 400, code: 'invalid_contract' });
  });

  it('reports a persistence failure rather than an empty chain when a lookup errors', async () => {
    boundary.rows = { agent_tasks: [omarTask()] };
    boundary.failingTable = 'agent_runs';
    await expect(readWorkflowChain(researchRunId, authorization)).rejects.toMatchObject({ code: 'persistence_failure' });
  });
});
