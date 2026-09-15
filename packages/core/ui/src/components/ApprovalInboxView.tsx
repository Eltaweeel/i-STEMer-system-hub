import type { CSSProperties } from 'react';
import type { ApprovalPackage } from '@bagos/contracts';

// Accessible approval queue. Uses a semantic <ul> so screen readers can walk
// the list in authored order. Status is always PENDING — there is no mechanism
// to flip it. Clicking a row navigates to the exact-revision detail page.

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-3)',
};

const itemStyle: CSSProperties = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderLeft: '3px solid var(--status-attention-core)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4) var(--space-5)',
};

const TIER_LABEL: Record<ApprovalPackage['requiredTier'], string> = {
  tier_0_internal: 'Internal',
  persisted_exact_revision: 'Exact revision',
  owner_only: 'Owner only',
};

export interface ApprovalInboxViewProps {
  readonly packages: readonly ApprovalPackage[];
  readonly getDetailHref: (id: string) => string;
  readonly formatTime: (iso: string) => string;
}

export function ApprovalInboxView({
  packages,
  getDetailHref,
  formatTime,
}: ApprovalInboxViewProps): React.JSX.Element {
  if (packages.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)' }}>No approval packages pending.</p>
    );
  }
  return (
    <ul style={listStyle} aria-label="Pending approval packages">
      {packages.map((pkg) => (
        <li key={pkg.id} style={itemStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-4)',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  ...kickerStyle,
                  color: 'var(--status-attention-core)',
                }}
              >
                PENDING
              </span>
              <span style={kickerStyle}>{TIER_LABEL[pkg.requiredTier]}</span>
              <span style={kickerStyle}>Due {formatTime(pkg.deadline)}</span>
            </div>
            <a
              href={getDetailHref(pkg.id)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-label-size)',
                letterSpacing: 'var(--tracking-label)',
                color: 'var(--text-link)',
                textDecoration: 'none',
              }}
            >
              {pkg.title}
            </a>
            <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '72ch' }}>
              {pkg.requestedAction}
            </p>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Agent: {pkg.responsibleAgent} · {pkg.targetSystem}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
