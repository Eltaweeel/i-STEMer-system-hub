import {
  type CoordinationBriefing,
  type CoordinationCycle,
  type CoordinationEvent,
  type CoordinationStream,
  type ViewMeta,
} from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW, FIXTURE_TZ } from '@bagos/fixtures';
import { slotForDomain } from '../tenant/tenant.config';

// -----------------------------------------------------------------------------
// The i-STEMer tenant's PROPOSED daily coordination cycle.
// Every timestamp derives from FIXTURE_NOW so the cycle reads coherently at
// any hour on any day. Times are authored as ISO strings using the fixed
// Africa/Cairo UTC+2 offset — deterministic and never wall-clock-derived.
// FIXTURE_NOW is 2026-08-19T09:15:00+02:00.
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

const DAY = '2026-08-19';

const MORNING: CoordinationBriefing = {
  id: 'briefing:morning-2026-08-19',
  kind: 'morning',
  scheduledAt: `${DAY}T08:00:00+02:00`,
  headline:
    'Kick off the day: confirm the campaign brief, agree on the design direction to explore, and set today\'s publication expectations.',
  agenda: [
    'Review approved objective and audience notes.',
    'Confirm which of the three design concepts to prototype first.',
    'Set which drafts must reach approval by evening briefing.',
    'Flag any owner-only decisions likely to surface today.',
  ],
  attendees: ['Hadeer', 'Hermes Conductor'],
} as const;

const EVENING: CoordinationBriefing = {
  id: 'briefing:evening-2026-08-19',
  kind: 'evening',
  scheduledAt: `${DAY}T20:00:00+02:00`,
  headline:
    'Close the day: what was produced, what is awaiting approval, and what is deferred to tomorrow.',
  agenda: [
    'Walk the day\'s produced artefacts (drafts, briefs, concepts).',
    'List items awaiting owner-only approval.',
    'Confirm carry-over into tomorrow\'s cycle.',
    'Note any refusals or blocked steps for the log.',
  ],
  attendees: ['Hadeer', 'Hermes Conductor'],
} as const;

const MIDDAY: readonly CoordinationStream[] = [
  {
    id: 'stream:marketing',
    agentId: 'agent:marketing',
    displayName: 'Marketing',
    domainSlot: slotForDomain('marketing'),
    plannedContributions: [
      'Update the campaign brief with the morning\'s confirmed objective.',
      'Assemble the priority list of copy variants for the day.',
      'Prepare a competitor-intelligence summary for the conductor to route.',
    ],
  },
  {
    id: 'stream:social',
    agentId: 'agent:social-media',
    displayName: 'Social Media',
    domainSlot: slotForDomain('social'),
    plannedContributions: [
      'Report on trending topics relevant to today\'s approved brief.',
      'Draft channel-specific post variants for review (never publishes).',
      'Attach predicted-reach and preview notes for reviewer context.',
    ],
  },
  {
    id: 'stream:designer',
    agentId: 'agent:designer',
    displayName: 'Designer',
    domainSlot: slotForDomain('creative'),
    plannedContributions: [
      'Refresh the production queue against the confirmed direction.',
      'Prepare three concept compositions for the human decision point.',
      'Draft alt-text alongside every visual artefact.',
    ],
  },
] as const;

const EVENTS: readonly CoordinationEvent[] = [
  {
    id: 'event:09-15-conductor-check-in',
    at: `${DAY}T09:15:00+02:00`,
    actor: 'Hermes Conductor',
    summary: 'Confirms overnight approvals log is empty; opens the routing queue.',
  },
  {
    id: 'event:10-30-marketing-brief-updated',
    at: `${DAY}T10:30:00+02:00`,
    actor: 'Marketing',
    summary: 'Updated campaign brief attached to the approval queue as a draft.',
  },
  {
    id: 'event:12-45-designer-concepts-ready',
    at: `${DAY}T12:45:00+02:00`,
    actor: 'Designer',
    summary: 'Three concept compositions ready for the human decision point.',
  },
  {
    id: 'event:14-10-hadeer-selects-direction',
    at: `${DAY}T14:10:00+02:00`,
    actor: 'Hadeer',
    summary: 'Selects a direction from the three concepts; documented on the workflow.',
  },
  {
    id: 'event:16-00-social-drafts-attached',
    at: `${DAY}T16:00:00+02:00`,
    actor: 'Social Media',
    summary: 'Attaches channel-specific draft posts to the approval queue for review.',
  },
  {
    id: 'event:18-20-approvals-summary',
    at: `${DAY}T18:20:00+02:00`,
    actor: 'Hermes Conductor',
    summary: 'Assembles the end-of-day approvals summary for evening briefing.',
  },
] as const;

export const COORDINATION_CYCLE: CoordinationCycle = {
  meta: META,
  id: 'coordination-cycle:istemer-demo-2026-08-19',
  title: 'Daily coordination cycle',
  timezone: FIXTURE_TZ,
  proposedNotice:
    'This is the proposed operating cycle — a plan, not a live schedule. Nothing on this page runs.',
  morning: MORNING,
  midday: MIDDAY,
  daytimeEvents: EVENTS,
  evening: EVENING,
} as const;
