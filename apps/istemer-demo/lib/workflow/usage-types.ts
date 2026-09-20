import { z } from 'zod';

// No 'server-only' guard here: the panel that renders this summary is a client
// component, so these shapes must stay safe to bundle for the browser. This
// module carries only schemas, never a database client.
const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z.string(),
  // null means no allowance row for this period, which the submission command
  // treats as unlimited. It is not a zero balance and must never render as one.
  limitTokens: z.number().int().positive().nullable(),
  consumedTokens: z.number().int().nonnegative(),
  // Runs whose provider returned no usage figure. Counted apart from
  // consumedTokens because an unreported run is not a free one.
  unreportedRuns: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative().nullable(),
}).strict();

export const UsageSummarySchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().uuid(),
  periodStart: z.string(),
  viewerId: z.string().uuid(),
  viewerRole: z.string(),
  // The upstream subscription balance is not derivable from anything this
  // system observes, so the contract carries the absence itself rather than a
  // number that would have to be invented.
  providerBalance: z.literal('unavailable'),
  members: z.array(memberSchema),
}).strict();

export type UsageSummary = z.infer<typeof UsageSummarySchema>;
