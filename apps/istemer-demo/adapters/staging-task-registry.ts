import type {
  AgentResultEnvelope,
  AgentTaskEnvelope,
  AgentTaskStatus,
  AgentTransport,
  Clock,
} from '@bagos/contracts';
import { fixtureClock } from '@bagos/fixtures';

export interface StagingTaskRecord {
  readonly task: AgentTaskEnvelope;
  readonly status: AgentTaskStatus;
  readonly result: AgentResultEnvelope | null;
}

export class StagingTaskRegistry {
  private readonly records = new Map<string, StagingTaskRecord>();

  public constructor(
    private readonly transport: AgentTransport,
    private readonly clock: Clock = fixtureClock(),
  ) {}

  public async submit(task: AgentTaskEnvelope): Promise<StagingTaskRecord> {
    if (!task.tenantId || !task.requesterId || !task.requesterRole || task.allowedScope.length === 0) {
      throw new Error('envelope_incomplete');
    }
    if (Date.parse(task.expiresAt) <= Date.parse(this.clock.nowIso())) throw new Error('envelope_expired');
    const key = `${task.tenantId}:${task.idempotencyKey}`;
    const existing = this.records.get(key);
    if (existing) return existing;
    const running: StagingTaskRecord = { task, status: 'running', result: null };
    this.records.set(key, running);
    try {
      const result = await this.transport.dispatch(task);
      const completed: StagingTaskRecord = { task, status: result.status, result };
      this.records.set(key, completed);
      return completed;
    } catch (error) {
      const failed: StagingTaskRecord = { task, status: 'retryable', result: null };
      this.records.set(key, failed);
      throw error;
    }
  }

  public get(tenantId: string, idempotencyKey: string): StagingTaskRecord | null {
    return this.records.get(`${tenantId}:${idempotencyKey}`) ?? null;
  }
}
