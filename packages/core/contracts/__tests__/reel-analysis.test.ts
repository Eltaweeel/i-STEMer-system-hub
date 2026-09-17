import { describe, expect, it } from 'vitest';
import { ReelAnalysisArtifactSchema, ReelAnalysisBriefSchema, ReelAnalysisErrorSchema,
  ReelAnalysisFindingSchema, ReelAnalysisHandoffSchema, ReelAnalysisTaskSchema,
  ReelAnalysisUnavailableModalitySchema, ReelModalitySchema, validateReelAnalysisArtifact } from '../src/reel-analysis';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const binding = { contractVersion: 'reel-analysis.v1', taskId: id(1), runId: id(2), attemptId: id(3),
  tenantId: id(4), liveEffects: false };
const lineage = { ...binding, sourceRevisionId: id(8) };
const task = { ...binding, requesterId: id(5), agentId: 'reel_analyst', allowedScope: ['reel-analysis:read'],
  issuedAt: '2026-09-17T00:00:00Z', expiresAt: '2026-09-17T00:10:00Z',
  brief: { ...lineage, idempotencyKey: id(6), objective: 'Analyze the supplied reel evidence',
    requestedModalities: ['text_only_source', 'audio'], suppliedModalities: ['text_only_source'] } };
const finding = { ...lineage, modality: 'text_only_source', observation: 'Caption opens with a question',
  interpretation: null, confidence: 'low', gaps: ['Audio unavailable'] };
const unavailable = { ...lineage, modality: 'audio', reason: 'No audio supplied' };
const artifact = { ...lineage, producedBy: 'reel_analyst', inspectedModalities: ['text_only_source'],
  findings: [finding], unavailableModalities: [unavailable] };
const handoff = { ...binding, fromAgentId: 'orchestrator', toAgentId: 'reel_analyst', inputRevisionIds: [id(8)] };
const error = { ...lineage, code: 'uninspected_modality', retryable: false, message: 'Audio was not inspected' };
const objects = [
  { schema: ReelAnalysisTaskSchema, input: task },
  { schema: ReelAnalysisBriefSchema, input: task.brief },
  { schema: ReelAnalysisHandoffSchema, input: handoff },
  { schema: ReelAnalysisArtifactSchema, input: artifact },
  { schema: ReelAnalysisFindingSchema, input: finding },
  { schema: ReelAnalysisUnavailableModalitySchema, input: unavailable },
  { schema: ReelAnalysisErrorSchema, input: error },
];

