import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ReelAnalysisArtifactSchema, ReelAnalysisRunViewSchema } from '@bagos/contracts';
import { createClient } from '../supabase/server';
import { ReelAnalysisRequestError } from './reel-analysis-request';

const taskRow = z.object({ id: z.string().uuid(), brief_revision_id: z.string().uuid() });
const attemptRow = z.object({ id: z.string().uuid(), state: z.enum(['running', 'failed', 'succeeded']),
  retryable: z.boolean(), error_code: z.string().nullable(), retry_requested_at: z.string().nullable() });
const briefBodyRow = z.object({ brief: z.object({ sourceRevisionId: z.string().uuid() }).passthrough() }).passthrough();
type Authority = { status: 'authorized'; tenantId: string; requesterId: string };

export async function readReelAnalysisRun(runId: string, authorization: Authority) {
  if (!z.string().uuid().safeParse(runId).success) throw new ReelAnalysisRequestError('invalid_contract', 400);
  const client = await createClient();
  if (!client) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  const tenantId = authorization.tenantId;
  const taskResponse = await client.from('reel_analysis_tasks').select('id,brief_revision_id')
    .eq('tenant_id', tenantId).eq('requester_id', authorization.requesterId).eq('run_id', runId).maybeSingle();
  if (taskResponse.error) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  if (!taskResponse.data) throw new ReelAnalysisRequestError('unauthorized', 404);
  const task = taskRow.parse(taskResponse.data);
  const runResponse = await client.from('agent_runs').select('state').eq('tenant_id', tenantId).eq('id', runId).eq('mode', 'reel_analysis').single();
  if (runResponse.error) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  const status = ReelAnalysisRunViewSchema.shape.status.parse(runResponse.data.state);
  const attempt = await latestReelAnalysisAttempt(client, tenantId, task.id);
  const completed = status === 'succeeded' ? await completedReelAnalysisArtifact(client, tenantId, task.id) : { artifact: null, revisionId: null };
  if (completed.artifact) {
    // The task's own brief_revision_id names Ziad's brief document, not Omar's
    // revision; the revision Ziad must cite lives one level deeper, inside that
    // brief's stored body, exactly where the claim and completion commands read it.
    const expectedSourceRevisionId = await reelAnalysisSourceRevisionId(client, tenantId, task.brief_revision_id);
    if (completed.artifact.runId !== runId || completed.artifact.taskId !== task.id
      || completed.artifact.tenantId !== tenantId || completed.artifact.sourceRevisionId !== expectedSourceRevisionId
      || completed.artifact.attemptId !== attempt?.id || attempt.state !== 'succeeded') {
      throw new ReelAnalysisRequestError('invalid_contract', 503);
    }
  }
  return ReelAnalysisRunViewSchema.parse({ contractVersion: 'reel-analysis.v1', runId, taskId: task.id,
    status, attempt, ...completed, liveEffects: false });
}

async function latestReelAnalysisAttempt(client: SupabaseClient, tenantId: string, taskId: string) {
  const response = await client.from('reel_analysis_attempts').select('id,state,retryable,error_code,retry_requested_at')
    .eq('tenant_id', tenantId).eq('task_id', taskId).order('attempt_number', { ascending: false }).limit(1).maybeSingle();
  if (response.error) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  if (!response.data) return null;
  const attempt = attemptRow.parse(response.data);
  return { id: attempt.id, state: attempt.state, errorCode: attempt.error_code,
    retryable: attempt.retryable && attempt.retry_requested_at === null };
}

async function completedReelAnalysisArtifact(client: SupabaseClient, tenantId: string, taskId: string) {
  const outcome = await client.from('reel_analysis_outcomes').select('artifact_revision_id')
    .eq('tenant_id', tenantId).eq('task_id', taskId).single();
  if (outcome.error) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  const revisionId = z.string().uuid().parse(outcome.data.artifact_revision_id);
  const body = await client.from('reel_analysis_revision_bodies').select('body')
    .eq('tenant_id', tenantId).eq('revision_id', revisionId).single();
  if (body.error) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  return { artifact: ReelAnalysisArtifactSchema.parse(body.data.body), revisionId };
}

async function reelAnalysisSourceRevisionId(client: SupabaseClient, tenantId: string, briefRevisionId: string) {
  const response = await client.from('reel_analysis_revision_bodies').select('body')
    .eq('tenant_id', tenantId).eq('revision_id', briefRevisionId).single();
  if (response.error) throw new ReelAnalysisRequestError('persistence_failure', 503, true);
  const parsed = briefBodyRow.safeParse(response.data.body);
  if (!parsed.success) throw new ReelAnalysisRequestError('invalid_contract', 503);
  return parsed.data.brief.sourceRevisionId;
}
