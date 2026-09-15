import type { DemoStatus } from './graph';
import type { ViewMeta } from './view-meta';

/**
 * A named agent roster is a product projection, not a claim that these
 * processes are running. `phase` distinguishes the initial team from roles
 * the owner plans to add later.
 */
export type TeamMemberPhase = 'initial' | 'planned';

export interface TeamMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly phase: TeamMemberPhase;
  readonly reportsTo: string;
  readonly reportsToLabel: string;
  readonly receivesFrom: readonly string[];
  readonly sendsTo: readonly string[];
  readonly responsibility: string;
  readonly demoStatus: DemoStatus;
}

export interface WorkflowHandoff {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly artifact: string;
  readonly rule: string;
}

export interface TeamProjection {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly title: string;
  readonly mission: string;
  readonly orchestratorId: string;
  readonly members: readonly TeamMember[];
  readonly handoffs: readonly WorkflowHandoff[];
  readonly approvalBoundary: string;
}

export type CapacitySnapshotState = 'unavailable' | 'estimated' | 'live';
export type CapacityThresholdState = 'below' | 'at_or_above' | 'unknown';

/** Provider capacity is nullable until a connected provider supplies it. */
export interface CapacitySnapshot {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly providerLabel: string;
  readonly accountLabel: string;
  readonly state: CapacitySnapshotState;
  readonly usedPercent: number | null;
  readonly remainingPercent: number | null;
  readonly resetAt: string | null;
  readonly runwayLabel: string;
  readonly thresholdPercent: number;
  readonly thresholdState: CapacityThresholdState;
  readonly policy: string;
  readonly note: string;
}
