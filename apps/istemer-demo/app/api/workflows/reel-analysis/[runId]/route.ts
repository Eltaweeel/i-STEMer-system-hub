import { NextResponse } from 'next/server';
import { readReelAnalysisRun } from '../../../../../lib/workflow/reel-analysis-read';
import { authorizeReelAnalysisRequest, reelAnalysisFailure } from '../../../../../lib/workflow/reel-analysis-request';

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const authorization = await authorizeReelAnalysisRequest();
    const { runId } = await context.params;
    return NextResponse.json(await readReelAnalysisRun(runId, authorization), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) { return reelAnalysisFailure(error); }
}
