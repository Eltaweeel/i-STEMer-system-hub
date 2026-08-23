// Every new route must render, and every route rendered through the app's
// shell must display the DEMO ENVIRONMENT indicator. The Next.js App Router
// makes this structural (root layout wraps everything), but exercising each
// route through AppShell here catches regressions that a route could
// accidentally introduce (e.g. throwing on load).

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '@bagos/ui';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW } from '@bagos/fixtures';
import CoordinationCyclePage from '../app/coordination-cycle/page';
import WorkflowsIndexPage from '../app/workflows/page';
import WorkflowDetailPage from '../app/workflows/[id]/page';
import AgentsIndexPage from '../app/agents/page';
import AgentDetailPage from '../app/agents/[id]/page';
import { AGENT_ROUTES, WORKFLOW_ROUTES } from '../adapters/fixture-adapter';
import { CAMPAIGN_WORKFLOW } from '../fixtures/workflows';

const SHELL_META = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

async function renderRoute(node: JSX.Element): Promise<string> {
  return renderToStaticMarkup(
    React.createElement(AppShell, {
      meta: SHELL_META,
      productName: 'Test Product',
      organizationName: 'Test Tenant',
      children: node,
    }),
  );
}

describe('every new route renders with the demo indicator', () => {
  it('coordination-cycle', async () => {
    const page = await CoordinationCyclePage();
    const html = await renderRoute(page);
    expect(html).toContain('DEMO ENVIRONMENT');
    expect(html).toContain('Sample data');
    expect(html.toLowerCase()).toContain('proposed');
    expect(html).toContain('Africa/Cairo');
  });

  it('workflows index', async () => {
    const page = await WorkflowsIndexPage();
    const html = await renderRoute(page);
    expect(html).toContain('DEMO ENVIRONMENT');
    expect(html).toContain('Workflows');
    expect(html).toContain(CAMPAIGN_WORKFLOW.label);
  });

  it('workflow detail', async () => {
    const slug = WORKFLOW_ROUTES.find((r) => r.id === CAMPAIGN_WORKFLOW.id)?.slug;
    if (!slug) throw new Error('missing workflow slug');
    const page = await WorkflowDetailPage({ params: { id: slug } });
    const html = await renderRoute(page);
    expect(html).toContain('DEMO ENVIRONMENT');
    // Every step renders NOT STARTED — never fabricated progress.
    expect(html).toContain('NOT STARTED');
    // Three design concepts render with the three variant tags.
    expect(html).toContain('data-concept-variant="orbit"');
    expect(html).toContain('data-concept-variant="grid"');
    expect(html).toContain('data-concept-variant="ribbon"');
  });

  it('agents index', async () => {
    const page = await AgentsIndexPage();
    const html = await renderRoute(page);
    expect(html).toContain('DEMO ENVIRONMENT');
    expect(html).toContain('Agents');
  });

  it('agent detail (marketing)', async () => {
    const slug = AGENT_ROUTES.find((r) => r.id === 'agent:marketing')?.slug;
    if (!slug) throw new Error('missing agent slug');
    const page = await AgentDetailPage({ params: { id: slug } });
    const html = await renderRoute(page);
    expect(html).toContain('DEMO ENVIRONMENT');
    for (const s of [
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
      expect(html).toContain(s);
    }
  });
});
