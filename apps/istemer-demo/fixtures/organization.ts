import {
  type AgentNode,
  type ConductorNode,
  type ConductorRecord,
  type DepartmentRecord,
  type GraphEdge,
  type HumanAuthorityNode,
  type OrganizationProjection,
  type ViewMeta,
} from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW, offsetMinutes } from '@bagos/fixtures';
import { slotForDomain } from '../tenant/tenant.config';
import { HERMES_TEAM } from './hermes-team';

// -----------------------------------------------------------------------------
// The i-STEMer tenant's walking-slice organization projection.
// Every timestamp is derived from FIXTURE_NOW via offsetMinutes — none are
// typed by hand and none read the wall clock.
// The Hadeer -> Adam -> initial team slice comes from the named Hermes roster.
// -----------------------------------------------------------------------------

const META: ViewMeta = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

// Human principal — the person the tenant identifies as authority.
const HADEER = {
  kind: 'human',
  id: 'human:hadeer',
  label: 'Hadeer',
  entityHref: '/organization?selected=human:hadeer',
  accessibleDescription:
    'Hadeer is the human principal. Owner-only decisions rest with the principal; this node does not run.',
  authorityScope: 'Founder and owner. Approves owner-only actions.',
  approvalTier: 'owner_only',
  avatarLabel: 'H',
} satisfies HumanAuthorityNode;

const ADAM_MEMBER = HERMES_TEAM.members.find((member) => member.id === HERMES_TEAM.orchestratorId);
if (!ADAM_MEMBER) throw new Error('Hermes team fixture is missing its orchestrator.');

const INITIAL_MEMBERS = HERMES_TEAM.members.filter(
  (member) => member.phase === 'initial' && member.id !== HERMES_TEAM.orchestratorId,
);

function domainForRole(role: string): string {
  if (role === 'Reel Analyst') return 'creative';
  if (role === 'Competitor Analyst') return 'marketing';
  if (role === 'Content Creator') return 'marketing';
  return 'executive';
}

// Conductor — the named Adam orchestrator.
export const HERMES_CONDUCTOR: ConductorRecord = {
  id: ADAM_MEMBER.id,
  displayName: ADAM_MEMBER.displayName,
  purpose: HERMES_TEAM.mission,
  responsibilities: [
    ADAM_MEMBER.responsibility,
    'Dispatch approved requests to the correct named specialist.',
    'Enforce approval gates and refuse requests outside the delegated authority.',
  ],
} as const;

const HERMES_NODE = {
  kind: 'conductor',
  id: HERMES_CONDUCTOR.id,
  label: HERMES_CONDUCTOR.displayName,
  entityHref: `/organization?selected=${HERMES_CONDUCTOR.id}`,
  accessibleDescription:
    'Adam (Main Orchestrator) coordinates the named specialist agents beneath him. He runs on demand and never acts without an approval gate.',
  status: 'idle',
  freshness: { capturedAt: FIXTURE_NOW, isStale: false },
  demoStatus: {
    kind: 'wired_no_runtime',
    note: 'Wired into the manifest; no runtime is attached in Batch 1.',
  },
} satisfies ConductorNode;

// Department records supplied by the tenant.
export const DEPARTMENTS: readonly DepartmentRecord[] = [
  {
    slug: 'marketing',
    label: 'Marketing',
    domainSlot: slotForDomain('marketing'),
    agentCount: 1,
    activeAgentCount: 'unknown',
  },
  {
    slug: 'social',
    label: 'Social',
    domainSlot: slotForDomain('social'),
    agentCount: 1,
    activeAgentCount: 'unknown',
  },
  {
    slug: 'creative',
    label: 'Creative',
    domainSlot: slotForDomain('creative'),
    agentCount: 1,
    activeAgentCount: 'unknown',
  },
] as const;

// Agents — the agreed initial team only. Planned expansion roles remain in the
// Hermes team view until their organization nodes are activated.
const INITIAL_AGENT_NODES = INITIAL_MEMBERS.map((member, index) => ({
  kind: 'agent' as const,
  id: member.id,
  label: member.displayName,
  entityHref: `/organization?selected=${member.id}`,
  accessibleDescription:
    `${member.displayName} is the ${member.role}. ${member.responsibility} Reports to ${member.reportsToLabel}. Currently idle in this fixture.`,
  status: 'idle' as const,
  freshness: { capturedAt: offsetMinutes(-42 - index * 24), isStale: false },
  domainSlot: slotForDomain(domainForRole(member.role)),
  demoStatus: {
    kind: 'wired_no_runtime' as const,
    note: 'Named profile is declared in the fixture; no runtime is attached.',
  },
})) satisfies readonly AgentNode[];

// Edges — reports_to lines carry the accessible sentences the tree renders.
const EDGES: readonly GraphEdge[] = [
  {
    id: 'edge:hermes-reports-to-hadeer',
    from: HERMES_CONDUCTOR.id,
    to: HADEER.id,
    kind: 'reports_to',
    accessibleDescription: 'Adam (Main Orchestrator) reports to Hadeer (human principal).',
  },
  ...INITIAL_AGENT_NODES.map((agent) => ({
    id: `edge:${agent.id.slice('agent:'.length)}-reports-to-adam`,
    from: agent.id,
    to: HERMES_CONDUCTOR.id,
    kind: 'reports_to' as const,
    accessibleDescription: `${agent.label} reports to Adam (Main Orchestrator).`,
  })),
];

export const ORGANIZATION_PROJECTION: OrganizationProjection = {
  meta: META,
  id: 'organization:istemer-demo',
  title: 'Organization — i-STEMer Demo',
  nodes: [HADEER, HERMES_NODE, ...INITIAL_AGENT_NODES],
  edges: EDGES,
} as const;
