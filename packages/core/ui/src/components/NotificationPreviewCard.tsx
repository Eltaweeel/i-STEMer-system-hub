import type { CSSProperties } from 'react';
import type { ChannelNotificationPreview } from '@bagos/contracts';

// Generic channel notification preview card. The card is a STATIC PREVIEW only:
//   - It carries a permanent "not sent" label. There is no "sent" state.
//   - It renders a placeholder channel name, not a real account or phone number.
//   - It uses the fixture timestamp, never the wall clock.
//   - It has no send button, no delivery ticks, and no conversation thread.
//   - The provider field labels the integration type; the component does not
//     claim the message was (or could be) delivered from this interface.

const cardStyle: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--line-subtle)',
  borderLeft: '3px solid var(--data-sample-core)',
  borderRadius: 'var(--radius-panel)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
};

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-micro-size)',
  letterSpacing: 'var(--tracking-micro)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const notSentStyle: CSSProperties = {
  ...kickerStyle,
  color: 'var(--data-sample-core)',
};

const bodyStyle: CSSProperties = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--line-subtle)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  lineHeight: 'var(--text-body-lh)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-5)',
  alignItems: 'baseline',
  flexWrap: 'wrap',
};

export interface NotificationPreviewCardProps {
  readonly preview: ChannelNotificationPreview;
  readonly formatTime: (iso: string) => string;
}

export function NotificationPreviewCard({
  preview,
  formatTime,
}: NotificationPreviewCardProps): React.JSX.Element {
  return (
    <div data-testid="notification-preview-card" style={cardStyle}>
      <div style={headerStyle}>
        <span style={notSentStyle} data-testid="not-sent-label">
          Sample notification preview — not sent.
        </span>
        <span style={kickerStyle}>
          {preview.provider} · {preview.channel}
        </span>
      </div>
      <div style={bodyStyle}>{preview.messageBody}</div>
      <div style={footerStyle}>
        <span style={kickerStyle}>
          Fixture time: {formatTime(preview.fixtureTimestamp)}
        </span>
        <a
          href={preview.sourceHref}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro-size)',
            letterSpacing: 'var(--tracking-micro)',
            textTransform: 'uppercase',
            color: 'var(--text-link)',
          }}
        >
          Source: {preview.sourceLabel}
        </a>
      </div>
    </div>
  );
}
