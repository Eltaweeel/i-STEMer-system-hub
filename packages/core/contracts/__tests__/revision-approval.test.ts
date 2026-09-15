import { describe, expect, it } from 'vitest';
import {
  compareApprovalBinding,
  type ApprovalBinding,
  type ContentDigest,
} from '../src/revision-approval';

const DIGEST: ContentDigest = { kind: 'sha256', hex: 'a'.repeat(64) };
const OTHER_DIGEST: ContentDigest = { kind: 'sha256', hex: 'b'.repeat(64) };
const BINDING: ApprovalBinding = {
  tenantId: 'tenant:example',
  actionId: 'action:stage-assets',
  actionRevision: 2,
  actionDigest: DIGEST,
  destination: { environment: 'staging', connectorId: 'connector:example', targetId: 'target:assets' },
  artifact: { artifactId: 'artifact:assets', revision: 3, contentDigest: DIGEST },
};

describe('exact-revision approval binding comparison (not authorization)', () => {
  it('matches independently loaded snapshots without changing either input', () => {
    const current = structuredClone(BINDING);
    Object.freeze(current);
    Object.freeze(current.destination);
    Object.freeze(current.artifact);
    expect(compareApprovalBinding(BINDING, current)).toEqual({ kind: 'matching' });
    expect(current).toEqual(BINDING);
  });

  // Each field is part of the approval scope even if content bytes stay identical.
  it.each([
    ['tenant', { ...BINDING, tenantId: 'tenant:other' }],
    ['action', { ...BINDING, actionId: 'action:other' }],
    ['action_revision', { ...BINDING, actionRevision: 3 }],
    ['action_digest', { ...BINDING, actionDigest: OTHER_DIGEST }],
    ['environment', { ...BINDING, destination: { ...BINDING.destination, environment: 'live' } }],
    ['connector', { ...BINDING, destination: { ...BINDING.destination, connectorId: 'connector:other' } }],
    ['target', { ...BINDING, destination: { ...BINDING.destination, targetId: 'target:other' } }],
    ['artifact', { ...BINDING, artifact: { ...BINDING.artifact, artifactId: 'artifact:other' } }],
    ['artifact_revision', { ...BINDING, artifact: { ...BINDING.artifact, revision: 4 } }],
    ['content_digest', { ...BINDING, artifact: { ...BINDING.artifact, contentDigest: OTHER_DIGEST } }],
  ] satisfies readonly (readonly [string, ApprovalBinding])[])('detects changed %s', (_field, current) => {
    expect(compareApprovalBinding(BINDING, current).kind).toBe('changed');
  });

  it.each([
    { kind: 'placeholder', reason: 'Sample content has not been hashed.' },
    { kind: 'sha256', hex: '' },
    { kind: 'sha256', hex: 'a'.repeat(63) },
    { kind: 'sha256', hex: 'a'.repeat(65) },
    { kind: 'sha256', hex: 'z'.repeat(64) },
  ] satisfies readonly ContentDigest[])('does not match unverified content digest %j', (contentDigest) => {
    const snapshot = { ...BINDING, artifact: { ...BINDING.artifact, contentDigest } };
    expect(compareApprovalBinding(snapshot, snapshot)).toEqual({ kind: 'unverifiable' });
    expect(compareApprovalBinding(BINDING, snapshot)).toEqual({ kind: 'unverifiable' });
    expect(compareApprovalBinding(snapshot, BINDING)).toEqual({ kind: 'unverifiable' });
  });

  it('requires an action digest even when the artifact digest is available', () => {
    const snapshot: ApprovalBinding = {
      ...BINDING,
      actionDigest: { kind: 'placeholder', reason: 'Action envelope not hashed.' },
    };
    expect(compareApprovalBinding(snapshot, snapshot)).toEqual({ kind: 'unverifiable' });
    expect(compareApprovalBinding(BINDING, snapshot)).toEqual({ kind: 'unverifiable' });
    expect(compareApprovalBinding(snapshot, BINDING)).toEqual({ kind: 'unverifiable' });
  });

  it('reports a known revision change even when hashes are unavailable', () => {
    const current: ApprovalBinding = {
      ...BINDING,
      actionRevision: 3,
      actionDigest: { kind: 'placeholder', reason: 'New revision not yet hashed.' },
    };
    expect(compareApprovalBinding(BINDING, current).kind).toBe('changed');
  });
});
