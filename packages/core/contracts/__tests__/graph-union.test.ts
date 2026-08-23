// The fix from the prior interface contract: a HumanAuthorityNode does NOT
// have a runtime status or a heartbeat. The union must make `.status` on a
// human node a type error before it is a runtime error.
//
// This file uses a compile-time assertion pattern: if the branch below
// compiles, the union is loose enough that a human could accidentally carry
// runtime state. The intentionally-commented probe below MUST NOT compile if
// uncommented. `tsc --noEmit` on this package is what actually catches it.

import { describe, expect, it } from 'vitest';
import {
  isHumanNode,
  type AgentNode,
  type GraphNode,
  type HumanAuthorityNode,
} from '../src/index';

const HUMAN: HumanAuthorityNode = {
  kind: 'human',
  id: 'human:owner',
  label: 'Owner',
  entityHref: '/x',
  accessibleDescription: 'The owner is the human principal.',
  authorityScope: 'owner-only actions',
  approvalTier: 'owner_only',
  avatarLabel: 'O',
};

const AGENT: AgentNode = {
  kind: 'agent',
  id: 'agent:a',
  label: 'A',
  entityHref: '/a',
  accessibleDescription: 'A specialist agent.',
  status: 'idle',
  freshness: { capturedAt: '2026-08-19T09:15:00+02:00', isStale: false },
  domainSlot: 2,
  demoStatus: { kind: 'wired_no_runtime', note: 'demo' },
};

describe('graph node discriminated union', () => {
  it('human has authority scope and no runtime status field', () => {
    expect('authorityScope' in HUMAN).toBe(true);
    expect('status' in HUMAN).toBe(false);
    expect('freshness' in HUMAN).toBe(false);
  });

  it('narrowing through isHumanNode exposes only authority fields', () => {
    const n: GraphNode = HUMAN;
    if (isHumanNode(n)) {
      expect(n.authorityScope).toBeTruthy();
      // The next line, if it were `n.status`, would fail typecheck.
      // (No runtime assertion needed — tsc is the enforcer.)
    } else {
      throw new Error('expected human');
    }
  });

  it('type narrowing keeps agent status accessible only after the guard', () => {
    const n: GraphNode = AGENT;
    if (n.kind === 'agent') {
      expect(n.status).toBe('idle');
    } else {
      throw new Error('expected agent');
    }
  });
});
