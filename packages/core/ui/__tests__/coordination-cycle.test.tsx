// The coordination cycle view labels itself as PROPOSED, prints its timezone
// explicitly, and renders the accessible table that walks the same data.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoordinationCycleTable, CoordinationCycleView } from '../src/index';
import type { CoordinationCycle } from '@bagos/contracts';

const CYCLE: CoordinationCycle = {
  meta: {
    source: 'fixture',
    isSample: true,
    isPartial: false,
    stale: false,
    dataVersion: 'test',
    capturedAt: '2026-08-19T09:15:00+02:00',
    generatedAt: '2026-08-19T09:15:00+02:00',
  },
  id: 'coord:test',
  title: 'Test cycle',
  timezone: 'Africa/Cairo',
  proposedNotice: 'This is a plan, not a live schedule.',
  morning: {
    id: 'br:m',
    kind: 'morning',
    scheduledAt: '2026-08-19T08:00:00+02:00',
    headline: 'Morning headline.',
    agenda: ['agenda-m-1'],
    attendees: ['Attendee One'],
  },
  midday: [
    {
      id: 'stream:one',
      agentId: 'agent:one',
      displayName: 'Stream One',
      domainSlot: 2,
      plannedContributions: ['contribution-1'],
    },
    {
      id: 'stream:two',
      agentId: 'agent:two',
      displayName: 'Stream Two',
      domainSlot: 3,
      plannedContributions: ['contribution-2'],
    },
    {
      id: 'stream:three',
      agentId: 'agent:three',
      displayName: 'Stream Three',
      domainSlot: 4,
      plannedContributions: ['contribution-3'],
    },
  ],
  daytimeEvents: [
    {
      id: 'ev:1',
      at: '2026-08-19T10:00:00+02:00',
      actor: 'Actor A',
      summary: 'Event summary A.',
    },
    {
      id: 'ev:2',
      at: '2026-08-19T14:00:00+02:00',
      actor: 'Actor B',
      summary: 'Event summary B.',
    },
  ],
  evening: {
    id: 'br:e',
    kind: 'evening',
    scheduledAt: '2026-08-19T20:00:00+02:00',
    headline: 'Evening headline.',
    agenda: ['agenda-e-1'],
    attendees: ['Attendee One'],
  },
};

const fmt = (iso: string): string => iso;

describe('CoordinationCycleView', () => {
  const html = renderToStaticMarkup(
    React.createElement(CoordinationCycleView, { cycle: CYCLE, formatTime: fmt }),
  );

  it('labels the cycle as proposed', () => {
    expect(html.toLowerCase()).toContain('proposed');
  });

  it('prints the timezone explicitly', () => {
    expect(html).toContain('Africa/Cairo');
  });

  it('renders morning and evening briefings and both times', () => {
    expect(html).toContain('Morning briefing');
    expect(html).toContain('Evening briefing');
    expect(html).toContain('2026-08-19T08:00:00+02:00');
    expect(html).toContain('2026-08-19T20:00:00+02:00');
  });

  it('renders three midday streams, each with its contribution', () => {
    expect(html).toContain('Stream One');
    expect(html).toContain('Stream Two');
    expect(html).toContain('Stream Three');
    expect(html).toContain('contribution-1');
    expect(html).toContain('contribution-2');
    expect(html).toContain('contribution-3');
  });

  it('renders daytime events in authored order with timestamps and actors', () => {
    const aIdx = html.indexOf('Event summary A.');
    const bIdx = html.indexOf('Event summary B.');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
    expect(html).toContain('Actor A');
    expect(html).toContain('Actor B');
    expect(html).toContain('2026-08-19T10:00:00+02:00');
    expect(html).toContain('2026-08-19T14:00:00+02:00');
  });
});

describe('CoordinationCycleTable — accessible synchronised walk', () => {
  const html = renderToStaticMarkup(
    React.createElement(CoordinationCycleTable, { cycle: CYCLE, formatTime: fmt }),
  );

  it('renders one <table> element with column headers', () => {
    expect(html).toMatch(/<table\b/);
    for (const h of ['Time', 'Actor', 'Kind', 'Item']) {
      expect(html).toContain(h);
    }
  });

  it('covers every stream contribution, event, and briefing', () => {
    for (const item of [
      'Morning headline.',
      'contribution-1',
      'contribution-2',
      'contribution-3',
      'Event summary A.',
      'Event summary B.',
      'Evening headline.',
    ]) {
      expect(html).toContain(item);
    }
  });
});
