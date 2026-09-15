import type { CSSProperties } from 'react';
import type { RuntimeStatus } from '@bagos/contracts';

// Every status is a coloured DOT + UPPERCASE TEXT. Colour is never the
// only signal. Removing the dot loses nothing that removing the text
// would not also lose.

const LABEL: Record<RuntimeStatus, string> = {
  idle: 'IDLE',
  running: 'RUNNING',
  ok: 'OK',
  attention: 'ATTENTION',
  blocked: 'BLOCKED',
  error: 'ERROR',
  offline: 'OFFLINE',
  unknown: 'UNKNOWN',
  draft: 'DRAFT',
};

// Only the status axis is referenced. No domain colour appears here.
function coreVar(status: RuntimeStatus): string {
  return `var(--status-${status}-core)`;
}
function tintVar(status: RuntimeStatus): string {
  return `var(--status-${status}-tint)`;
}

export interface StatusBadgeProps {
  readonly status: RuntimeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const wrap: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    height: 'var(--c-badge-h)',
    padding: '0 var(--c-badge-px)',
    borderRadius: 'var(--radius-pill)',
    background: tintVar(status),
    border: `1px solid ${coreVar(status)}`,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-micro-size)',
    letterSpacing: 'var(--tracking-micro)',
    textTransform: 'uppercase',
  };
  const dot: CSSProperties = {
    width: 'var(--c-badge-dot)',
    height: 'var(--c-badge-dot)',
    borderRadius: '999px',
    background: coreVar(status),
    flex: '0 0 auto',
  };
  return (
    <span style={wrap} aria-label={`status: ${LABEL[status]}`}>
      <span aria-hidden="true" style={dot} />
      <span>{LABEL[status]}</span>
    </span>
  );
}
