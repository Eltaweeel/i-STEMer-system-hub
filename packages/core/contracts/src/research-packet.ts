import { z } from 'zod';

export const RESEARCH_CONTRACT_VERSION = 'research.v1' as const;
const id = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const boundedText = z.string().trim().min(1).max(8000);
const revisionIds = z.array(id).min(1).max(12).refine((values) => new Set(values).size === values.length);
const source = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Research sources must use HTTPS without credentials');

// Browser input deliberately has no authority-bearing identity fields.
export const ResearchBriefSchema = z.object({
  idempotencyKey: id,
  objective: boundedText,
  sources: z.array(source).min(1).max(12).refine((values) => new Set(values).size === values.length),
}).strict();

export const ResearchTaskSchema = z.object({
  contractVersion: z.literal(RESEARCH_CONTRACT_VERSION),
  taskId: id,
  runId: id,
  attemptId: id,
  tenantId: id,
  requesterId: id,
  agentId: z.literal('competitor_analyst'),
  allowedScope: z.tuple([z.literal('research:read')]),
  issuedAt: instant,
  expiresAt: instant,
  brief: ResearchBriefSchema,
  liveEffects: z.literal(false),
}).strict().refine((value) => Date.parse(value.expiresAt) > Date.parse(value.issuedAt), 'Invalid task time window');

export const ResearchHandoffSchema = z.object({
  contractVersion: z.literal(RESEARCH_CONTRACT_VERSION),
  taskId: id,
  runId: id,
  attemptId: id,
  tenantId: id,
  fromAgentId: z.literal('orchestrator'),
  toAgentId: z.literal('competitor_analyst'),
  inputRevisionIds: revisionIds,
  liveEffects: z.literal(false),
}).strict();

// An inspection receipt must come from the host tool observer, never model prose.
export const SourceInspectionSchema = z.object({
  contractVersion: z.literal(RESEARCH_CONTRACT_VERSION),
  tenantId: id,
  taskId: id,
  runId: id,
  attemptId: id,
  sourceUrl: source,
  inspectedAt: instant,
  receiptId: id,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const ResearchEvidenceSchema = z.object({
  sourceUrl: source,
  inspectionReceiptId: id,
  inspectedAt: instant,
  observation: boundedText,
  interpretation: boundedText.nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
  gaps: z.array(boundedText).max(30),
}).strict();
export const ResearchArtifactSchema = z.object({
  contractVersion: z.literal(RESEARCH_CONTRACT_VERSION),
  taskId: id,
  runId: id,
  attemptId: id,
  tenantId: id,
  producedBy: z.literal('competitor_analyst'),
  sourceRevisionIds: revisionIds,
  evidence: z.array(ResearchEvidenceSchema).min(1).max(100),
  gaps: z.array(boundedText).max(30),
  liveEffects: z.literal(false),
}).strict();

export const ResearchErrorSchema = z.object({
  contractVersion: z.literal(RESEARCH_CONTRACT_VERSION),
  code: z.enum(['unauthorized', 'invalid_contract', 'expired', 'idempotency_conflict',
    'provider_failure', 'timeout', 'uninspected_source', 'stale_attempt', 'persistence_failure']),
  retryable: z.boolean(),
  message: boundedText,
}).strict();

// stale_attempt is reserved for the durable run registry: shape validation cannot
// establish whether an otherwise well-formed attempt still owns its lease.

export type ResearchTask = z.infer<typeof ResearchTaskSchema>;
export type ResearchArtifact = z.infer<typeof ResearchArtifactSchema>;
export type SourceInspection = z.infer<typeof SourceInspectionSchema>;

export const ResearchRunViewSchema = z.object({
  contractVersion: z.literal(RESEARCH_CONTRACT_VERSION), runId: id, taskId: id,
  status: z.enum(['queued', 'running', 'failed', 'succeeded']),
  attempt: z.object({ id, state: z.enum(['running', 'failed', 'succeeded']),
    retryable: z.boolean(), errorCode: ResearchErrorSchema.shape.code.nullable(),
  }).strict().nullable(),
  artifact: ResearchArtifactSchema.nullable(), revisionId: id.nullable(), liveEffects: z.literal(false),
}).strict();
export type ResearchRunView = z.infer<typeof ResearchRunViewSchema>;

export function validateResearchArtifact(
  input: unknown,
  taskInput: unknown,
  receiptInputs: readonly unknown[],
  expectedRevisionIds: readonly string[],
): ResearchArtifact {
  const task = ResearchTaskSchema.parse(taskInput);
  const artifact = ResearchArtifactSchema.parse(input);
  const expected = revisionIds.parse(expectedRevisionIds);
  for (const field of ['tenantId', 'taskId', 'runId', 'attemptId'] as const) {
    if (artifact[field] !== task[field]) throw new Error('invalid_contract');
  }
  if (artifact.sourceRevisionIds.length !== expected.length
    || new Set(artifact.sourceRevisionIds).size !== artifact.sourceRevisionIds.length
    || artifact.sourceRevisionIds.some((value) => !expected.includes(value))) {
    throw new Error('invalid_contract');
  }
  const receipts = z.array(SourceInspectionSchema).max(100).parse(receiptInputs);
  if (new Set(receipts.map((receipt) => receipt.receiptId)).size !== receipts.length) {
    throw new Error('invalid_contract');
  }
  for (const receipt of receipts) {
    for (const field of ['tenantId', 'taskId', 'runId', 'attemptId'] as const) {
      if (receipt[field] !== task[field]) throw new Error('uninspected_source');
    }
    if (Date.parse(receipt.inspectedAt) < Date.parse(task.issuedAt)
      || Date.parse(receipt.inspectedAt) >= Date.parse(task.expiresAt)) {
      throw new Error('uninspected_source');
    }
  }
  for (const item of artifact.evidence) {
    if (!task.brief.sources.includes(item.sourceUrl) || !receipts.some((receipt) =>
      receipt.receiptId === item.inspectionReceiptId && receipt.sourceUrl === item.sourceUrl
      && receipt.inspectedAt === item.inspectedAt)) throw new Error('uninspected_source');
  }
  return artifact;
}
