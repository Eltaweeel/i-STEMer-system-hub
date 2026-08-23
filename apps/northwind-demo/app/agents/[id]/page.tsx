import { notFound } from 'next/navigation';
import { AgentDetailView } from '@bagos/ui';
import { agentIdForSlug, AGENT_ROUTES, FixtureAdapter } from '../../../adapters/fixture-adapter';
import { formatNorthwindTime } from '../../../fixtures/time';

export function generateStaticParams(): { id: string }[] {
  return AGENT_ROUTES.map(({ slug }) => ({ id: slug }));
}

export const dynamicParams = false;

export default async function AgentDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const agentId = agentIdForSlug(decodeURIComponent(params.id));
  if (!agentId) notFound();
  const agent = await new FixtureAdapter().getAgent({ id: agentId });
  if (!agent) notFound();
  return <AgentDetailView agent={agent} formatTime={formatNorthwindTime} />;
}
