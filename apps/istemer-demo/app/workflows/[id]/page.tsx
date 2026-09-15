import { notFound } from 'next/navigation';
import { DesignConceptCard, WorkflowDiagram, WorkflowStepList } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { FixtureAdapter, workflowIdForSlug, WORKFLOW_ROUTES } from '../../../adapters/fixture-adapter';

// Static export: enumerate every known route slug so the App Router can
// pre-render one HTML file per workflow. Slugs are URL-safe (no `:`).
export function generateStaticParams(): { id: string }[] {
  return WORKFLOW_ROUTES.map((r) => ({ id: r.slug }));
}

export const dynamicParams = false;

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const internalId = workflowIdForSlug(decodeURIComponent((await params).id));
  if (!internalId) notFound();
  const adapter = new FixtureAdapter();
  const workflow = await adapter.getWorkflow({ id: internalId });
  if (!workflow) notFound();

  const conceptStep = workflow.steps.find((s) => s.id === workflow.conceptStepId);

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
          {workflow.label}
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          <strong>Objective.</strong> {workflow.objective}
        </p>
        <p style={{ color: 'var(--text-secondary)', margin: 'var(--space-3) 0 0', maxWidth: '72ch' }}>
          <strong>Purpose.</strong> {workflow.purpose}
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
          Captured {formatFixtureTime(workflow.meta.capturedAt)} · Data version{' '}
          {workflow.meta.dataVersion}
        </p>
      </header>

      <div
        style={{
          overflowX: 'auto',
          background: 'var(--surface-panel)',
          borderRadius: 'var(--radius-panel)',
          border: '1px solid var(--line-subtle)',
          padding: 'var(--space-3)',
        }}
      >
        <WorkflowDiagram steps={workflow.steps} title={`${workflow.label} — workflow diagram`} />
      </div>

      <section
        aria-labelledby="steplist-heading"
        style={{
          marginTop: 'var(--space-6)',
          background: 'var(--surface-panel)',
          borderRadius: 'var(--radius-panel)',
          border: '1px solid var(--line-subtle)',
        }}
      >
        <h2
          id="steplist-heading"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-label-size)',
            letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: 0,
            padding: 'var(--space-5) var(--space-5) 0',
          }}
        >
          Steps — accessible list, synchronised with the diagram
        </h2>
        <WorkflowStepList steps={workflow.steps} />
      </section>

      {conceptStep ? (
        <section
          aria-labelledby="concepts-heading"
          style={{ marginTop: 'var(--space-6)' }}
        >
          <h2
            id="concepts-heading"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-label-size)',
              letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginTop: 0,
            }}
          >
            Design concepts for step {conceptStep.order}: {conceptStep.title}
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '72ch', marginTop: 'var(--space-3)' }}>
            Three deterministic compositions built entirely from the design tokens. Selecting a
            direction is the human decision point that follows.
          </p>
          <div
            className="concept-grid"
            style={{
              display: 'grid',
              gap: 'var(--space-5)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              marginTop: 'var(--space-4)',
            }}
          >
            {workflow.designConcepts.map((c) => (
              <DesignConceptCard key={c.id} concept={c} />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
