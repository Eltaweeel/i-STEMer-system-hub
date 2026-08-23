import type { AgentSummary, ApprovalPackage, CoordinationCycle, WorkflowDetail, WorkflowStep } from '@bagos/contracts';
import { StatusBadge } from './StatusBadge';

export interface CommandCenterViewProps {
  readonly workflow: WorkflowDetail;
  readonly agents: readonly AgentSummary[];
  readonly approvals: readonly ApprovalPackage[];
  readonly cycle: CoordinationCycle;
  readonly formatTime: (iso: string) => string;
  readonly agentHref: (id: string) => string;
  readonly approvalHref: (id: string) => string;
}

const panelStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
} as const;

const kickerStyle = {
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
} as const;

function EmptyState({ children }: { children: string }): JSX.Element {
  return <p style={{ margin: 0, color: 'var(--text-muted)' }}>{children}</p>;
}

function StepList({ steps }: { steps: readonly WorkflowStep[] }): JSX.Element {
  if (steps.length === 0) return <EmptyState>No workflow steps are currently in progress.</EmptyState>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
      {steps.map((step) => (
        <li key={step.id} style={{ padding: 'var(--space-3) 0', borderTop: '1px solid var(--line-subtle)' }}>
          <strong>{step.title}</strong>
          <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Owner: {step.ownerLabel}</span>
          <span style={{ ...kickerStyle, color: 'var(--status-running-core)' }}><span aria-hidden="true">● </span>IN PROGRESS</span>
        </li>
      ))}
    </ul>
  );
}

export function CommandCenterView({ workflow, agents, approvals, cycle, formatTime, agentHref, approvalHref }: CommandCenterViewProps): JSX.Element {
  const activeSteps = workflow.steps.filter((step) => step.state === 'in_progress');
  const notStartedCount = workflow.steps.filter((step) => step.state === 'not_started').length;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <section aria-labelledby="command-objective" style={{ ...panelStyle, background: 'var(--surface-glow)', borderColor: 'var(--line-strong)' }}>
        <span style={kickerStyle}>Current objective · fixture plan</span>
        <h2 id="command-objective" style={{ margin: 'var(--space-3) 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-title-size)' }}>{workflow.label}</h2>
        <p style={{ margin: 0, maxWidth: '80ch' }}>{workflow.objective}</p>
      </section>

      <div className="command-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-5)' }}>
        <section aria-labelledby="command-progress" style={panelStyle}>
          <span style={kickerStyle}>Execution</span>
          <h2 id="command-progress">Steps in progress</h2>
          <StepList steps={activeSteps} />
          <p style={{ margin: 'var(--space-4) 0 0', color: 'var(--text-secondary)' }}>{notStartedCount} of {workflow.steps.length} steps are NOT STARTED.</p>
        </section>

        <section aria-labelledby="command-approvals" style={panelStyle}>
          <span style={kickerStyle}>Attention queue</span>
          <h2 id="command-approvals">Approvals requiring attention</h2>
          {approvals.length === 0 ? <EmptyState>No approval packages require attention.</EmptyState> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {approvals.map((approval) => (
                <li key={approval.id} style={{ padding: 'var(--space-3) 0', borderTop: '1px solid var(--line-subtle)' }}>
                  <a href={approvalHref(approval.id)} style={{ color: 'var(--text-link)' }}>{approval.title}</a>
                  <span style={{ display: 'block', ...kickerStyle, color: 'var(--status-attention-core)' }}><span aria-hidden="true">● </span>PENDING · {approval.requiredTier.replaceAll('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="command-agents" style={panelStyle}>
        <span style={kickerStyle}>Roster</span>
        <h2 id="command-agents">Agent status</h2>
        <ul className="command-agent-grid" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          {agents.map((agent) => (
            <li key={agent.id} data-domain-slot={String(agent.domainSlot)} style={{ padding: 'var(--space-4)', background: 'var(--domain-active-tint)', border: '1px solid var(--domain-active-edge)', borderLeft: '3px solid var(--domain-active-core)', borderRadius: 'var(--radius-card)' }}>
              <a href={agentHref(agent.id)} style={{ color: 'var(--text-link)', display: 'block', marginBottom: 'var(--space-3)' }}>{agent.displayName}</a>
              <StatusBadge status={agent.status} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="command-schedule" style={panelStyle}>
        <span style={kickerStyle}>Today · proposed fixture cycle</span>
        <h2 id="command-schedule">Operating day</h2>
        <ol className="command-timeline" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 'var(--space-3)' }}>
          <li style={{ padding: 'var(--space-4)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-card)' }}><time dateTime={cycle.morning.scheduledAt} style={kickerStyle}>{formatTime(cycle.morning.scheduledAt)}</time><strong style={{ display: 'block', marginTop: 'var(--space-2)' }}>Morning briefing</strong></li>
          <li style={{ padding: 'var(--space-4)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-card)' }}><span style={kickerStyle}>Midday streams</span><span style={{ display: 'block', marginTop: 'var(--space-2)' }}>{cycle.midday.map((stream) => stream.displayName).join(' · ')}</span></li>
          <li style={{ padding: 'var(--space-4)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-card)' }}><time dateTime={cycle.evening.scheduledAt} style={kickerStyle}>{formatTime(cycle.evening.scheduledAt)}</time><strong style={{ display: 'block', marginTop: 'var(--space-2)' }}>Evening briefing</strong></li>
        </ol>
        <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--text-muted)' }}>Timezone: {cycle.timezone}. This schedule is proposed, not live.</p>
      </section>
    </div>
  );
}
