import type { ViewMeta } from './view-meta';

// -----------------------------------------------------------------------------
// The fix for the bug in the prior contract:
// Humans do NOT carry a runtime status or a heartbeat. Modelling the graph as
// a discriminated union on `kind` makes `.status` on a HumanAuthorityNode a
// type error, not just a stylistic convention.
// -----------------------------------------------------------------------------

export type NodeKind =
  | 'human'
  | 'conductor'
  | 'agent'
  | 'department';

export type RuntimeStatus =
  | 'idle'
  | 'running'
  | 'ok'
  | 'attention'
  | 'blocked'
  | 'error'
  | 'offline'
  | 'unknown'
  | 'draft';

export type ApprovalTier =
  | 'tier_0_internal'
  | 'persisted_exact_revision'
  | 'owner_only';

export interface Freshness {
  readonly capturedAt: string;
  readonly isStale: boolean;
}

interface BaseGraphNode {
  readonly id: string;
  readonly label: string;
  readonly entityHref: string;
  readonly accessibleDescription: string;
}

export interface HumanAuthorityNode extends BaseGraphNode {
  readonly kind: 'human';
  readonly authorityScope: string;
  readonly approvalTier: ApprovalTier;
  readonly avatarLabel: string;
  // Deliberately: NO status, NO freshness, NO heartbeat.
}

export interface ConductorNode extends BaseGraphNode {
  readonly kind: 'conductor';
  readonly status: RuntimeStatus;
  readonly freshness: Freshness;
  readonly demoStatus: DemoStatus;
}

export interface AgentNode extends BaseGraphNode {
  readonly kind: 'agent';
  readonly status: RuntimeStatus;
  readonly freshness: Freshness;
  readonly domainSlot: DomainSlot;
  readonly demoStatus: DemoStatus;
}

export interface DepartmentNode extends BaseGraphNode {
  readonly kind: 'department';
  readonly domainSlot: DomainSlot;
  readonly agentCount: number;
  // Aggregate metric, not a runtime status. `unknown` renders as `unknown`.
  readonly activeAgentCount: number | 'unknown';
}

export type GraphNode =
  | HumanAuthorityNode
  | ConductorNode
  | AgentNode
  | DepartmentNode;

export type EdgeKind =
  | 'reports_to'
  | 'assigned_to'
  | 'approves'
  | 'produces'
  | 'depends_on';

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly accessibleDescription: string;
}

export type DomainSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OrganizationProjection {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly title: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

// A demo agent's honest current state. `wired_no_runtime` is the truthful
// default in Batch 1 — the manifest is loaded, but nothing runs.
export type DemoStatus =
  | { readonly kind: 'fixture_only'; readonly note: string }
  | { readonly kind: 'wired_no_runtime'; readonly note: string }
  | { readonly kind: 'live'; readonly note: string };

// Type-narrowing helpers. Reading `.status` on the union without narrowing
// past a human node is a compile error, which is the point.
export function isHumanNode(node: GraphNode): node is HumanAuthorityNode {
  return node.kind === 'human';
}
export function isConductorNode(node: GraphNode): node is ConductorNode {
  return node.kind === 'conductor';
}
export function isAgentNode(node: GraphNode): node is AgentNode {
  return node.kind === 'agent';
}
export function isDepartmentNode(node: GraphNode): node is DepartmentNode {
  return node.kind === 'department';
}
