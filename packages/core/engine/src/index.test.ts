import { describe, expect, it } from 'vitest';
import { runInitialMarketingWorkflow } from './index';

const clock = { nowIso: () => '2026-09-15T10:00:00.000Z' };

describe('initial marketing workflow engine', () => {
  it('runs Adam -> Omar -> Ziad and Nour with one immutable evidence handoff', () => {
    const result = runInitialMarketingWorkflow({
      taskId: 'task:tenant-a:001', tenantId: 'tenant-a', requesterId: 'human:owner',
      objective: 'Find relevant education competitors and content opportunities.',
      platforms: ['instagram', 'facebook'], competitorSources: ['source-a', 'source-b'],
    }, { clock });
    expect(result.status).toBe('complete');
    expect(result.evidence.id).toBe(result.reelAnalysis.data.basedOnEvidenceArtifactId);
    expect(result.evidence.id).toBe(result.calendar.data.entries.at(0)?.evidenceArtifactId);
    expect(result.reelAnalysis.data.unavailableModalities).toContain('video frames');
    expect(result.calendar.data.approvalRequired).toBe(true);
    expect(result.approvals).toHaveLength(2);
    expect(result.finishedPosts.data.posts[0]?.publicationStatus).toBe('not_published');
    expect(result.finishedPosts.data.posts[0]?.mediaStatus).toBe('not_supplied');
    expect(result.approvals.every((approval) => approval.status === 'waiting_for_approval')).toBe(true);
    expect(result.liveEffects).toBe(false);
  });

  it('rejects an unscoped brief before any artifacts are produced', () => {
    expect(() => runInitialMarketingWorkflow({
      taskId: '', tenantId: 'tenant-a', requesterId: 'human:owner', objective: 'x',
      platforms: ['instagram'], competitorSources: ['source'],
    }, { clock })).toThrow('authorized brief');
  });
});
