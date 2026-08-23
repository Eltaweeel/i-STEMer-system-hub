import {
  type DesignConcept,
  type ViewMeta,
  type WorkflowDetail,
  type WorkflowStep,
  type WorkflowSummary,
} from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW } from '@bagos/fixtures';
import { slotForDomain } from '../tenant/tenant.config';

// -----------------------------------------------------------------------------
// One complete end-to-end campaign workflow for the walking demo. Every step
// declares its owner, inputs, outputs, and current demo state. Nothing runs;
// state is fixture-authored and honestly reflects "not started" until an
// authored transition says otherwise.
// -----------------------------------------------------------------------------

const META: ViewMeta = {
  source: 'fixture',
  isSample: true,
  isPartial: false,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

const MARKETING_SLOT = slotForDomain('marketing');
const SOCIAL_SLOT = slotForDomain('social');
const CREATIVE_SLOT = slotForDomain('creative');

const STEPS: readonly WorkflowStep[] = [
  {
    kind: 'agent',
    id: 'wfstep:competitor-intelligence',
    order: 1,
    title: 'Competitor intelligence',
    ownerLabel: 'Marketing',
    ownerRef: 'agent:marketing',
    inputs: ['approved_brief', 'audience_notes'],
    outputs: ['competitor_summary'],
    state: 'not_started',
    domainSlot: MARKETING_SLOT,
  },
  {
    kind: 'agent',
    id: 'wfstep:campaign-strategy',
    order: 2,
    title: 'Campaign strategy',
    ownerLabel: 'Marketing',
    ownerRef: 'agent:marketing',
    inputs: ['competitor_summary', 'style_guide'],
    outputs: ['draft_campaign_brief'],
    state: 'not_started',
    domainSlot: MARKETING_SLOT,
  },
  {
    kind: 'agent',
    id: 'wfstep:social-plan',
    order: 3,
    title: 'Social plan',
    ownerLabel: 'Social Media',
    ownerRef: 'agent:social-media',
    inputs: ['draft_campaign_brief', 'channel_style'],
    outputs: ['draft_social_plan'],
    state: 'not_started',
    domainSlot: SOCIAL_SLOT,
  },
  {
    kind: 'agent',
    id: 'wfstep:creative-brief',
    order: 4,
    title: 'Creative brief',
    ownerLabel: 'Marketing',
    ownerRef: 'agent:marketing',
    inputs: ['draft_campaign_brief', 'draft_social_plan'],
    outputs: ['creative_brief'],
    state: 'not_started',
    domainSlot: MARKETING_SLOT,
  },
  {
    kind: 'agent',
    id: 'wfstep:three-design-concepts',
    order: 5,
    title: 'Three design concepts',
    ownerLabel: 'Designer',
    ownerRef: 'agent:designer',
    inputs: ['creative_brief', 'brand_style'],
    outputs: ['concept_a', 'concept_b', 'concept_c'],
    state: 'not_started',
    domainSlot: CREATIVE_SLOT,
  },
  {
    kind: 'human_decision',
    id: 'wfstep:human-select-direction',
    order: 6,
    title: 'Select design direction',
    ownerLabel: 'Hadeer',
    ownerRef: 'human:hadeer',
    inputs: ['concept_a', 'concept_b', 'concept_c'],
    outputs: ['selected_direction'],
    state: 'not_started',
    domainSlot: null,
    decisionPrompt:
      'Choose one of the three concepts to develop into final assets. Owner-only decision.',
  },
  {
    kind: 'agent',
    id: 'wfstep:final-assets',
    order: 7,
    title: 'Final assets',
    ownerLabel: 'Designer',
    ownerRef: 'agent:designer',
    inputs: ['selected_direction', 'brand_style'],
    outputs: ['final_assets', 'alt_text_draft'],
    state: 'not_started',
    domainSlot: CREATIVE_SLOT,
  },
  {
    kind: 'human_decision',
    id: 'wfstep:human-approval',
    order: 8,
    title: 'Approval',
    ownerLabel: 'Hadeer',
    ownerRef: 'human:hadeer',
    inputs: ['final_assets', 'alt_text_draft'],
    outputs: ['approved_bundle'],
    state: 'not_started',
    domainSlot: null,
    decisionPrompt:
      'Approve the final assets for publication readiness. Owner-only decision.',
  },
  {
    kind: 'agent',
    id: 'wfstep:ready-for-publication',
    order: 9,
    title: 'Ready for publication',
    ownerLabel: 'Hermes Conductor',
    ownerRef: 'conductor:hermes',
    inputs: ['approved_bundle'],
    outputs: ['publication_manifest'],
    state: 'not_started',
    domainSlot: null,
  },
] as const;

const DESIGN_CONCEPTS: readonly DesignConcept[] = [
  {
    id: 'concept:orbit',
    label: 'Orbit',
    variant: 'orbit',
    domainSlot: CREATIVE_SLOT,
    rationale:
      'A single centered nucleus with concentric rings — evokes focus, orbit, and gravitational pull around the campaign\'s core message.',
    slogan: 'THE CORE IDEA',
    altText:
      'Abstract poster with a filled center circle and two concentric rings, three small satellite dots, and a horizontal baseline.',
  },
  {
    id: 'concept:grid',
    label: 'Grid',
    variant: 'grid',
    domainSlot: CREATIVE_SLOT,
    rationale:
      'A structured grid with an emphasised central column — evokes system, plan, and repetition. Reads as a printed poster.',
    slogan: 'SYSTEM WORK',
    altText:
      'Abstract poster made of a five-by-six grid of squares with alternating fill, framed by a rectangle, and a single tall filled block at its centre.',
  },
  {
    id: 'concept:ribbon',
    label: 'Ribbon',
    variant: 'ribbon',
    domainSlot: CREATIVE_SLOT,
    rationale:
      'Three flowing curves at different weights — evokes momentum, motion, and a story unfolding from bottom-left to top-right.',
    slogan: 'IN MOTION',
    altText:
      'Abstract poster with three horizontal flowing curves at different weights sweeping from bottom-left to top-right.',
  },
] as const;

export const CAMPAIGN_WORKFLOW: WorkflowDetail = {
  meta: META,
  id: 'workflow:campaign-end-to-end',
  label: 'Campaign — end to end',
  purpose:
    'Take an approved objective through intelligence, strategy, design, human selection, final production, approval, and publication readiness.',
  objective:
    'Prepare a campaign for publication. The campaign begins from an approved objective and ends at a publication-ready bundle awaiting an owner-only approval.',
  steps: STEPS,
  conceptStepId: 'wfstep:three-design-concepts',
  designConcepts: DESIGN_CONCEPTS,
} as const;

export const WORKFLOW_SUMMARIES: readonly WorkflowSummary[] = [
  {
    id: CAMPAIGN_WORKFLOW.id,
    label: CAMPAIGN_WORKFLOW.label,
    meta: META,
  },
] as const;
