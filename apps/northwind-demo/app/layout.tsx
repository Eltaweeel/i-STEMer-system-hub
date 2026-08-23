import type { ReactNode } from 'react';
import { AppShell } from '@bagos/ui';
import { NORTHWIND_DATA_VERSION, NORTHWIND_FIXTURE_NOW } from '../fixtures/time';
import { TENANT_CONFIG } from '../tenant/tenant.config';
import '@bagos/ui/tokens.css';
import './globals.css';

export const metadata = {
  title: 'Northwind Field OS — Conformance Demo',
  description: 'Synthetic second-tenant conformance fixture for Business Agent OS core.',
};

const SHELL_META = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: NORTHWIND_DATA_VERSION,
  capturedAt: NORTHWIND_FIXTURE_NOW,
  generatedAt: NORTHWIND_FIXTURE_NOW,
} as const;

const NAV = [
  { href: '/', label: 'Fixture overview' },
  { href: '/organization/', label: 'Organization' },
  { href: '/agents/', label: 'Agents' },
];

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <AppShell
          meta={SHELL_META}
          productName={TENANT_CONFIG.brand.productName}
          organizationName={TENANT_CONFIG.brand.organizationName}
          nav={NAV}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
