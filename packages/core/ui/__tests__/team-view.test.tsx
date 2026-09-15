import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CapacitySnapshot, TeamProjection } from '@bagos/contracts';
import { TeamView } from '../src/components/TeamView';

const META = {
  source: 'fixture' as const,
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: 'test',
  capturedAt: '2026-01-01T09:00:00+02:00',
  generatedAt: '2026-01-01T09:00:00+02:00',
};

const TEAM: TeamProjection = {
  meta: META,
  id: 'team:test',
  title: 'Sample team',
  mission: 'Coordinate the work.',
  orchestratorId: 'agent:alpha',
  members: [
    {
      id: 'agent:alpha', displayName: 'Alpha (Orchestrator)', role: 'Orchestrator', phase: 'initial',
      reportsTo: 'human:owner', reportsToLabel: 'Owner', receivesFrom: ['Owner'], sendsTo: ['Nour'], responsibility: 'Routes work.', demoStatus: { kind: 'wired_no_runtime', note: 'fixture' },
    },
    {
      id: 'agent:beta', displayName: 'Beta (Planner)', role: 'Planner', phase: 'initial',
      reportsTo: 'agent:alpha', reportsToLabel: 'Alpha (Orchestrator)', receivesFrom: ['Gamma'], sendsTo: ['Owner'], responsibility: 'Owns the calendar.', demoStatus: { kind: 'wired_no_runtime', note: 'fixture' },
    },
  ],
  handoffs: [{ id: 'handoff:test', from: 'Gamma (Researcher)', to: 'Delta (Analyst)', artifact: 'Evidence', rule: 'Continue the analysis.' }],
  approvalBoundary: 'Owner approval remains required.',
};

const CAPACITY: CapacitySnapshot = {
  meta: META,
  id: 'capacity:test',
  providerLabel: 'Provider telemetry',
  accountLabel: 'Not configured',
  state: 'unavailable',
  usedPercent: null,
  remainingPercent: null,
  resetAt: null,
  runwayLabel: 'Unknown until connected.',
  thresholdPercent: 90,
  thresholdState: 'unknown',
  policy: 'Queue nonurgent work at 90%.',
  note: 'No number is inferred.',
};

describe('TeamView', () => {
  it('shows the named roster, evidence handoff, and honest unavailable capacity', () => {
    const html = renderToStaticMarkup(<TeamView team={TEAM} capacity={CAPACITY} formatTime={(iso) => iso} />);
    expect(html).toContain('Alpha (Orchestrator)');
    expect(html).toContain('Beta (Planner)');
    expect(html).toContain('Gamma (Researcher) → Delta (Analyst)');
    expect(html).toContain('TELEMETRY UNAVAILABLE');
    expect(html).toContain('FIXTURE ONLY');
    expect(html).toContain('Unknown');
    expect(html).toContain('No number is inferred.');
  });
});
