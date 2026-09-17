import type { AgentResultEnvelope, AgentTaskEnvelope, AgentTransport } from '@bagos/contracts';

export interface AgentTransportClientOptions {
  readonly baseUrl: string;
  readonly request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Server-only boundary for the future Hermes runtime. Identity and scope must
 * already be derived by the caller from the authenticated system session.
 * This client never accepts credentials from browser input and never exposes a
 * publish/send operation.
 */
export function createAgentTransportClient(options: AgentTransportClientOptions): AgentTransport {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  return {
    async dispatch(task: AgentTaskEnvelope): Promise<AgentResultEnvelope> {
      const response = await options.request(`${baseUrl}/v1/agent-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agent-contract-version': task.contractVersion },
        body: JSON.stringify(task),
      });
      if (!response.ok) throw new Error(`Agent transport failed with HTTP ${response.status}.`);
      const result = (await response.json()) as AgentResultEnvelope;
      if (result.contractVersion !== task.contractVersion || result.runId !== task.runId || result.liveEffects !== false) {
        throw new Error('Agent transport returned an invalid result envelope.');
      }
      return result;
    },
  };
}
