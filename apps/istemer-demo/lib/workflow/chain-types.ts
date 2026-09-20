import { z } from 'zod';
import { ResearchRunViewSchema } from '@bagos/contracts';

// No 'server-only' guard here: unlike chain-read.ts, this module is imported by
// the client component that renders the chain summary, so it must stay safe to
// bundle for the browser. It carries only shapes, never a database client.
const id = z.string().uuid();

// The chain reuses Omar's own run-status vocabulary rather than declaring a
// second copy: every stage this demo runs (research, reel-analysis, content
// calendar) is validated against the identical queued/running/failed/succeeded
// enum in its own contract, so there is exactly one list to keep in sync.
export const chainStatusSchema = ResearchRunViewSchema.shape.status;

export const ChainStageSchema = z.object({ runId: id, status: chainStatusSchema }).strict().nullable();
export const ChainSummarySchema = z.object({
  researchRunId: id,
  reelAnalysis: ChainStageSchema,
  contentCalendar: ChainStageSchema,
}).strict();

export type ChainStage = z.infer<typeof ChainStageSchema>;
export type ChainSummary = z.infer<typeof ChainSummarySchema>;
