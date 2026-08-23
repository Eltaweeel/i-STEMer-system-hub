import Link from 'next/link';
import { StatusBadge } from '@bagos/ui';
import { AGENT_ROUTES, FixtureAdapter } from '../../adapters/fixture-adapter';

const slugById = new Map(AGENT_ROUTES.map((r) => [r.id, r.slug]));

export default async function AgentsIndexPage(): Promise<JSX.Element> {
  const adapter = new FixtureAdapter();
  const agents = await adapter.listAgents({});

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
          Agents
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          Each agent has a detail page describing its purpose, permitted inputs, expected outputs,
          tools, prohibited actions, approval requirements, planned SOPs, sample activity, and
          current demo status.
        </p>
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
        {agents.map((a) => (
          <li
            key={a.id}
            data-domain-slot={String(a.domainSlot)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) var(--space-5)',
              background: 'var(--domain-active-tint)',
              borderLeft: '3px solid var(--domain-active-core)',
              border: '1px solid var(--domain-active-edge)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <Link
              href={`/agents/${encodeURIComponent(slugById.get(a.id) ?? a.id)}/`}
              style={{ color: 'var(--text-link)' }}
            >
              {a.displayName}
            </Link>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <Link href={`/workspaces/${encodeURIComponent(slugById.get(a.id) ?? a.id)}/`} style={{ color: 'var(--text-link)' }}>Workspace</Link>
              <StatusBadge status={a.status} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
