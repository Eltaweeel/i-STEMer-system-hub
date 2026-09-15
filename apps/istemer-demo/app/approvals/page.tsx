import { ApprovalInboxView } from '@bagos/ui';
import { formatFixtureTime } from '@bagos/fixtures';
import { APPROVAL_ROUTES, FixtureAdapter } from '../../adapters/fixture-adapter';

export default async function ApprovalsIndexPage(): Promise<React.JSX.Element> {
  const adapter = new FixtureAdapter();
  const packages = await adapter.listApprovalPackages({});

  const slugById = new Map(APPROVAL_ROUTES.map((r) => [r.id, r.slug]));

  function getDetailHref(id: string): string {
    const slug = slugById.get(id) ?? id;
    return `/approvals/${encodeURIComponent(slug)}/`;
  }

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
          Approval inbox
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '72ch' }}>
          Read-only queue of approval packages. Each entry links to an exact-revision
          preview. Decision controls on the detail page are permanently disabled — no
          decision can be recorded from this demo interface.
        </p>
      </header>
      <ApprovalInboxView
        packages={packages}
        getDetailHref={getDetailHref}
        formatTime={formatFixtureTime}
      />
    </section>
  );
}
