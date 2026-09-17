import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PersistWorkflowInput {
  readonly tenantId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly objective: string;
  readonly inputSnapshot: Record<string, unknown>;
}

export interface PersistedWorkflow {
  readonly campaignId: string;
  readonly objectiveId: string;
  readonly runId: string;
}

export interface PersistedArtifacts {
  readonly artifacts: readonly Record<string, unknown>[];
  readonly approvals: readonly Record<string, unknown>[];
}

export async function persistWorkflow(
  client: SupabaseClient,
  input: PersistWorkflowInput,
): Promise<PersistedWorkflow> {
  const response = await client.rpc('create_agent_workflow', {
    wanted_tenant: input.tenantId,
    command_id: input.commandId,
    idempotency_key: input.idempotencyKey,
    objective_text: input.objective,
    input_snapshot: { schema_version: 1, ...input.inputSnapshot },
  });
  if (response.error) throw new Error(`workflow_persistence_failed:${response.error.code ?? 'unknown'}`);
  const value = response.data as Record<string, unknown> | null;
  if (!value || typeof value.campaign_id !== 'string' || typeof value.objective_id !== 'string' || typeof value.run_id !== 'string') {
    throw new Error('workflow_persistence_invalid_response');
  }
  return { campaignId: value.campaign_id, objectiveId: value.objective_id, runId: value.run_id };
}

export async function persistArtifacts(
  client: SupabaseClient,
  input: { readonly tenantId: string; readonly runId: string; readonly artifacts: readonly Record<string, unknown>[]; readonly approvals: readonly Record<string, unknown>[] },
): Promise<PersistedArtifacts> {
  const response = await client.rpc('record_agent_artifacts', {
    wanted_tenant: input.tenantId,
    wanted_run: input.runId,
    artifact_payload: input.artifacts,
    approval_payload: input.approvals,
  });
  if (response.error) throw new Error(`artifact_persistence_failed:${response.error.code ?? 'unknown'}`);
  const value = response.data as Record<string, unknown> | null;
  if (!value || !Array.isArray(value.artifacts) || !Array.isArray(value.approvals)) throw new Error('artifact_persistence_invalid_response');
  return { artifacts: value.artifacts as Record<string, unknown>[], approvals: value.approvals as Record<string, unknown>[] };
}

export async function markWorkflowFailed(client: SupabaseClient, tenantId: string, runId: string, message: string) {
  const response = await client.rpc('fail_agent_workflow', { wanted_tenant: tenantId, wanted_run: runId, failure: { schema_version: 1, message } });
  if (response.error) throw new Error(`workflow_failure_record_failed:${response.error.code ?? 'unknown'}`);
  return response.data;
}

export async function retryWorkflow(client: SupabaseClient, tenantId: string, runId: string) {
  const response = await client.rpc('retry_agent_workflow', { wanted_tenant: tenantId, wanted_run: runId });
  if (response.error) throw new Error(`workflow_retry_failed:${response.error.code ?? 'unknown'}`);
  return response.data;
}
