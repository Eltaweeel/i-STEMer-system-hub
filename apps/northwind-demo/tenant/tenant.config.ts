import { TenantConfigSchema, type TenantConfigParsed } from '@bagos/contracts';

const RAW = {
  tenantId: 'northwind-demo',
  brand: {
    productName: 'Northwind Field OS',
    organizationName: 'Northwind Research Cooperative',
  },
  timezone: 'Africa/Cairo',
  domains: [
    { slug: 'expedition-ops', label: 'Expedition Operations', slot: 1 },
    { slug: 'instrumentation', label: 'Instrumentation', slot: 3 },
    { slug: 'data-stewardship', label: 'Data Stewardship', slot: 5 },
    { slug: 'safety-review', label: 'Safety Review', slot: 7 },
  ],
} as const;

export const TENANT_CONFIG: TenantConfigParsed = TenantConfigSchema.parse(RAW);

export function slotForDomain(slug: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  const domain = TENANT_CONFIG.domains.find((candidate) => candidate.slug === slug);
  if (!domain) throw new Error(`Unknown Northwind domain slug: ${slug}`);
  return domain.slot;
}
