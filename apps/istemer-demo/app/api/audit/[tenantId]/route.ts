import { NextResponse } from 'next/server';
import { readTenantAuditLog } from '../../../../lib/workflow/audit-read';
import { researchFailure } from '../../../../lib/workflow/research-request';

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    return NextResponse.json(await readTenantAuditLog(tenantId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) { return researchFailure(error); }
}
