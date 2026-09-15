import type { CSSProperties } from 'react';
import type { CapacitySnapshot, TeamMember, TeamProjection } from '@bagos/contracts';

const panelStyle: CSSProperties = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
};

const labelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
};

const phaseLabel: Record<TeamMember['phase'], string> = {
  initial: 'INITIAL TEAM',
  planned: 'PLANNED ROLE',
};

const capacityStateLabel: Record<CapacitySnapshot['state'], string> = {
  unavailable: 'TELEMETRY UNAVAILABLE',
  estimated: 'ESTIMATE',
  live: 'LIVE TELEMETRY',
};

function MemberCard({ member, isOrchestrator }: { member: TeamMember; isOrchestrator: boolean }): React.JSX.Element {
  return (
    <article
      data-team-phase={member.phase}
      style={{
        padding: 'var(--space-4)',
        background: isOrchestrator ? 'var(--surface-glow)' : 'var(--surface-raised)',
        border: `1px solid ${isOrchestrator ? 'var(--line-strong)' : 'var(--line-subtle)'}`,
        borderLeft: `3px solid ${isOrchestrator ? 'var(--line-contrast)' : 'var(--domain-active-core)'}`,
        borderRadius: 'var(--radius-card)',
        display: 'grid',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 'var(--space-3)' }}>
        <div>
          <strong>{member.displayName}</strong>
          <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>{member.role}</span>
        </div>
        <span style={{ ...labelStyle, whiteSpace: 'nowrap' }}>{phaseLabel[member.phase]}</span>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{member.responsibility}</p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...labelStyle, color: 'var(--status-draft-core)' }}>FIXTURE ONLY</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-small-size)' }}>{member.demoStatus.note}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-small-size)' }}>Reports to {member.reportsToLabel}</span>
      </div>
    </article>
  );
}

