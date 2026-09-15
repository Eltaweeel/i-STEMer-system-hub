import { OrganizationGraph, OrganizationStatusList, OrganizationTree } from '@bagos/ui';
import { formatFixtureTime, FIXTURE_TZ } from '@bagos/fixtures';
import { FixtureAdapter } from '../../adapters/fixture-adapter';

// Route/composition code is the only layer permitted to call an adapter.
// Presentational components below receive a resolved view model as props.

export default async function OrganizationPage(): Promise<React.JSX.Element> {
  const adapter = new FixtureAdapter();
  const projection = await adapter.getOrganization({});

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
          {projection.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          Hadeer oversees Adam (Main Orchestrator), who coordinates Nour (Content Creator),
          Omar (Competitor Analyst), and Ziad (Reel Analyst). Every timestamp on this page
          derives from the frozen fixture instant; times are shown in {FIXTURE_TZ}.
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
          Captured {formatFixtureTime(projection.meta.capturedAt)} · Data version{' '}
          {projection.meta.dataVersion}
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gap: 'var(--space-6)',
          gridTemplateColumns: 'minmax(0, 1fr)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-5)',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)',
          }}
          className="org-split"
        >
          <OrganizationGraph projection={projection} />
          <aside
            aria-label="Agent runtime status"
            style={{
              background: 'var(--surface-panel)',
              borderRadius: 'var(--radius-panel)',
              border: '1px solid var(--line-subtle)',
              padding: 'var(--space-4)',
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
              Runtime status
            </h2>
            <OrganizationStatusList projection={projection} />
          </aside>
        </div>

        <section
          aria-label="Accessible tree"
          style={{
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
            Accessible tree — synchronised with the graph
          </h2>
          <OrganizationTree projection={projection} />
        </section>
      </div>
      <style>{`
        @media (max-width: 720px) {
          .org-split { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}
