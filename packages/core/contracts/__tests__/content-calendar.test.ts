import { describe, expect, it } from 'vitest';
import { CalendarEntrySchema, CalendarFormatSchema, NourArtifactSchema, NourBriefSchema,
  NourErrorSchema, NourHandoffSchema, NourTaskSchema, PlatformSchema, validateNourArtifact } from '../src/content-calendar';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const binding = { contractVersion: 'content-calendar.v1', taskId: id(1), runId: id(2), attemptId: id(3),
  tenantId: id(4), liveEffects: false };
const lineage = { ...binding, sourceRevisionId: id(8) };
const task = { ...binding, requesterId: id(5), agentId: 'content_creator', allowedScope: ['content-calendar:write'],
  issuedAt: '2026-09-17T00:00:00Z', expiresAt: '2026-09-17T00:10:00Z',
  brief: { ...lineage, idempotencyKey: id(6), objective: 'Draft a seven-day calendar from reel analysis',
    requestedPlatforms: ['instagram'] } };
const entry = { ...lineage, dayIndex: 0, platform: 'instagram', format: 'reel', conceptTitle: 'Learning through experiments' };
const artifact = { ...lineage, producedBy: 'content_creator',
  entries: Array.from({ length: 7 }, (_, dayIndex) => ({ ...entry, dayIndex })) };
const handoff = { ...binding, fromAgentId: 'orchestrator', toAgentId: 'content_creator', inputRevisionIds: [id(8)] };
const error = { ...lineage, code: 'unrequested_platform', retryable: false, message: 'Facebook was not requested' };
const objects = [
  { schema: NourTaskSchema, input: task },
  { schema: NourBriefSchema, input: task.brief },
  { schema: NourHandoffSchema, input: handoff },
  { schema: NourArtifactSchema, input: artifact },
  { schema: CalendarEntrySchema, input: entry },
  { schema: NourErrorSchema, input: error },
];

