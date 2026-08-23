import Link from 'next/link';
import { StatusBadge } from '@bagos/ui';
import { AGENT_ROUTES, FixtureAdapter } from '../../adapters/fixture-adapter';

const SLUG_BY_ID = new Map(AGENT_ROUTES.map(({ id, slug }) => [id, slug]));

export default async function AgentsPage(): Promise<JSX.Element> {
  const agents = await new FixtureAdapter().listAgents({});
  return (
    <section>
      <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>Northwind agents</h1>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
        {agents.map((agent) => (
          <li key={agent.id} data-domain-slot={String(agent.domainSlot)} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-4)', background: 'var(--domain-active-tint)', borderLeft: '3px solid var(--domain-active-core)', borderRadius: 'var(--radius-card)' }}>
            <Link href={`/agents/${SLUG_BY_ID.get(agent.id) ?? agent.id}/`}>
              {agent.displayName}
            </Link>
            <StatusBadge status={agent.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
