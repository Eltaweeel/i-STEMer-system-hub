import type { CSSProperties } from 'react';
import type { ViewMeta } from '@bagos/contracts';

// The demo indicator is application-shell chrome. It exists for every route
// that runs against a fixture source. There is deliberately NO prop, config
// flag, or environment variable that hides it while source === 'fixture'.
// It is NOT an ARIA live region — it is static, so it would re-announce on
// every navigation. The skip link renders before it in the DOM.

export interface DemoIndicatorProps {
  readonly meta: Pick<ViewMeta, 'source'>;
}

const containerStyle: CSSProperties = {
  minHeight: 'var(--c-demo-indicator-h)',
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--data-sample-tint)',
  borderBottom: '1px solid var(--data-sample-core)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  display: 'flex',
  gap: 'var(--space-4)',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const detailStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  textTransform: 'none',
  letterSpacing: 'normal',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-body-size)',
};

export function DemoIndicator({ meta }: DemoIndicatorProps): JSX.Element | null {
  if (meta.source !== 'fixture') return null;
  return (
    <div role="note" aria-label="Demo environment notice" style={containerStyle}>
      <strong data-testid="demo-indicator-title">DEMO ENVIRONMENT</strong>
      <span style={detailStyle} data-testid="demo-indicator-detail">
        Sample data — no live external actions
      </span>
    </div>
  );
}
