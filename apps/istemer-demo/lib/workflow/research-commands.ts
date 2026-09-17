import 'server-only';
import { z } from 'zod';
import { ResearchBriefSchema } from '@bagos/contracts';
import { createClient } from '../supabase/server';
import { ResearchRequestError } from './research-request';

const acceptedBriefSchema = z.object({
  contractVersion: z.literal('research.v1'), taskId: z.string().uuid(), runId: z.string().uuid(),
  tenantId: z.string().uuid(), requesterId: z.string().uuid(), briefRevisionId: z.string().uuid(),
  liveEffects: z.literal(false),
}).strict();
const acceptedRetrySchema = z.object({ status: z.literal('retry_requested'), runId: z.string().uuid() }).strict();
const researchRetrySchema = z.object({ attemptId: z.string().uuid() }).strict();

async function researchCommand(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  const client = await createClient();
  if (!client) throw new ResearchRequestError('persistence_failure', 503, true);
  const response = await client.rpc(name, parameters);
  if (response.error) {
    if (response.error.code === '42501') throw new ResearchRequestError('unauthorized', 403);
    if (response.error.message === 'idempotency_conflict') throw new ResearchRequestError('idempotency_conflict', 409);
    if (response.error.message === 'not_retryable' || response.error.message === 'stale_attempt') {
      throw new ResearchRequestError('stale_attempt', 409);
    }
    if (response.error.code === '22023') throw new ResearchRequestError('invalid_contract', 400);
    throw new ResearchRequestError('persistence_failure', 503, true);
  }
  return response.data;
}

export async function submitResearchBrief(input: unknown, tenantId: string) {
  const brief = ResearchBriefSchema.safeParse(input);
  if (!brief.success) throw new ResearchRequestError('invalid_contract', 400);
  return acceptedBriefSchema.parse(await researchCommand('submit_research_brief', { brief: brief.data, expected_tenant: tenantId }));
}

export async function requestResearchRetry(input: unknown, tenantId: string) {
  const retry = researchRetrySchema.safeParse(input);
  if (!retry.success) throw new ResearchRequestError('invalid_contract', 400);
  return acceptedRetrySchema.parse(await researchCommand('retry_research_attempt', {
    wanted_attempt: retry.data.attemptId, expected_tenant: tenantId,
  }));
}
