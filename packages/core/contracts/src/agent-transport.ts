export const AGENT_TRANSPORT_CONTRACT_VERSION = 'agent-transport.v1' as const;
export type AgentTaskStatus = 'queued' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'retryable' | 'cancelled' | 'expired' | 'reconciliation_required';
export type AgentEnvelopeErrorKind = 'envelope_incomplete' | 'envelope_expired' | 'agent_mismatch' | 'upstream_missing' | 'contract_mismatch' | 'invalid_status' | 'hash_mismatch';
export interface AgentEnvelopeError extends Error { readonly kind: AgentEnvelopeErrorKind; readonly retryable: boolean }

export interface AgentArtifactEnvelope {
  readonly id: string;
  readonly revisionId: string;
  readonly tenantId: string;
  readonly producedBy: string;
  readonly sourceRevisionIds: readonly string[];
  readonly contentHash: string;
  readonly createdAt: string;
  readonly contractVersion: typeof AGENT_TRANSPORT_CONTRACT_VERSION;
}

export interface AgentHandoffEnvelope {
  readonly id: string;
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly artifactRevisionIds: readonly string[];
  readonly tenantId: string;
  readonly contractVersion: typeof AGENT_TRANSPORT_CONTRACT_VERSION;
}

export interface AgentApprovalBinding {
  readonly tenantId: string;
  readonly taskId: string;
  readonly artifactId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly destination: string;
  readonly approvalStage: 'strategy_and_calendar' | 'finished_posts';
  readonly approverId: string;
}

export interface AgentErrorEnvelope {
  readonly kind: AgentEnvelopeErrorKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly contractVersion: typeof AGENT_TRANSPORT_CONTRACT_VERSION;
}

export interface AgentTaskEnvelope {
  readonly contractVersion: typeof AGENT_TRANSPORT_CONTRACT_VERSION;
  readonly taskId: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly requesterId: string;
  readonly requesterRole: string;
  readonly agentId: string;
  readonly allowedScope: readonly string[];
  readonly inputArtifactIds: readonly string[];
  readonly idempotencyKey: string;
  readonly expiresAt: string;
}

export interface AgentResultEnvelope {
  readonly contractVersion: typeof AGENT_TRANSPORT_CONTRACT_VERSION;
  readonly runId: string;
  readonly agentId: string;
  readonly status: AgentTaskStatus;
  readonly artifactIds: readonly string[];
  readonly inputRevisionIds: readonly string[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly evidence: readonly AgentArtifactEnvelope[];
  readonly liveEffects: false;
}
