import type { ReactNode } from 'react';
import type { DomainSlot, WorkflowStep, WorkflowStepState } from '@bagos/contracts';

const STATE_LABEL: Record<WorkflowStepState, string> = {
  not_started: 'NOT STARTED',
  in_progress: 'IN PROGRESS',
  complete: 'COMPLETE',
  blocked: 'BLOCKED',
};

export interface SpecialistWorkspaceViewProps {
  readonly title: string;
  readonly description: string;
  readonly domainSlot: DomainSlot;
  readonly agentDetailHref: string;
  readonly children: ReactNode;
}

export function SpecialistWorkspaceView({ title, description, domainSlot, agentDetailHref, children }: SpecialistWorkspaceViewProps): React.JSX.Element {
  return (
    <div data-domain-slot={String(domainSlot)} style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <header style={{ padding: 'var(--space-5)', background: 'var(--domain-active-tint)', border: '1px solid var(--domain-active-edge)', borderLeft: '3px solid var(--domain-active-core)', borderRadius: 'var(--radius-panel)' }}>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro-size)', letterSpacing: 'var(--tracking-micro)', textTransform: 'uppercase' }}>Specialist workspace · fixture only</span>
        <h1 style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-display)', margin: 'var(--space-3) 0' }}>{title}</h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '72ch' }}>{description}</p>
        <a href={agentDetailHref} style={{ color: 'var(--text-link)' }}>View agent role, policy, and status</a>
      </header>
      {children}
    </div>
  );
}

export function WorkflowWorkList({ title, steps }: { title: string; steps: readonly WorkflowStep[] }): React.JSX.Element {
  return (
    <section aria-labelledby={`work-list-${title.replaceAll(' ', '-').toLowerCase()}`} style={{ padding: 'var(--space-5)', background: 'var(--surface-panel)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-panel)' }}>
      <h2 id={`work-list-${title.replaceAll(' ', '-').toLowerCase()}`}>{title}</h2>
      {steps.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No workflow-owned work exists in the fixture.</p> : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
          {steps.map((step) => (
            <li key={step.id} style={{ padding: 'var(--space-4)', background: 'var(--surface-raised)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}><strong>{step.title}</strong><span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro-size)' }}><span aria-hidden="true">● </span>{STATE_LABEL[step.state]}</span></div>
              <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--text-secondary)' }}>Produces: {step.outputs.length > 0 ? step.outputs.join(', ') : 'unknown'}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
