import { z } from 'zod';

export const FINISHED_POST_CONTRACT_VERSION = 'finished-post.v1' as const;
const id = z.string().uuid();
const boundedText = z.string().trim().min(1).max(8000);

export const FinishedPostPlatformSchema = z.enum(['instagram', 'facebook']);

/** Either a real asset someone supplied, or an explicit placeholder. There is
 * deliberately no third shape and no optional asset field: a package that could
 * omit the distinction would let a placeholder be presented as a finished
 * graphic, which is the one thing the approval stage must never allow. */
export const FinishedPostAssetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('supplied'), reference: boundedText, description: boundedText }).strict(),
  z.object({ kind: z.literal('placeholder'), reason: boundedText }).strict(),
]);

/** Where the approved post would go. Bound into the package because an approval
 * covers a destination as much as it covers content: changing it must require a
 * fresh decision rather than inheriting the old one. */
export const FinishedPostDestinationSchema = z.object({
  platform: FinishedPostPlatformSchema,
  // Staging never publishes, so this names the intended account rather than a
  // connected one. It is a label, not a credential or a delivery target.
  accountLabel: boundedText,
}).strict();

export const FinishedPostPackageSchema = z.object({
  contractVersion: z.literal(FINISHED_POST_CONTRACT_VERSION),
  tenantId: id,
  // The exact calendar revision this post was drawn from. Approval binds to it,
  // so a later calendar revision invalidates this package's decision.
  sourceRevisionId: id,
  dayIndex: z.number().int().min(0).max(6),
  // Copied server-side from the calendar entry rather than supplied by a
  // caller: the point of the second approval is that it covers the exact text
  // the first approval already covered, not text typed in afterwards.
  caption: boundedText,
  asset: FinishedPostAssetSchema,
  destination: FinishedPostDestinationSchema,
  liveEffects: z.literal(false),
}).strict();

export type FinishedPostAsset = z.infer<typeof FinishedPostAssetSchema>;
export type FinishedPostPackage = z.infer<typeof FinishedPostPackageSchema>;

/** True only for a package whose asset is a real supplied one. Callers that
 * render or summarise a package must branch on this rather than on the presence
 * of a field, so a placeholder can never read as a finished graphic. */
export function hasSuppliedAsset(pkg: FinishedPostPackage): boolean {
  return pkg.asset.kind === 'supplied';
}
