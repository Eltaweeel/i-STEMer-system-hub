import { z } from 'zod';

// No 'server-only' guard: the panel that renders these is a client component,
// so these shapes must stay safe to bundle for the browser. Schemas only, never
// a database client.
const id = z.string().uuid();

export const ApprovalRowSchema = z.object({
  approvalId: id,
  stage: z.enum(['strategy', 'finished_post']),
  status: z.enum(['pending', 'approved', 'rejected', 'invalidated']),
  artifactRevisionId: id,
  // Echoed back with any decision so the decision binds to the exact revision
  // the viewer was shown. A revision that moved underneath produces a refused
  // decision rather than one silently applied to different content.
  contentDigest: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
}).strict();

export const TenantApprovalsSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: id,
  viewerRole: z.string(),
  canDecide: z.boolean(),
  approvals: z.array(ApprovalRowSchema),
}).strict();

export type ApprovalRow = z.infer<typeof ApprovalRowSchema>;
export type TenantApprovals = z.infer<typeof TenantApprovalsSchema>;
