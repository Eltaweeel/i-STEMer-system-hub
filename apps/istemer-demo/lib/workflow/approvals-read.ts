import 'server-only';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { ResearchRequestError } from './research-request';
import { TenantApprovalsSchema, type TenantApprovals } from './approvals-types';

export { TenantApprovalsSchema, type TenantApprovals, type ApprovalRow } from './approvals-types';

export async function readTenantApprovals(tenantId: string): Promise<TenantApprovals> {
  if (!z.string().uuid().safeParse(tenantId).success) throw new ResearchRequestError('invalid_contract', 400);
  const client = await createClient();
  if (!client) throw new ResearchRequestError('persistence_failure', 503, true);
  const response = await client.rpc('read_tenant_approvals', { wanted_tenant: tenantId });
  // The command refuses a caller with no active membership, so an error is a
  // denial or an outage -- never an empty list to render as "nothing pending".
  if (response.error) {
    const denied = response.error.code === '42501';
    throw new ResearchRequestError(denied ? 'unauthorized' : 'persistence_failure', denied ? 403 : 503, !denied);
  }
  const parsed = TenantApprovalsSchema.safeParse(response.data);
  if (!parsed.success) throw new ResearchRequestError('invalid_contract', 503);
  return parsed.data;
}
