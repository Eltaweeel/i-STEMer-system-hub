import { z } from 'zod';

// No 'server-only' guard here: the panel that renders this log is a client
// component, so these shapes must stay safe to bundle for the browser. This
// module carries only schemas, never a database client. Fields mirror exactly
// the column-level grant on public.audit_log (see the Phase 1A migration) --
// evidence is deliberately excluded there and must never be added here.
const id = z.string().uuid();

export const AuditEntrySchema = z.object({
  auditId: id,
  actorKind: z.enum(['human', 'system', 'agent']),
  actorReference: id,
  eventType: z.string().min(1).max(128),
  // Both null on events with no single addressed row (for example a workflow
  // being created); present together whenever the command targeted a
  // specific artifact revision.
  targetReference: id.nullable(),
  targetRevision: z.number().int().positive().nullable(),
  commandId: id,
  createdAt: z.string(),
}).strict();

export const TenantAuditLogSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: id,
  entries: z.array(AuditEntrySchema),
}).strict();

export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export type TenantAuditLog = z.infer<typeof TenantAuditLogSchema>;
