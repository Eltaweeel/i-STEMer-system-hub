import { NextResponse } from 'next/server';
import { submitResearchBrief } from '../../../lib/workflow/research-commands';
import { authorizeResearchRequest, readResearchInput, researchFailure } from '../../../lib/workflow/research-request';

export async function POST(request: Request) {
  try {
    const authorization = await authorizeResearchRequest();
    const accepted = await submitResearchBrief(await readResearchInput(request), authorization.tenantId);
    if (accepted.tenantId !== authorization.tenantId || accepted.requesterId !== authorization.requesterId) {
      return researchFailure(new Error('research_binding_mismatch'));
    }
    // Acceptance is durable enqueueing, not evidence that Omar has executed.
    return NextResponse.json({ accepted, liveEffects: false }, {
      status: 202, headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) { return researchFailure(error); }
}
