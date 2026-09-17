import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { readIdentity } from '../../../lib/auth/session';
import { readTenantAccess } from '../../../lib/auth/tenant';

export async function POST(request: Request) {
  const identity = await readIdentity();
  if (identity.status !== 'authenticated') return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  let input: { tenantId?: unknown; approvalId?: unknown; contentDigest?: unknown };
  try { input = await request.json() as typeof input; } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (typeof input.tenantId !== 'string' || typeof input.approvalId !== 'string' || typeof input.contentDigest !== 'string') {
    return NextResponse.json({ error: 'invalid_approval' }, { status: 400 });
  }
  const access = await readTenantAccess(input.tenantId);
  if (access.status !== 'authorized' || access.role !== 'owner') return NextResponse.json({ error: 'owner_access_required' }, { status: 403 });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: 'persistence_not_configured' }, { status: 503 });
  const response = await client.rpc('approve_agent_revision', {
    wanted_tenant: input.tenantId,
    approval_id: input.approvalId,
    expected_digest: input.contentDigest,
  });
  if (response.error) return NextResponse.json({ error: 'approval_failed', code: response.error.code }, { status: 409 });
  return NextResponse.json({ approval: response.data, externalPublication: false });
}
