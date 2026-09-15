import { CoordinationCycleTable, CoordinationCycleView } from '@bagos/ui';
import { formatFixtureTime, FIXTURE_TZ } from '@bagos/fixtures';
import { FixtureAdapter } from '../../adapters/fixture-adapter';

// Route/composition code is the only layer permitted to call an adapter.
// Presentational components receive a resolved view model as props.

function formatCycleTime(iso: string): string {
  return formatFixtureTime(iso);
}

export default async function CoordinationCyclePage(): Promise<React.JSX.Element> {
  const adapter = new FixtureAdapter();
  const cycle = await adapter.getCoordinationCycle({});

  return (
    <section>
      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-display)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {cycle.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          The morning and evening briefings frame the day. Between them, three midday streams
          describe what each specialist would contribute. Daytime events are a deterministic
          ordered list — no clock reads, no fabricated activity. Times are shown in {FIXTURE_TZ}.
        </p>
        <p
          style={{
            marginTop: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro-size)',
            letterSpacing: 'var(--tracking-micro)',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Captured {formatCycleTime(cycle.meta.capturedAt)} · Data version {cycle.meta.dataVersion}
        </p>
      </header>

      <CoordinationCycleView cycle={cycle} formatTime={formatCycleTime} />

      <section
        aria-label="Accessible table"
        style={{
          marginTop: 'var(--space-6)',
          background: 'var(--surface-panel)',
          borderRadius: 'var(--radius-panel)',
          border: '1px solid var(--line-subtle)',
          padding: 'var(--space-5)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-label-size)',
            letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginTop: 0,
          }}
        >
          Accessible table — synchronised with the diagram
        </h2>
        <CoordinationCycleTable cycle={cycle} formatTime={formatCycleTime} />
      </section>
    </section>
  );
}