describe('reel analysis boundary', () => {
  it('accepts strict packets and findings bound to supplied, inspected text', () => {
    for (const { schema, input } of objects) expect(schema.parse(input)).toEqual(input);
    expect(validateReelAnalysisArtifact(artifact, task)).toEqual(artifact);
  });
  it('rejects extra fields, unsupported versions and external effects on every object', () => {
    for (const { schema, input } of objects) {
      for (const replacement of [{ extra: true }, { contractVersion: 'reel-analysis.v2' }, { liveEffects: true }]) {
        expect(schema.safeParse({ ...input, ...replacement }).success).toBe(false);
      }
      for (const field of ['tenantId', 'taskId', 'runId', 'attemptId']) {
        expect(schema.safeParse({ ...input, [field]: 'not-a-uuid' }).success).toBe(false);
        expect(schema.safeParse({ ...input, [field]: undefined }).success).toBe(false);
      }
    }
  });
  it('rejects substituted agents, widened scope and invalid task windows', () => {
    for (const replacement of [{ agentId: 'competitor_analyst' }, { allowedScope: ['publish'] },
      { allowedScope: ['reel-analysis:read', 'publish'] }, { requesterId: 'invalid' },
      { issuedAt: 'yesterday' }, { expiresAt: task.issuedAt }, { expiresAt: '2026-09-16T00:00:00Z' }]) {
      expect(ReelAnalysisTaskSchema.safeParse({ ...task, ...replacement }).success).toBe(false);
    }
    for (const replacement of [{ fromAgentId: 'competitor_analyst' }, { toAgentId: 'content_creator' }]) {
      expect(ReelAnalysisHandoffSchema.safeParse({ ...handoff, ...replacement }).success).toBe(false);
    }
    expect(ReelAnalysisArtifactSchema.safeParse({ ...artifact, producedBy: 'content_creator' }).success).toBe(false);
  });
  it('rejects missing, duplicate, invalid and oversized handoff lineage', () => {
    for (const inputRevisionIds of [[], [id(8), id(8)], ['invalid'], Array.from({ length: 13 }, (_, n) => id(n + 20))]) {
      expect(ReelAnalysisHandoffSchema.safeParse({ ...handoff, inputRevisionIds }).success).toBe(false);
    }
  });
  it('rejects cross-tenant, cross-task, cross-run and stale-attempt bindings at every level', () => {
    for (const field of ['tenantId', 'taskId', 'runId', 'attemptId']) {
      const otherBinding = { [field]: id(9) };
      expect(() => validateReelAnalysisArtifact({ ...artifact, ...otherBinding,
        findings: [{ ...finding, ...otherBinding }], unavailableModalities: [{ ...unavailable, ...otherBinding }] }, task))
        .toThrow('invalid_contract');
      expect(() => validateReelAnalysisArtifact(artifact, { ...task, brief: { ...task.brief, ...otherBinding } }))
        .toThrow('invalid_contract');
      expect(() => validateReelAnalysisArtifact({ ...artifact, findings: [{ ...finding, ...otherBinding }] }, task))
        .toThrow('invalid_contract');
      expect(() => validateReelAnalysisArtifact({ ...artifact, unavailableModalities: [{ ...unavailable, ...otherBinding }] }, task))
        .toThrow('invalid_contract');
    }
  });
  it('rejects invalid or absent revisions on every revision-bearing object', () => {
    for (const { schema, input } of objects.filter(({ input }) => 'sourceRevisionId' in input)) {
      for (const sourceRevisionId of [undefined, 'invalid', [id(8)]]) {
        expect(schema.safeParse({ ...input, sourceRevisionId }).success).toBe(false);
      }
    }
  });
  it('rejects another Omar revision on the artifact, finding or unavailable reason', () => {
    const otherRevision = { sourceRevisionId: id(9) };
    expect(() => validateReelAnalysisArtifact({ ...artifact, ...otherRevision,
      findings: [{ ...finding, ...otherRevision }], unavailableModalities: [{ ...unavailable, ...otherRevision }] }, task))
      .toThrow('invalid_contract');
    expect(() => validateReelAnalysisArtifact({ ...artifact, findings: [{ ...finding, ...otherRevision }] }, task))
      .toThrow('invalid_contract');
    expect(() => validateReelAnalysisArtifact({ ...artifact, unavailableModalities: [{ ...unavailable, ...otherRevision }] }, task))
      .toThrow('invalid_contract');
  });
  it('accepts each modality only when requested, supplied and inspected', () => {
    for (const modality of ReelModalitySchema.options) {
      const suppliedTask = { ...task, brief: { ...task.brief, requestedModalities: [modality], suppliedModalities: [modality] } };
      const inspectedArtifact = { ...artifact, inspectedModalities: [modality],
        findings: [{ ...finding, modality }], unavailableModalities: [] };
      expect(validateReelAnalysisArtifact(inspectedArtifact, suppliedTask)).toEqual(inspectedArtifact);
    }
  });
  it('rejects a supplied but uninspected citation in both schema and validator', () => {
    const suppliedTask = { ...task, brief: { ...task.brief, suppliedModalities: ['text_only_source', 'audio'] } };
    const falseCitation = { ...artifact, findings: [{ ...finding, modality: 'audio' }] };
    expect(ReelAnalysisArtifactSchema.safeParse(falseCitation).success).toBe(false);
    expect(() => validateReelAnalysisArtifact(falseCitation, suppliedTask)).toThrow('uninspected_modality');
  });
  it('rejects unsupplied inspection even when the artifact claims it, with or without findings', () => {
    for (const findings of [[], [{ ...finding, modality: 'audio' }]]) {
      expect(() => validateReelAnalysisArtifact({ ...artifact, inspectedModalities: ['text_only_source', 'audio'],
        findings, unavailableModalities: [] }, task)).toThrow('uninspected_modality');
    }
  });
  it('requires an explicit reason for every requested modality not inspected', () => {
    for (const unavailableModalities of [[], [unavailable, unavailable],
      [{ ...unavailable, modality: 'video_frames' }], [{ ...unavailable, reason: '   ' }],
      [unavailable, { ...unavailable, modality: 'text_only_source' }]]) {
      expect(() => validateReelAnalysisArtifact({ ...artifact, unavailableModalities }, task)).toThrow();
    }
    const nothingSupplied = { ...task, brief: { ...task.brief, suppliedModalities: [] } };
    const gapsOnly = { ...artifact, inspectedModalities: [], findings: [],
      unavailableModalities: [unavailable, { ...unavailable, modality: 'text_only_source', reason: 'Text unavailable' }] };
    expect(validateReelAnalysisArtifact(gapsOnly, nothingSupplied)).toEqual(gapsOnly);
    expect(validateReelAnalysisArtifact(gapsOnly, task)).toEqual(gapsOnly);
  });
  it('rejects duplicate, unknown, empty requested and unrequested supplied modalities', () => {
    for (const replacement of [{ requestedModalities: [] }, { requestedModalities: ['unknown'] },
      { requestedModalities: ['audio', 'audio'] }, { suppliedModalities: ['text_only_source', 'text_only_source'] },
      { suppliedModalities: ['video_frames'] }]) {
      expect(ReelAnalysisBriefSchema.safeParse({ ...task.brief, ...replacement }).success).toBe(false);
    }
    for (const inspectedModalities of [['unknown'], ['text_only_source', 'text_only_source']]) {
      expect(ReelAnalysisArtifactSchema.safeParse({ ...artifact, inspectedModalities }).success).toBe(false);
    }
    for (const modality of ['unknown', ['audio', 'text_only_source']]) {
      expect(ReelAnalysisFindingSchema.safeParse({ ...finding, modality }).success).toBe(false);
      expect(ReelAnalysisUnavailableModalitySchema.safeParse({ ...unavailable, modality }).success).toBe(false);
    }
  });
  it('bounds analysis text, finding counts, gaps and error packets', () => {
    for (const replacement of [{ observation: '' }, { observation: 'x'.repeat(8001) },
      { interpretation: '' }, { confidence: 'certain' }, { gaps: Array(31).fill('gap') }]) {
      expect(ReelAnalysisFindingSchema.safeParse({ ...finding, ...replacement }).success).toBe(false);
    }
    expect(ReelAnalysisArtifactSchema.safeParse({ ...artifact, findings: Array(101).fill(finding) }).success).toBe(false);
    for (const replacement of [{ objective: ' ' }, { idempotencyKey: 'invalid' }]) {
      expect(ReelAnalysisBriefSchema.safeParse({ ...task.brief, ...replacement }).success).toBe(false);
    }
    for (const replacement of [{ code: 'unknown' }, { retryable: 'yes' }, { message: '' }]) {
      expect(ReelAnalysisErrorSchema.safeParse({ ...error, ...replacement }).success).toBe(false);
    }
  });
});
