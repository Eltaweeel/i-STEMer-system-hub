import { OrganizationGraph, OrganizationStatusList, OrganizationTree } from '@bagos/ui';
import { FixtureAdapter } from '../../adapters/fixture-adapter';
import { formatNorthwindTime, NORTHWIND_FIXTURE_TZ } from '../../fixtures/time';

export default async function OrganizationPage(): Promise<React.JSX.Element> {
  const projection = await new FixtureAdapter().getOrganization({});
  const agentCount = projection.nodes.filter(({ kind }) => kind === 'agent').length;

  return (
    <section>
      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>
          {projection.title}
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '72ch' }}>
          One human principal, one conductor, four departments, and {agentCount} fixture agents.
          Times use the tenant-owned frozen clock in {NORTHWIND_FIXTURE_TZ}.
        </p>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Captured {formatNorthwindTime(projection.meta.capturedAt)} · {projection.meta.dataVersion}
        </p>
      </header>
      <div className="northwind-org-split" style={{ display: 'grid', gap: 'var(--space-5)', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)' }}>
        <OrganizationGraph projection={projection} />
        <aside aria-label="Agent runtime status" style={{ background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)', padding: 'var(--space-4)' }}>
          <h2>Runtime status</h2>
          <OrganizationStatusList projection={projection} />
        </aside>
      </div>
      <section aria-label="Accessible tree" style={{ marginTop: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)', padding: 'var(--space-5)' }}>
        <h2>Accessible tree — synchronised with the graph</h2>
        <OrganizationTree projection={projection} />
      </section>
    </section>
  );
}
