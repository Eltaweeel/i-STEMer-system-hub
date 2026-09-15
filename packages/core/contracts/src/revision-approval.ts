import type { ViewMeta } from './view-meta';

export type ApprovalReviewState =
  | 'draft'
  | 'awaiting_review'
  | 'changes_requested'
  | 'rejected'
  | 'awaiting_approval'
  | 'approved_for_staging'
  | 'awaiting_live_approval'
  | 'approved_for_execution'
  | 'approval_invalidated_by_revision';

// A display vocabulary, not a mutable field that conflates approval and execution.
export type ApprovalLifecycleState = ApprovalReviewState
  | 'execution_requested'
  | 'executing'
  | 'externally_verified'
  | 'execution_failed';

export type ContentDigest =
  | { readonly kind: 'sha256'; readonly hex: string }
  | { readonly kind: 'placeholder'; readonly reason: string };

export interface ArtifactRevisionReference {
  readonly artifactId: string;
  readonly revision: number;
  readonly contentDigest: ContentDigest;
}

export interface ApprovalDestination {
  readonly environment: 'staging' | 'live';
  readonly connectorId: string;
  readonly targetId: string;
}

export interface ApprovalBinding {
  readonly tenantId: string;
  readonly actionId: string;
  readonly actionRevision: number;
  // Covers the canonical full action envelope, including cost, schedule and destination.
  readonly actionDigest: ContentDigest;
  readonly destination: ApprovalDestination;
  readonly artifact: ArtifactRevisionReference;
}

export type HumanApproverRole = 'owner' | 'operator';

// Read model only. A server must derive identity from authentication, never this DTO.
export interface HumanApprovalDecision {
  readonly id: string;
  readonly packageId: string;
  readonly binding: ApprovalBinding;
  readonly actor: {
    readonly kind: 'human';
    readonly principalId: string;
    readonly role: HumanApproverRole;
  };
  readonly outcome: 'approved_for_staging' | 'approved_for_execution' | 'changes_requested' | 'rejected';
  readonly reason: string;
  readonly decidedAt: string;
  readonly provenance: 'sample_scenario' | 'authenticated_service';
}

export interface RevisionApprovalPackage {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly title: string;
  readonly state: ApprovalReviewState;
  readonly binding: ApprovalBinding;
  readonly exactAction: string;
  readonly requestingRoleId: string;
  readonly responsibleRoleId: string;
  readonly reason: string;
  readonly preview: { readonly artifact: ArtifactRevisionReference; readonly summary: string };
  readonly evidenceIds: readonly string[];
  readonly risks: readonly string[];
  readonly cost:
    | { readonly kind: 'known'; readonly currency: string; readonly minorUnits: number }
    | { readonly kind: 'unknown'; readonly reason: string };
  readonly deadline: string;
  readonly requiredApproverRole: HumanApproverRole;
  readonly decisionHistory: readonly HumanApprovalDecision[];
}

export type ApprovalBindingComparison =
  | { readonly kind: 'matching' }
  | { readonly kind: 'changed' }
  | { readonly kind: 'unverifiable' };

function sameScope(previous: ApprovalBinding, current: ApprovalBinding): boolean {
  return previous.tenantId === current.tenantId
    && previous.actionId === current.actionId
    && previous.actionRevision === current.actionRevision
    && previous.destination.environment === current.destination.environment
    && previous.destination.connectorId === current.destination.connectorId
    && previous.destination.targetId === current.destination.targetId
    && previous.artifact.artifactId === current.artifact.artifactId
    && previous.artifact.revision === current.artifact.revision;
}

function comparableDigest(digest: ContentDigest): string | null {
  return digest.kind === 'sha256' && /^[a-f0-9]{64}$/.test(digest.hex) ? digest.hex : null;
}

function compareDigests(previous: ContentDigest, current: ContentDigest): ApprovalBindingComparison {
  const previousHex = comparableDigest(previous);
  const currentHex = comparableDigest(current);
  if (previousHex === null || currentHex === null) return { kind: 'unverifiable' };
  return { kind: previousHex === currentHex ? 'matching' : 'changed' };
}

/**
 * Compares read snapshots only: matching hashes are NOT verified content or authorization.
 * Production still needs server-computed hashes, authenticated human decisions, current
 * permissions, expiry/revocation checks and an atomic revision check before broker execution.
 * Placeholders never match, even when the very same sample object is compared to itself.
 */
export function compareApprovalBinding(
  previous: ApprovalBinding,
  current: ApprovalBinding,
): ApprovalBindingComparison {
  if (!sameScope(previous, current)) return { kind: 'changed' };
  const comparisons = [
    compareDigests(previous.actionDigest, current.actionDigest),
    compareDigests(previous.artifact.contentDigest, current.artifact.contentDigest),
  ];
  if (comparisons.some((comparison) => comparison.kind === 'changed')) return { kind: 'changed' };
  if (comparisons.some((comparison) => comparison.kind === 'unverifiable')) return { kind: 'unverifiable' };
  return { kind: 'matching' };
}
