import 'server-only';
import { createClient } from '../supabase/server';
import { verifyIdentity } from './identity';

export async function readTenantAccess(tenantId: string) {
  const client = await createClient();
  if (!client) return { status: 'setup-needed' } as const;
  const identity = await verifyIdentity(() => client.auth.getUser());
  if (identity.status !== 'authenticated') return identity;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(tenantId)) return { status: 'denied' } as const;
  try {
    const membership = await client.from('memberships').select('role').eq('tenant_id', tenantId).eq('user_id', identity.userId).eq('status', 'active').maybeSingle();
    if (membership.error) return { status: 'unavailable' } as const;
    if (!membership.data || !['owner', 'operator'].includes(membership.data.role)) return { status: 'denied' } as const;
    if (membership.data.role === 'owner') {
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) return { status: 'unavailable' } as const;
      if (assurance.data.currentLevel !== 'aal2') return { status: 'mfa-required' } as const;
    }
    const tenant = await client.from('tenants').select('name').eq('id', tenantId).eq('status', 'active').maybeSingle();
    if (tenant.error) return { status: 'unavailable' } as const;
    if (!tenant.data) return { status: 'denied' } as const;
    return { status: 'authorized', name: String(tenant.data.name), role: String(membership.data.role) } as const;
  } catch { return { status: 'unavailable' } as const; }
}
