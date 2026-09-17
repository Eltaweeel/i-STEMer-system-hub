import { z } from 'zod';

export const REEL_ANALYSIS_CONTRACT_VERSION = 'reel-analysis.v1' as const;
const id = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const boundedText = z.string().trim().min(1).max(8000);
const revisionIds = z.array(id).min(1).max(12).refine((values) => new Set(values).size === values.length);
export const ReelModalitySchema = z.enum(['video_frames', 'audio', 'transcript', 'metadata_only', 'text_only_source']);
const modalities = z.array(ReelModalitySchema).max(5).refine((values) => new Set(values).size === values.length);
const binding = {
  contractVersion: z.literal(REEL_ANALYSIS_CONTRACT_VERSION),
  tenantId: id,
  taskId: id,
  runId: id,
  attemptId: id,
  liveEffects: z.literal(false),
};
const bindingFields = ['tenantId', 'taskId', 'runId', 'attemptId'] as const;
type Binding = { [Field in typeof bindingFields[number]]: string };
const sameBinding = (actual: Binding, expected: Binding) => bindingFields.every((field) => actual[field] === expected[field]);

// This is a host-bound brief, not browser input. One task analyzes one exact Omar revision.
export const ReelAnalysisBriefSchema = z.object({
  ...binding,
  idempotencyKey: id,
  objective: boundedText,
  sourceRevisionId: id,
  requestedModalities: modalities,
  suppliedModalities: modalities,
}).strict().refine((brief) => brief.requestedModalities.length > 0
  && brief.suppliedModalities.every((modality) => brief.requestedModalities.includes(modality)),
'Supplied modalities must be requested');

export const ReelAnalysisTaskSchema = z.object({
  ...binding,
  requesterId: id,
  agentId: z.literal('reel_analyst'),
  allowedScope: z.tuple([z.literal('reel-analysis:read')]),
  issuedAt: instant,
  expiresAt: instant,
  brief: ReelAnalysisBriefSchema,
}).strict().refine((task) => Date.parse(task.expiresAt) > Date.parse(task.issuedAt), 'Invalid task time window')
  .refine((task) => sameBinding(task.brief, task), 'invalid_contract');

export const ReelAnalysisHandoffSchema = z.object({
  ...binding,
  fromAgentId: z.literal('orchestrator'),
  toAgentId: z.literal('reel_analyst'),
  inputRevisionIds: revisionIds,
}).strict();

export const ReelAnalysisFindingSchema = z.object({
  ...binding,
  sourceRevisionId: id,
  modality: ReelModalitySchema,
  observation: boundedText,
  interpretation: boundedText.nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
  gaps: z.array(boundedText).max(30),
}).strict();

export const ReelAnalysisUnavailableModalitySchema = z.object({
  ...binding,
  sourceRevisionId: id,
  modality: ReelModalitySchema,
  reason: boundedText,
}).strict();

export const ReelAnalysisArtifactSchema = z.object({
  ...binding,
  producedBy: z.literal('reel_analyst'),
  sourceRevisionId: id,
  inspectedModalities: modalities,
  findings: z.array(ReelAnalysisFindingSchema).max(100),
  unavailableModalities: z.array(ReelAnalysisUnavailableModalitySchema).max(5),
}).strict().superRefine((artifact, context) => {
  for (const entry of [...artifact.findings, ...artifact.unavailableModalities]) {
    if (!sameBinding(entry, artifact) || entry.sourceRevisionId !== artifact.sourceRevisionId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_contract' });
    }
  }
  if (artifact.findings.some((finding) => !artifact.inspectedModalities.includes(finding.modality))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'uninspected_modality' });
  }
  const unavailable = artifact.unavailableModalities.map((entry) => entry.modality);
  if (new Set(unavailable).size !== unavailable.length
    || unavailable.some((modality) => artifact.inspectedModalities.includes(modality))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_contract' });
  }
});

export const ReelAnalysisErrorSchema = z.object({
  ...binding,
  sourceRevisionId: id,
  code: z.enum(['unauthorized', 'invalid_contract', 'expired', 'idempotency_conflict',
    'provider_failure', 'timeout', 'uninspected_modality', 'stale_attempt', 'persistence_failure']),
  retryable: z.boolean(),
  message: boundedText,
}).strict();

export type ReelAnalysisTask = z.infer<typeof ReelAnalysisTaskSchema>;
export type ReelAnalysisArtifact = z.infer<typeof ReelAnalysisArtifactSchema>;

export const ReelAnalysisRunViewSchema = z.object({
  contractVersion: z.literal(REEL_ANALYSIS_CONTRACT_VERSION), runId: id, taskId: id,
  status: z.enum(['queued', 'running', 'failed', 'succeeded']),
  attempt: z.object({ id, state: z.enum(['running', 'failed', 'succeeded']),
    retryable: z.boolean(), errorCode: ReelAnalysisErrorSchema.shape.code.nullable(),
  }).strict().nullable(),
  artifact: ReelAnalysisArtifactSchema.nullable(), revisionId: id.nullable(), liveEffects: z.literal(false),
}).strict();
export type ReelAnalysisRunView = z.infer<typeof ReelAnalysisRunViewSchema>;

// Inspection claims require a trusted host in future execution code; shape checks cannot prove inspection or lease ownership.
export function validateReelAnalysisArtifact(input: unknown, taskInput: unknown): ReelAnalysisArtifact {
  const task = ReelAnalysisTaskSchema.parse(taskInput);
  const artifact = ReelAnalysisArtifactSchema.parse(input);
  if (!sameBinding(artifact, task) || artifact.sourceRevisionId !== task.brief.sourceRevisionId) {
    throw new Error('invalid_contract');
  }
  if (artifact.inspectedModalities.some((modality) => !task.brief.suppliedModalities.includes(modality))) {
    throw new Error('uninspected_modality');
  }
  const missing = task.brief.requestedModalities.filter((modality) => !artifact.inspectedModalities.includes(modality));
  if (artifact.unavailableModalities.length !== missing.length
    || artifact.unavailableModalities.some((entry) => !missing.includes(entry.modality))) {
    throw new Error('invalid_contract');
  }
  return artifact;
}
