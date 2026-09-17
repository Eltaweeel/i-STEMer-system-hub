import 'server-only';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { verifyIdentity } from '../auth/identity';

const uuid = z.string().uuid();
const membershipSchema = z.object({
  tenant_id: uuid, user_id: uuid, status: z.literal('active'),
  role: z.enum(['owner', 'operator']),
});
const tenantSchema = z.object({ id: uuid, status: z.literal('active') });

export type ResearchAuthorization = {
  status: 'authorized'; tenantId: string; requesterId: string;
  agentId: 'competitor_analyst'; allowedScope: readonly ['research:read']; liveEffects: false;
} | { status: 'setup-needed' | 'signed-out' | 'unavailable' | 'denied' | 'mfa-required' };

/** No request/prompt parameters: authority comes only from verified Auth and the
 * server's single-brand tenant binding. This is a preflight, not a substitute for
 * membership checks inside each transactional database command.
 */
export async function readResearchAuthorization(): Promise<ResearchAuthorization> {
  const configuredTenant = uuid.safeParse(process.env.ISTEMER_RESEARCH_TENANT_ID);
  if (!configuredTenant.success) return { status: 'setup-needed' };
  try {
    const client = await createClient();
    if (!client) return { status: 'setup-needed' };
    const identity = await verifyIdentity(() => client.auth.getUser());
    if (identity.status !== 'authenticated') return identity;
    if (!uuid.safeParse(identity.userId).success) return { status: 'denied' };
    const tenantId = configuredTenant.data;
    const response = await client.from('memberships')
      .select('tenant_id,user_id,status,role')
      .eq('tenant_id', tenantId).eq('user_id', identity.userId).eq('status', 'active').maybeSingle();
    if (response.error) return { status: 'unavailable' };
    const membership = membershipSchema.safeParse(response.data);
    if (!membership.success || membership.data.tenant_id !== tenantId
      || membership.data.user_id !== identity.userId) return { status: 'denied' };
    if (membership.data.role === 'owner') {
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) return { status: 'unavailable' };
      if (assurance.data.currentLevel !== 'aal2') return { status: 'mfa-required' };
    }
    const tenantResponse = await client.from('tenants').select('id,status')
      .eq('id', tenantId).eq('status', 'active').maybeSingle();
    if (tenantResponse.error) return { status: 'unavailable' };
    const tenant = tenantSchema.safeParse(tenantResponse.data);
    if (!tenant.success || tenant.data.id !== tenantId) return { status: 'denied' };
    return { status: 'authorized', tenantId, requesterId: identity.userId,
      agentId: 'competitor_analyst', allowedScope: ['research:read'], liveEffects: false };
  } catch {
    // Never expose Auth, database or configuration details in a client error.
    return { status: 'unavailable' };
  }
}
