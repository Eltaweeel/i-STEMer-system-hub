// Approval inbox honesty guarantees — asserted here:
//
//  1. DisabledDecisionControls renders <button disabled> with no click handler in
//     the static markup. The DisabledDecisionControl type has no callback field,
//     so there is nothing to attach even if a developer wanted to.
//
//  2. RehearsalEndScreen — the terminal state of the rehearsal flow — explicitly
//     states "No decision was recorded."
//
//  3. NotificationPreviewCard never claims anything was sent. It carries a
//     permanent "not sent" label and has no send button.
//
//  4. DemoIndicator renders when meta.source === 'fixture', which is what every
//     new route uses via the root layout.
//
//  5. The DisabledDecisionControl type is structurally inert: its runtime shape
//     exposes only id, label, disabledReason — no handler fields.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ApprovalInboxView,
  DisabledDecisionControls,
  RehearsalEndScreen,
  RehearsalFlowView,
  NotificationPreviewCard,
  DemoIndicator,
} from '../src/index';
import {
  makeDisabledDecisionControl,
  type ApprovalPackage,
  type ChannelNotificationPreview,
  type DisabledDecisionControl,
} from '@bagos/contracts';

const FIXTURE_TS = '2026-08-19T09:15:00+02:00';
const noop = (iso: string): string => iso;

const PREVIEW: ChannelNotificationPreview = {
  channel: '#test-approvals (fixture channel)',
  provider: 'Telegram',
  messageBody: 'Approval required: Test approval. Review and decide.',
  fixtureTimestamp: FIXTURE_TS,
  sourceHref: '/approvals/test/',
  sourceLabel: 'Test approval',
};

const PKG: ApprovalPackage = {
  meta: {
    source: 'fixture',
    isSample: true,
    isPartial: false,
    stale: false,
    dataVersion: 'test',
    capturedAt: FIXTURE_TS,
    generatedAt: FIXTURE_TS,
  },
  id: 'approval:test',
  title: 'Test Approval Package',
  status: 'pending',
  requestedAction: 'Approve the test artifact for publication.',
  responsibleAgent: 'Test Agent',
  businessReason: 'This is the business reason for the test approval.',
  targetSystem: 'Test system (fixture)',
  artifactRef: 'run:test-0001 / artifact_v1',
  supportingEvidence: ['Evidence reference one.', 'Evidence reference two.'],
  expectedResult: 'Test result achieved.',
  risks: 'No real risks in a test fixture.',
  estimatedCost: 'Zero — test fixture.',
  deadline: FIXTURE_TS,
  diffSummary: 'Second draft: added evidence reference two.',
  workflowStepRef: 'wfstep:test',
  requiredTier: 'owner_only',
  notificationPreview: PREVIEW,
};

const CONTROLS: readonly DisabledDecisionControl[] = [
  makeDisabledDecisionControl({
    id: 'ctrl:approve',
    label: 'Approve',
    disabledReason: 'Demo mode — decisions are not recorded.',
  }),
  makeDisabledDecisionControl({
    id: 'ctrl:reject',
    label: 'Reject',
    disabledReason: 'Demo mode — decisions are not recorded.',
  }),
];

// --- 1. DisabledDecisionControl type is structurally inert ---

describe('DisabledDecisionControl is content, not a control', () => {
  it('exposes only id, label, disabledReason', () => {
    const c = makeDisabledDecisionControl({
      id: 'x',
      label: 'Approve',
      disabledReason: 'Demo mode',
    });
    const keys = Object.keys(c).sort();
    expect(keys).toEqual(['disabledReason', 'id', 'label']);
  });

  it('has no handler-like properties', () => {
    const c = makeDisabledDecisionControl({ id: 'x', label: 'Approve', disabledReason: 'r' });
    const asRecord = c as unknown as Record<string, unknown>;
    expect(asRecord['onClick']).toBeUndefined();
    expect(asRecord['onActivate']).toBeUndefined();
    expect(asRecord['href']).toBeUndefined();
    expect(asRecord['action']).toBeUndefined();
  });
});

// --- 2. Disabled controls render as disabled buttons with visible reason ---

describe('DisabledDecisionControls renders properly disabled buttons', () => {
  const html = renderToStaticMarkup(
    React.createElement(DisabledDecisionControls, { controls: CONTROLS }),
  );

  it('renders a button for each control', () => {
    expect(html).toContain('Approve');
    expect(html).toContain('Reject');
  });

  it('all buttons carry the disabled attribute', () => {
    const buttons = html.match(/<button\b[^>]*>/gi) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.toLowerCase()).toContain('disabled');
    }
  });

  it('no button has an inline onclick handler', () => {
    // renderToStaticMarkup never serializes a React onClick prop into an
    // `onclick=` HTML attribute — that string is absent from React's static
    // output whether or not the prop exists. Checking the markup for it is a
    // tautology that passes even if a real handler is attached. Walk the
    // actual React element tree instead and assert no 'button' host element
    // carries any function-valued prop.
    function findFunctionPropsOnButtons(node: unknown, found: string[] = []): string[] {
      if (node === null || node === undefined || typeof node !== 'object') return found;
      if (Array.isArray(node)) {
        for (const child of node) findFunctionPropsOnButtons(child, found);
        return found;
      }
      const el = node as { type?: unknown; props?: Record<string, unknown> };
      if (el.type === 'button' && el.props) {
        for (const [key, value] of Object.entries(el.props)) {
          if (typeof value === 'function') found.push(key);
        }
      }
      if (el.props?.['children'] !== undefined) {
        findFunctionPropsOnButtons(el.props['children'], found);
      }
      return found;
    }
    const tree = DisabledDecisionControls({ controls: CONTROLS });
    const functionProps = findFunctionPropsOnButtons(tree);
    expect(functionProps).toEqual([]);
  });

  it('renders the disabled reason text for each control', () => {
    expect(html).toContain('Demo mode — decisions are not recorded.');
  });
});

