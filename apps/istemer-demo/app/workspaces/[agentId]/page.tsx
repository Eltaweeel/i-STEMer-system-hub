import { notFound } from 'next/navigation';
import { ContentCalendar, SpecialistWorkspaceView, TrendAlertCard } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { AGENT_ROUTES, agentIdForSlug, FixtureAdapter } from '../../../adapters/fixture-adapter';
import { SOCIAL_CONTENT_CALENDAR, SOCIAL_TREND_ALERT } from '../../../fixtures/workspaces';

export function generateStaticParams(): { agentId: string }[] {
  return AGENT_ROUTES.map((route) => ({ agentId: route.slug }));
}

export const dynamicParams = false;

export default async function SpecialistWorkspacePage({ params }: { params: Promise<{ agentId: string }> }): Promise<React.JSX.Element> {
  const slug = decodeURIComponent((await params).agentId);
  const id = agentIdForSlug(slug);
  if (!id) notFound();
  const adapter = new FixtureAdapter();
  const agent = await adapter.getAgent({ id });
  if (!agent) notFound();

  return (
    <SpecialistWorkspaceView
      title={`${agent.displayName} workspace`}
      description="A read-only role workspace. The named profile is a fixture; no runtime activity is inferred."
      domainSlot={agent.domainSlot}
      agentDetailHref={`/agents/${encodeURIComponent(slug)}/`}
    >
      {id === 'agent:adam' ? (
        <section aria-labelledby="adam-scope" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
          <h2 id="adam-scope">Orchestration scope</h2>
          <p>Adam coordinates bounded work by Omar, Ziad, and Nour, assembles versioned evidence, and routes owner approvals. No live runtime is attached.</p>
        </section>
      ) : null}

      {id === 'agent:marketing' ? (
        <section aria-labelledby="competitor-evidence" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
          <h2 id="competitor-evidence">Competitor research evidence</h2>
          <p>No approved competitor source set or research question is attached to this fixture. No findings are inferred.</p>
        </section>
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
        <section aria-labelledby="reel-evidence" style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
          <h2 id="reel-evidence">Reel analysis evidence</h2>
          <p>No reel frames, audio, transcripts, or observed metrics are attached to this fixture. No analysis is inferred.</p>
        </section>
      ) : null}
    </SpecialistWorkspaceView>
  );
}
