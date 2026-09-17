import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ResearchArtifactSchema, ResearchRunViewSchema } from '@bagos/contracts';
import { createClient } from '../supabase/server';
import type { ResearchAuthorization } from './authorization';
import { ResearchRequestError } from './research-request';

const taskRow = z.object({ id: z.string().uuid(), brief_revision_id: z.string().uuid() });
const attemptRow = z.object({ id: z.string().uuid(), state: z.enum(['running', 'failed', 'succeeded']),
  retryable: z.boolean(), error_code: z.string().nullable(), retry_requested_at: z.string().nullable() });
type Authority = Extract<ResearchAuthorization, { status: 'authorized' }>;

export async function readResearchRun(runId: string, authorization: Authority) {
  if (!z.string().uuid().safeParse(runId).success) throw new ResearchRequestError('invalid_contract', 400);
  const client = await createClient();
  if (!client) throw new ResearchRequestError('persistence_failure', 503, true);
  const tenantId = authorization.tenantId;
  const taskResponse = await client.from('agent_tasks').select('id,brief_revision_id')
    .eq('tenant_id', tenantId).eq('requester_id', authorization.requesterId).eq('run_id', runId).maybeSingle();
  if (taskResponse.error) throw new ResearchRequestError('persistence_failure', 503, true);
  if (!taskResponse.data) throw new ResearchRequestError('unauthorized', 404);
  const task = taskRow.parse(taskResponse.data);
  const runResponse = await client.from('agent_runs').select('state').eq('tenant_id', tenantId).eq('id', runId).eq('mode', 'research').single();
  if (runResponse.error) throw new ResearchRequestError('persistence_failure', 503, true);
  const status = ResearchRunViewSchema.shape.status.parse(runResponse.data.state);
  const attempt = await latestResearchAttempt(client, tenantId, task.id);
  const completed = status === 'succeeded' ? await completedResearchArtifact(client, tenantId, task.id) : { artifact: null, revisionId: null };
  if (completed.artifact && (completed.artifact.runId !== runId || completed.artifact.taskId !== task.id
    || completed.artifact.tenantId !== tenantId || completed.artifact.sourceRevisionIds.length !== 1
    || completed.artifact.sourceRevisionIds[0] !== task.brief_revision_id
    || completed.artifact.attemptId !== attempt?.id || attempt.state !== 'succeeded')) throw new ResearchRequestError('invalid_contract', 503);
  return ResearchRunViewSchema.parse({ contractVersion: 'research.v1', runId, taskId: task.id,
    status, attempt, ...completed, liveEffects: false });
}

async function latestResearchAttempt(client: SupabaseClient, tenantId: string, taskId: string) {
  const response = await client.from('research_attempts').select('id,state,retryable,error_code,retry_requested_at')
    .eq('tenant_id', tenantId).eq('task_id', taskId).order('attempt_number', { ascending: false }).limit(1).maybeSingle();
  if (response.error) throw new ResearchRequestError('persistence_failure', 503, true);
  if (!response.data) return null;
  const attempt = attemptRow.parse(response.data);
  return { id: attempt.id, state: attempt.state, errorCode: attempt.error_code,
    retryable: attempt.retryable && attempt.retry_requested_at === null };
}

async function completedResearchArtifact(client: SupabaseClient, tenantId: string, taskId: string) {
  const outcome = await client.from('research_outcomes').select('artifact_revision_id')
    .eq('tenant_id', tenantId).eq('task_id', taskId).single();
  if (outcome.error) throw new ResearchRequestError('persistence_failure', 503, true);
  const revisionId = z.string().uuid().parse(outcome.data.artifact_revision_id);
  const body = await client.from('research_revision_bodies').select('body')
    .eq('tenant_id', tenantId).eq('revision_id', revisionId).single();
  if (body.error) throw new ResearchRequestError('persistence_failure', 503, true);
  return { artifact: ResearchArtifactSchema.parse(body.data.body), revisionId };
}
