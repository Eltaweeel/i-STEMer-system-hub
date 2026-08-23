import type { AgentDetail, AgentSummary } from './agent';
import type { OrganizationProjection } from './graph';
import type { ApprovalPackage, WorkflowDetail, WorkflowSummary } from './workflow';

// Every port is async from day one. That is what prevents a rewrite when a
// real adapter arrives. NO command port and NO event port ship in Batch 1:
// mutation methods do not appear in a query interface.

export interface OrganizationQueryArgs {
  readonly domainSlot?: number;
}
export interface OrganizationQueries {
  getOrganization(query: OrganizationQueryArgs): Promise<OrganizationProjection>;
}

export interface AgentListQuery {
  readonly domainSlot?: number;
}
export interface AgentGetQuery {
  readonly id: string;
}
export interface AgentQueries {
  listAgents(query: AgentListQuery): Promise<readonly AgentSummary[]>;
  getAgent(query: AgentGetQuery): Promise<AgentDetail | null>;
}

export interface WorkflowListQuery {
  readonly domainSlot?: number;
}
export interface WorkflowGetQuery {
  readonly id: string;
}
export interface WorkflowQueries {
  listWorkflows(query: WorkflowListQuery): Promise<readonly WorkflowSummary[]>;
  getWorkflow(query: WorkflowGetQuery): Promise<WorkflowDetail | null>;
}

export interface ApprovalListQuery {
  readonly domainSlot?: number;
}
export interface ApprovalQueries {
  listApprovalPackages(query: ApprovalListQuery): Promise<readonly ApprovalPackage[]>;
}
