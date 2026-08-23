import type { ViewMeta } from '@bagos/contracts';

export interface FreshnessSource {
  readonly id: string;
  readonly label: string;
  readonly meta: ViewMeta;
}

export interface SubsystemCheck {
  readonly id: string;
  readonly label: string;
  readonly state: 'available' | 'planned';
  readonly note: string;
}

export interface SystemHealthViewProps {
  readonly sources: readonly FreshnessSource[];
  readonly subsystems: readonly SubsystemCheck[];
  readonly formatTime: (iso: string) => string;
}

export function SystemHealthView({ sources, subsystems, formatTime }: SystemHealthViewProps): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <section aria-labelledby="fixture-health" style={{ padding: 'var(--space-5)', background: 'var(--status-draft-tint)', border: '1px solid var(--status-draft-core)', borderRadius: 'var(--radius-panel)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro-size)', letterSpacing: 'var(--tracking-micro)', color: 'var(--status-draft-core)' }}><span aria-hidden="true">◆ </span>FIXTURE MODE ACTIVE</span>
        <h2 id="fixture-health">Demo environment is operating from static sample data</h2>
        <p style={{ margin: 0 }}>No live runtime, connector, database, authentication, or external action is present.</p>
      </section>

      <section aria-labelledby="fixture-freshness" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
        <h2 id="fixture-freshness">Data freshness</h2>
        <div className="health-source-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          {sources.map((source) => (
            <article key={source.id} style={{ padding: 'var(--space-4)', background: 'var(--surface-raised)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-card)' }}>
              <strong>{source.label}</strong>
              <dl style={{ margin: 'var(--space-3) 0 0', display: 'grid', gap: 'var(--space-2)' }}>
                <div><dt style={{ color: 'var(--text-muted)' }}>Captured</dt><dd style={{ margin: 0 }}>{formatTime(source.meta.capturedAt)}</dd></div>
                <div><dt style={{ color: 'var(--text-muted)' }}>Data version</dt><dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{source.meta.dataVersion || 'unknown'}</dd></div>
                <div><dt style={{ color: 'var(--text-muted)' }}>State</dt><dd style={{ margin: 0 }}><span aria-hidden="true">● </span>{source.meta.stale ? 'STALE' : 'FIXED SNAPSHOT'}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="subsystem-scope" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
        <h2 id="subsystem-scope">Subsystem scope</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
          {subsystems.map((subsystem) => (
            <li className="health-subsystem-row" key={subsystem.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(8rem, auto) 1fr', gap: 'var(--space-4)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--line-subtle)' }}>
              <strong><span aria-hidden="true">{subsystem.state === 'available' ? '✓' : '○'} </span>{subsystem.state === 'available' ? 'AVAILABLE' : 'PLANNED / NOT IMPLEMENTED'}</strong>
              <span><span style={{ display: 'block' }}>{subsystem.label}</span><span style={{ color: 'var(--text-muted)' }}>{subsystem.note}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
