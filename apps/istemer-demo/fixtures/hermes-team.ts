import type {
  TeamMember,
  TeamProjection,
  WorkflowHandoff,
  ViewMeta,
} from '@bagos/contracts';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW } from '@bagos/fixtures';

const META: ViewMeta = {
  source: 'fixture',
  isSample: true,
  isPartial: true,
  stale: false,
  dataVersion: FIXTURE_DATA_VERSION,
  capturedAt: FIXTURE_NOW,
  generatedAt: FIXTURE_NOW,
} as const;

const ADAM = 'agent:adam';
const HADEER = 'human:hadeer';

const MEMBER = (
  member: Omit<TeamMember, 'demoStatus'>,
): TeamMember => ({
  ...member,
  demoStatus: {
    kind: 'wired_no_runtime',
    note: 'Named profile is declared in the fixture; no runtime is attached.',
  },
});

const MEMBERS: readonly TeamMember[] = [
  MEMBER({
    id: ADAM,
    displayName: 'Adam (Main Orchestrator)',
    role: 'Main Orchestrator',
    phase: 'initial',
    reportsTo: HADEER,
    reportsToLabel: 'Hadeer',
    receivesFrom: ['Hadeer', 'Abdo', 'approved requests'],
    sendsTo: ['Nour', 'Omar', 'Ziad', 'future specialists'],
    responsibility: 'Routes work, coordinates specialists, enforces authority and approval boundaries.',
  }),
  MEMBER({
    id: 'agent:nour',
    displayName: 'Nour (Content Creator)',
    role: 'Content Creator',
    phase: 'initial',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['Omar (Competitor Analyst)', 'approved objectives'],
    sendsTo: ['Hadeer', 'Mariam (Social Media Coordinator)', 'Hana (Graphic Designer)'],
    responsibility: 'Owns the one-week content calendar and drafts content from approved strategy evidence.',
  }),
  MEMBER({
    id: 'agent:omar',
    displayName: 'Omar (Competitor Analyst)',
    role: 'Competitor Analyst',
    phase: 'initial',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['Adam (Main Orchestrator)', 'permitted research sources'],
    sendsTo: ['Nour (Content Creator)', 'Ziad (Reel Analyst)'],
    responsibility: 'Produces permitted competitor research and evidence for the calendar and reel analysis.',
  }),
  MEMBER({
    id: 'agent:ziad',
    displayName: 'Ziad (Reel Analyst)',
    role: 'Reel Analyst',
    phase: 'initial',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['Omar (Competitor Analyst)'],
    sendsTo: ['Hana (Graphic Designer)', 'Hadeer marketing team'],
    responsibility: 'Continues Omar’s findings and analyzes hooks, creative patterns, trends, and observed performance signals.',
  }),
  MEMBER({
    id: 'agent:mariam',
    displayName: 'Mariam (Social Media Coordinator)',
    role: 'Social Media Coordinator',
    phase: 'planned',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['Nour (Content Creator)', 'Hadeer-approved templates'],
    sendsTo: ['approved channels'],
    responsibility: 'Prepares and publishes already-approved posts within the exact delegated scope.',
  }),
  MEMBER({
    id: 'agent:hana',
    displayName: 'Hana (Graphic Designer)',
    role: 'Graphic Designer',
    phase: 'planned',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['Ziad (Reel Analyst)', 'approved creative direction'],
    sendsTo: ['Hadeer marketing team', 'finished-post review'],
    responsibility: 'Creates proposed graphics and production assets for human review.',
  }),
  MEMBER({
    id: 'agent:seif',
    displayName: 'Seif (Media Buyer)',
    role: 'Media Buyer',
    phase: 'planned',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['Hadeer-approved media plan'],
    sendsTo: ['spend approval queue'],
    responsibility: 'Prepares media buying plans; spending remains approval-gated.',
  }),
  MEMBER({
    id: 'agent:nada',
    displayName: 'Nada (Talent Acquisition)',
    role: 'Talent Acquisition',
    phase: 'planned',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['approved hiring brief'],
    sendsTo: ['Hadeer review'],
    responsibility: 'Sources and organizes candidate research for owner review.',
  }),
  MEMBER({
    id: 'agent:mazen',
    displayName: 'Mazen (Business Developer)',
    role: 'Business Developer',
    phase: 'planned',
    reportsTo: ADAM,
    reportsToLabel: 'Adam (Main Orchestrator)',
    receivesFrom: ['approved growth brief'],
    sendsTo: ['Hadeer review'],
    responsibility: 'Prepares partnership and growth opportunities without making commitments.',
  }),
] as const;

const HANDOFFS: readonly WorkflowHandoff[] = [
  {
    id: 'handoff:omar-to-nour',
    from: 'Omar (Competitor Analyst)',
    to: 'Nour (Content Creator)',
    artifact: 'Competitor evidence summary',
    rule: 'Nour uses the evidence to own the one-week content calendar.',
  },
  {
    id: 'handoff:omar-to-ziad',
    from: 'Omar (Competitor Analyst)',
    to: 'Ziad (Reel Analyst)',
    artifact: 'Competitor evidence summary',
    rule: 'Ziad continues the findings with video, reel, hook, and creative analysis.',
  },
  {
    id: 'handoff:ziad-to-hana',
    from: 'Ziad (Reel Analyst)',
    to: 'Hana (Graphic Designer)',
    artifact: 'Reel creative brief',
    rule: 'Hana turns approved direction into proposed graphic assets for review.',
  },
  {
    id: 'handoff:ziad-to-marketing-team',
    from: 'Ziad (Reel Analyst)',
    to: 'Hadeer marketing team',
    artifact: 'Reel patterns and learning notes',
    rule: 'The human marketing team uses the evidence when creating reels.',
  },
  {
    id: 'handoff:nour-to-hadeer',
    from: 'Nour (Content Creator)',
    to: 'Hadeer',
    artifact: 'One-week content calendar',
    rule: 'Hadeer approves strategy first, then reviews finished posts before publication.',
  },
] as const;

export const HERMES_TEAM: TeamProjection = {
  meta: META,
  id: 'hermes-team:istemer-demo',
  title: 'Adam’s Hermes team',
  mission: 'Coordinate research, content planning, reel analysis, creative production, and owner approvals.',
  orchestratorId: ADAM,
  members: MEMBERS,
  handoffs: HANDOFFS,
  approvalBoundary:
    'Publishing, customer messages, spending, price changes, business commitments, deployments, configuration changes, and access changes remain approval-gated.',
} as const;
