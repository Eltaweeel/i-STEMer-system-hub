import 'server-only';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { ResearchRequestError } from './research-request';
import { AuditEntrySchema, TenantAuditLogSchema, type TenantAuditLog } from './audit-types';

export { TenantAuditLogSchema, type TenantAuditLog, type AuditEntry } from './audit-types';

const auditRow = z.object({
  id: z.string().uuid(), tenant_id: z.string().uuid(), actor_kind: z.enum(['human', 'system', 'agent']),
  actor_reference: z.string().uuid(), event_type: z.string().min(1).max(128),
  target_reference: z.string().uuid().nullable(), target_revision: z.number().int().positive().nullable(),
  command_id: z.string().uuid(), created_at: z.string(),
});

// The demo's whole chain (a workflow creation, three agent attempt runs, an
// auto-created approval, and one decision) is under a dozen rows per tenant.
// One hundred stays far above that so the trail never looks truncated during
// a demo, while still keeping the response small enough to render without
// pagination; raise it only alongside an actual pagination story, not by
// widening the ceiling further.
const RECENT_ENTRIES_LIMIT = 100;

export async function readTenantAuditLog(tenantId: string): Promise<TenantAuditLog> {
  if (!z.string().uuid().safeParse(tenantId).success) throw new ResearchRequestError('invalid_contract', 400);
  const client = await createClient();
  if (!client) throw new ResearchRequestError('persistence_failure', 503, true);
  // Selects only the columns the Phase 1A migration grants `authenticated` on
  // public.audit_log -- evidence is intentionally excluded there and must
  // stay excluded here. Tenant scoping is enforced twice over: the explicit
  // .eq() below, and the member_read RLS policy on the table itself.
  const response = await client.from('audit_log')
    .select('id,tenant_id,actor_kind,actor_reference,event_type,target_reference,target_revision,command_id,created_at')
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(RECENT_ENTRIES_LIMIT);
  // A tenant with genuine no history yields zero rows, not an error -- but a
  // real database error must never be swallowed into that same empty list,
  // or a demo audience would read an outage as "nothing ever happened".
  // Note the one case this layer cannot distinguish: RLS filters a non-member's
  // rows away silently rather than raising, so a non-member and an empty tenant
  // both arrive here as zero rows. That is acceptable only because the page
  // renders this panel behind readTenantAccess, which already refused a
  // non-member. Anything that reuses this read outside that check needs its own
  // membership gate rather than inferring one from an empty list.
  if (response.error) throw new ResearchRequestError('persistence_failure', 503, true);
  const rows = z.array(auditRow).safeParse(response.data);
  if (!rows.success) throw new ResearchRequestError('invalid_contract', 503);
  return TenantAuditLogSchema.parse({
    schemaVersion: 1,
    tenantId,
    entries: rows.data.map((row) => AuditEntrySchema.parse({
      auditId: row.id,
      actorKind: row.actor_kind,
      actorReference: row.actor_reference,
      // Not translated or filtered here: an event type this module does not
      // recognise still has to reach the panel verbatim rather than being
      // dropped, so the schema stays a bounded string, not an enum.
      eventType: row.event_type,
      targetReference: row.target_reference,
      targetRevision: row.target_revision,
      commandId: row.command_id,
      createdAt: row.created_at,
    })),
  });
}
