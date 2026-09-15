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
  type SampleActivityEntry,
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

const MARKETING_ACTIVITY: readonly SampleActivityEntry[] = [
  {
    id: 'act:mk-1',
    runRef: 'run:mk-2026-08-18-0001',
    at: offsetMinutes(-1440 + 195),
    summary: 'Assembled a campaign brief draft from the approved objective.',
    state: 'awaiting_review',
  },
  {
    id: 'act:mk-2',
    runRef: 'run:mk-2026-08-18-0002',
    at: offsetMinutes(-1440 + 360),
    summary: 'Drafted three copy variants for the reviewer.',
    state: 'complete',
  },
  {
    id: 'act:mk-3',
    runRef: 'run:mk-2026-08-18-0003',
    at: offsetMinutes(-1440 + 480),
    summary: 'Refused a request to send an outbound email — outside allowed outputs.',
    state: 'refused',
  },
] as const;

const SOCIAL_ACTIVITY: readonly SampleActivityEntry[] = [
  {
    id: 'act:sm-1',
    runRef: 'run:sm-2026-08-18-0011',
    at: offsetMinutes(-1440 + 240),
    summary: 'Drafted channel-specific posts from an approved brief.',
    state: 'awaiting_review',
  },
  {
    id: 'act:sm-2',
    runRef: 'run:sm-2026-08-18-0012',
    at: offsetMinutes(-1440 + 420),
    summary: 'Refused to schedule a publish — schedule_publish is prohibited.',
    state: 'refused',
  },
] as const;

const DESIGNER_ACTIVITY: readonly SampleActivityEntry[] = [
  {
    id: 'act:dz-1',
    runRef: 'run:dz-2026-08-18-0021',
    at: offsetMinutes(-1440 + 300),
    summary: 'Prepared a set of three concept compositions for a decision point.',
    state: 'awaiting_review',
  },
  {
    id: 'act:dz-2',
    runRef: 'run:dz-2026-08-18-0022',
    at: offsetMinutes(-1440 + 540),
    summary: 'Produced an alt-text draft alongside the primary visual.',
    state: 'complete',
  },
] as const;

const AGENT_DETAILS: readonly AgentDetail[] = [
  {
    meta: {
      source: 'fixture',
      isSample: true,
      isPartial: true,
      stale: false,
      dataVersion: FIXTURE_DATA_VERSION,
      capturedAt: FIXTURE_NOW,
      generatedAt: FIXTURE_NOW,
    },
    id: 'agent:marketing',
    displayName: 'Marketing',
    domainSlot: slotForDomain('marketing'),
    purpose: 'Draft campaign concepts and briefs against approved product objectives.',
    responsibilities: [
      'Assemble campaign briefs from approved objectives and audience notes.',
      'Draft outbound copy variants for later human review.',
      'Never publish; never spend; never bind commitments.',
    ],
    allowedInputs: ['approved_brief', 'audience_notes', 'style_guide'],
    allowedOutputs: ['draft_campaign_brief', 'copy_variants'],
    allowedTools: ['copy_workspace_read_write', 'style_guide_lookup'],
    prohibitedActions: toRestrictions([
      'send_external_message',
      'commit_spend',
      'grant_permissions',
    ]),
    approvalPolicy: {
      default: 'tier_0_internal',
      externalPublishOrSend: 'persisted_exact_revision',
      spendOrFinanceMutation: 'owner_only',
      permissionsOrDeletion: 'owner_only',
    },
    sopRefs: ['campaign-brief-cycle'],
    sampleActivity: MARKETING_ACTIVITY,
    status: 'idle',
    freshness: { capturedAt: offsetMinutes(-42), isStale: false },
    demoStatus: { kind: 'wired_no_runtime', note: 'Fixture only in Batch 1.' },
  },
  {
    meta: {
      source: 'fixture',
      isSample: true,
      isPartial: true,
      stale: false,
      dataVersion: FIXTURE_DATA_VERSION,
      capturedAt: FIXTURE_NOW,
      generatedAt: FIXTURE_NOW,
    },
    id: 'agent:social-media',
    displayName: 'Social Media',
    domainSlot: slotForDomain('social'),
    purpose:
      'Prepare social posts and threads from approved briefs; never publishes without review.',
    responsibilities: [
      'Translate approved briefs into channel-appropriate posts.',
      'Attach preview and predicted-reach notes for reviewer context.',
    ],
    allowedInputs: ['approved_brief', 'channel_style'],
    allowedOutputs: ['draft_post', 'draft_thread'],
    allowedTools: ['copy_workspace_read_write'],
    prohibitedActions: toRestrictions([
      'send_external_message',
      'schedule_publish',
    ]),
    approvalPolicy: {
      default: 'tier_0_internal',
      externalPublishOrSend: 'persisted_exact_revision',
      spendOrFinanceMutation: 'owner_only',
      permissionsOrDeletion: 'owner_only',
    },
    sopRefs: ['social-post-cycle'],
    sampleActivity: SOCIAL_ACTIVITY,
    status: 'idle',
    freshness: { capturedAt: offsetMinutes(-90), isStale: false },
    demoStatus: { kind: 'wired_no_runtime', note: 'Fixture only in Batch 1.' },
  },
  {
    meta: {
      source: 'fixture',
      isSample: true,
      isPartial: true,
      stale: false,
      dataVersion: FIXTURE_DATA_VERSION,
      capturedAt: FIXTURE_NOW,
      generatedAt: FIXTURE_NOW,
    },
    id: 'agent:designer',
    displayName: 'Designer',
    domainSlot: slotForDomain('creative'),
    purpose: 'Produce visual artefacts to approved specs for human review before publication.',
    responsibilities: [
      'Compose visual drafts against the brief and brand style.',
      'Provide an alt-text draft with every asset.',
    ],
    allowedInputs: ['approved_brief', 'brand_style'],
    allowedOutputs: ['draft_asset', 'alt_text_draft'],
    allowedTools: ['asset_workspace_read_write'],
    prohibitedActions: toRestrictions([
      'publish_asset',
      'purchase_stock_asset',
    ]),
    approvalPolicy: {
      default: 'tier_0_internal',
      externalPublishOrSend: 'persisted_exact_revision',
      spendOrFinanceMutation: 'owner_only',
      permissionsOrDeletion: 'owner_only',
    },
    sopRefs: ['visual-draft-cycle'],
    sampleActivity: DESIGNER_ACTIVITY,
    status: 'idle',
    freshness: { capturedAt: offsetMinutes(-15), isStale: false },
    demoStatus: { kind: 'wired_no_runtime', note: 'Fixture only in Batch 1.' },
  },
];

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
