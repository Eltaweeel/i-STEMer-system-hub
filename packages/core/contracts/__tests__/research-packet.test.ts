import { describe, expect, it } from 'vitest';
import { ResearchBriefSchema, validateResearchArtifact } from '../src/research-packet';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceUrl = 'https://example.org/research';
const inspectedAt = '2026-09-16T00:00:00Z';
const task = { contractVersion: 'research.v1', taskId: id(1), runId: id(2), attemptId: id(3),
  tenantId: id(4), requesterId: id(5), agentId: 'competitor_analyst', allowedScope: ['research:read'],
  issuedAt: '2026-09-16T00:00:00Z', expiresAt: '2026-09-16T00:10:00Z', liveEffects: false,
  brief: { idempotencyKey: id(6), objective: 'Research competitors', sources: [sourceUrl] } };
const receipt = { contractVersion: 'research.v1', tenantId: id(4), taskId: id(1), runId: id(2), attemptId: id(3),
  sourceUrl, inspectedAt, receiptId: id(7), contentHash: 'a'.repeat(64) };
const artifact = { contractVersion: 'research.v1', taskId: id(1), runId: id(2), attemptId: id(3),
  tenantId: id(4), producedBy: 'competitor_analyst', sourceRevisionIds: [id(8)], liveEffects: false,
  evidence: [{ sourceUrl, inspectedAt, inspectionReceiptId: id(7), observation: 'Observed text',
    interpretation: null, confidence: 'low', gaps: ['Engagement unavailable'] }], gaps: [] };

describe('research boundary', () => {
  it('rejects authority fields supplied by a browser', () => {
    for (const field of ['tenantId', 'requesterId', 'role', 'agentId']) {
      expect(ResearchBriefSchema.safeParse({ ...task.brief, [field]: id(9) }).success).toBe(false);
    }
  });
  it('accepts evidence matched to independently observed inspection receipts', () => {
    expect(validateResearchArtifact(artifact, task, [receipt], [id(8)])).toEqual(artifact);
  });
  it('rejects cross-tenant, cross-run and stale-attempt results', () => {
    for (const field of ['tenantId', 'taskId', 'runId', 'attemptId']) {
      expect(() => validateResearchArtifact({ ...artifact, [field]: id(9) }, task, [receipt], [id(8)])).toThrow();
    }
  });
  it('rejects claimed inspection without a host receipt', () => {
    expect(() => validateResearchArtifact(artifact, task, [], [id(8)])).toThrow('uninspected_source');
    expect(() => validateResearchArtifact(artifact, task, [{ ...receipt, inspectedAt: '2026-09-15T00:00:00Z' }], [id(8)])).toThrow('uninspected_source');
  });
  it('rejects receipts from another tenant, task, run or attempt', () => {
    for (const field of ['tenantId', 'taskId', 'runId', 'attemptId']) {
      expect(() => validateResearchArtifact(artifact, task, [{ ...receipt, [field]: id(9) }], [id(8)]))
        .toThrow('uninspected_source');
    }
  });
  it('rejects ambiguous receipts and inspection at or after expiry', () => {
    expect(() => validateResearchArtifact(artifact, task, [receipt, receipt], [id(8)])).toThrow('invalid_contract');
    const late = { ...receipt, inspectedAt: task.expiresAt };
    const lateArtifact = { ...artifact, evidence: artifact.evidence.map((item) => ({ ...item, inspectedAt: task.expiresAt })) };
    expect(() => validateResearchArtifact(lateArtifact, task, [late], [id(8)])).toThrow('uninspected_source');
  });
  it('rejects missing lineage, empty successful evidence and external effects', () => {
    for (const replacement of [{ sourceRevisionIds: [] }, { evidence: [] }, { liveEffects: true }]) {
      expect(() => validateResearchArtifact({ ...artifact, ...replacement }, task, [receipt], [id(8)])).toThrow();
    }
  });
  it('bounds host receipts and validates expected lineage at runtime', () => {
    expect(() => validateResearchArtifact(artifact, task, Array(101).fill(receipt), [id(8)])).toThrow();
    for (const expected of [[], ['not-a-uuid'], [id(8), id(8)], Array.from({ length: 13 }, (_, n) => id(n + 20))]) {
      expect(() => validateResearchArtifact(artifact, task, [receipt], expected)).toThrow();
    }
  });
  it('rejects receipts before issuance and duplicate requested sources', () => {
    const early = '2026-09-15T23:59:59Z';
    expect(() => validateResearchArtifact({ ...artifact, evidence: artifact.evidence.map((item) => ({ ...item, inspectedAt: early })) },
      task, [{ ...receipt, inspectedAt: early }], [id(8)])).toThrow('uninspected_source');
    expect(ResearchBriefSchema.safeParse({ ...task.brief, sources: [sourceUrl, sourceUrl] }).success).toBe(false);
  });
});
