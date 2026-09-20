import 'server-only';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { ResearchRequestError } from './research-request';
import { UsageSummarySchema, type UsageSummary } from './usage-types';

export { UsageSummarySchema, type UsageSummary } from './usage-types';

export async function readUsageSummary(tenantId: string): Promise<UsageSummary> {
  if (!z.string().uuid().safeParse(tenantId).success) throw new ResearchRequestError('invalid_contract', 400);
  const client = await createClient();
  if (!client) throw new ResearchRequestError('persistence_failure', 503, true);
  const response = await client.rpc('read_usage_summary', { wanted_tenant: tenantId });
  // The command refuses a caller with no active membership, so an error here is
  // a denial or an outage, never an empty result to render optimistically.
  if (response.error) {
    throw new ResearchRequestError(response.error.code === '42501' ? 'unauthorized' : 'persistence_failure',
      response.error.code === '42501' ? 403 : 503, response.error.code !== '42501');
  }
  const parsed = UsageSummarySchema.safeParse(response.data);
  if (!parsed.success) throw new ResearchRequestError('invalid_contract', 503);
  return parsed.data;
}
