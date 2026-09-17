import type { Clock } from '@bagos/contracts';

export type InitialAgentId = 'adam' | 'omar' | 'ziad' | 'nour';
export type AgentArtifactKind = 'brief' | 'competitor_evidence' | 'reel_analysis' | 'content_calendar' | 'finished_posts';

export interface AuthorizedBrief {
  readonly taskId: string;
  readonly tenantId: string;
  readonly requesterId: string;
  readonly objective: string;
  readonly platforms: readonly ('instagram' | 'facebook')[];
  readonly competitorSources: readonly string[];
}

export interface EvidenceItem {
  readonly source: string;
  readonly observedAt: string;
  readonly observation: string;
  readonly interpretation: string | null;
  readonly unavailableData: readonly string[];
}

export interface AgentArtifact<T> {
  readonly id: string;
  readonly kind: AgentArtifactKind;
  readonly producedBy: InitialAgentId;
  readonly taskId: string;
  readonly version: number;
  readonly createdAt: string;
  readonly data: T;
}

export interface CompetitorEvidence {
  readonly question: string;
  readonly platforms: readonly ('instagram' | 'facebook')[];
  readonly items: readonly EvidenceItem[];
  readonly gaps: readonly string[];
}

export interface ReelAnalysis {
  readonly basedOnEvidenceArtifactId: string;
  readonly findings: readonly string[];
  readonly hypotheses: readonly string[];
  readonly unavailableModalities: readonly string[];
}

export interface CalendarEntry {
  readonly day: number;
  readonly platform: 'instagram' | 'facebook';
  readonly format: 'post' | 'reel' | 'story';
  readonly concept: string;
  readonly evidenceArtifactId: string;
}

export interface ContentCalendar {
  readonly durationDays: 7;
  readonly entries: readonly CalendarEntry[];
  readonly approvalRequired: true;
}

export interface ApprovalCheckpoint {
  readonly id: string;
  readonly stage: 'strategy_and_calendar' | 'finished_posts';
  readonly artifactIds: readonly string[];
  readonly contentHash: string;
  readonly status: 'waiting_for_approval';
  readonly destination: 'instagram' | 'facebook';
}

export interface FinishedPostPackage {
  readonly basedOnArtifactIds: readonly string[];
  readonly posts: readonly {
    readonly platform: 'instagram' | 'facebook';
    readonly day: number;
    readonly caption: string;
    readonly mediaStatus: 'not_supplied';
    readonly publicationStatus: 'not_published';
  }[];
  readonly approvalRequired: true;
}

export interface EngineTraceEntry {
  readonly agent: InitialAgentId;
  readonly action: 'accepted' | 'completed' | 'handoff';
  readonly artifactId?: string;
  readonly at: string;
}

export interface InitialEngineResult {
  readonly status: 'complete' | 'blocked';
  readonly brief: AgentArtifact<AuthorizedBrief>;
  readonly evidence: AgentArtifact<CompetitorEvidence>;
  readonly reelAnalysis: AgentArtifact<ReelAnalysis>;
  readonly calendar: AgentArtifact<ContentCalendar>;
  readonly finishedPosts: AgentArtifact<FinishedPostPackage>;
  readonly approvals: readonly ApprovalCheckpoint[];
  readonly trace: readonly EngineTraceEntry[];
  readonly liveEffects: false;
}

export interface InitialEngineDependencies {
  readonly clock: Clock;
}

function artifact<T>(
  taskId: string,
  kind: AgentArtifactKind,
  producedBy: InitialAgentId,
  createdAt: string,
  data: T,
): AgentArtifact<T> {
  return { id: `artifact:${taskId}:${kind}:v1`, kind, producedBy, taskId, version: 1, createdAt, data };
}

