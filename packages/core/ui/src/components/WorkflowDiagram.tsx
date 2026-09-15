import type { CSSProperties } from 'react';
import {
  isHumanDecisionStep,
  type WorkflowStep,
  type WorkflowStepState,
} from '@bagos/contracts';

// -----------------------------------------------------------------------------
// A deterministic left-to-right SVG diagram of a workflow's steps. Human
// decision points are rendered as diamonds; agent steps as rounded rectangles.
// Colour is never the only signal — every node carries its shape, its owner
// text, and an UPPERCASE state label.
//
// Steps that have not happened render "NOT STARTED" — never a fake progress
// bar and never an implied heartbeat.
// -----------------------------------------------------------------------------

export interface WorkflowDiagramProps {
  readonly steps: readonly WorkflowStep[];
  readonly title: string;
}

const STATE_LABEL: Record<WorkflowStepState, string> = {
  not_started: 'NOT STARTED',
  in_progress: 'IN PROGRESS',
  complete: 'COMPLETE',
  blocked: 'BLOCKED',
};

const NODE_W = 180;
const NODE_H = 96;
const GAP_X = 44;
const PAD_X = 24;
const PAD_Y = 32;

function stateFillFor(state: WorkflowStepState): string {
  if (state === 'complete') return 'var(--status-ok-tint)';
  if (state === 'in_progress') return 'var(--status-running-tint)';
  if (state === 'blocked') return 'var(--status-blocked-tint)';
  return 'var(--surface-raised)';
}

function stateStrokeFor(state: WorkflowStepState): string {
  if (state === 'complete') return 'var(--status-ok-core)';
  if (state === 'in_progress') return 'var(--status-running-core)';
  if (state === 'blocked') return 'var(--status-blocked-core)';
  return 'var(--line-default)';
}

