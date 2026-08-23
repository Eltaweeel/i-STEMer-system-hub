import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  isAgentNode,
  isConductorNode,
  isDepartmentNode,
  isHumanNode,
  type OrganizationProjection,
} from '@bagos/contracts';
import { computeLayout, toTree } from '@bagos/organization';
import { AppShell, OrganizationGraph, OrganizationTree } from '@bagos/ui';
import { FixtureAdapter } from '../../apps/northwind-demo/adapters/fixture-adapter';
import {
  NORTHWIND_AGENT_NODES,
  NORTHWIND_DEPARTMENTS,
  NORTHWIND_ORGANIZATION,
} from '../../apps/northwind-demo/fixtures/organization';
import {
  DEPARTMENTS as ISTEMER_DEPARTMENTS,
  ORGANIZATION_PROJECTION as ISTEMER_ORGANIZATION,
} from '../../apps/istemer-demo/fixtures/organization';
import {
  NORTHWIND_DATA_VERSION,
  NORTHWIND_FIXTURE_NOW,
} from '../../apps/northwind-demo/fixtures/time';
import { TENANT_CONFIG } from '../../apps/northwind-demo/tenant/tenant.config';

function validateProjection(projection: OrganizationProjection): void {
  const nodeIds = new Set(projection.nodes.map(({ id }) => id));
  const edgeIds = new Set(projection.edges.map(({ id }) => id));
  expect(nodeIds.size).toBe(projection.nodes.length);
  expect(edgeIds.size).toBe(projection.edges.length);
  expect(projection.nodes.filter(isHumanNode)).toHaveLength(1);
  expect(projection.nodes.filter(isConductorNode)).toHaveLength(1);
  expect(projection.nodes.filter(isDepartmentNode)).toHaveLength(NORTHWIND_DEPARTMENTS.length);
  expect(projection.nodes.filter(isAgentNode)).toHaveLength(NORTHWIND_AGENT_NODES.length);
  for (const edge of projection.edges) {
    expect(nodeIds.has(edge.from)).toBe(true);
    expect(nodeIds.has(edge.to)).toBe(true);
  }
}

function treeNodeCount(projection: OrganizationProjection): number {
  const countBranch = (branch: ReturnType<typeof toTree>[number]): number =>
    1 + branch.children.reduce((total, child) => total + countBranch(child), 0);
  return toTree(projection).reduce((total, root) => total + countBranch(root), 0);
}

describe('second-tenant conformance', () => {
  it('Northwind satisfies the core organization contract and hierarchy invariants', async () => {
    const projection: OrganizationProjection = await new FixtureAdapter().getOrganization({});
    validateProjection(projection);
    expect(computeLayout(projection).size).toBe(projection.nodes.length);
    expect(treeNodeCount(projection)).toBe(projection.nodes.length);
    expect(projection.nodes.filter(isDepartmentNode).every(
      ({ activeAgentCount }) => activeAgentCount === 'unknown',
    )).toBe(true);
  });

  it('uses a different agent scale and department taxonomy from i-STEMer', () => {
    const istemerAgentCount = ISTEMER_ORGANIZATION.nodes.filter(isAgentNode).length;
    const northwindLabels = new Set(NORTHWIND_DEPARTMENTS.map(({ label }) => label));
    const istemerLabels = new Set(ISTEMER_DEPARTMENTS.map(({ label }) => label));
    const northwindPrincipal = NORTHWIND_ORGANIZATION.nodes.find(isHumanNode);
    const istemerPrincipal = ISTEMER_ORGANIZATION.nodes.find(isHumanNode);
    expect(NORTHWIND_AGENT_NODES.length).not.toBe(istemerAgentCount);
    expect([...northwindLabels].some((label) => istemerLabels.has(label))).toBe(false);
    expect(northwindPrincipal?.approvalTier).not.toBe(istemerPrincipal?.approvalTier);
  });

  it('renders Northwind through the published core graph and tree presenters', async () => {
    const projection = await new FixtureAdapter().getOrganization({});
    const graphMarkup = renderToStaticMarkup(React.createElement(OrganizationGraph, { projection }));
    const treeMarkup = renderToStaticMarkup(React.createElement(OrganizationTree, { projection }));
    expect(projection.nodes).toHaveLength(11);
    expect(projection.edges).toHaveLength(10);
    expect(graphMarkup).toContain('Northwind Research Cooperative');
    expect(treeMarkup).toContain('Mara Vale');
    for (const agent of NORTHWIND_AGENT_NODES) {
      expect(graphMarkup).toContain(agent.label);
      expect(treeMarkup).toContain(agent.label);
    }
  });

  it('renders Northwind branding and the fixture notice from shell chrome', () => {
    const shellMarkup = renderToStaticMarkup(React.createElement(AppShell, {
      meta: {
        source: 'fixture',
        isSample: true,
        isPartial: true,
        stale: false,
        dataVersion: NORTHWIND_DATA_VERSION,
        capturedAt: NORTHWIND_FIXTURE_NOW,
        generatedAt: NORTHWIND_FIXTURE_NOW,
      },
      productName: TENANT_CONFIG.brand.productName,
      organizationName: TENANT_CONFIG.brand.organizationName,
      children: React.createElement('div', null, 'Northwind route content'),
    }));
    expect(shellMarkup).toContain('Northwind Field OS');
    expect(shellMarkup).toContain('Northwind Research Cooperative');
    expect(shellMarkup).toContain('DEMO ENVIRONMENT');
    expect(shellMarkup).toContain('Sample data — no live external actions');
  });
});
