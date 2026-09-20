import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import type { ResearchAuthorization } from './authorization';
import { ResearchRequestError } from './research-request';
import { ChainSummarySchema, chainStatusSchema, type ChainSummary } from './chain-types';

const uuid = z.string().uuid();
const taskIdRow = z.object({ id: uuid });
const runRow = z.object({ id: uuid, state: chainStatusSchema });

type Authority = Extract<ResearchAuthorization, { status: 'authorized' }>;
type DownstreamMode = 'reel_analysis' | 'content_calendar';
type DownstreamTaskTable = 'reel_analysis_tasks' | 'content_calendar_tasks';

/**
 * The page only ever learns Omar's runId. Everything downstream of it was
 * created by a database trigger (migrations 20260918070000 and
 * 20260918070100), which stamps the new agent_runs row's input_snapshot with
 * `{ source_task_id, source_attempt_id }` pointing at the upstream task it
 * fired from — read directly out of those migrations' `insert into
 * public.agent_runs(...)` statements, not assumed. This walks that
 * breadcrumb one hop at a time: Omar's task id finds Ziad's run, and Ziad's
 * own task id (recovered the same way readReelAnalysisRun does) finds
 * Nour's run in turn.
 *
 * Every lookup is scoped to this tenant and requester, exactly like the
 * per-stage read modules: the upstream task lookup already requires
 * (tenant_id, requester_id, run_id) to match, and each downstream task is
 * re-verified against the same pair before its run is ever reported. A run
 * this requester could not already reach through its own upstream task
 * cannot surface here either.
 */
export async function readWorkflowChain(researchRunId: string, authorization: Authority): Promise<ChainSummary> {
  if (!uuid.safeParse(researchRunId).success) throw new ResearchRequestError('invalid_contract', 400);
  const client = await createClient();
  if (!client) throw new ResearchRequestError('persistence_failure', 503, true);
  const tenantId = authorization.tenantId;
  const requesterId = authorization.requesterId;

  const researchTask = await client.from('agent_tasks').select('id')
    .eq('tenant_id', tenantId).eq('requester_id', requesterId).eq('run_id', researchRunId).maybeSingle();
  if (researchTask.error) throw new ResearchRequestError('persistence_failure', 503, true);
  if (!researchTask.data) throw new ResearchRequestError('unauthorized', 404);
  const omarTaskId = taskIdRow.parse(researchTask.data).id;

  const reelAnalysis = await downstreamStage(client, tenantId, requesterId, 'reel_analysis', 'reel_analysis_tasks', omarTaskId);
  const contentCalendar = reelAnalysis
    ? await downstreamStage(client, tenantId, requesterId, 'content_calendar', 'content_calendar_tasks', reelAnalysis.taskId)
    : null;

  return ChainSummarySchema.parse({
    researchRunId,
    reelAnalysis: reelAnalysis ? { runId: reelAnalysis.runId, status: reelAnalysis.status } : null,
    contentCalendar: contentCalendar ? { runId: contentCalendar.runId, status: contentCalendar.status } : null,
  });
}

async function downstreamStage(client: SupabaseClient, tenantId: string, requesterId: string,
  mode: DownstreamMode, taskTable: DownstreamTaskTable, sourceTaskId: string) {
  const run = await client.from('agent_runs').select('id,state')
    .eq('tenant_id', tenantId).eq('mode', mode).eq('input_snapshot->>source_task_id', sourceTaskId).maybeSingle();
  if (run.error) throw new ResearchRequestError('persistence_failure', 503, true);
  if (!run.data) return null;
  const candidate = runRow.parse(run.data);
  // The trigger always copies the original requester onto the new task row
  // (see research_task.requester_id / reel_task.requester_id in the fan-out
  // migrations), so this must match whenever the run was truly reached
  // through this requester's own upstream task. A mismatch means the run's
  // lineage does not attest what this discovery path assumed.
  const task = await client.from(taskTable).select('id')
    .eq('tenant_id', tenantId).eq('requester_id', requesterId).eq('run_id', candidate.id).maybeSingle();
  if (task.error) throw new ResearchRequestError('persistence_failure', 503, true);
  if (!task.data) throw new ResearchRequestError('invalid_contract', 503);
  return { runId: candidate.id, status: candidate.state, taskId: taskIdRow.parse(task.data).id };
}
