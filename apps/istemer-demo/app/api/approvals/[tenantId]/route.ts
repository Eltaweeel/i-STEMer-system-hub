import { NextResponse } from 'next/server';
import { readTenantApprovals } from '../../../../lib/workflow/approvals-read';
import { researchFailure } from '../../../../lib/workflow/research-request';

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    return NextResponse.json(await readTenantApprovals(tenantId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) { return researchFailure(error); }
}