export function WorkflowDiagram({ steps, title }: WorkflowDiagramProps): React.JSX.Element {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const width = PAD_X * 2 + ordered.length * NODE_W + (ordered.length - 1) * GAP_X;
  const height = PAD_Y * 2 + NODE_H + 60;

  const canvasStyle: CSSProperties = {
    width: '100%',
    height: 'auto',
    background: 'var(--surface-panel)',
    border: '1px solid var(--line-subtle)',
    borderRadius: 'var(--radius-panel)',
    display: 'block',
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={canvasStyle}
      role="img"
      aria-label={title}
      preserveAspectRatio="xMinYMid meet"
    >
      <title>{title}</title>
      <desc>
        Left-to-right workflow. Refer to the step list below for the same steps in
        reading order with owners, inputs, outputs, and current demo state.
      </desc>
      {/* connectors */}
      <g>
        {ordered.slice(0, -1).map((step, i) => {
          const x1 = PAD_X + (i + 1) * NODE_W + i * GAP_X;
          const x2 = x1 + GAP_X;
          const y = PAD_Y + NODE_H / 2;
          const nextStep = ordered[i + 1];
          if (!nextStep) return null;
          return (
            <g key={`edge-${step.id}-${nextStep.id}`}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke="var(--edge-color)"
                strokeWidth="var(--edge-w)"
              />
              <polygon
                points={`${x2},${y} ${x2 - 6},${y - 4} ${x2 - 6},${y + 4}`}
                fill="var(--edge-color)"
              />
            </g>
          );
        })}
      </g>
      {/* nodes */}
      <g>
        {ordered.map((step, i) => {
          const x = PAD_X + i * (NODE_W + GAP_X);
          const y = PAD_Y;
          const isHuman = isHumanDecisionStep(step);
          const slotProps = step.domainSlot !== null
            ? { 'data-domain-slot': String(step.domainSlot) }
            : {};
          const fill = stateFillFor(step.state);
          const stroke = isHuman ? 'var(--node-human-ring)' : stateStrokeFor(step.state);
          const strokeWidth = isHuman ? 'var(--node-human-ring-w)' : 'var(--node-stroke-w)';
          return (
            <g key={step.id} {...slotProps}>
              {isHuman ? (
                // Diamond for human decision — visually unmistakable.
                <polygon
                  points={`${x + NODE_W / 2},${y} ${x + NODE_W},${y + NODE_H / 2} ${x + NODE_W / 2},${y + NODE_H} ${x},${y + NODE_H / 2}`}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  ry={12}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              )}
              <text
                x={x + NODE_W / 2}
                y={y - 8}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                fontSize="10"
                letterSpacing="1.2"
                style={{ textTransform: 'uppercase' }}
              >
                {isHuman ? 'HUMAN DECISION' : 'AGENT STEP'}
              </text>
              <text
                x={x + NODE_W / 2}
                y={y + 34}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontFamily="var(--font-sans)"
                fontSize="13"
                fontWeight="600"
              >
                {step.title.length > 24 ? step.title.slice(0, 23) + '…' : step.title}
              </text>
              <text
                x={x + NODE_W / 2}
                y={y + 54}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontFamily="var(--font-sans)"
                fontSize="11"
              >
                {step.ownerLabel}
              </text>
              <text
                x={x + NODE_W / 2}
                y={y + 76}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontFamily="var(--font-mono)"
                fontSize="10"
                letterSpacing="1.2"
                style={{ textTransform: 'uppercase' }}
              >
                {STATE_LABEL[step.state]}
              </text>
              <title>
                {`${isHuman ? 'Human decision — ' : 'Agent step — '}${step.title}. Owner: ${step.ownerLabel}. State: ${STATE_LABEL[step.state]}.`}
              </title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// The synchronised accessible list — walks the same ordered steps and prints
// inputs, outputs, owner, and state for each one.
export interface WorkflowStepListProps {
  readonly steps: readonly WorkflowStep[];
}

const listItemStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: 'var(--space-3) var(--space-4)',
  padding: 'var(--space-4)',
  borderTop: '1px solid var(--line-subtle)',
};

const kindTagStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const stateTagStyle = (state: WorkflowStepState): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: '0 var(--space-3)',
  height: 'var(--c-badge-h)',
  borderRadius: 'var(--radius-pill)',
  background: stateFillFor(state),
  border: `1px solid ${stateStrokeFor(state)}`,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
});

export function WorkflowStepList({ steps }: WorkflowStepListProps): React.JSX.Element {
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  return (
    <ol
      aria-label="Workflow steps (accessible list)"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {ordered.map((step) => {
        const isHuman = isHumanDecisionStep(step);
        const slotProps = step.domainSlot !== null
          ? { 'data-domain-slot': String(step.domainSlot) }
          : {};
        return (
          <li key={step.id} {...slotProps} style={listItemStyle}>
            <span style={kindTagStyle}>Step {step.order}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{step.title}</strong>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-micro-size)',
                    letterSpacing: 'var(--tracking-micro)',
                    textTransform: 'uppercase',
                    color: isHuman ? 'var(--node-human-ring)' : 'var(--text-secondary)',
                    padding: '0 var(--space-3)',
                    border: `1px solid ${isHuman ? 'var(--node-human-ring)' : 'var(--line-default)'}`,
                    borderRadius: 'var(--radius-pill)',
                  }}
                >
                  {isHuman ? 'Human decision' : 'Agent step'}
                </span>
                <span style={stateTagStyle(step.state)}>{STATE_LABEL[step.state]}</span>
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>Owner: {step.ownerLabel}</span>
              {isHuman ? (
                <span style={{ color: 'var(--text-secondary)' }}>
                  Decision prompt: {step.decisionPrompt}
                </span>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                <div>
                  <div style={kindTagStyle}>Inputs</div>
                  {step.inputs.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>None declared</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {step.inputs.map((s) => (
                        <li key={`${step.id}-in-${s}`}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div style={kindTagStyle}>Outputs</div>
                  {step.outputs.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>None declared</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {step.outputs.map((s) => (
                        <li key={`${step.id}-out-${s}`}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
