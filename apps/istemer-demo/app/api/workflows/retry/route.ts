import { NextResponse } from 'next/server';
import { requestResearchRetry } from '../../../../lib/workflow/research-commands';
import { authorizeResearchRequest, readResearchInput, researchFailure } from '../../../../lib/workflow/research-request';

export async function POST(request: Request) {
  try {
    const authorization = await authorizeResearchRequest();
    const retry = await requestResearchRetry(await readResearchInput(request), authorization.tenantId);
    return NextResponse.json({ retry, liveEffects: false }, {
      status: 202, headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) { return researchFailure(error); }
}
