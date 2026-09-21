import { z } from 'zod';

export const CONTENT_CALENDAR_CONTRACT_VERSION = 'content-calendar.v1' as const;
const id = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const boundedText = z.string().trim().min(1).max(8000);
const revisionIds = z.array(id).min(1).max(12).refine((values) => new Set(values).size === values.length);
export const PlatformSchema = z.enum(['instagram', 'facebook']);
export const CalendarFormatSchema = z.enum(['post', 'reel', 'story', 'carousel']);
const platforms = z.array(PlatformSchema).min(1).max(2).refine((values) => new Set(values).size === values.length);
const binding = {
  contractVersion: z.literal(CONTENT_CALENDAR_CONTRACT_VERSION),
  tenantId: id,
  taskId: id,
  runId: id,
  attemptId: id,
  liveEffects: z.literal(false),
};
const bindingFields = ['tenantId', 'taskId', 'runId', 'attemptId'] as const;
type Binding = { [Field in typeof bindingFields[number]]: string };
const sameBinding = (actual: Binding, expected: Binding) => bindingFields.every((field) => actual[field] === expected[field]);

// This is a host-bound brief, not browser input. One task drafts from one exact Ziad revision.
export const NourBriefSchema = z.object({
  ...binding,
  idempotencyKey: id,
  objective: boundedText,
  sourceRevisionId: id,
  requestedPlatforms: platforms,
}).strict();

export const NourTaskSchema = z.object({
  ...binding,
  requesterId: id,
  agentId: z.literal('content_creator'),
  allowedScope: z.tuple([z.literal('content-calendar:write')]),
  issuedAt: instant,
  expiresAt: instant,
  brief: NourBriefSchema,
}).strict().refine((task) => Date.parse(task.expiresAt) > Date.parse(task.issuedAt), 'Invalid task time window')
  .refine((task) => sameBinding(task.brief, task), 'invalid_contract');

export const NourHandoffSchema = z.object({
  ...binding,
  fromAgentId: z.literal('orchestrator'),
  toAgentId: z.literal('content_creator'),
  inputRevisionIds: revisionIds,
}).strict();

export const CalendarEntrySchema = z.object({
  ...binding,
  sourceRevisionId: id,
  dayIndex: z.number().int().min(0).max(6),
  platform: PlatformSchema,
  format: CalendarFormatSchema,
  conceptTitle: boundedText,
  objective: boundedText,
  hook: boundedText,
  // The post body itself, not a summary of one: the finished-post package is
  // assembled from this text, so anything shorter than the real caption would
  // have to be rewritten by hand before it could be approved.
  caption: boundedText,
  callToAction: boundedText,
  // What the post still needs, never what it has. No media exists anywhere in
  // this system yet, so a field that could read as an attached asset would
  // misrepresent the state of the work.
  assetRequirement: boundedText,
  // May be empty: an entry can legitimately rest on the upstream analysis as a
  // whole rather than on a specific numbered finding. Capped so a model cannot
  // pad it into an unbounded list.
  evidenceRefs: z.array(boundedText).max(12),
}).strict();

export const NourArtifactSchema = z.object({
  ...binding,
  producedBy: z.literal('content_creator'),
  sourceRevisionId: id,
  entries: z.array(CalendarEntrySchema).length(7),
}).strict().superRefine((artifact, context) => {
  for (const entry of artifact.entries) {
    if (!sameBinding(entry, artifact) || entry.sourceRevisionId !== artifact.sourceRevisionId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_contract' });
    }
  }
  if (new Set(artifact.entries.map((entry) => entry.dayIndex)).size !== 7) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_contract' });
  }
});

export const NourErrorSchema = z.object({
  ...binding,
  sourceRevisionId: id,
  code: z.enum(['unauthorized', 'invalid_contract', 'expired', 'idempotency_conflict',
    'provider_failure', 'timeout', 'unrequested_platform', 'stale_attempt', 'persistence_failure']),
  retryable: z.boolean(),
  message: boundedText,
}).strict();

export type NourTask = z.infer<typeof NourTaskSchema>;
export type NourArtifact = z.infer<typeof NourArtifactSchema>;

export const NourRunViewSchema = z.object({
  contractVersion: z.literal(CONTENT_CALENDAR_CONTRACT_VERSION), runId: id, taskId: id,
  status: z.enum(['queued', 'running', 'failed', 'succeeded']),
  attempt: z.object({ id, state: z.enum(['running', 'failed', 'succeeded']),
    retryable: z.boolean(), errorCode: NourErrorSchema.shape.code.nullable(),
  }).strict().nullable(),
  artifact: NourArtifactSchema.nullable(), revisionId: id.nullable(), liveEffects: z.literal(false),
}).strict();
export type NourRunView = z.infer<typeof NourRunViewSchema>;

// Future execution must supply trusted task/revision state; consistency checks cannot prove lineage or lease ownership.
export function validateNourArtifact(input: unknown, taskInput: unknown): NourArtifact {
  const task = NourTaskSchema.parse(taskInput);
  const artifact = NourArtifactSchema.parse(input);
  if (!sameBinding(artifact, task) || artifact.sourceRevisionId !== task.brief.sourceRevisionId) {
    throw new Error('invalid_contract');
  }
  if (artifact.entries.some((entry) => !task.brief.requestedPlatforms.includes(entry.platform))) {
    throw new Error('unrequested_platform');
  }
  return artifact;
}
