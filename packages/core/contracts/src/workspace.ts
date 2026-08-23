import type { DomainSlot } from './graph';

export type ContentCalendarState = 'draft' | 'awaiting_review' | 'scheduled';

export interface ContentCalendarItem {
  readonly id: string;
  readonly scheduledFor: string;
  readonly title: string;
  readonly ownerId: string;
  readonly ownerLabel: string;
  readonly domainSlot: DomainSlot;
  readonly state: ContentCalendarState;
}

export interface TrendAlert {
  readonly id: string;
  readonly observedAt: string;
  readonly observation: string;
  readonly evidenceLabel: string;
  readonly evidenceRef: string;
  readonly suggestedNextStep: string;
  readonly isFixtureExample: true;
}
