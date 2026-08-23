// Approval inbox contracts for Batch 3a.
//
// DisabledDecisionControl mirrors the Restriction pattern: no callback, no href,
// no action field. Disablement is structural — the type itself prevents wiring
// a click handler that could change approval state.
//
// ChannelNotificationPreview is provider-agnostic. The component that renders
// it must never claim delivery occurred; that invariant is enforced in tests.
//
// ApprovalPackage carries status: 'pending' as a literal type. There is no
// union, no setter, and no mutable path — so it cannot be changed even in
// local component state without a type error.

import type { ViewMeta } from './view-meta';

// DisabledDecisionControl — structural disablement.
// Do not add onClick, onActivate, href, or action. The type is the guard.
export interface DisabledDecisionControl {
  readonly id: string;
  readonly label: string;
  readonly disabledReason: string;
  // Deliberately: NO onClick, NO onActivate, NO href, NO action field.
}

export function makeDisabledDecisionControl(input: {
  id: string;
  label: string;
  disabledReason: string;
}): DisabledDecisionControl {
  return { id: input.id, label: input.label, disabledReason: input.disabledReason };
}

// Generic channel notification preview — provider name is a label only,
// not a live connection. The component must label this as "not sent".
export interface ChannelNotificationPreview {
  readonly channel: string;
  readonly provider: string;
  readonly messageBody: string;
  readonly fixtureTimestamp: string;
  readonly sourceHref: string;
  readonly sourceLabel: string;
}

// ApprovalPackage — exact-revision snapshot of one approval request.
// `status` is the literal 'pending'; there is no union variant and no
// mechanism to change it. The approval inbox renders from fixture data only.
export interface ApprovalPackage {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly title: string;
  readonly status: 'pending';
  readonly requestedAction: string;
  readonly responsibleAgent: string;
  readonly businessReason: string;
  readonly targetSystem: string;
  readonly artifactRef: string;
  readonly supportingEvidence: readonly string[];
  readonly expectedResult: string;
  readonly risks: string;
  readonly estimatedCost: string;
  readonly deadline: string;
  readonly diffSummary: string | null;
  readonly workflowStepRef: string;
  readonly requiredTier: 'tier_0_internal' | 'persisted_exact_revision' | 'owner_only';
  readonly notificationPreview: ChannelNotificationPreview;
}