describe('content calendar boundary', () => {
  it('accepts strict packets and seven entries bound to the requested platform', () => {
    for (const { schema, input } of objects) expect(schema.parse(input)).toEqual(input);
    expect(validateNourArtifact(artifact, task)).toEqual(artifact);
    const reordered = { ...artifact, entries: [...artifact.entries].reverse() };
    expect(validateNourArtifact(reordered, task)).toEqual(reordered);
  });
  it('rejects extra fields, unsupported versions and external effects on every object', () => {
    for (const { schema, input } of objects) {
      for (const replacement of [{ extra: true }, { contractVersion: 'content-calendar.v2' }, { liveEffects: true }]) {
        expect(schema.safeParse({ ...input, ...replacement }).success).toBe(false);
      }
      for (const field of ['tenantId', 'taskId', 'runId', 'attemptId']) {
        expect(schema.safeParse({ ...input, [field]: 'not-a-uuid' }).success).toBe(false);
        expect(schema.safeParse({ ...input, [field]: undefined }).success).toBe(false);
      }
    }
  });
  it('rejects substituted agents, widened scope and invalid task windows', () => {
    for (const replacement of [{ agentId: 'reel_analyst' }, { allowedScope: ['content-calendar:read'] },
      { allowedScope: [] }, { allowedScope: ['content-calendar:write', 'publish'] }, { requesterId: 'invalid' },
      { issuedAt: 'yesterday' }, { expiresAt: 'tomorrow' }, { expiresAt: task.issuedAt },
      { expiresAt: '2026-09-16T00:00:00Z' }]) {
      expect(NourTaskSchema.safeParse({ ...task, ...replacement }).success).toBe(false);
    }
    for (const replacement of [{ fromAgentId: 'reel_analyst' }, { toAgentId: 'reel_analyst' }]) {
      expect(NourHandoffSchema.safeParse({ ...handoff, ...replacement }).success).toBe(false);
    }
    expect(NourArtifactSchema.safeParse({ ...artifact, producedBy: 'reel_analyst' }).success).toBe(false);
  });
  it('rejects missing, duplicate, invalid and oversized handoff lineage', () => {
    for (const inputRevisionIds of [undefined, [], [id(8), id(8)], ['invalid'], Array.from({ length: 13 }, (_, n) => id(n + 20))]) {
      expect(NourHandoffSchema.safeParse({ ...handoff, inputRevisionIds }).success).toBe(false);
    }
  });
  it('rejects cross-tenant, cross-task, cross-run and stale-attempt bindings at every level', () => {
    for (const field of ['tenantId', 'taskId', 'runId', 'attemptId']) {
      const otherBinding = { [field]: id(9) };
      expect(() => validateNourArtifact({ ...artifact, ...otherBinding,
        entries: artifact.entries.map((calendarEntry) => ({ ...calendarEntry, ...otherBinding })) }, task))
        .toThrow('invalid_contract');
      expect(() => validateNourArtifact(artifact, { ...task, brief: { ...task.brief, ...otherBinding } }))
        .toThrow('invalid_contract');
      expect(() => validateNourArtifact({ ...artifact,
        entries: artifact.entries.map((calendarEntry) => calendarEntry.dayIndex === 6
          ? { ...calendarEntry, ...otherBinding } : calendarEntry) }, task)).toThrow('invalid_contract');
    }
  });
  it('rejects invalid or absent revisions on every revision-bearing object', () => {
    for (const { schema, input } of objects.filter(({ input }) => 'sourceRevisionId' in input)) {
      for (const sourceRevisionId of [undefined, 'invalid', [id(8)]]) {
        expect(schema.safeParse({ ...input, sourceRevisionId }).success).toBe(false);
      }
    }
  });
  it('rejects another Ziad revision on the artifact, brief or an individual entry', () => {
    const otherRevision = { sourceRevisionId: id(9) };
    expect(() => validateNourArtifact({ ...artifact, ...otherRevision,
      entries: artifact.entries.map((calendarEntry) => ({ ...calendarEntry, ...otherRevision })) }, task))
      .toThrow('invalid_contract');
    expect(() => validateNourArtifact(artifact, { ...task, brief: { ...task.brief, ...otherRevision } }))
      .toThrow('invalid_contract');
    expect(() => validateNourArtifact({ ...artifact,
      entries: [{ ...entry, ...otherRevision }, ...artifact.entries.slice(1)] }, task)).toThrow('invalid_contract');
  });
  it('accepts each requested platform and every supported format', () => {
    for (const platform of PlatformSchema.options) {
      for (const format of CalendarFormatSchema.options) {
        const requestedTask = { ...task, brief: { ...task.brief, requestedPlatforms: [platform] } };
        const requestedArtifact = { ...artifact, entries: artifact.entries.map((calendarEntry) => ({ ...calendarEntry, platform, format })) };
        expect(validateNourArtifact(requestedArtifact, requestedTask)).toEqual(requestedArtifact);
      }
    }
    const mixed = { ...artifact, entries: [{ ...entry, platform: 'facebook' }, ...artifact.entries.slice(1)] };
    expect(validateNourArtifact(mixed, { ...task, brief: { ...task.brief, requestedPlatforms: ['instagram', 'facebook'] } }))
      .toEqual(mixed);
  });
  it('rejects even one entry citing a valid but unrequested platform', () => {
    const unrequested = { ...artifact, entries: [...artifact.entries.slice(0, 6), { ...entry, dayIndex: 6, platform: 'facebook' }] };
    expect(NourArtifactSchema.parse(unrequested)).toEqual(unrequested);
    expect(() => validateNourArtifact(unrequested, task)).toThrow('unrequested_platform');
  });
  it('rejects missing, empty, duplicate, unknown and oversized requested platforms', () => {
    for (const requestedPlatforms of [undefined, [], ['unknown'], ['instagram', 'instagram'], ['instagram', 'facebook', 'instagram']]) {
      expect(NourBriefSchema.safeParse({ ...task.brief, requestedPlatforms }).success).toBe(false);
    }
    for (const replacement of [{ platform: 'unknown' }, { platform: ['instagram', 'facebook'] }, { format: 'video' }]) {
      expect(CalendarEntrySchema.safeParse({ ...entry, ...replacement }).success).toBe(false);
    }
  });
  it('rejects missing days, duplicate days and wrong entry counts in schema and validator', () => {
    for (const entries of [[], artifact.entries.slice(1), [...artifact.entries, { ...entry }],
      [...artifact.entries.slice(0, 6), { ...entry }]]) {
      expect(NourArtifactSchema.safeParse({ ...artifact, entries }).success).toBe(false);
      expect(() => validateNourArtifact({ ...artifact, entries }, task)).toThrow();
    }
  });
  it('rejects out-of-range, fractional, missing and nonnumeric day indices', () => {
    for (const dayIndex of [-1, 7, 0.5, undefined, '0']) {
      expect(CalendarEntrySchema.safeParse({ ...entry, dayIndex }).success).toBe(false);
      expect(() => validateNourArtifact({ ...artifact,
        entries: [{ ...entry, dayIndex }, ...artifact.entries.slice(1)] }, task)).toThrow();
    }
  });
  it('bounds and trims calendar text, brief objectives and error messages', () => {
    for (const text of ['', '   ', 'x'.repeat(8001)]) {
      expect(CalendarEntrySchema.safeParse({ ...entry, conceptTitle: text }).success).toBe(false);
      expect(NourBriefSchema.safeParse({ ...task.brief, objective: text }).success).toBe(false);
      expect(NourErrorSchema.safeParse({ ...error, message: text }).success).toBe(false);
    }
    expect(CalendarEntrySchema.parse({ ...entry, conceptTitle: '  Idea  ' }).conceptTitle).toBe('Idea');
    expect(CalendarEntrySchema.parse({ ...entry, conceptTitle: 'x'.repeat(8000) }).conceptTitle).toHaveLength(8000);
    expect(NourBriefSchema.safeParse({ ...task.brief, idempotencyKey: 'invalid' }).success).toBe(false);
    for (const replacement of [{ code: 'unknown' }, { retryable: 'yes' }]) {
      expect(NourErrorSchema.safeParse({ ...error, ...replacement }).success).toBe(false);
    }
  });
});
