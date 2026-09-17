import { describe, expect, it, vi } from 'vitest';
import { AGENT_TRANSPORT_CONTRACT_VERSION, type AgentResultEnvelope, type AgentTaskEnvelope } from '@bagos/contracts';
import { StagingTaskRegistry } from '../adapters/staging-task-registry';

const task: AgentTaskEnvelope = { contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION, taskId: 'task-1', runId: 'run-1', tenantId: 'tenant-a', requesterId: 'owner-a', requesterRole: 'owner', agentId: 'agent:adam', allowedScope: ['marketing:research'], inputArtifactIds: [], idempotencyKey: 'idem-1', expiresAt: '2099-09-16T12:00:00.000Z' };
const result: AgentResultEnvelope = { contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION, runId: 'run-1', agentId: 'agent:adam', status: 'completed', artifactIds: ['artifact-1'], inputRevisionIds: [], warnings: [], errors: [], evidence: [], liveEffects: false };

describe('staging task registry', () => {
  it('returns the same result for a duplicate tenant-scoped idempotency key', async () => {
    const dispatch = vi.fn().mockResolvedValue(result);
    const registry = new StagingTaskRegistry({ dispatch });
    const first = await registry.submit(task);
    const second = await registry.submit({ ...task, taskId: 'task-duplicate', runId: 'run-duplicate' });
    expect(second).toBe(first);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('rejects incomplete authority scope before dispatch', async () => {
    const dispatch = vi.fn().mockResolvedValue(result);
    await expect(new StagingTaskRegistry({ dispatch }).submit({ ...task, requesterId: '', allowedScope: [] })).rejects.toThrow('envelope_incomplete');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
