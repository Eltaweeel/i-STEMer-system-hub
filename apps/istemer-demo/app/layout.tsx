import type { ReactNode } from 'react';
import { AppShell } from '@bagos/ui';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW } from '@bagos/fixtures';
import { TENANT_CONFIG } from '../tenant/tenant.config';
import '@bagos/ui/tokens.css';
import './globals.css';

// The AppShell is the ONLY place the demo indicator lives. Because it is in
// the root layout, every route in the App Router inherits it — that is what
// makes the "on every route" guarantee structural rather than a promise.
//
// The `meta.source === 'fixture'` invariant holds until a real data source is
// introduced. There is no environment variable that hides the indicator.

export const metadata = {
  title: 'Business Agent OS — i-STEMer Demo',
  description:
    'Fixtures-only, read-only visual operating system for managing AI agents. Demo environment.',
};

const SHELL_META = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

const NAV = [
  { href: '/en/auth/login', label: 'Sign in / تسجيل الدخول' },
  { href: '/', label: 'Command center' },
  { href: '/organization/', label: 'Organization' },
  { href: '/coordination-cycle/', label: 'Coordination cycle' },
  { href: '/workflows/', label: 'Workflows' },
  { href: '/agents/', label: 'Agents' },
  { href: '/hermes-team/', label: 'Hermes team' },
  { href: '/approvals/', label: 'Approvals' },
  { href: '/system-health/', label: 'System health' },
];

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
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
