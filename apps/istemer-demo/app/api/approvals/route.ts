import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { readIdentity } from '../../../lib/auth/session';
import { readTenantAccess } from '../../../lib/auth/tenant';

export async function POST(request: Request) {
  const identity = await readIdentity();
  if (identity.status !== 'authenticated') return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  let input: { tenantId?: unknown; approvalId?: unknown; contentDigest?: unknown; decision?: unknown; reason?: unknown };
  try { input = await request.json() as typeof input; } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (typeof input.tenantId !== 'string' || typeof input.approvalId !== 'string' || typeof input.contentDigest !== 'string') {
    return NextResponse.json({ error: 'invalid_approval' }, { status: 400 });
  }
  // Absent decision means approve, preserving the original caller contract.
  const decision = input.decision === undefined ? 'approve' : input.decision;
  if (decision !== 'approve' && decision !== 'reject') return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  // A rejection without a stated reason is not a decision anyone can act on,
  // and the command refuses an empty one anyway; fail here with a clearer error.
  if (decision === 'reject' && (typeof input.reason !== 'string' || input.reason.trim() === '')) {
    return NextResponse.json({ error: 'reason_required' }, { status: 400 });
  }
  const access = await readTenantAccess(input.tenantId);
  if (access.status !== 'authorized' || access.role !== 'owner') return NextResponse.json({ error: 'owner_access_required' }, { status: 403 });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: 'persistence_not_configured' }, { status: 503 });
  // The digest travels from the row the owner was shown, so a revision that
  // moved underneath produces a refused decision rather than one applied to
  // content they never saw. Owner and AAL2 are re-checked inside the command.
  const response = decision === 'approve'
    ? await client.rpc('approve_agent_revision', {
      wanted_tenant: input.tenantId, approval_id: input.approvalId, expected_digest: input.contentDigest,
    })
    : await client.rpc('reject_agent_revision', {
      wanted_tenant: input.tenantId, approval_id: input.approvalId, expected_digest: input.contentDigest,
      reason: (input.reason as string).trim(),
    });
  if (response.error) {
    // Several distinct refusals share SQLSTATE 55000, so the bare code cannot
    // tell an owner whether the calendar behind this post lost its approval or
    // whether someone else already decided it.
    const message = String(response.error.message ?? '');
    const reason = ['strategy_not_approved', 'approval is not pending', 'approval digest mismatch']
      .find((candidate) => message.includes(candidate)) ?? 'decision_failed';
    return NextResponse.json({ error: reason.replace(/ /g, '_'), code: response.error.code }, { status: 409 });
  }
  return NextResponse.json({ approval: response.data, decision, externalPublication: false });
}
