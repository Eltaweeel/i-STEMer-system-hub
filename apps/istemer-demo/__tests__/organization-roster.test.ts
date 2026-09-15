import { describe, expect, it } from 'vitest';
import { isAgentNode, isConductorNode } from '@bagos/contracts';
import { FixtureAdapter } from '../adapters/fixture-adapter';

describe('i-STEMer organization roster', () => {
  it('uses the agreed named initial team instead of generic placeholder labels', async () => {
    const projection = await new FixtureAdapter().getOrganization({});
    const conductor = projection.nodes.find(isConductorNode);
    const agents = projection.nodes.filter(isAgentNode);
    const labels = agents.map((agent) => agent.label);

    expect(conductor?.label).toBe('Adam (Main Orchestrator)');
    expect(labels).toEqual([
      'Nour (Content Creator)',
      'Omar (Competitor Analyst)',
      'Ziad (Reel Analyst)',
    ]);
    expect(labels).not.toContain('Marketing');
    expect(labels).not.toContain('Social Media');
    expect(labels).not.toContain('Designer');
    expect(projection.edges.every((edge) => edge.kind === 'reports_to')).toBe(true);
  });
});
