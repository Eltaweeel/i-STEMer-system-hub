import { CommandCenterView } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { AGENT_ROUTES, APPROVAL_ROUTES, FixtureAdapter } from '../adapters/fixture-adapter';

const agentSlugById = new Map(AGENT_ROUTES.map((route) => [route.id, route.slug]));
const approvalSlugById = new Map(APPROVAL_ROUTES.map((route) => [route.id, route.slug]));

export default async function IndexPage(): Promise<React.JSX.Element> {
  const adapter = new FixtureAdapter();
  const [workflow, agents, approvals, cycle] = await Promise.all([
    adapter.getWorkflow({ id: 'workflow:campaign-end-to-end' }),
    adapter.listAgents({}),
    adapter.listApprovalPackages({}),
    adapter.getCoordinationCycle({}),
  ]);
  if (!workflow) throw new Error('Campaign workflow fixture is required by the command center.');

  return (
    <section>
      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>Command center</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Executive fixture snapshot. Nothing shown here is live and no action can be taken from this view.</p>
      </header>
      <CommandCenterView
        workflow={workflow}
        agents={agents}
        approvals={approvals}
        cycle={cycle}
        formatTime={formatFixtureTime}
        agentHref={(id) => `/agents/${encodeURIComponent(agentSlugById.get(id) ?? id)}/`}
        approvalHref={(id) => `/approvals/${encodeURIComponent(approvalSlugById.get(id) ?? id)}/`}
      />
    </section>
  );
}