// --- 3. Rehearsal flow end screen states no decision was recorded ---

describe('RehearsalEndScreen states no decision was recorded', () => {
  const html = renderToStaticMarkup(
    React.createElement(RehearsalEndScreen, {
      packageTitle: 'Test Approval Package',
      onReset: () => {},
    }),
  );

  it('contains the "no decision was recorded" message', () => {
    expect(html.toLowerCase()).toContain('no decision was recorded');
  });

  it('states the package remains PENDING', () => {
    expect(html).toContain('PENDING');
  });

  it('does not claim any approval succeeded', () => {
    // The component should say "No decision was recorded" — the word "recorded"
    // appears inside the negation, which is expected. What must NOT appear is
    // a positive claim of success.
    expect(html.toLowerCase()).not.toContain('approved successfully');
    expect(html.toLowerCase()).not.toContain('decision recorded');
    expect(html.toLowerCase()).not.toContain('approval confirmed');
  });
});

describe('RehearsalFlowView — idle state shows preview trigger, not Approve', () => {
  const html = renderToStaticMarkup(
    React.createElement(RehearsalFlowView, {
      step: 'idle',
      pkg: PKG,
      formattedDeadline: FIXTURE_TS,
      onAdvance: () => {},
      onReset: () => {},
    }),
  );

  it('shows "Preview decision flow" label, not "Approve"', () => {
    expect(html.toLowerCase()).toContain('preview decision flow');
    expect(html).not.toContain('>Approve<');
  });
});

// --- 4. NotificationPreviewCard never claims sent ---

describe('NotificationPreviewCard — static preview, not a delivery record', () => {
  const html = renderToStaticMarkup(
    React.createElement(NotificationPreviewCard, { preview: PREVIEW, formatTime: noop }),
  );

  it('carries the "not sent" label', () => {
    expect(html.toLowerCase()).toContain('not sent');
  });

  it('shows the channel name and provider as labels', () => {
    expect(html).toContain('Telegram');
    expect(html).toContain('#test-approvals (fixture channel)');
  });

  it('shows the message body', () => {
    expect(html).toContain('Approval required: Test approval.');
  });

  it('has no send button', () => {
    expect(html).not.toMatch(/<button\b/i);
  });

  it('has no claim that a message was sent or delivered', () => {
    expect(html.toLowerCase()).not.toContain('message sent');
    expect(html.toLowerCase()).not.toContain('delivered');
    expect(html.toLowerCase()).not.toContain('✓');
    expect(html.toLowerCase()).not.toContain('✔');
  });

  it('links to the source item', () => {
    expect(html).toContain('href="/approvals/test/"');
    expect(html).toContain('Test approval');
  });
});

// --- 5. DemoIndicator renders on every fixture route ---

describe('DemoIndicator renders for fixture source', () => {
  it('shows DEMO ENVIRONMENT when source is fixture', () => {
    const html = renderToStaticMarkup(
      React.createElement(DemoIndicator, { meta: { source: 'fixture' } }),
    );
    expect(html).toContain('DEMO ENVIRONMENT');
    expect(html).toContain('Sample data');
  });

  it('renders nothing when source is not fixture', () => {
    const html = renderToStaticMarkup(
      React.createElement(DemoIndicator, { meta: { source: 'api' } }),
    );
    expect(html).toBe('');
  });
});

// --- 6. ApprovalInboxView — accessible list structure ---

describe('ApprovalInboxView — accessible structure', () => {
  const html = renderToStaticMarkup(
    React.createElement(ApprovalInboxView, {
      packages: [PKG],
      getDetailHref: (id) => `/approvals/${id}/`,
      formatTime: noop,
    }),
  );

  it('renders a semantic list', () => {
    expect(html).toMatch(/<ul\b/);
    expect(html).toMatch(/<li\b/);
  });

  it('shows the package title as a link', () => {
    expect(html).toContain('Test Approval Package');
    expect(html).toMatch(/<a\b[^>]*href=/i);
  });

  it('shows PENDING status label', () => {
    expect(html).toContain('PENDING');
  });

  it('shows no empty-state message when packages are present', () => {
    expect(html).not.toContain('No approval packages pending.');
  });

  it('renders the empty state message when list is empty', () => {
    const emptyHtml = renderToStaticMarkup(
      React.createElement(ApprovalInboxView, {
        packages: [],
        getDetailHref: (id) => `/approvals/${id}/`,
        formatTime: noop,
      }),
    );
    expect(emptyHtml).toContain('No approval packages pending.');
  });
});
