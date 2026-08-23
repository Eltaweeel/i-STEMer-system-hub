// The AgentDetailView must render all nine sections. Prohibited actions must
// render as content, NOT as controls. Sample activity items missing a run
// reference or a timestamp must not render as activity.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentDetailView } from '../src/index';
import {
  makeRestriction,
  type AgentDetail,
  type SampleActivityEntry,
} from '@bagos/contracts';

const AGENT: AgentDetail = {
  meta: {
    source: 'fixture',
    isSample: true,
    isPartial: false,
    stale: false,
    dataVersion: 'test',
    capturedAt: '2026-08-19T09:15:00+02:00',
    generatedAt: '2026-08-19T09:15:00+02:00',
  },
  id: 'agent:test',
  displayName: 'Test Agent',
  domainSlot: 2,
  purpose: 'A purpose statement.',
  responsibilities: ['Responsibility one.', 'Responsibility two.'],
  allowedInputs: ['input_a', 'input_b'],
  allowedOutputs: ['output_a'],
  allowedTools: ['tool_a'],
  prohibitedActions: [
    makeRestriction({
      id: 'restriction:send',
      label: 'send_external_message',
      reason: 'Prohibited by declared policy.',
    }),
  ],
  approvalPolicy: {
    default: 'tier_0_internal',
    externalPublishOrSend: 'persisted_exact_revision',
    spendOrFinanceMutation: 'owner_only',
    permissionsOrDeletion: 'owner_only',
  },
  sopRefs: ['sop-a'],
  sampleActivity: [
    {
      id: 'act:1',
      runRef: 'run:test-0001',
      at: '2026-08-19T07:00:00+02:00',
      summary: 'Did a thing.',
      state: 'complete',
    },
  ],
  status: 'idle',
  freshness: { capturedAt: '2026-08-19T09:00:00+02:00', isStale: false },
  demoStatus: { kind: 'wired_no_runtime', note: 'note about status' },
};

const noop = (iso: string): string => iso;

describe('AgentDetailView renders all nine sections', () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentDetailView, { agent: AGENT, formatTime: noop }),
  );

  it('includes every section heading', () => {
    for (const title of [
      'Purpose',
      'Responsibilities',
      'Permitted inputs',
      'Expected outputs',
      'Tools',
      'Prohibited actions',
      'Approval requirements',
      'Planned SOPs',
      'Sample activity',
      'Current demo status',
    ]) {
      expect(html).toContain(title);
    }
  });
});

describe('Prohibited actions render as content, never as a control', () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentDetailView, { agent: AGENT, formatTime: noop }),
  );

  it('emits the restriction label and reason', () => {
    expect(html).toContain('send_external_message');
    expect(html).toContain('Prohibited by declared policy.');
  });

  it('does NOT wrap the restriction in a button or anchor', () => {
    // Grab the DOM subtree around our restriction id, then confirm it has no
    // interactive elements.
    const marker = 'data-restriction-id="restriction:send"';
    const idx = html.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    // A pragmatic window around the item.
    const window = html.slice(Math.max(0, idx - 40), idx + 400);
    expect(window).not.toMatch(/<button\b/i);
    expect(window).not.toMatch(/<a\b[^>]*\bhref=/i);
    expect(window).not.toMatch(/onclick=/i);
    expect(window).not.toMatch(/role="button"/i);
    expect(window).not.toMatch(/role="link"/i);
  });
});

describe('Sample activity requires runRef AND timestamp', () => {
  it('drops entries that are missing a run reference at render time', () => {
    const broken: SampleActivityEntry = {
      id: 'act:broken',
      runRef: '',
      at: '2026-08-19T07:00:00+02:00',
      summary: 'Should not render as activity.',
      state: 'complete',
    };
    const agent: AgentDetail = { ...AGENT, sampleActivity: [broken] };
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailView, { agent, formatTime: noop }),
    );
    expect(html).not.toContain('Should not render as activity.');
    expect(html).toContain('No sample activity to display');
  });

  it('drops entries that are missing a timestamp at render time', () => {
    const broken: SampleActivityEntry = {
      id: 'act:broken2',
      runRef: 'run:x',
      at: '',
      summary: 'Also should not render.',
      state: 'complete',
    };
    const agent: AgentDetail = { ...AGENT, sampleActivity: [broken] };
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailView, { agent, formatTime: noop }),
    );
    expect(html).not.toContain('Also should not render.');
  });

  it('renders valid entries with the run reference visible', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailView, { agent: AGENT, formatTime: noop }),
    );
    expect(html).toContain('Did a thing.');
    expect(html).toContain('run:test-0001');
  });
});

describe('Current demo status uses the DemoStatus union honestly', () => {
  it('renders the wired_no_runtime label with its note', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentDetailView, { agent: AGENT, formatTime: noop }),
    );
    expect(html).toContain('WIRED');
    expect(html).toContain('note about status');
  });
});
