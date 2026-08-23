import type { DomainSlot } from './graph';
import type { ViewMeta } from './view-meta';

// -----------------------------------------------------------------------------
// Workflow steps carry inputs, outputs, an owner, and a demo state. Steps that
// have not happened render `not_started` — never fabricated progress. Human
// decision points are a distinct step kind so a presenter cannot confuse them
// with an agent step.
// -----------------------------------------------------------------------------

export type WorkflowStepKind = 'agent' | 'human_decision';

export type WorkflowStepState =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'blocked';

interface WorkflowStepBase {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly ownerLabel: string;
  readonly ownerRef: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly state: WorkflowStepState;
  readonly domainSlot: DomainSlot | null;
}

export interface AgentWorkflowStep extends WorkflowStepBase {
  readonly kind: 'agent';
}

export interface HumanWorkflowStep extends WorkflowStepBase {
  readonly kind: 'human_decision';
  readonly decisionPrompt: string;
}

export type WorkflowStep = AgentWorkflowStep | HumanWorkflowStep;

export function isHumanDecisionStep(step: WorkflowStep): step is HumanWorkflowStep {
  return step.kind === 'human_decision';
}

// A design concept is data. The presenter renders it as a deterministic inline
// SVG composition built entirely from design tokens — no photographs, no
// stock imagery, no external assets. Three concepts must be distinguishable
// enough that selecting one is a meaningful choice.
export type DesignConceptVariant = 'orbit' | 'grid' | 'ribbon';

export interface DesignConcept {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly variant: DesignConceptVariant;
  readonly domainSlot: DomainSlot;
  readonly slogan: string;
  readonly altText: string;
}

export interface WorkflowSummary {
  readonly id: string;
  readonly label: string;
  readonly meta: ViewMeta;
}

export interface WorkflowDetail {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly label: string;
  readonly purpose: string;
  readonly objective: string;
  readonly steps: readonly WorkflowStep[];
  readonly conceptStepId: string;
  readonly designConcepts: readonly DesignConcept[];
}

// ApprovalPackage has moved to ./approval (Batch 3a expansion).
// Re-exported from index.ts for consumers who import from @bagos/contracts.
