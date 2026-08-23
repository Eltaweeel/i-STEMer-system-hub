import {
  type AgentNode,
  type ConductorNode,
  type DepartmentNode,
  type DepartmentRecord,
  type GraphEdge,
  type HumanAuthorityNode,
  type OrganizationProjection,
  type ViewMeta,
} from '@bagos/contracts';
import { slotForDomain } from '../tenant/tenant.config';
import {
  NORTHWIND_DATA_VERSION,
  NORTHWIND_FIXTURE_NOW,
  northwindOffsetMinutes,
} from './time';

const META = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: NORTHWIND_DATA_VERSION,
  capturedAt: NORTHWIND_FIXTURE_NOW,
  generatedAt: NORTHWIND_FIXTURE_NOW,
} satisfies ViewMeta;

const PRINCIPAL = {
  kind: 'human',
  id: 'human:mara-vale',
  label: 'Mara Vale',
  entityHref: '/organization?selected=human:mara-vale',
  accessibleDescription: 'Mara Vale is the human expedition principal and final field-release reviewer.',
  authorityScope: 'Authorizes field releases and safety exceptions.',
  approvalTier: 'persisted_exact_revision',
  avatarLabel: 'MV',
} satisfies HumanAuthorityNode;

const CONDUCTOR = {
  kind: 'conductor',
  id: 'conductor:aster',
  label: 'Aster Conductor',
  entityHref: '/organization?selected=conductor:aster',
  accessibleDescription: 'Aster Conductor routes fixture requests across four research departments.',
  status: 'idle',
  freshness: { capturedAt: northwindOffsetMinutes(-8), isStale: false },
  demoStatus: { kind: 'fixture_only', note: 'No runtime is connected.' },
} satisfies ConductorNode;

export const NORTHWIND_DEPARTMENTS = [
  { slug: 'expedition-ops', label: 'Expedition Operations', domainSlot: slotForDomain('expedition-ops'), agentCount: 1, activeAgentCount: 'unknown' },
  { slug: 'instrumentation', label: 'Instrumentation', domainSlot: slotForDomain('instrumentation'), agentCount: 1, activeAgentCount: 'unknown' },
  { slug: 'data-stewardship', label: 'Data Stewardship', domainSlot: slotForDomain('data-stewardship'), agentCount: 2, activeAgentCount: 'unknown' },
  { slug: 'safety-review', label: 'Safety Review', domainSlot: slotForDomain('safety-review'), agentCount: 1, activeAgentCount: 'unknown' },
] as const satisfies readonly DepartmentRecord[];

const DEPARTMENT_NODES = NORTHWIND_DEPARTMENTS.map((department) => ({
  kind: 'department',
  id: `department:${department.slug}`,
  label: department.label,
  entityHref: `/organization?selected=department:${department.slug}`,
  accessibleDescription: `${department.label} contains ${department.agentCount} fixture agent${department.agentCount === 1 ? '' : 's'}.`,
  domainSlot: department.domainSlot,
  agentCount: department.agentCount,
  activeAgentCount: department.activeAgentCount,
})) satisfies readonly DepartmentNode[];

export const NORTHWIND_AGENT_NODES = [
  { id: 'agent:route-planner', label: 'Route Planner', domain: 'expedition-ops', capturedOffset: -24 },
  { id: 'agent:sensor-calibrator', label: 'Sensor Calibrator', domain: 'instrumentation', capturedOffset: -37 },
  { id: 'agent:sample-custodian', label: 'Sample Custodian', domain: 'data-stewardship', capturedOffset: -51 },
  { id: 'agent:archive-curator', label: 'Archive Curator', domain: 'data-stewardship', capturedOffset: -65 },
  { id: 'agent:risk-assessor', label: 'Risk Assessor', domain: 'safety-review', capturedOffset: -19 },
].map((agent) => ({
  kind: 'agent',
  id: agent.id,
  label: agent.label,
  entityHref: `/organization?selected=${agent.id}`,
  accessibleDescription: `${agent.label} is a Northwind fixture agent. It has no active run and is idle.`,
  status: 'idle',
  freshness: { capturedAt: northwindOffsetMinutes(agent.capturedOffset), isStale: false },
  domainSlot: slotForDomain(agent.domain),
  demoStatus: { kind: 'fixture_only', note: 'Configuration fixture only; no runtime is attached.' },
})) satisfies readonly AgentNode[];

const EDGES = [
  { id: 'edge:aster-to-mara', from: CONDUCTOR.id, to: PRINCIPAL.id, kind: 'reports_to', accessibleDescription: 'Aster Conductor reports to Mara Vale.' },
  ...NORTHWIND_DEPARTMENTS.map((department) => ({
    id: `edge:${department.slug}-to-aster`,
    from: `department:${department.slug}`,
    to: CONDUCTOR.id,
    kind: 'reports_to' as const,
    accessibleDescription: `${department.label} reports through Aster Conductor.`,
  })),
  ...NORTHWIND_AGENT_NODES.map((agent) => {
    const department = NORTHWIND_DEPARTMENTS.find(({ domainSlot }) => domainSlot === agent.domainSlot);
    if (!department) throw new Error(`No department owns domain slot ${agent.domainSlot}.`);
    return {
      id: `edge:${agent.id.slice('agent:'.length)}-to-${department.slug}`,
      from: agent.id,
      to: `department:${department.slug}`,
      kind: 'reports_to' as const,
      accessibleDescription: `${agent.label} reports to ${department.label}.`,
    };
  }),
] satisfies readonly GraphEdge[];

export const NORTHWIND_ORGANIZATION: OrganizationProjection = {
  meta: META,
  id: 'organization:northwind-demo',
  title: 'Organization — Northwind Research Cooperative',
  nodes: [PRINCIPAL, CONDUCTOR, ...DEPARTMENT_NODES, ...NORTHWIND_AGENT_NODES],
  edges: EDGES,
};
