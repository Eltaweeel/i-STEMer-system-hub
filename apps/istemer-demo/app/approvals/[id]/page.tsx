import { notFound } from 'next/navigation';
import { ApprovalDetailView } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { makeDisabledDecisionControl } from '@bagos/contracts';
import {
  APPROVAL_ROUTES,
  approvalIdForSlug,
  FixtureAdapter,
} from '../../../adapters/fixture-adapter';

// Static export: enumerate every known approval slug so the App Router can
// pre-render one HTML file per approval package. Slugs are URL-safe (no `:`).
export function generateStaticParams(): { id: string }[] {
  return APPROVAL_ROUTES.map((r) => ({ id: r.slug }));
}

export const dynamicParams = false;

// The three decision controls are built here, not in core, because the
// disabled-reason copy is tenant-authored. They carry no callback — the type
// (DisabledDecisionControl) structurally prevents one from being attached.
const DECISION_CONTROLS = [
  makeDisabledDecisionControl({
    id: 'ctrl:approve',
    label: 'Approve',
    disabledReason: 'Demo mode — decisions are not recorded.',
  }),
  makeDisabledDecisionControl({
    id: 'ctrl:reject',
    label: 'Reject',
    disabledReason: 'Demo mode — decisions are not recorded.',
  }),
  makeDisabledDecisionControl({
    id: 'ctrl:request-changes',
    label: 'Request changes',
    disabledReason: 'Demo mode — decisions are not recorded.',
  }),
] as const;

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const internalId = approvalIdForSlug(decodeURIComponent((await params).id));
  if (!internalId) notFound();
  const adapter = new FixtureAdapter();
  const pkg = await adapter.getApprovalPackage({ id: internalId });
  if (!pkg) notFound();

  return (
    <section>
      <ApprovalDetailView
        pkg={pkg}
        decisionControls={DECISION_CONTROLS}
        formatTime={formatFixtureTime}
      />
    </section>
  );
}
