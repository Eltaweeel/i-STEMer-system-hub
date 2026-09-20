import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { readIdentity } from '../../../../../lib/auth/session';
import { readTenantAccess } from '../../../../../lib/auth/tenant';

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const identity = await readIdentity();
  if (identity.status !== 'authenticated') return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  const { tenantId } = await context.params;
  let input: { memberUserId?: unknown; limitTokens?: unknown };
  try { input = await request.json() as typeof input; } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (typeof input.memberUserId !== 'string') return NextResponse.json({ error: 'invalid_member' }, { status: 400 });
  // The command rejects a non-positive limit, but catching it here keeps the
  // caller's error specific instead of surfacing a generic command failure.
  if (typeof input.limitTokens !== 'number' || !Number.isSafeInteger(input.limitTokens) || input.limitTokens <= 0) {
    return NextResponse.json({ error: 'invalid_limit' }, { status: 400 });
  }
  const access = await readTenantAccess(tenantId);
  if (access.status !== 'authorized' || access.role !== 'owner') return NextResponse.json({ error: 'owner_access_required' }, { status: 403 });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: 'persistence_not_configured' }, { status: 503 });
  // No period is sent: the command derives the current window itself, from the
  // same expression enforcement reads, so a caller cannot target a window that
  // is never checked and the two cannot drift apart.
  const response = await client.rpc('set_usage_allowance', {
    wanted_tenant: tenantId, member_user: input.memberUserId, limit_tokens: input.limitTokens,
  });
  if (response.error) return NextResponse.json({ error: 'allowance_failed', code: response.error.code }, { status: 409 });
  return NextResponse.json({ allowance: response.data });
}
