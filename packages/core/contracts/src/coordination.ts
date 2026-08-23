import type { DomainSlot } from './graph';
import type { ViewMeta } from './view-meta';

// -----------------------------------------------------------------------------
// The daily coordination cycle is a PROPOSED operating cycle — a plan, not a
// live schedule. Every timestamp is authored as an offset from FIXTURE_NOW at
// the tenant layer; core defines the shape only. The three midday streams,
// two briefings, and daytime events are all deterministic and ordered.
// -----------------------------------------------------------------------------

export type BriefingKind = 'morning' | 'evening';

export interface CoordinationBriefing {
  readonly id: string;
  readonly kind: BriefingKind;
  readonly scheduledAt: string;
  readonly headline: string;
  readonly agenda: readonly string[];
  readonly attendees: readonly string[];
}

export interface CoordinationStream {
  readonly id: string;
  readonly agentId: string;
  readonly displayName: string;
  readonly domainSlot: DomainSlot;
  readonly plannedContributions: readonly string[];
}

export interface CoordinationEvent {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly summary: string;
}

export interface CoordinationCycle {
  readonly meta: ViewMeta;
  readonly id: string;
  readonly title: string;
  readonly timezone: string;
  readonly proposedNotice: string;
  readonly morning: CoordinationBriefing;
  readonly midday: readonly CoordinationStream[];
  readonly daytimeEvents: readonly CoordinationEvent[];
  readonly evening: CoordinationBriefing;
}
