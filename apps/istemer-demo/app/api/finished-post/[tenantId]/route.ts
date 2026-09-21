import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { readIdentity } from '../../../../lib/auth/session';
import { readTenantAccess } from '../../../../lib/auth/tenant';

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const identity = await readIdentity();
  if (identity.status !== 'authenticated') return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  const { tenantId } = await context.params;
  let input: { calendarRevisionId?: unknown; dayIndex?: unknown; assetReference?: unknown; assetDescription?: unknown;
    placeholderReason?: unknown; platform?: unknown; accountLabel?: unknown };
  try { input = await request.json() as typeof input; } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (typeof input.calendarRevisionId !== 'string') return NextResponse.json({ error: 'invalid_revision' }, { status: 400 });
  if (typeof input.dayIndex !== 'number' || !Number.isInteger(input.dayIndex) || input.dayIndex < 0 || input.dayIndex > 6) {
    return NextResponse.json({ error: 'invalid_day' }, { status: 400 });
  }
  if (typeof input.platform !== 'string' || typeof input.accountLabel !== 'string' || input.accountLabel.trim() === '') {
    return NextResponse.json({ error: 'invalid_destination' }, { status: 400 });
  }
  // Exactly one of the two asset shapes, decided here so an ambiguous request
  // can never reach the command and be resolved by guesswork. A supplied asset
  // needs both its reference and a description; a placeholder needs its reason.
  const supplied = typeof input.assetReference === 'string' && input.assetReference.trim() !== '';
  const placeholder = typeof input.placeholderReason === 'string' && input.placeholderReason.trim() !== '';
  if (supplied === placeholder) return NextResponse.json({ error: 'asset_or_placeholder_required' }, { status: 400 });
  if (supplied && (typeof input.assetDescription !== 'string' || input.assetDescription.trim() === '')) {
    return NextResponse.json({ error: 'asset_description_required' }, { status: 400 });
  }
  const asset = supplied
    ? { kind: 'supplied', reference: (input.assetReference as string).trim(), description: (input.assetDescription as string).trim() }
    : { kind: 'placeholder', reason: (input.placeholderReason as string).trim() };

  const access = await readTenantAccess(tenantId);
  if (access.status !== 'authorized') return NextResponse.json({ error: 'tenant_access_required' }, { status: 403 });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: 'persistence_not_configured' }, { status: 503 });
  // The caption is not sent: the command copies it from the stored calendar
  // entry, so the package provably carries the text the calendar was approved
  // with rather than anything composed at this boundary.
  const response = await client.rpc('create_finished_post_package', {
    wanted_tenant: tenantId, calendar_revision: input.calendarRevisionId, day_index: input.dayIndex,
    asset, destination: { platform: input.platform, accountLabel: input.accountLabel.trim() },
  });
  if (response.error) return NextResponse.json({ error: 'package_failed', code: response.error.code }, { status: 409 });
  return NextResponse.json({ package: response.data, externalPublication: false });
}
