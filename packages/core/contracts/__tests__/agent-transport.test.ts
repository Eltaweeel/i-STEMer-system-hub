import { describe, expect, it } from 'vitest';
import { AGENT_TRANSPORT_CONTRACT_VERSION, type AgentTaskEnvelope } from '../src/agent-transport';

describe('agent transport v1', () => {
  it('requires the cross-repository identity and scope fields', () => {
    const envelope: AgentTaskEnvelope = { contractVersion: AGENT_TRANSPORT_CONTRACT_VERSION, taskId: 'task-1', runId: 'run-1', tenantId: 'tenant-a', requesterId: 'owner-a', requesterRole: 'owner', agentId: 'agent:omar', allowedScope: ['research'], inputArtifactIds: [], idempotencyKey: 'idem-1', expiresAt: '2026-09-16T12:00:00.000Z' };
    expect(envelope.contractVersion).toBe('agent-transport.v1');
    expect(envelope.allowedScope).toEqual(['research']);
  });
});