function CapacityPanel({ snapshot, formatTime }: { snapshot: CapacitySnapshot; formatTime: (iso: string) => string }): React.JSX.Element {
  const hasUsage = snapshot.remainingPercent !== null && snapshot.usedPercent !== null;
  const progressValue = hasUsage ? snapshot.remainingPercent ?? 0 : 0;
  const thresholdLabel = snapshot.thresholdState === 'unknown'
    ? 'THRESHOLD UNKNOWN'
    : snapshot.thresholdState === 'at_or_above'
      ? `AT OR ABOVE ${snapshot.thresholdPercent}%`
      : `BELOW ${snapshot.thresholdPercent}%`;

  return (
    <section aria-labelledby="capacity-heading" style={{ ...panelStyle, background: 'var(--surface-glow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <span style={labelStyle}>Account capacity</span>
          <h2 id="capacity-heading" style={{ margin: 'var(--space-2) 0 0' }}>Usage and reset runway</h2>
        </div>
        <span style={{ ...labelStyle, color: snapshot.state === 'live' ? 'var(--status-ok-core)' : 'var(--status-draft-core)' }}>{capacityStateLabel[snapshot.state]}</span>
      </div>

      <div className="capacity-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
        <div style={{ padding: 'var(--space-3)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-card)' }}>
          <span style={labelStyle}>Remaining</span>
          <strong style={{ display: 'block', fontSize: 'var(--text-heading-size)', marginTop: 'var(--space-2)' }}>{hasUsage ? `${snapshot.remainingPercent}%` : 'Unknown'}</strong>
        </div>
        <div style={{ padding: 'var(--space-3)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-card)' }}>
          <span style={labelStyle}>Reset</span>
          <strong style={{ display: 'block', marginTop: 'var(--space-2)' }}>{snapshot.resetAt ? formatTime(snapshot.resetAt) : 'Unknown'}</strong>
        </div>
        <div style={{ padding: 'var(--space-3)', background: 'var(--surface-raised)', borderRadius: 'var(--radius-card)' }}>
          <span style={labelStyle}>Policy</span>
          <strong style={{ display: 'block', marginTop: 'var(--space-2)' }}>{thresholdLabel}</strong>
        </div>
      </div>

      {hasUsage ? (
        <progress max={100} value={progressValue} aria-label={`Remaining capacity ${progressValue}%`} style={{ width: '100%', marginTop: 'var(--space-4)' }} />
      ) : null}
      <p style={{ margin: 'var(--space-4) 0 0', color: 'var(--text-secondary)' }}>{snapshot.runwayLabel}</p>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{snapshot.policy}</p>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-small-size)' }}>{snapshot.note}</p>
      <dl style={{ margin: 'var(--space-4) 0 0', display: 'grid', gap: 'var(--space-2)' }}>
        <div><dt style={{ ...labelStyle, display: 'inline' }}>Provider: </dt><dd style={{ display: 'inline', margin: 0 }}>{snapshot.providerLabel}</dd></div>
        <div><dt style={{ ...labelStyle, display: 'inline' }}>Account: </dt><dd style={{ display: 'inline', margin: 0 }}>{snapshot.accountLabel}</dd></div>
      </dl>
    </section>
  );
}

export interface TeamViewProps {
  readonly team: TeamProjection;
  readonly capacity: CapacitySnapshot;
  readonly formatTime: (iso: string) => string;
}

export function TeamView({ team, capacity, formatTime }: TeamViewProps): React.JSX.Element {
  const orchestrator = team.members.find((member) => member.id === team.orchestratorId);
  const initial = team.members.filter((member) => member.phase === 'initial');
  const planned = team.members.filter((member) => member.phase === 'planned');

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <section aria-labelledby="team-mission" style={{ ...panelStyle, background: 'var(--surface-glow)', borderColor: 'var(--line-strong)' }}>
        <span style={labelStyle}>Named agent operating model · fixture projection</span>
        <h2 id="team-mission" style={{ margin: 'var(--space-2) 0' }}>{team.title}</h2>
        <p style={{ margin: 0, maxWidth: '78ch' }}>{team.mission}</p>
        <p style={{ margin: 'var(--space-3) 0 0', color: 'var(--text-secondary)' }}>{team.approvalBoundary}</p>
      </section>

      <section aria-labelledby="team-roster" style={panelStyle}>
        <span style={labelStyle}>Roster</span>
        <h2 id="team-roster" style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>Team roster</h2>
        {orchestrator ? <MemberCard member={orchestrator} isOrchestrator /> : null}
        <h3 style={{ ...labelStyle, margin: 'var(--space-5) 0 var(--space-3)' }}>Initial team</h3>
        <div className="team-roster-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          {initial.filter((member) => member.id !== team.orchestratorId).map((member) => <MemberCard key={member.id} member={member} isOrchestrator={false} />)}
        </div>
        <h3 style={{ ...labelStyle, margin: 'var(--space-5) 0 var(--space-3)' }}>Planned expansion</h3>
        <div className="team-roster-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
          {planned.map((member) => <MemberCard key={member.id} member={member} isOrchestrator={false} />)}
        </div>
      </section>

      <section aria-labelledby="team-handoffs" style={panelStyle}>
        <span style={labelStyle}>Evidence flow</span>
        <h2 id="team-handoffs" style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>Who receives what</h2>
        <ol className="team-handoff-grid" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
          {team.handoffs.map((handoff) => (
            <li key={handoff.id} style={{ padding: 'var(--space-4)', background: 'var(--surface-raised)', border: '1px solid var(--line-subtle)', borderRadius: 'var(--radius-card)' }}>
              <strong>{handoff.from} → {handoff.to}</strong>
              <span style={{ display: 'block', marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>{handoff.artifact}</span>
              <span style={{ display: 'block', marginTop: 'var(--space-2)', color: 'var(--text-muted)' }}>{handoff.rule}</span>
            </li>
          ))}
        </ol>
      </section>

      <CapacityPanel snapshot={capacity} formatTime={formatTime} />
    </div>
  );
}
