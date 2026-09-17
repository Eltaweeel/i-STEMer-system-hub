import { NextResponse } from 'next/server';
import { readContentCalendarRun } from '../../../../../lib/workflow/content-calendar-read';
import { authorizeContentCalendarRequest, contentCalendarFailure } from '../../../../../lib/workflow/content-calendar-request';

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const authorization = await authorizeContentCalendarRequest();
    const { runId } = await context.params;
    return NextResponse.json(await readContentCalendarRun(runId, authorization), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) { return contentCalendarFailure(error); }
}
