import Link from 'next/link';
import { FixtureAdapter, WORKFLOW_ROUTES } from '../../adapters/fixture-adapter';

const slugById = new Map(WORKFLOW_ROUTES.map((r) => [r.id, r.slug]));

export default async function WorkflowsIndexPage(): Promise<JSX.Element> {
  const adapter = new FixtureAdapter();
  const workflows = await adapter.listWorkflows({});

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
          Workflows
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          One end-to-end campaign workflow for the walking demo. Every step declares its owner,
          inputs, outputs, and current demo state. Nothing runs.
        </p>
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
        {workflows.map((w) => (
          <li
            key={w.id}
            style={{
              background: 'var(--surface-panel)',
              border: '1px solid var(--line-subtle)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-4) var(--space-5)',
            }}
          >
            <Link
              href={`/workflows/${encodeURIComponent(slugById.get(w.id) ?? w.id)}/`}
              style={{ color: 'var(--text-link)' }}
            >
              {w.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
