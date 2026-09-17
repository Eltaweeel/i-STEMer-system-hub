import { NextResponse } from 'next/server';
import { readResearchRun } from '../../../../lib/workflow/research-read';
import { authorizeResearchRequest, researchFailure } from '../../../../lib/workflow/research-request';

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const authorization = await authorizeResearchRequest();
    const { runId } = await context.params;
    return NextResponse.json(await readResearchRun(runId, authorization), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) { return researchFailure(error); }
}
