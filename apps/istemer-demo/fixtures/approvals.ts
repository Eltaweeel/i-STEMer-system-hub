import type { ApprovalPackage, ViewMeta } from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW, offsetHours } from '@bagos/fixtures';

// Two approval packages tied to the campaign workflow.
// Both are permanently PENDING — this is a fixture; no decision can be recorded.
// Deadlines are expressed as offsets from FIXTURE_NOW. Never the wall clock.

const META: ViewMeta = {
  source: 'fixture',
  isSample: true,
  isPartial: false,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

export const APPROVAL_FINAL_ASSETS: ApprovalPackage = {
  meta: META,
  id: 'approval:campaign-final-assets',
  title: 'Campaign Final Assets — Owner Approval',
  status: 'pending',
  requestedAction:
    'Approve the final assets bundle and alt-text draft for publication readiness.',
  responsibleAgent: 'Designer',
  businessReason:
    'The end-to-end campaign workflow has reached the final production stage. ' +
    'All three design concepts were reviewed and the Orbit direction was selected at the ' +
    'human decision point. The Designer has produced the final assets and an alt-text draft. ' +
    'The bundle requires an owner-only approval before a publication manifest can be generated.',
  targetSystem: 'Campaign assets store (fixture — no live system)',
  artifactRef: 'run:dz-2026-08-18-0022 / final_assets_v3 / alt_text_draft_v1',
  supportingEvidence: [
    'run:dz-2026-08-18-0021 — three concept compositions reviewed at design direction step',
    'wfstep:human-select-direction — Orbit direction selected as the approved concept',
    'run:dz-2026-08-18-0022 — final assets and alt-text draft produced against Orbit brief',
  ],
  expectedResult:
    'publication_manifest generated; campaign bundle moves to publication queue awaiting release.',
  risks:
    'Demo only — no live assets exist. In a real deployment: assets published without final ' +
    'review could expose off-brand or inaccessible content to the audience.',
  estimatedCost: 'Zero — no real actions performed in this demo.',
  deadline: offsetHours(4),
  diffSummary: null,
  workflowStepRef: 'wfstep:human-approval',
  requiredTier: 'owner_only',
  notificationPreview: {
    channel: '#campaign-approvals (fixture channel)',
    provider: 'Telegram',
    messageBody:
      'Approval required: Campaign Final Assets — Owner Approval.\n' +
      'Designer has submitted the final assets bundle (run:dz-2026-08-18-0022).\n' +
      'Tier: Owner only. Deadline: 4 hours from fixture time.\n' +
      'Review the exact revision at the link below before deciding.',
    fixtureTimestamp: FIXTURE_NOW,
    sourceHref: '/approvals/campaign-final-assets/',
    sourceLabel: 'Campaign Final Assets — Owner Approval',
  },
} as const;

export const APPROVAL_SOCIAL_BUDGET: ApprovalPackage = {
  meta: META,
  id: 'approval:social-budget-q3',
  title: 'Social Campaign Q3 Budget Allocation',
  status: 'pending',
  requestedAction:
    'Allocate the proposed budget for social campaign distribution channels in Q3.',
  responsibleAgent: 'Marketing',
  businessReason:
    'The campaign brief has been drafted and the social plan is ready for production. ' +
    'Before the social campaign can proceed, a budget allocation must be approved. ' +
    'This is a placeholder approval — no real spend is possible from this demo interface.',
  targetSystem: 'Budget management system (fixture — no live system)',
  artifactRef: 'run:mk-2026-08-18-0002 / draft_campaign_brief_v2 / social_budget_proposal_v2',
  supportingEvidence: [
    'run:mk-2026-08-18-0001 — campaign brief draft assembled from approved objective',
    'run:sm-2026-08-18-0011 — draft social plan with channel breakdown and reach estimates',
    'competitor_summary — competitor intelligence used to size channel allocation',
  ],
  expectedResult:
    'Budget allocation confirmed; social plan moves to final asset production with approved spend envelope.',
  risks:
    'Demo only — no real budget is allocated. In a real deployment: over-allocation or ' +
    'mis-categorisation of spend could affect campaign ROI and reporting accuracy.',
  estimatedCost: 'Sample budget: EGP 12,000 (fixture — not a real commitment).',
  deadline: offsetHours(2),
  diffSummary:
    'This is the second draft (v2). Previous draft (v1) allocated EGP 8,000 across two ' +
    'channels. This revision adds a third channel (video shorts) and increases the total by ' +
    'EGP 4,000 based on competitor intelligence gathered in run:mk-2026-08-18-0001.',
  workflowStepRef: 'wfstep:campaign-strategy',
  requiredTier: 'persisted_exact_revision',
  notificationPreview: {
    channel: '#campaign-approvals (fixture channel)',
    provider: 'Telegram',
    messageBody:
      'Approval required: Social Campaign Q3 Budget Allocation.\n' +
      'Marketing has submitted budget proposal v2 (EGP 12,000 sample — not a real commitment).\n' +
      'Tier: Exact revision. Deadline: 2 hours from fixture time.\n' +
      'Review the exact revision and diff summary at the link below before deciding.',
    fixtureTimestamp: FIXTURE_NOW,
    sourceHref: '/approvals/social-budget-q3/',
    sourceLabel: 'Social Campaign Q3 Budget Allocation',
  },
} as const;

export const APPROVAL_PACKAGES: readonly ApprovalPackage[] = [
  APPROVAL_SOCIAL_BUDGET,
  APPROVAL_FINAL_ASSETS,
] as const;
