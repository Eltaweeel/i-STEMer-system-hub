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

// -----------------------------------------------------------------------------
// The i-STEMer tenant's walking-slice organization projection.
// Every timestamp is derived from FIXTURE_NOW via offsetMinutes — none are
// typed by hand and none read the wall clock.
// The Hadeer -> Hermes -> {Marketing, Social, Creative} slice comes from here.
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

// Conductor — one instance.
export const HERMES_CONDUCTOR: ConductorRecord = {
  id: 'conductor:hermes',
  displayName: 'Hermes Conductor',
  purpose:
    'Route approved requests to the correct specialist agent; enforce approval gates; refuse anything outside its policy.',
  responsibilities: [
    'Dispatch tasks to specialist agents based on approved routing rules.',
    'Attach an approval requirement to every external action.',
    'Report structured refusals when a request violates policy.',
  ],
} as const;

const HERMES_NODE = {
  kind: 'conductor',
  id: HERMES_CONDUCTOR.id,
  label: HERMES_CONDUCTOR.displayName,
  entityHref: '/organization?selected=conductor:hermes',
  accessibleDescription:
    'Hermes Conductor coordinates the specialist agents beneath it. It runs on demand and never acts without an approval gate.',
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

// Agents — three, walking slice only. Fabrication of activity is forbidden;
// each carries `idle` because no persisted run exists in fixtures.
const MARKETING_AGENT = {
  kind: 'agent',
  id: 'agent:marketing',
  label: 'Marketing',
  entityHref: '/organization?selected=agent:marketing',
  accessibleDescription:
    'Marketing agent — plans and drafts campaigns. Reports to Hermes Conductor. Currently idle.',
  status: 'idle',
  freshness: { capturedAt: offsetMinutes(-42), isStale: false },
  domainSlot: slotForDomain('marketing'),
  demoStatus: {
    kind: 'wired_no_runtime',
    note: 'Persona and policy declared; no runtime attached.',
  },
} satisfies AgentNode;

const SOCIAL_AGENT = {
  kind: 'agent',
  id: 'agent:social-media',
  label: 'Social Media',
  entityHref: '/organization?selected=agent:social-media',
  accessibleDescription:
    'Social Media agent — drafts approved-only posts. Reports to Hermes Conductor. Currently idle.',
  status: 'idle',
  freshness: { capturedAt: offsetMinutes(-90), isStale: false },
  domainSlot: slotForDomain('social'),
  demoStatus: {
    kind: 'wired_no_runtime',
    note: 'Persona and policy declared; no runtime attached.',
  },
} satisfies AgentNode;

const DESIGNER_AGENT = {
  kind: 'agent',
  id: 'agent:designer',
  label: 'Designer',
  entityHref: '/organization?selected=agent:designer',
  accessibleDescription:
    'Designer agent — produces visual artefacts on request. Reports to Hermes Conductor. Currently idle.',
  status: 'idle',
  freshness: { capturedAt: offsetMinutes(-15), isStale: false },
  domainSlot: slotForDomain('creative'),
  demoStatus: {
    kind: 'wired_no_runtime',
    note: 'Persona and policy declared; no runtime attached.',
  },
} satisfies AgentNode;

// Edges — reports_to lines carry the accessible sentences the tree renders.
const EDGES: readonly GraphEdge[] = [
  {
    id: 'edge:hermes-reports-to-hadeer',
    from: HERMES_CONDUCTOR.id,
    to: HADEER.id,
    kind: 'reports_to',
    accessibleDescription: 'Hermes Conductor reports to Hadeer (human principal).',
  },
  {
    id: 'edge:marketing-reports-to-hermes',
    from: MARKETING_AGENT.id,
    to: HERMES_CONDUCTOR.id,
    kind: 'reports_to',
    accessibleDescription: 'Marketing agent reports to Hermes Conductor.',
  },
  {
    id: 'edge:social-reports-to-hermes',
    from: SOCIAL_AGENT.id,
    to: HERMES_CONDUCTOR.id,
    kind: 'reports_to',
    accessibleDescription: 'Social Media agent reports to Hermes Conductor.',
  },
  {
    id: 'edge:designer-reports-to-hermes',
    from: DESIGNER_AGENT.id,
    to: HERMES_CONDUCTOR.id,
    kind: 'reports_to',
    accessibleDescription: 'Designer agent reports to Hermes Conductor.',
  },
];

export const ORGANIZATION_PROJECTION: OrganizationProjection = {
  meta: META,
  id: 'organization:istemer-demo',
  title: 'Organization — i-STEMer Demo',
  nodes: [HADEER, HERMES_NODE, MARKETING_AGENT, SOCIAL_AGENT, DESIGNER_AGENT],
  edges: EDGES,
} as const;
