import { notFound } from 'next/navigation';
import { ContentCalendar, DesignConceptCard, SpecialistWorkspaceView, TrendAlertCard, WorkflowWorkList } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { AGENT_ROUTES, agentIdForSlug, FixtureAdapter } from '../../../adapters/fixture-adapter';
import { SOCIAL_CONTENT_CALENDAR, SOCIAL_TREND_ALERT } from '../../../fixtures/workspaces';

export function generateStaticParams(): { agentId: string }[] {
  return AGENT_ROUTES.map((route) => ({ agentId: route.slug }));
}

export const dynamicParams = false;

export default async function SpecialistWorkspacePage({ params }: { params: { agentId: string } }): Promise<JSX.Element> {
  const slug = decodeURIComponent(params.agentId);
  const id = agentIdForSlug(slug);
  if (!id) notFound();
  const adapter = new FixtureAdapter();
  const [agent, workflow] = await Promise.all([
    adapter.getAgent({ id }),
    adapter.getWorkflow({ id: 'workflow:campaign-end-to-end' }),
  ]);
  if (!agent || !workflow) notFound();
  const ownedSteps = workflow.steps.filter((step) => step.ownerRef === id);

  return (
    <SpecialistWorkspaceView
      title={`${agent.displayName} workspace`}
      description="A read-only view of fixture-authored work in progress. Step states come from the campaign workflow; no runtime activity is inferred."
      domainSlot={agent.domainSlot}
      agentDetailHref={`/agents/${encodeURIComponent(slug)}/`}
    >
      {id === 'agent:marketing' ? (
        <WorkflowWorkList title="Campaign brief and strategy artifacts" steps={ownedSteps} />
      ) : null}

      {id === 'agent:social-media' ? (
        <>
          <section aria-labelledby="social-calendar" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
            <h2 id="social-calendar">Content calendar</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Deterministic planned items only. SCHEDULED means placed on this fixture calendar; it does not mean externally scheduled or published.</p>
            <ContentCalendar items={SOCIAL_CONTENT_CALENDAR.filter((item) => item.ownerId === id)} formatDate={formatFixtureTime} />
          </section>
          <section aria-labelledby="social-trend">
            <h2 id="social-trend">Observed opportunity</h2>
            <TrendAlertCard alert={SOCIAL_TREND_ALERT} formatTime={formatFixtureTime} />
          </section>
        </>
      ) : null}

      {id === 'agent:designer' ? (
        <>
          <section aria-labelledby="design-concepts" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
            <h2 id="design-concepts">Three design concepts</h2>
            <div className="concept-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
              {workflow.designConcepts.map((concept) => <DesignConceptCard key={concept.id} concept={concept} />)}
            </div>
          </section>
          <WorkflowWorkList title="Design production queue" steps={ownedSteps} />
        </>
      ) : null}
    </SpecialistWorkspaceView>
  );
}
