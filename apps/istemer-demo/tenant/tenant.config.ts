import { TenantConfigSchema, type TenantConfigParsed } from '@bagos/contracts';

// Tenant config passes through Zod at the boundary. This is one of the very
// small number of places where Zod runs; from here on we use plain TS.

const RAW = {
  tenantId: 'istemer-demo',
  brand: {
    productName: 'Business Agent OS',
    organizationName: 'i-STEMer Demo',
  },
  timezone: 'Africa/Cairo',
  domains: [
    { slug: 'executive', label: 'Executive', slot: 1 },
    { slug: 'marketing', label: 'Marketing', slot: 2 },
    { slug: 'social',    label: 'Social',    slot: 3 },
    { slug: 'creative',  label: 'Creative',  slot: 4 },
  ],
} as const;

export const TENANT_CONFIG: TenantConfigParsed = TenantConfigSchema.parse(RAW);

export function slotForDomain(slug: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  const found = TENANT_CONFIG.domains.find((d) => d.slug === slug);
  if (!found) throw new Error(`Unknown tenant domain slug: ${slug}`);
  return found.slot;
}
