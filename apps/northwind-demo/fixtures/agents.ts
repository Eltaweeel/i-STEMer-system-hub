import {
  makeRestriction,
  type AgentDetail,
} from '@bagos/contracts';
import { NORTHWIND_AGENT_NODES } from './organization';
import {
  NORTHWIND_DATA_VERSION,
  NORTHWIND_FIXTURE_NOW,
} from './time';

interface AgentFixtureSpec {
  readonly id: string;
  readonly purpose: string;
  readonly responsibilities: readonly string[];
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly tools: readonly string[];
  readonly prohibited: readonly string[];
  readonly sopRefs: readonly string[];
}

const AGENT_SPECS = [
  {
    id: 'agent:route-planner',
    purpose: 'Prepare route options from approved field constraints for human review.',
    responsibilities: ['Compare declared route constraints.', 'Produce a reviewable route brief.'],
    inputs: ['approved_field_constraints', 'terrain_snapshot'],
    outputs: ['route_option_brief'],
    tools: ['fixture_map_catalog'],
    prohibited: ['dispatch_field_team', 'change_safety_limits'],
    sopRefs: ['field-route-review'],
  },
  {
    id: 'agent:sensor-calibrator',
    purpose: 'Draft calibration checklists for registered research instruments.',
    responsibilities: ['Match instruments to fixture calibration protocols.'],
    inputs: ['instrument_record', 'calibration_protocol'],
    outputs: ['calibration_checklist'],
    tools: ['fixture_instrument_registry'],
    prohibited: ['control_physical_instrument'],
    sopRefs: ['instrument-calibration-review'],
  },
  {
    id: 'agent:sample-custodian',
    purpose: 'Prepare sample-chain records from approved intake notes.',
    responsibilities: ['Draft custody transitions without changing the source record.'],
    inputs: ['approved_intake_note'],
    outputs: ['custody_record_draft'],
    tools: ['fixture_sample_ledger'],
    prohibited: ['release_physical_sample'],
    sopRefs: ['sample-custody-review'],
  },
  {
    id: 'agent:archive-curator',
    purpose: 'Suggest archive metadata for completed research packages.',
    responsibilities: ['Propose consistent metadata and retention labels.'],
    inputs: ['completed_research_package'],
    outputs: ['archive_metadata_draft'],
    tools: ['fixture_archive_taxonomy'],
    prohibited: ['delete_archive_record'],
    sopRefs: ['archive-package-review'],
  },
  {
    id: 'agent:risk-assessor',
    purpose: 'Summarize declared field risks without authorizing an expedition.',
    responsibilities: ['Surface unresolved hazards for the human principal.'],
    inputs: ['route_option_brief', 'declared_hazards'],
    outputs: ['risk_summary'],
    tools: ['fixture_hazard_catalog'],
    prohibited: ['approve_field_release'],
    sopRefs: ['field-risk-review'],
  },
] as const satisfies readonly AgentFixtureSpec[];

const META = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: NORTHWIND_DATA_VERSION,
  capturedAt: NORTHWIND_FIXTURE_NOW,
  generatedAt: NORTHWIND_FIXTURE_NOW,
} as const;

function restrictions(labels: readonly string[]) {
  return labels.map((label) => makeRestriction({
    id: `restriction:${label.replaceAll('_', '-')}`,
    label,
    reason: 'Northwind fixture policy requires human control of this action.',
  }));
}

function createAgentDetail(spec: AgentFixtureSpec): AgentDetail {
  const node = NORTHWIND_AGENT_NODES.find(({ id }) => id === spec.id);
  if (!node) throw new Error(`Missing organization node for ${spec.id}.`);
  return {
    meta: META,
    id: spec.id,
    displayName: node.label,
    domainSlot: node.domainSlot,
    purpose: spec.purpose,
    responsibilities: spec.responsibilities,
    allowedInputs: spec.inputs,
    allowedOutputs: spec.outputs,
    allowedTools: spec.tools,
    prohibitedActions: restrictions(spec.prohibited),
    approvalPolicy: {
      default: 'tier_0_internal',
      externalPublishOrSend: 'persisted_exact_revision',
      spendOrFinanceMutation: 'owner_only',
      permissionsOrDeletion: 'owner_only',
    },
    sopRefs: spec.sopRefs,
    sampleActivity: [],
    status: node.status,
    freshness: node.freshness,
    demoStatus: node.demoStatus,
  };
}

export const NORTHWIND_AGENT_DETAILS = AGENT_SPECS.map(createAgentDetail);
