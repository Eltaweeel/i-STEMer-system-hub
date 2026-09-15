import type { CSSProperties } from 'react';
import type {
  AgentDetail,
  DemoStatus,
  Restriction,
  SampleActivityEntry,
} from '@bagos/contracts';
import { StatusBadge } from './StatusBadge';

// -----------------------------------------------------------------------------
// Nine sections, all present, all rendered honestly.
//
// Prohibited actions render through the Restriction type — which has no href,
// no onActivate, no action field — so they are STRUCTURALLY unable to be
// clickable. This component does not wrap them in a link or a button.
//
// Sample activity requires both a run reference AND a timestamp. The type
// makes both required, and this component asserts that at render time. If
// either is missing, the item is silently dropped rather than rendered as a
// silent lie.
//
// Current demo status uses the DemoStatus union from @bagos/contracts.
// -----------------------------------------------------------------------------

const sectionStyle: CSSProperties = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'baseline',
  justifyContent: 'space-between',
};

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  margin: 0,
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section aria-labelledby={id} style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <h2 id={id} style={titleStyle}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items, emptyLabel }: { items: readonly string[]; emptyLabel: string }): React.JSX.Element {
  if (items.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>{emptyLabel}</span>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
      {items.map((s, i) => (
        <li key={`bl-${i}-${s}`}>{s}</li>
      ))}
    </ul>
  );
}

function RestrictionList({ restrictions }: { restrictions: readonly Restriction[] }): React.JSX.Element {
  // A Restriction is content, not a control. This list uses plain <li> —
  // no <a href>, no <button>, no onClick. The type has no handler to attach
  // even if a developer wanted to.
  if (restrictions.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>No prohibited actions declared</span>;
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-3)' }}>
      {restrictions.map((r) => (
        <li
          key={r.id}
          data-restriction-id={r.id}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--line-subtle)',
            borderLeft: '3px solid var(--autonomy-prohibited-core)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--surface-raised)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...kickerStyle, color: 'var(--autonomy-prohibited-core)' }}>Prohibited</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{r.label}</strong>
          </div>
          <span style={{ color: 'var(--text-secondary)' }}>{r.reason}</span>
        </li>
      ))}
    </ul>
  );
}

const SAMPLE_STATE_LABEL: Record<SampleActivityEntry['state'], string> = {
  complete: 'COMPLETE',
  refused: 'REFUSED',
  awaiting_review: 'AWAITING REVIEW',
  draft: 'DRAFT',
};

