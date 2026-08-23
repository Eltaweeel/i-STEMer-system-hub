import { z } from 'zod';

// -----------------------------------------------------------------------------
// Zod lives at trust boundaries: imported JSON, tenant config, URL search
// params. Everywhere else we use strict TypeScript + `satisfies`. There is
// deliberately no release-versioned schema ecosystem here.
// -----------------------------------------------------------------------------

// --- Domain slot -------------------------------------------------------------

export const DomainSlotSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

// --- Tenant config -----------------------------------------------------------

export const TenantDomainSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  slot: DomainSlotSchema,
});

export const TenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  brand: z.object({
    productName: z.string().min(1),
    organizationName: z.string().min(1),
  }),
  // Timezone is fixed to Africa/Cairo per Batch 1 spec §7.
  timezone: z.literal('Africa/Cairo'),
  domains: z.array(TenantDomainSchema).min(1).max(8),
});
export type TenantConfigInput = z.input<typeof TenantConfigSchema>;
export type TenantConfigParsed = z.output<typeof TenantConfigSchema>;

// --- Agent manifest (the on-disk JSON) --------------------------------------
// This schema parses the fields the app actually consumes. Fields we do not
// use are permitted and passed through by z.object being non-strict.

export const ApprovalPolicySchema = z.object({
  default: z.string(),
  external_publish_or_send: z.string(),
  spend_or_finance_mutation: z.string(),
  permissions_or_deletion: z.string(),
});

export const AgentManifestEntrySchema = z.object({
  schema_version: z.string(),
  id: z.string().min(1),
  display_name: z.string().min(1),
  department: z.string().min(1),
  purpose: z.string().min(1),
  runtime_mode: z.enum(['on_demand_job', 'scheduled_job', 'daemon']),
  reports_to: z.string().min(1),
  enabled_by_default: z.boolean(),
  triggers: z.array(z.string()),
  allowed_inputs: z.array(z.string()),
  allowed_outputs: z.array(z.string()),
  allowed_tools: z.array(z.string()),
  prohibited_actions: z.array(z.string()),
  approval_policy: ApprovalPolicySchema,
  sop_refs: z.array(z.string()),
});

export const AgentManifestFileSchema = z.object({
  schema_version: z.string(),
  organization: z.string(),
  default_runtime_model: z.string(),
  departments: z.record(z.string(), z.number().int().nonnegative()),
  agents: z.array(AgentManifestEntrySchema).min(1),
});
export type AgentManifestFile = z.output<typeof AgentManifestFileSchema>;
export type AgentManifestEntry = z.output<typeof AgentManifestEntrySchema>;

// --- URL search params (organization view) ----------------------------------

export const OrganizationSearchSchema = z.object({
  selected: z
    .string()
    .regex(/^(human|conductor|agent|department):[a-z0-9-]+$/)
    .optional(),
  view: z.enum(['graph', 'tree']).optional(),
});
export type OrganizationSearch = z.output<typeof OrganizationSearchSchema>;
