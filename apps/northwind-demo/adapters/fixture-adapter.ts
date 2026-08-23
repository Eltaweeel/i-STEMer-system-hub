import {
  type AgentDetail,
  type AgentGetQuery,
  type AgentListQuery,
  type AgentQueries,
  type AgentSummary,
  type OrganizationProjection,
  type OrganizationQueries,
  type OrganizationQueryArgs,
} from '@bagos/contracts';
import { NORTHWIND_AGENT_DETAILS } from '../fixtures/agents';
import { NORTHWIND_ORGANIZATION } from '../fixtures/organization';

export class FixtureAdapter implements OrganizationQueries, AgentQueries {
  async getOrganization(_query: OrganizationQueryArgs): Promise<OrganizationProjection> {
    return NORTHWIND_ORGANIZATION;
  }

  async listAgents(query: AgentListQuery): Promise<readonly AgentSummary[]> {
    return NORTHWIND_AGENT_DETAILS
      .filter((agent) => query.domainSlot === undefined || agent.domainSlot === query.domainSlot)
      .map(({ id, displayName, domainSlot, status, freshness, demoStatus }) => ({
        id,
        displayName,
        domainSlot,
        status,
        freshness,
        demoStatus,
      }));
  }

  async getAgent(query: AgentGetQuery): Promise<AgentDetail | null> {
    return NORTHWIND_AGENT_DETAILS.find(({ id }) => id === query.id) ?? null;
  }
}

function routeSlug(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

export const AGENT_ROUTES = NORTHWIND_AGENT_DETAILS.map(({ id }) => ({
  id,
  slug: routeSlug(id),
}));

export function agentIdForSlug(slug: string): string | null {
  return AGENT_ROUTES.find((route) => route.slug === slug)?.id ?? null;
}
