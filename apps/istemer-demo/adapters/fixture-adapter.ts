import {
  makeRestriction,
  type AgentDetail,
  type AgentGetQuery,
  type AgentListQuery,
  type AgentQueries,
  type AgentSummary,
  type ApprovalGetQuery,
  type ApprovalListQuery,
  type ApprovalPackage,
  type ApprovalQueries,
  type CoordinationCycle,
  type CoordinationQueries,
  type CoordinationQueryArgs,
  type CapacityQueries,
  type TeamQueries,
  type CapacitySnapshot,
  type TeamProjection,
  type OrganizationProjection,
  type OrganizationQueries,
  type OrganizationQueryArgs,
  type Restriction,
  type WorkflowDetail,
  type WorkflowGetQuery,
  type WorkflowListQuery,
  type WorkflowQueries,
  type WorkflowSummary,
} from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW, offsetMinutes } from '@bagos/fixtures';
import { COORDINATION_CYCLE } from '../fixtures/coordination-cycle';
import { ORGANIZATION_PROJECTION } from '../fixtures/organization';
import { APPROVAL_PACKAGES } from '../fixtures/approvals';
import { CAMPAIGN_WORKFLOW, WORKFLOW_SUMMARIES } from '../fixtures/workflows';
import { HERMES_TEAM } from '../fixtures/hermes-team';
import { CAPACITY_SNAPSHOT } from '../fixtures/capacity';
import { slotForDomain } from '../tenant/tenant.config';

// The FixtureAdapter satisfies all four query interfaces. It never mutates
// data, and — per the port rules — presentational components must not import
// this file. Route/composition code calls this and passes view models down.

