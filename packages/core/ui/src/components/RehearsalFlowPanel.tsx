'use client';

// This is the ONLY file in the approval feature that uses client-side state.
// It is isolated here precisely so ApprovalDetailView can remain a server
// component and receive `formatTime` as a prop without hitting the
// "functions cannot be passed to Client Components" constraint.
//
// RehearsalEndScreen and RehearsalFlowView are also exported from this file
// so that tests can render them with renderToStaticMarkup — neither uses hooks,
// so they are safe for static rendering despite being in a 'use client' module.

import { useState, type CSSProperties } from 'react';
import type { ApprovalPackage } from '@bagos/contracts';

type RehearsalStep =
  | 'idle'
  | 'step1_review'
  | 'step2_consequence'
  | 'step3_confirm'
  | 'ended';

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const rehearsalBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 'var(--c-badge-h)',
  padding: '0 var(--space-5)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--status-draft-core)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

const advanceBtnStyle: CSSProperties = {
  ...rehearsalBtnStyle,
  border: '1px solid var(--status-ok-core)',
  color: 'var(--text-primary)',
};

const stepPanelStyle: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--status-draft-core)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const stepKickerStyle: CSSProperties = {
  ...kickerStyle,
  color: 'var(--status-draft-core)',
};

// -----------------------------------------------------------------------------
// Pure sub-components — no hooks. Exported for testing with renderToStaticMarkup.
// -----------------------------------------------------------------------------

export interface RehearsalEndScreenProps {
  readonly packageTitle: string;
  readonly onReset: () => void;
}

export function RehearsalEndScreen({
  packageTitle,
  onReset,
}: RehearsalEndScreenProps): React.JSX.Element {
  return (
    <div style={stepPanelStyle}>
      <span style={stepKickerStyle}>Rehearsal complete</span>
      <p
        data-testid="rehearsal-end-message"
        style={{ margin: 0, color: 'var(--text-primary)', maxWidth: '72ch' }}
      >
        <strong>No decision was recorded.</strong> This was a preview only. The approval
        package <em>&ldquo;{packageTitle}&rdquo;</em> remains <strong>PENDING</strong> and
        its audit trail is unchanged.
      </p>
      <button onClick={onReset} style={rehearsalBtnStyle}>
        Close rehearsal
      </button>
    </div>
  );
}

export interface RehearsalFlowViewProps {
  readonly step: RehearsalStep;
  readonly pkg: ApprovalPackage;
  readonly formattedDeadline: string;
  readonly onAdvance: () => void;
  readonly onReset: () => void;
}

export function RehearsalFlowView({
  step,
  pkg,
  formattedDeadline,
  onAdvance,
  onReset,
}: RehearsalFlowViewProps): React.JSX.Element {
  if (step === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '72ch' }}>
          Preview what a real decision sequence would look like. No decision will be recorded.
        </p>
        <button onClick={onAdvance} style={rehearsalBtnStyle}>
          Preview decision flow
        </button>
      </div>
    );
  }

  if (step === 'step1_review') {
    return (
      <div style={stepPanelStyle}>
        <span style={stepKickerStyle}>Preview — Step 1 of 3 — Exact revision under review</span>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--space-3) var(--space-4)',
            margin: 0,
          }}
        >
          <dt style={kickerStyle}>Artifact</dt>
          <dd style={{ margin: 0 }}>{pkg.artifactRef}</dd>
          <dt style={kickerStyle}>Requested action</dt>
          <dd style={{ margin: 0 }}>{pkg.requestedAction}</dd>
          <dt style={kickerStyle}>Responsible agent</dt>
          <dd style={{ margin: 0 }}>{pkg.responsibleAgent}</dd>
          <dt style={kickerStyle}>Deadline</dt>
          <dd style={{ margin: 0 }}>{formattedDeadline}</dd>
        </dl>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button onClick={onAdvance} style={advanceBtnStyle}>
            Next: Hypothetical consequence
          </button>
          <button onClick={onReset} style={rehearsalBtnStyle}>
            Cancel rehearsal
          </button>
        </div>
      </div>
    );
  }

  if (step === 'step2_consequence') {
    return (
      <div style={stepPanelStyle}>
        <span style={stepKickerStyle}>
          Preview — Step 2 of 3 — Hypothetical consequence (sample only)
        </span>
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
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button onClick={onAdvance} style={advanceBtnStyle}>
            Next: Confirmation step
          </button>
          <button onClick={onReset} style={rehearsalBtnStyle}>
            Cancel rehearsal
          </button>
        </div>
      </div>
    );
  }

  if (step === 'step3_confirm') {
    return (
      <div style={stepPanelStyle}>
        <span style={stepKickerStyle}>
          Preview — Step 3 of 3 — Confirmation (sample only)
        </span>
        <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '72ch' }}>
          In a real deployment, the decision principal would confirm:{' '}
          <strong>&ldquo;{pkg.requestedAction}&rdquo;</strong>. The consequence would be:{' '}
          {pkg.expectedResult}.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button onClick={onAdvance} style={advanceBtnStyle}>
            Complete rehearsal
          </button>
          <button onClick={onReset} style={rehearsalBtnStyle}>
            Cancel rehearsal
          </button>
        </div>
      </div>
    );
  }

  return <RehearsalEndScreen packageTitle={pkg.title} onReset={onReset} />;
}

// -----------------------------------------------------------------------------
// The stateful client component — the only one in this feature that calls hooks.
// Accepts only serializable props (no functions from the server).
// -----------------------------------------------------------------------------

export interface RehearsalFlowPanelProps {
  readonly pkg: ApprovalPackage;
  readonly formattedDeadline: string;
}

export function RehearsalFlowPanel({
  pkg,
  formattedDeadline,
}: RehearsalFlowPanelProps): React.JSX.Element {
  const [step, setStep] = useState<RehearsalStep>('idle');

  function advance(): void {
    setStep((s) => {
      if (s === 'idle') return 'step1_review';
      if (s === 'step1_review') return 'step2_consequence';
      if (s === 'step2_consequence') return 'step3_confirm';
      return 'ended';
    });
  }

  return (
    <RehearsalFlowView
      step={step}
      pkg={pkg}
      formattedDeadline={formattedDeadline}
      onAdvance={advance}
      onReset={() => setStep('idle')}
    />
  );
}
