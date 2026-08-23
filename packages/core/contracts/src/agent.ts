import type { SampleActivityEntry } from './activity';
import type { DomainSlot, DemoStatus, Freshness, RuntimeStatus } from './graph';
import type { Restriction } from './restriction';
import type { ViewMeta } from './view-meta';

export interface ApprovalPolicy {
  readonly default: string;
  readonly externalPublishOrSend: string;
  readonly spendOrFinanceMutation: string;
  readonly permissionsOrDeletion: string;
}

export interface AgentSummary {
  readonly id: string;
  readonly displayName: string;
  readonly domainSlot: DomainSlot;
  readonly status: RuntimeStatus;
  readonly freshness: Freshness;
  readonly demoStatus: DemoStatus;
}

export interface AgentDetail {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly displayName: string;
  readonly domainSlot: DomainSlot;
  readonly purpose: string;
  // Added in the Batch 1 contract fix: distinct from `purpose`, and always
  // authored — never derived from purpose text.
  readonly responsibilities: readonly string[];
  readonly allowedInputs: readonly string[];
  readonly allowedOutputs: readonly string[];
  readonly allowedTools: readonly string[];
  readonly prohibitedActions: readonly Restriction[];
  readonly approvalPolicy: ApprovalPolicy;
  readonly sopRefs: readonly string[];
  // Sample activity is only rendered as activity when a run reference AND a
  // timestamp are present. Making both required at the type level enforces it.
  readonly sampleActivity: readonly SampleActivityEntry[];
  readonly status: RuntimeStatus;
  readonly freshness: Freshness;
  readonly demoStatus: DemoStatus;
}
