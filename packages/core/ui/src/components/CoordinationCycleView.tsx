import type { CSSProperties } from 'react';
import type {
  CoordinationBriefing,
  CoordinationCycle,
  CoordinationEvent,
  CoordinationStream,
} from '@bagos/contracts';

// -----------------------------------------------------------------------------
// The daily coordination cycle diagram. Labelled clearly as the PROPOSED
// operating cycle — this is a plan, not a live schedule. Every displayed time
// is a preformatted string passed in by the caller; nothing here reads the
// wall clock.
//
// Structure top-to-bottom:
//   [ Morning briefing ]
//         |
//   [ midday stream 1 ] [ midday stream 2 ] [ midday stream 3 ]
//         |
//   [ Daytime events (ordered list) ]
//         |
//   [ Evening briefing ]
//
// The synchronised accessible view (below) walks the same data as a table so
// a reader sees the same relationships.
// -----------------------------------------------------------------------------

export interface CoordinationCycleViewProps {
  readonly cycle: CoordinationCycle;
  readonly formatTime: (iso: string) => string;
}

const wrapStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-5)',
};

const proposedTagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: '0 var(--space-3)',
  height: 'var(--c-badge-h)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--status-draft-tint)',
  border: '1px solid var(--status-draft-core)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
};

const panelStyle: CSSProperties = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const timeStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-heading-size)',
  color: 'var(--text-primary)',
};

function Briefing({
  briefing,
  formatTime,
}: {
  briefing: CoordinationBriefing;
  formatTime: (iso: string) => string;
}): JSX.Element {
  return (
    <section aria-label={`${briefing.kind} briefing`} style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <div style={labelStyle}>{briefing.kind === 'morning' ? 'Morning briefing' : 'Evening briefing'}</div>
          <div style={timeStyle}>{formatTime(briefing.scheduledAt)}</div>
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>Attendees: {briefing.attendees.join(', ')}</div>
      </div>
      <p style={{ margin: 0, color: 'var(--text-primary)' }}>{briefing.headline}</p>
      <div>
        <div style={labelStyle}>Agenda</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {briefing.agenda.map((item, i) => (
            <li key={`${briefing.id}-agenda-${i}`} style={{ color: 'var(--text-secondary)' }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function StreamCard({ stream }: { stream: CoordinationStream }): JSX.Element {
  return (
    <article
      aria-label={`${stream.displayName} midday stream`}
      data-domain-slot={String(stream.domainSlot)}
      style={{
        background: 'var(--domain-active-tint)',
        border: '1px solid var(--domain-active-edge)',
        borderLeft: '3px solid var(--domain-active-core)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        minWidth: 0,
      }}
    >
      <div style={labelStyle}>Midday stream</div>
      <strong style={{ fontSize: 'var(--text-heading-size)' }}>{stream.displayName}</strong>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-secondary)' }}>
        {stream.plannedContributions.map((c, i) => (
          <li key={`${stream.id}-c-${i}`}>{c}</li>
        ))}
      </ul>
    </article>
  );
}

function EventsList({
  events,
  formatTime,
}: {
  events: readonly CoordinationEvent[];
  formatTime: (iso: string) => string;
}): JSX.Element {
  return (
    <section aria-label="Daytime events (deterministic order)" style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <div style={labelStyle}>Daytime events</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-micro-size)' }}>
          {events.length} authored · deterministic order
        </div>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {events.map((e) => (
          <li
            key={e.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 160px 1fr',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) 0',
              borderTop: '1px solid var(--line-subtle)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-micro-size)',
                letterSpacing: 'var(--tracking-micro)',
                textTransform: 'uppercase',
              }}
            >
              {formatTime(e.at)}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>{e.actor}</span>
            <span>{e.summary}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CoordinationCycleView({ cycle, formatTime }: CoordinationCycleViewProps): JSX.Element {
  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={proposedTagStyle} aria-label="proposed operating cycle">
          Proposed
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>{cycle.proposedNotice}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro-size)',
            letterSpacing: 'var(--tracking-micro)',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Timezone: {cycle.timezone}
        </span>
      </div>

      <Briefing briefing={cycle.morning} formatTime={formatTime} />

      <div
        className="coord-streams"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        {cycle.midday.map((stream) => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>

      <EventsList events={cycle.daytimeEvents} formatTime={formatTime} />

      <Briefing briefing={cycle.evening} formatTime={formatTime} />
    </div>
  );
}

// The synchronised accessible table — walks the SAME cycle data as the diagram
// so a reader sees the same relationships in reading order.
export interface CoordinationCycleTableProps {
  readonly cycle: CoordinationCycle;
  readonly formatTime: (iso: string) => string;
}

export function CoordinationCycleTable({ cycle, formatTime }: CoordinationCycleTableProps): JSX.Element {
  const rows: { time: string; actor: string; item: string; kind: string }[] = [];
  rows.push({
    time: formatTime(cycle.morning.scheduledAt),
    actor: cycle.morning.attendees.join(', '),
    item: cycle.morning.headline,
    kind: 'Morning briefing',
  });
  for (const stream of cycle.midday) {
    for (const c of stream.plannedContributions) {
      rows.push({
        time: '—',
        actor: stream.displayName,
        item: c,
        kind: 'Midday stream',
      });
    }
  }
  for (const e of cycle.daytimeEvents) {
    rows.push({
      time: formatTime(e.at),
      actor: e.actor,
      item: e.summary,
      kind: 'Daytime event',
    });
  }
  rows.push({
    time: formatTime(cycle.evening.scheduledAt),
    actor: cycle.evening.attendees.join(', '),
    item: cycle.evening.headline,
    kind: 'Evening briefing',
  });

  return (
    <table
      aria-label="Coordination cycle — accessible table, synchronised with the diagram"
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: 'var(--surface-panel)',
        borderRadius: 'var(--radius-panel)',
        border: '1px solid var(--line-subtle)',
      }}
    >
      <thead>
        <tr>
          {['Time', 'Actor', 'Kind', 'Item'].map((h) => (
            <th
              key={h}
              scope="col"
              style={{
                textAlign: 'left',
                padding: 'var(--space-3) var(--space-4)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-micro-size)',
                letterSpacing: 'var(--tracking-micro)',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--line-subtle)',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`row-${i}`}>
            <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {r.time}
            </td>
            <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-secondary)' }}>{r.actor}</td>
            <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-muted)' }}>{r.kind}</td>
            <td style={{ padding: 'var(--space-3) var(--space-4)' }}>{r.item}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
