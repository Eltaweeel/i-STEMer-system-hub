import type { CSSProperties, ReactNode } from 'react';
import type { ViewMeta } from '@bagos/contracts';
import { DemoIndicator } from './DemoIndicator';
import { CommandPalette, type CommandPaletteItem } from './CommandPalette';

export type AppShellNavItem = CommandPaletteItem;

export interface AppShellProps {
  readonly meta: ViewMeta;
  readonly productName: string;
  readonly organizationName: string;
  readonly children: ReactNode;
  readonly nav?: readonly AppShellNavItem[];
}

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--surface-canvas)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-body-size)',
  lineHeight: 'var(--text-body-lh)',
  display: 'flex',
  flexDirection: 'column',
};

const topbarStyle: CSSProperties = {
  minHeight: 'var(--layout-topbar-h)',
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--surface-nav)',
  borderBottom: '1px solid var(--line-subtle)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-5)',
  flexWrap: 'wrap',
};

const brandStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  fontWeight: 'var(--weight-semibold)' as unknown as number,
};

const tenantStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const navStyle: CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  gap: 'var(--space-5)',
  flexWrap: 'wrap',
  alignItems: 'center',
};

const navLinkStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  textDecoration: 'none',
};

const mainStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--space-6)',
  maxWidth: 'var(--layout-content-max)',
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
};

const skipLinkStyle: CSSProperties = {
  position: 'absolute',
  left: '-9999px',
  top: 0,
};

export function AppShell({
  meta,
  productName,
  organizationName,
  children,
  nav,
}: AppShellProps): JSX.Element {
  return (
    <div style={shellStyle}>
      <a href="#main-content" style={skipLinkStyle}>Skip to main content</a>
      <DemoIndicator meta={meta} />
      <header className="app-shell-topbar" style={topbarStyle}>
        <span style={brandStyle}>{productName}</span>
        <span style={tenantStyle} aria-label="tenant">{organizationName}</span>
        {nav && nav.length > 0 ? (
          <nav className="app-shell-nav" aria-label="Primary" style={navStyle}>
            <CommandPalette items={nav} />
            {nav.map((item) => (
              <a key={item.href} href={item.href} style={navLinkStyle}>
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}
      </header>
      <main id="main-content" style={mainStyle}>
        {children}
      </main>
    </div>
  );
}