function SampleActivityList({
  entries,
  formatTime,
}: {
  entries: readonly SampleActivityEntry[];
  formatTime: (iso: string) => string;
}): React.JSX.Element {
  // Enforce the honesty rule at render time — even though the type requires
  // both fields, we double-check so a broken fixture cannot slip a lie in.
  const usable = entries.filter((e) => e.runRef.length > 0 && e.at.length > 0);
  if (usable.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>No sample activity to display</span>;
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--space-3)' }}>
      {usable.map((e) => (
        <li
          key={e.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '150px 120px 1fr',
            gap: 'var(--space-3) var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--line-subtle)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {formatTime(e.at)}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-micro-size)',
              letterSpacing: 'var(--tracking-micro)',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {SAMPLE_STATE_LABEL[e.state]}
          </span>
          <span>
            {e.summary}{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-micro-size)',
                marginLeft: 'var(--space-2)',
              }}
            >
              ({e.runRef})
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const DEMO_STATUS_LABEL: Record<DemoStatus['kind'], string> = {
  fixture_only: 'FIXTURE ONLY',
  wired_no_runtime: 'WIRED · NO RUNTIME',
  live: 'LIVE',
};

function DemoStatusChip({ status }: { status: DemoStatus }): React.JSX.Element {
  const isLive = status.kind === 'live';
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '0 var(--space-3)',
    height: 'var(--c-badge-h)',
    borderRadius: 'var(--radius-pill)',
    background: isLive ? 'var(--status-ok-tint)' : 'var(--status-draft-tint)',
    border: `1px solid ${isLive ? 'var(--status-ok-core)' : 'var(--status-draft-core)'}`,
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-micro-size)',
    letterSpacing: 'var(--tracking-micro)',
    textTransform: 'uppercase',
    color: 'var(--text-primary)',
  };
  return (
    <span style={style} aria-label={`demo status: ${DEMO_STATUS_LABEL[status.kind]}`}>
      {DEMO_STATUS_LABEL[status.kind]}
    </span>
  );
}

export interface AgentDetailViewProps {
  readonly agent: AgentDetail;
  readonly formatTime: (iso: string) => string;
}

export function AgentDetailView({ agent, formatTime }: AgentDetailViewProps): React.JSX.Element {
  return (
    <div
      data-domain-slot={String(agent.domainSlot)}
      style={{ display: 'grid', gap: 'var(--space-5)' }}
    >
      <header
        style={{
          background: 'var(--domain-active-tint)',
          border: '1px solid var(--domain-active-edge)',
          borderLeft: '3px solid var(--domain-active-core)',
          borderRadius: 'var(--radius-panel)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div style={kickerStyle}>Agent</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)' }}>
          {agent.displayName}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusBadge status={agent.status} />
          <DemoStatusChip status={agent.demoStatus} />
          <span style={{ color: 'var(--text-muted)' }}>
            Freshness captured: {formatTime(agent.freshness.capturedAt)}
            {agent.freshness.isStale ? ' · STALE' : ''}
          </span>
        </div>
      </header>

      <Section id="s-purpose" title="Purpose">
        <p style={{ margin: 0 }}>{agent.purpose}</p>
      </Section>

      <Section id="s-responsibilities" title="Responsibilities">
        <BulletList items={agent.responsibilities} emptyLabel="No responsibilities declared" />
      </Section>

      <Section id="s-inputs" title="Permitted inputs">
        <BulletList items={agent.allowedInputs} emptyLabel="No inputs declared" />
      </Section>

      <Section id="s-outputs" title="Expected outputs">
        <BulletList items={agent.allowedOutputs} emptyLabel="No outputs declared" />
      </Section>

      <Section id="s-tools" title="Tools">
        <BulletList items={agent.allowedTools} emptyLabel="No tools declared" />
      </Section>

      <Section id="s-prohibited" title="Prohibited actions">
        <RestrictionList restrictions={agent.prohibitedActions} />
      </Section>

      <Section id="s-approval" title="Approval requirements">
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-3) var(--space-4)', margin: 0 }}>
          <dt style={kickerStyle}>Default</dt>
          <dd style={{ margin: 0 }}>{agent.approvalPolicy.default}</dd>
          <dt style={kickerStyle}>External publish / send</dt>
          <dd style={{ margin: 0 }}>{agent.approvalPolicy.externalPublishOrSend}</dd>
          <dt style={kickerStyle}>Spend / finance mutation</dt>
          <dd style={{ margin: 0 }}>{agent.approvalPolicy.spendOrFinanceMutation}</dd>
          <dt style={kickerStyle}>Permissions / deletion</dt>
          <dd style={{ margin: 0 }}>{agent.approvalPolicy.permissionsOrDeletion}</dd>
        </dl>
      </Section>

      <Section id="s-sops" title="Planned SOPs">
        <BulletList items={agent.sopRefs} emptyLabel="No SOPs referenced" />
      </Section>

      <Section id="s-activity" title="Sample activity">
        <SampleActivityList entries={agent.sampleActivity} formatTime={formatTime} />
      </Section>

      <Section id="s-demo" title="Current demo status">
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <DemoStatusChip status={agent.demoStatus} />
          <span style={{ color: 'var(--text-secondary)' }}>{agent.demoStatus.note}</span>
        </div>
      </Section>
    </div>
  );
}
