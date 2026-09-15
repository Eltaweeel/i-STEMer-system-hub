import type { TrendAlert } from '@bagos/contracts';

export interface TrendAlertCardProps {
  readonly alert: TrendAlert;
  readonly formatTime: (iso: string) => string;
}

export function TrendAlertCard({ alert, formatTime }: TrendAlertCardProps): React.JSX.Element {
  return (
    <article
      aria-label="Fixture example trend alert"
      style={{
        padding: 'var(--space-5)',
        background: 'var(--status-attention-tint)',
        border: '1px solid var(--status-attention-core)',
        borderRadius: 'var(--radius-panel)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)' }}>
          Trend alert
        </strong>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-attention-core)', fontSize: 'var(--text-micro-size)', letterSpacing: 'var(--tracking-micro)', textTransform: 'uppercase' }}>
          Fixture example · not live
        </span>
      </div>
      <p style={{ margin: 0 }}>{alert.observation}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(7rem, auto) 1fr', gap: 'var(--space-2) var(--space-4)', margin: 0 }}>
        <dt style={{ color: 'var(--text-muted)' }}>Observed</dt>
        <dd style={{ margin: 0 }}>{formatTime(alert.observedAt)}</dd>
        <dt style={{ color: 'var(--text-muted)' }}>Evidence</dt>
        <dd style={{ margin: 0 }}>{alert.evidenceLabel} <code>{alert.evidenceRef}</code></dd>
        <dt style={{ color: 'var(--text-muted)' }}>Suggested next step</dt>
        <dd style={{ margin: 0 }}>{alert.suggestedNextStep}</dd>
      </dl>
    </article>
  );
}
