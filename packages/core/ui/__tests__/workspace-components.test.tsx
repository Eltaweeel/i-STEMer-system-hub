import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContentCalendarItem, TrendAlert } from '@bagos/contracts';
import { ContentCalendar } from '../src/components/ContentCalendar';
import { TrendAlertCard } from '../src/components/TrendAlertCard';

describe('workspace fixture presenters', () => {
  it('renders only honest content calendar states', () => {
    const items: readonly ContentCalendarItem[] = [{
      id: 'content:1', scheduledFor: '2026-01-01T10:00:00Z', title: 'Draft example',
      ownerId: 'agent:1', ownerLabel: 'Agent one', domainSlot: 1, state: 'awaiting_review',
    }];
    const html = renderToStaticMarkup(<ContentCalendar items={items} formatDate={(iso) => iso} />);
    expect(html).toContain('AWAITING REVIEW');
    expect(html).toContain('2026-01-01T10:00:00Z');
    expect(html).not.toContain('POSTED');
  });

  it('labels a trend alert as a non-live fixture example', () => {
    const alert: TrendAlert = {
      id: 'trend:1', observedAt: '2026-01-01T10:00:00Z', observation: 'Observed sample.',
      evidenceLabel: 'Evidence', evidenceRef: 'fixture:1', suggestedNextStep: 'Draft only.',
      isFixtureExample: true,
    };
    const html = renderToStaticMarkup(<TrendAlertCard alert={alert} formatTime={(iso) => iso} />);
    expect(html).toContain('Fixture example');
    expect(html).toContain('not live');
    expect(html).toContain('fixture:1');
  });
});
