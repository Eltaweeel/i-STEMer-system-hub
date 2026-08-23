import {
  makeRestriction,
  type AgentDetail,
  type AgentGetQuery,
  type AgentListQuery,
  type AgentQueries,
  type AgentSummary,
  type ApprovalListQuery,
  type ApprovalPackage,
  type ApprovalQueries,
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
import { ORGANIZATION_PROJECTION } from '../fixtures/organization';
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
    purpose: 'Prepare social posts and threads from approved briefs; never publishes without review.',
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
    status: 'idle',
    freshness: { capturedAt: offsetMinutes(-15), isStale: false },
    demoStatus: { kind: 'wired_no_runtime', note: 'Fixture only in Batch 1.' },
  },
];

export class FixtureAdapter implements OrganizationQueries, AgentQueries, WorkflowQueries, ApprovalQueries {
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
    // Batch 1: no workflow surface. Return empty; the port is defined so a
    // later batch can implement it without a rewrite.
    return [];
  }

  async getWorkflow(_query: WorkflowGetQuery): Promise<WorkflowDetail | null> {
    return null;
  }

  async listApprovalPackages(_query: ApprovalListQuery): Promise<readonly ApprovalPackage[]> {
    return [];
  }
}
