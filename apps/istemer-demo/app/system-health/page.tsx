import { SystemHealthView, type SubsystemCheck } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { FixtureAdapter } from '../../adapters/fixture-adapter';

const SUBSYSTEMS: readonly SubsystemCheck[] = [
  { id: 'organization', label: 'Organization and agent views', state: 'available', note: 'Static fixture projections and read-only presenters.' },
  { id: 'workflow', label: 'Workflow, coordination, and approvals', state: 'available', note: 'Deterministic fixture records; approval decisions are disabled.' },
  { id: 'workspaces', label: 'Command center and specialist workspaces', state: 'available', note: 'Compositions of existing fixture data plus labelled examples.' },
  { id: 'runtime', label: 'Live agent runtime', state: 'planned', note: 'Out of scope for this phase; agents remain IDLE without an active run.' },
  { id: 'identity', label: 'Authentication and authorization', state: 'planned', note: 'Out of scope for this fixture-only demo.' },
  { id: 'connectors', label: 'Connectors and external actions', state: 'planned', note: 'Out of scope; no network requests or external actions exist.' },
] as const;

export default async function SystemHealthPage(): Promise<React.JSX.Element> {
  const adapter = new FixtureAdapter();
  const [organization, workflow, rosterRepresentative] = await Promise.all([
    adapter.getOrganization({}),
    adapter.getWorkflow({ id: 'workflow:campaign-end-to-end' }),
    adapter.getAgent({ id: 'agent:marketing' }),
  ]);
  if (!workflow || !rosterRepresentative) throw new Error('System health requires the authored workflow and roster fixtures.');

  return (
    <section>
      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>System health and data freshness</h1>
        <p style={{ color: 'var(--text-secondary)' }}>A fixture provenance summary, not a live infrastructure monitor.</p>
      </header>
      <SystemHealthView
        formatTime={formatFixtureTime}
        sources={[
          { id: 'organization', label: 'Organization data', meta: organization.meta },
          { id: 'agents', label: 'Agent roster', meta: rosterRepresentative.meta },
          { id: 'workflow', label: 'Workflow fixtures', meta: workflow.meta },
        ]}
        subsystems={SUBSYSTEMS}
      />
    </section>
  );
}
