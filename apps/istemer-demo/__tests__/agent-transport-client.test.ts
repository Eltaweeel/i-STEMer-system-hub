import { describe, expect, it, vi } from 'vitest';
import { createAgentTransportClient } from '../adapters/agent-transport-client';
import { AGENT_TRANSPORT_CONTRACT_VERSION, type AgentTaskEnvelope } from '@bagos/contracts';

const task: AgentTaskEnvelope = { contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION, taskId: 'task-1', runId: 'run-1', tenantId: 'tenant-a', requesterId: 'owner-a', requesterRole: 'owner', agentId: 'agent:omar', allowedScope: ['research'], inputArtifactIds: [], idempotencyKey: 'idem-1', expiresAt: '2099-09-16T12:00:00.000Z' };

describe('agent transport client', () => {
  it('sends only the versioned task envelope and accepts a no-effects result', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION, runId: 'run-1', agentId: 'agent:omar', status: 'completed', artifactIds: ['artifact-1'], inputRevisionIds: [], warnings: [], errors: [], evidence: [], liveEffects: false }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await createAgentTransportClient({ baseUrl: 'http://agents.test', request }).dispatch(task);
    expect(result.runId).toBe('run-1');
    expect(request).toHaveBeenCalledWith('http://agents.test/v1/agent-tasks', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects a result that claims a live effect', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...task, contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION, runId: 'run-1', liveEffects: true }), { status: 200 }));
    await expect(createAgentTransportClient({ baseUrl: 'http://agents.test', request }).dispatch(task)).rejects.toThrow('invalid result envelope');
  });
});
