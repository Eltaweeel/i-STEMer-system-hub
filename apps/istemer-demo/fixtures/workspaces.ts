import type { ContentCalendarItem, TrendAlert } from '@bagos/contracts';
import { offsetHours, offsetMinutes } from '@bagos/fixtures';
import { slotForDomain } from '../tenant/tenant.config';

export const SOCIAL_CONTENT_CALENDAR: readonly ContentCalendarItem[] = [
  {
    id: 'content:campaign-story-sequence',
    scheduledFor: offsetHours(24),
    title: 'Campaign story sequence — draft one',
    ownerId: 'agent:social-media',
    ownerLabel: 'Social Media',
    domainSlot: slotForDomain('social'),
    state: 'draft',
  },
  {
    id: 'content:campaign-carousel',
    scheduledFor: offsetHours(48),
    title: 'Campaign carousel — reviewer copy',
    ownerId: 'agent:social-media',
    ownerLabel: 'Social Media',
    domainSlot: slotForDomain('social'),
    state: 'awaiting_review',
  },
  {
    id: 'content:campaign-short-video',
    scheduledFor: offsetHours(72),
    title: 'Campaign short-video outline',
    ownerId: 'agent:social-media',
    ownerLabel: 'Social Media',
    domainSlot: slotForDomain('social'),
    state: 'scheduled',
  },
] as const;

export const SOCIAL_TREND_ALERT: TrendAlert = {
  id: 'trend:campaign-question-format',
  observedAt: offsetMinutes(-30),
  observation: 'Question-led campaign openings appear repeatedly in the authored competitor-intelligence sample.',
  evidenceLabel: 'Fixture evidence reference',
  evidenceRef: 'competitor_summary / question-format-cluster',
  suggestedNextStep: 'Draft one question-led variant for human review; do not publish or schedule externally.',
  isFixtureExample: true,
} as const;
