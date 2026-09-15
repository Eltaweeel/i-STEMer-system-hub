import { notFound } from 'next/navigation';
import { AgentDetailView } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { agentIdForSlug, AGENT_ROUTES, FixtureAdapter } from '../../../adapters/fixture-adapter';

// Static export: enumerate every known route slug so the App Router can
// pre-render one HTML file per agent. Slugs are URL-safe (no `:`).
export function generateStaticParams(): { id: string }[] {
  return AGENT_ROUTES.map((r) => ({ id: r.slug }));
}

export const dynamicParams = false;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const internalId = agentIdForSlug(decodeURIComponent((await params).id));
  if (!internalId) notFound();
  const adapter = new FixtureAdapter();
  const agent = await adapter.getAgent({ id: internalId });
  if (!agent) notFound();

  return (
    <section>
      <AgentDetailView agent={agent} formatTime={formatFixtureTime} />
    </section>
  );
}
