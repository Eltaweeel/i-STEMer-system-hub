import type { CSSProperties } from 'react';
import type { ContentCalendarItem, ContentCalendarState } from '@bagos/contracts';

const STATE_LABEL: Record<ContentCalendarState, string> = {
  draft: 'DRAFT',
  awaiting_review: 'AWAITING REVIEW',
  scheduled: 'SCHEDULED',
};

const STATE_TOKEN: Record<ContentCalendarState, string> = {
  draft: 'var(--status-draft-core)',
  awaiting_review: 'var(--status-attention-core)',
  scheduled: 'var(--status-ok-core)',
};

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
};

export interface ContentCalendarProps {
  readonly items: readonly ContentCalendarItem[];
  readonly formatDate: (iso: string) => string;
}

export function ContentCalendar({ items, formatDate }: ContentCalendarProps): JSX.Element {
  if (items.length === 0) {
    return <p style={{ color: 'var(--text-muted)', margin: 0 }}>No planned content items.</p>;
  }

  return (
    <ol aria-label="Planned content calendar" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
      {items.map((contentItem) => (
        <li
          key={contentItem.id}
          className="content-calendar-item"
          data-domain-slot={String(contentItem.domainSlot)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(9rem, 0.7fr) minmax(12rem, 2fr) minmax(8rem, 1fr)',
            gap: 'var(--space-4)',
            alignItems: 'center',
            padding: 'var(--space-4)',
            background: 'var(--surface-raised)',
            border: '1px solid var(--line-subtle)',
            borderLeft: '3px solid var(--domain-active-core)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <time dateTime={contentItem.scheduledFor} style={{ ...labelStyle, color: 'var(--text-secondary)' }}>
            {formatDate(contentItem.scheduledFor)}
          </time>
          <span>
            <strong style={{ display: 'block' }}>{contentItem.title}</strong>
            <span style={{ color: 'var(--text-muted)' }}>Owner: {contentItem.ownerLabel}</span>
          </span>
          <span style={{ ...labelStyle, color: STATE_TOKEN[contentItem.state] }}>
            <span aria-hidden="true">● </span>{STATE_LABEL[contentItem.state]}
          </span>
        </li>
      ))}
    </ol>
  );
}
