import type { CSSProperties } from 'react';
import type { ApprovalPackage, DisabledDecisionControl } from '@bagos/contracts';
import { NotificationPreviewCard } from './NotificationPreviewCard';
import { RehearsalFlowPanel } from './RehearsalFlowPanel';

// ApprovalDetailView is a server component — no hooks, no 'use client'.
// It receives formatTime as a prop (called here on the server) and applies it
// before the client boundary. The stateful rehearsal flow is in RehearsalFlowPanel,
// which accepts only serializable props (strings and plain data objects).
//
// DisabledDecisionControls renders <button disabled> for each control. The
// DisabledDecisionControl type has no callback or action field, so there is
// structurally nothing to attach even if a developer tried. The `disabled`
// attribute ensures keyboard users cannot activate the buttons.

const sectionStyle: CSSProperties = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const sectionHeadingStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  margin: 0,
};

const disabledBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 'var(--c-badge-h)',
  padding: '0 var(--space-5)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--line-subtle)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  cursor: 'not-allowed',
  opacity: 0.6,
};

// Pure sub-component exported for testing
export interface DisabledDecisionControlsProps {
  readonly controls: readonly DisabledDecisionControl[];
}

export function DisabledDecisionControls({
  controls,
}: DisabledDecisionControlsProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Decision controls — all disabled in demo"
      style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}
    >
      {controls.map((c) => (
        <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <button
            disabled
            aria-disabled="true"
            aria-describedby={`reason-${c.id}`}
            style={disabledBtnStyle}
          >
            {c.label}
          </button>
          <span
            id={`reason-${c.id}`}
            style={{ ...kickerStyle, color: 'var(--text-muted)' }}
          >
            {c.disabledReason}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface ApprovalDetailViewProps {
  readonly pkg: ApprovalPackage;
  readonly decisionControls: readonly DisabledDecisionControl[];
  readonly formatTime: (iso: string) => string;
}

export function ApprovalDetailView({
  pkg,
  decisionControls,
  formatTime,
}: ApprovalDetailViewProps): JSX.Element {
  const formattedDeadline = formatTime(pkg.deadline);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <header
        style={{
          background: 'var(--surface-panel)',
          border: '1px solid var(--line-subtle)',
          borderLeft: '3px solid var(--status-attention-core)',
          borderRadius: 'var(--radius-panel)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <div style={kickerStyle}>Approval package · PENDING</div>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            letterSpacing: 'var(--tracking-display)',
          }}
        >
          {pkg.title}
        </h1>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          <span style={kickerStyle}>Tier: {pkg.requiredTier}</span>
          <span style={kickerStyle}>Due: {formattedDeadline}</span>
          <span style={kickerStyle}>Agent: {pkg.responsibleAgent}</span>
        </div>
      </header>

      <section aria-labelledby="s-action" style={sectionStyle}>
        <h2 id="s-action" style={sectionHeadingStyle}>Requested action</h2>
        <p style={{ margin: 0 }}>{pkg.requestedAction}</p>
      </section>

      <section aria-labelledby="s-reason" style={sectionStyle}>
        <h2 id="s-reason" style={sectionHeadingStyle}>Business reason</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{pkg.businessReason}</p>
      </section>

      <section aria-labelledby="s-artifact" style={sectionStyle}>
        <h2 id="s-artifact" style={sectionHeadingStyle}>Artifact / revision</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--space-3) var(--space-4)',
            margin: 0,
          }}
        >
          <dt style={kickerStyle}>Artifact ref</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{pkg.artifactRef}</dd>
          <dt style={kickerStyle}>Target system</dt>
          <dd style={{ margin: 0 }}>{pkg.targetSystem}</dd>
        </dl>
        {pkg.diffSummary !== null ? (
          <div
            style={{
              marginTop: 'var(--space-3)',
              padding: 'var(--space-4)',
              background: 'var(--surface-raised)',
              border: '1px solid var(--line-subtle)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <div style={{ ...kickerStyle, marginBottom: 'var(--space-2)' }}>
              Changes from previous revision
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{pkg.diffSummary}</p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="s-evidence" style={sectionStyle}>
        <h2 id="s-evidence" style={sectionHeadingStyle}>Supporting evidence</h2>
        {pkg.supportingEvidence.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>No evidence references</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {pkg.supportingEvidence.map((e, i) => (
              <li key={`ev-${i}`}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="s-outcome" style={sectionStyle}>
        <h2 id="s-outcome" style={sectionHeadingStyle}>Expected result and risks</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--space-3) var(--space-4)',
            margin: 0,
          }}
        >
          <dt style={kickerStyle}>Expected result</dt>
          <dd style={{ margin: 0 }}>{pkg.expectedResult}</dd>
          <dt style={kickerStyle}>Risks</dt>
          <dd style={{ margin: 0 }}>{pkg.risks}</dd>
          <dt style={kickerStyle}>Estimated cost</dt>
          <dd style={{ margin: 0 }}>{pkg.estimatedCost}</dd>
        </dl>
      </section>

      <section aria-labelledby="s-controls" style={sectionStyle}>
        <h2 id="s-controls" style={sectionHeadingStyle}>Decision controls</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '72ch' }}>
          These controls are permanently disabled in the demo. No decision can be recorded
          from this interface.
        </p>
        <DisabledDecisionControls controls={decisionControls} />
      </section>

      <section aria-labelledby="s-rehearsal" style={sectionStyle}>
        <h2 id="s-rehearsal" style={sectionHeadingStyle}>Decision flow rehearsal</h2>
        <RehearsalFlowPanel pkg={pkg} formattedDeadline={formattedDeadline} />
      </section>

      <section aria-labelledby="s-notification" style={sectionStyle}>
        <h2 id="s-notification" style={sectionHeadingStyle}>Downstream notification preview</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '72ch' }}>
          What a downstream channel notification would look like when the decision surface
          is wired to a real integration. This is a static preview only.
        </p>
        <NotificationPreviewCard
          preview={pkg.notificationPreview}
          formatTime={formatTime}
        />
      </section>
    </div>
  );
}