export function runInitialMarketingWorkflow(
  brief: AuthorizedBrief,
  deps: InitialEngineDependencies,
): InitialEngineResult {
  if (!brief.taskId || !brief.tenantId || !brief.requesterId || !brief.objective) {
    throw new Error('An authorized brief requires taskId, tenantId, requesterId, and objective.');
  }
  if (brief.platforms.length === 0 || brief.competitorSources.length === 0) {
    throw new Error('The initial workflow requires at least one platform and competitor source.');
  }
  const at = deps.clock.nowIso();
  const baseTrace: EngineTraceEntry[] = [
    { agent: 'adam', action: 'accepted', at },
    { agent: 'omar', action: 'accepted', at },
  ];
  const briefArtifact = artifact(brief.taskId, 'brief', 'adam', at, brief);
  const evidence = artifact<CompetitorEvidence>(brief.taskId, 'competitor_evidence', 'omar', at, {
    question: brief.objective,
    platforms: brief.platforms,
    items: brief.competitorSources.map((source) => ({
      source,
      observedAt: at,
      observation: 'Source supplied for research; no live fetch was performed by this engine.',
      interpretation: null,
      unavailableData: ['current engagement metrics', 'causal performance evidence'],
    })),
    gaps: ['Live source retrieval is not connected.', 'Video frames, audio, and transcripts were not inspected.'],
  });
  const reelAnalysis = artifact<ReelAnalysis>(brief.taskId, 'reel_analysis', 'ziad', at, {
    basedOnEvidenceArtifactId: evidence.id,
    findings: ['No reel-level finding is asserted until media or transcript evidence is supplied.'],
    hypotheses: [],
    unavailableModalities: ['video frames', 'audio', 'transcript', 'platform performance metrics'],
  });
  const calendar = artifact<ContentCalendar>(brief.taskId, 'content_calendar', 'nour', at, {
    durationDays: 7,
    entries: brief.platforms.map((platform, index) => ({
      day: index + 1,
      platform,
      format: platform === 'instagram' ? 'reel' : 'post',
      concept: 'Original STEM learning-by-doing story, to be drafted after human strategy approval.',
      evidenceArtifactId: evidence.id,
    })),
    approvalRequired: true,
  });
  const finishedPosts: AgentArtifact<FinishedPostPackage> = {
    id: `artifact:${brief.taskId}:finished_posts:v1`, kind: 'finished_posts', producedBy: 'adam',
    taskId: brief.taskId, version: 1, createdAt: at,
    data: {
      basedOnArtifactIds: [briefArtifact.id, evidence.id, reelAnalysis.id, calendar.id],
      posts: brief.platforms.map((platform, index) => ({
        platform,
        day: index + 1,
        caption: 'Draft awaiting human approval; no publication is authorized.',
        mediaStatus: 'not_supplied' as const,
        publicationStatus: 'not_published' as const,
      })),
      approvalRequired: true,
    },
  };
  const approvals: ApprovalCheckpoint[] = [
    { id: `approval:${brief.taskId}:strategy:v1`, stage: 'strategy_and_calendar', artifactIds: [evidence.id, calendar.id], contentHash: `sha256:${calendar.id}`, status: 'waiting_for_approval', destination: brief.platforms[0] ?? 'instagram' },
    { id: `approval:${brief.taskId}:finished-posts:v1`, stage: 'finished_posts', artifactIds: [finishedPosts.id], contentHash: `sha256:${finishedPosts.id}`, status: 'waiting_for_approval', destination: brief.platforms[0] ?? 'instagram' },
  ];
  baseTrace.push(
    { agent: 'omar', action: 'completed', artifactId: evidence.id, at },
    { agent: 'adam', action: 'handoff', artifactId: evidence.id, at },
    { agent: 'ziad', action: 'completed', artifactId: reelAnalysis.id, at },
    { agent: 'nour', action: 'completed', artifactId: calendar.id, at },
    { agent: 'adam', action: 'completed', artifactId: finishedPosts.id, at },
    { agent: 'adam', action: 'completed', at },
  );
  return { status: 'complete', brief: briefArtifact, evidence, reelAnalysis, calendar, finishedPosts, approvals, trace: baseTrace, liveEffects: false };
}
