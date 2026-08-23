import type { ViewMeta } from './view-meta';

export interface WorkflowSummary {
  readonly id: string;
  readonly label: string;
  readonly meta: ViewMeta;
}

export interface WorkflowDetail {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly label: string;
  readonly purpose: string;
}

export interface ApprovalPackage {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly title: string;
  readonly requester: string;
  readonly requiredTier: 'tier_0_internal' | 'persisted_exact_revision' | 'owner_only';
}