function toRestrictions(labels: readonly string[]): readonly Restriction[] {
  return labels.map((label) =>
    makeRestriction({
      id: `restriction:${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      label,
      reason: 'Declared in the agent manifest as a prohibited action.',
    }),
  );
}


type AgentProfileContent = Pick<
  AgentDetail,
  | 'purpose'
  | 'responsibilities'
  | 'allowedInputs'
  | 'allowedOutputs'
  | 'allowedTools'
  | 'prohibitedActions'
  | 'approvalPolicy'
  | 'sopRefs'
  | 'sampleActivity'
>;

const COMMON_PROHIBITED_ACTIONS = toRestrictions([
  'publish',
  'send_customer_message',
  'spend',
  'change_price',
  'make_business_commitment',
  'change_permissions',
  'deploy',
  'alter_credentials',
]);

const DEFAULT_APPROVAL_POLICY: AgentDetail['approvalPolicy'] = {
  default: 'tier_0_internal',
  externalPublishOrSend: 'persisted_exact_revision',
  spendOrFinanceMutation: 'owner_only',
  permissionsOrDeletion: 'owner_only',
};

const AGENT_PROFILE_CONTENT: Readonly<Record<string, AgentProfileContent>> = {
  'agent:adam': {
    purpose: 'Coordinate bounded specialist work, assemble evidence, and route owner approvals.',
    responsibilities: [
      'Assign Omar, Ziad, and Nour bounded work and assemble their versioned evidence.',
      'Route required decisions to Hadeer and enforce approval boundaries.',
    ],
    allowedInputs: ['authorized_requester', 'business_brief', 'deadline', 'budget'],
    allowedOutputs: ['bounded_task_plan', 'task_status', 'combined_review_package'],
    allowedTools: ['clarify', 'memory', 'session_search', 'todo'],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    sopRefs: ['adam-bounded-orchestration'],
    sampleActivity: [],
  },
  'agent:nour': {
    purpose: 'Create an original one-week Instagram/Facebook calendar from approved objectives and evidence.',
    responsibilities: [
      'Own the one-week content calendar using Omar and Ziad evidence.',
      'Draft original content and list required assets; do not publish.',
    ],
    allowedInputs: ['approved_objectives', 'omar_findings', 'ziad_findings', 'production_constraints'],
    allowedOutputs: ['one_week_content_calendar', 'content_drafts', 'asset_requirements'],
    allowedTools: [],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    sopRefs: ['one-week-content-calendar'],
    sampleActivity: [],
  },
  'agent:omar': {
    purpose: 'Research permitted competitors and produce timestamped evidence with explicit gaps.',
    responsibilities: [
      'Research the approved competitor and source set for the authorized question.',
      'Separate observed metrics from inference and record source dates and gaps.',
    ],
    allowedInputs: ['approved_competitor_sources', 'research_question'],
    allowedOutputs: ['source_linked_findings', 'observed_metrics', 'evidence_gaps'],
    allowedTools: [],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    sopRefs: ['competitor-evidence-research'],
    sampleActivity: [],
  },
  'agent:ziad': {
    purpose: 'Analyze supplied reel material and observable metrics, separating observations from hypotheses.',
    responsibilities: [
      'Analyze accessible frames, audio, transcripts, metadata, and observed metrics.',
      'State which modalities were inspected and distinguish evidence from hypotheses.',
    ],
    allowedInputs: ['omar_evidence', 'reel_frames', 'audio', 'transcripts', 'metadata', 'observed_metrics'],
    allowedOutputs: ['creative_analysis', 'reusable_hypotheses', 'creative_brief'],
    allowedTools: ['vision'],
    prohibitedActions: COMMON_PROHIBITED_ACTIONS,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    sopRefs: ['reel-analysis-evidence'],
    sampleActivity: [],
  },
};

// Preserve established route/workflow IDs while sourcing visible names and
// responsibilities from the confirmed tenant roster.
const AGENT_ROUTE_IDS: Readonly<Record<string, string>> = {
  'agent:adam': 'agent:adam',
  'agent:nour': 'agent:social-media',
  'agent:omar': 'agent:marketing',
  'agent:ziad': 'agent:designer',
};

const AGENT_DETAILS: readonly AgentDetail[] = HERMES_TEAM.members
  .filter((member) => member.phase === 'initial')
  .map((member, index) => {
    const content = AGENT_PROFILE_CONTENT[member.id];
    const routeId = AGENT_ROUTE_IDS[member.id];
    if (!content || !routeId) throw new Error(`Missing agent profile content for ${member.id}.`);

    const domain = {
      'Main Orchestrator': 'executive',
      'Content Creator': 'social',
      'Competitor Analyst': 'marketing',
      'Reel Analyst': 'creative',
    }[member.role];
    if (!domain) throw new Error(`Missing domain slot for agent role ${member.role}.`);

    return {
      meta: {
        source: 'fixture',
        isSample: true,
        isPartial: true,
        stale: false,
        dataVersion: FIXTURE_DATA_VERSION,
        capturedAt: FIXTURE_NOW,
        generatedAt: FIXTURE_NOW,
      },
      id: routeId,
      displayName: member.displayName,
      domainSlot: slotForDomain(domain),
      ...content,
      status: 'idle',
      freshness: { capturedAt: offsetMinutes(-42 - index * 24), isStale: false },
      demoStatus: member.demoStatus,
    } satisfies AgentDetail;
  });

export class FixtureAdapter
  implements
    OrganizationQueries,
    AgentQueries,
    WorkflowQueries,
    ApprovalQueries,
    CoordinationQueries,
    TeamQueries,
    CapacityQueries
{
  async getOrganization(_query: OrganizationQueryArgs): Promise<OrganizationProjection> {
    return ORGANIZATION_PROJECTION;
  }

  async listAgents(query: AgentListQuery): Promise<readonly AgentSummary[]> {
    const filtered = AGENT_DETAILS.filter(
      (a) => query.domainSlot === undefined || a.domainSlot === query.domainSlot,
    );
    return filtered.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      domainSlot: a.domainSlot,
      status: a.status,
      freshness: a.freshness,
      demoStatus: a.demoStatus,
    }));
  }

  async getAgent(query: AgentGetQuery): Promise<AgentDetail | null> {
    return AGENT_DETAILS.find((a) => a.id === query.id) ?? null;
  }

  async listWorkflows(_query: WorkflowListQuery): Promise<readonly WorkflowSummary[]> {
    return WORKFLOW_SUMMARIES;
  }

  async getWorkflow(query: WorkflowGetQuery): Promise<WorkflowDetail | null> {
    if (query.id === CAMPAIGN_WORKFLOW.id) return CAMPAIGN_WORKFLOW;
    return null;
  }

  async listApprovalPackages(_query: ApprovalListQuery): Promise<readonly ApprovalPackage[]> {
    return APPROVAL_PACKAGES;
  }

  async getApprovalPackage(query: ApprovalGetQuery): Promise<ApprovalPackage | null> {
    return APPROVAL_PACKAGES.find((p) => p.id === query.id) ?? null;
  }

  async getCoordinationCycle(_query: CoordinationQueryArgs): Promise<CoordinationCycle> {
    return COORDINATION_CYCLE;
  }

  async getTeam(): Promise<TeamProjection> {
    return HERMES_TEAM;
  }

  async getCapacitySnapshot(): Promise<CapacitySnapshot> {
    return CAPACITY_SNAPSHOT;
  }
}

// Route slugs: internal IDs use `:` as a separator (e.g. `agent:social-media`)
// but `:` is invalid in filenames on Windows and unfriendly in URLs. The route
// layer uses a URL-safe slug derived by dropping the `kind:` prefix.

function toRouteSlug(id: string): string {
  const idx = id.indexOf(':');
  return idx === -1 ? id : id.slice(idx + 1);
}

export interface RouteEntry {
  readonly slug: string;
  readonly id: string;
}

export const AGENT_ROUTES: readonly RouteEntry[] = AGENT_DETAILS.map((a) => ({
  slug: toRouteSlug(a.id),
  id: a.id,
}));

export const WORKFLOW_ROUTES: readonly RouteEntry[] = [
  { slug: toRouteSlug(CAMPAIGN_WORKFLOW.id), id: CAMPAIGN_WORKFLOW.id },
];

export function agentIdForSlug(slug: string): string | null {
  return AGENT_ROUTES.find((r) => r.slug === slug)?.id ?? null;
}

export function workflowIdForSlug(slug: string): string | null {
  return WORKFLOW_ROUTES.find((r) => r.slug === slug)?.id ?? null;
}

export const APPROVAL_ROUTES: readonly RouteEntry[] = APPROVAL_PACKAGES.map((p) => ({
  slug: toRouteSlug(p.id),
  id: p.id,
}));

export function approvalIdForSlug(slug: string): string | null {
  return APPROVAL_ROUTES.find((r) => r.slug === slug)?.id ?? null;
}
