import {
  type CoordinationBriefing,
  type CoordinationCycle,
  type CoordinationEvent,
  type CoordinationStream,
  type ViewMeta,
} from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW, FIXTURE_TZ } from '@bagos/fixtures';
import { slotForDomain } from '../tenant/tenant.config';
import { HERMES_TEAM } from './hermes-team';

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

const ADAM = HERMES_TEAM.members.find((member) => member.id === HERMES_TEAM.orchestratorId);
const NOUR = HERMES_TEAM.members.find((member) => member.id === 'agent:nour');
const OMAR = HERMES_TEAM.members.find((member) => member.id === 'agent:omar');
const ZIAD = HERMES_TEAM.members.find((member) => member.id === 'agent:ziad');
if (!ADAM || !NOUR || !OMAR || !ZIAD) {
  throw new Error('The coordination cycle requires the confirmed initial team roster.');
}

const MORNING: CoordinationBriefing = {
  id: 'briefing:morning-2026-08-19',
  kind: 'morning',
  scheduledAt: `${DAY}T08:00:00+02:00`,
  headline:
    'Kick off the day: confirm the approved objective, define the evidence needed, and set the one-week calendar review checkpoint.',
  agenda: [
    'Confirm the approved objective and content-calendar scope.',
    `Set ${OMAR.displayName}'s permitted competitor sources and research question.`,
    `Check whether reel frames, audio, or transcripts are available for ${ZIAD.displayName}; record missing modalities.`,
    'Set Hadeer’s first approval checkpoint for the strategy and calendar.',
    'Flag any owner-only decisions likely to surface today.',
  ],
  attendees: ['Hadeer', ADAM.displayName],
} as const;

const EVENING: CoordinationBriefing = {
  id: 'briefing:evening-2026-08-19',
  kind: 'evening',
  scheduledAt: `${DAY}T20:00:00+02:00`,
  headline:
    'Close the day: review planned outputs, pending owner approvals, and work deferred to tomorrow.',
  agenda: [
    `Review ${OMAR.displayName}'s source-linked findings and evidence gaps.`,
    `Review ${ZIAD.displayName}'s analysis only where reel evidence was supplied.`,
    `Review ${NOUR.displayName}'s one-week calendar and items awaiting owner approval.`,
    'Confirm carry-over and record blocked steps; do not imply publication.',
  ],
  attendees: ['Hadeer', ADAM.displayName],
} as const;

const MIDDAY: readonly CoordinationStream[] = [
  {
    id: 'stream:omar',
    agentId: OMAR.id,
    displayName: OMAR.displayName,
    domainSlot: slotForDomain('marketing'),
    plannedContributions: [
      'Research only the approved competitor and source set for the authorized question.',
      'Record source links, observation dates, observed metrics, and evidence gaps.',
      `Hand the same versioned evidence to ${NOUR.displayName} and ${ZIAD.displayName}.`,
    ],
  },
  {
    id: 'stream:ziad',
    agentId: ZIAD.id,
    displayName: ZIAD.displayName,
    domainSlot: slotForDomain('creative'),
    plannedContributions: [
      'Analyze only supplied reel frames, audio, transcripts, metadata, and observed metrics.',
      'Separate observations from hypotheses and state which modalities were unavailable.',
      `Send analysis to ${NOUR.displayName} and a creative brief to Hadeer’s human production team.`,
    ],
  },
  {
    id: 'stream:nour',
    agentId: NOUR.id,
    displayName: NOUR.displayName,
    domainSlot: slotForDomain('social'),
    plannedContributions: [
      'Prepare the one-week Instagram/Facebook calendar from approved objectives and available evidence.',
      'Draft original content concepts, hooks, captions, and calls to action for review.',
      'List visual assets still needed; do not publish or imply that assets are produced.',
    ],
  },
] as const;

const EVENTS: readonly CoordinationEvent[] = [
  {
    id: 'event:09-15-adam-routing',
    at: `${DAY}T09:15:00+02:00`,
    actor: ADAM.displayName,
    summary: 'Proposed: route the authorized brief to the named specialists and track approval boundaries.',
  },
  {
    id: 'event:10-30-omar-research',
    at: `${DAY}T10:30:00+02:00`,
    actor: OMAR.displayName,
    summary: 'Planned: prepare timestamped competitor evidence and gaps from the permitted source set.',
  },
  {
    id: 'event:12-45-ziad-analysis',
    at: `${DAY}T12:45:00+02:00`,
    actor: ZIAD.displayName,
    summary: 'Planned: analyze only supplied reel evidence; if none is attached, record that analysis is pending.',
  },
  {
    id: 'event:14-10-nour-calendar',
    at: `${DAY}T14:10:00+02:00`,
    actor: NOUR.displayName,
    summary: 'Planned: assemble the one-week calendar from the approved objective and available evidence.',
  },
  {
    id: 'event:16-00-hadeer-strategy-review',
    at: `${DAY}T16:00:00+02:00`,
    actor: 'Hadeer',
    summary: 'Owner review checkpoint: strategy and calendar first; finished posts require a separate review.',
  },
  {
    id: 'event:18-20-adam-summary',
    at: `${DAY}T18:20:00+02:00`,
    actor: ADAM.displayName,
    summary: 'Planned: summarize pending approvals, evidence gaps, and deferred work for the evening briefing.',
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
