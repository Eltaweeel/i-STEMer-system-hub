import { spawn as nodeSpawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { IncomingMessage, type ClientRequest } from 'node:http';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { observeSource } from '../../../packages/core/research-worker/src/source-observer';
import type { SourceNetwork } from '../../../packages/core/research-worker/src/public-source';
import { dispatchResearchTask } from '../lib/workflow/research-transport';
import { runResearchWorkerCycle, type ResearchCommandPort, type ResearchWorkerConfig } from '../lib/workflow/research-worker';

// The whole vertical slice in one process, with only the outside world doubled:
//   claim (fake port) -> real observer + receipt (stubbed network) -> real signing -> real loopback
//   HTTP -> real agents-hub listener, replay store and attempt guard -> real adapter spawning a
//   stand-in `hermes` child -> strict research.v1 validation -> complete (fake port).
// Skipped when the sibling agents-hub checkout is not present.
const agentsDir = process.env.ISTEMER_AGENTS_HUB_DIR ?? resolve(import.meta.dirname, '../../../../i-STEMer-agents-hub');
const present = existsSync(join(agentsDir, 'src/research/server.ts'));

const FAKE_HERMES = `
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const p = JSON.parse(input);
  const mode = p.task.brief.objective;
  if (mode.includes('MODE:exit3')) process.exit(3);
  const s = p.snapshots[0].receipt;
  console.log(JSON.stringify({ contractVersion: 'research.v1', taskId: p.task.taskId, runId: p.task.runId, attemptId: p.task.attemptId,
    tenantId: p.task.tenantId, producedBy: 'competitor_analyst', sourceRevisionIds: p.inputRevisionIds, liveEffects: false, gaps: [],
    evidence: [{ sourceUrl: s.sourceUrl, inspectionReceiptId: mode.includes('MODE:fabricated') ? '00000000-0000-4000-8000-0000000000ff' : s.receiptId,
      inspectedAt: s.inspectedAt, observation: 'Page text mentions robotics.', interpretation: null, confidence: 'low', gaps: [] }] }));
});`;

// Fixed injected clock: the repository forbids wall-clock reads, and a fixed clock keeps the run deterministic.
const NOW = Date.parse('2026-09-16T12:00:00Z');
const PAGE_TEXT = 'Robotics and science programs for children';
const SOURCE = 'https://research.example.org/about';
const key = new Uint8Array(32).fill(9);
const tenantId = '20000000-0000-4000-8000-000000000001';
const requesterId = '20000000-0000-4000-8000-000000000002';
const revisionId = '20000000-0000-4000-8000-000000000003';

function stubNetwork(): SourceNetwork {
  return {
    resolve: async () => [{ address: '93.184.215.14', family: 4 }],
    request: ((_options: unknown, callback: (response: IncomingMessage) => void) => {
      const response = new IncomingMessage(new Socket());
      response.statusCode = 200;
      response.headers = { 'content-type': 'text/html; charset=utf-8' };
      return Object.assign(new EventEmitter(), { end() {
        queueMicrotask(() => { callback(response); response.push(`<h1>${PAGE_TEXT}</h1>`); response.push(null); });
      } }) as ClientRequest;
    }) as SourceNetwork['request'],
  };
}

function claimFor(objective: string, ids = { taskId: randomUUID(), runId: randomUUID(), attemptId: randomUUID() }) {
  const issued = NOW;
  return { status: 'claimed', task: { contractVersion: 'research.v1', ...ids, tenantId, requesterId, agentId: 'competitor_analyst',
    allowedScope: ['research:read'], issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + 5 * 60_000).toISOString(),
    brief: { idempotencyKey: randomUUID(), objective, sources: [SOURCE] }, liveEffects: false },
  handoff: { contractVersion: 'research.v1', ...ids, tenantId, fromAgentId: 'orchestrator', toAgentId: 'competitor_analyst',
    inputRevisionIds: [revisionId], liveEffects: false } };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function startSlice(agentTenantId = tenantId) {
  const load = (file: string) => import(/* @vite-ignore */ pathToFileURL(join(agentsDir, file)).href);
  const [{ createResearchServer }, { SqliteReplayStore }, { createHermesOmarInference }] = await Promise.all([
    load('src/research/server.ts'), load('src/research/sqlite-replay-store.ts'), load('src/research/hermes-omar-inference.ts')]);
  const directory = await mkdtemp(join(tmpdir(), 'istemer-slice-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, 'fake-hermes.cjs');
  await writeFile(script, FAKE_HERMES);
  let hermesRuns = 0;
  const spawn = (_command: string, args: string[], options: object) => {
    hermesRuns += 1;
    return nodeSpawn(process.execPath, [script, ...args], options);
  };
  const replayStore = new SqliteReplayStore(join(directory, 'replay.sqlite'));
  const server = createResearchServer({ tenantId: agentTenantId, now: () => NOW, replayStore, attempts: replayStore,
    resolveKey: (keyId: string) => (keyId === 'worker-key' ? key : undefined),
    infer: createHermesOmarInference({ hermesBin: process.execPath, profile: 'istemer-omar', runBudgetSeconds: 30, killGraceMs: 50, spawn }) });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  cleanups.push(async () => { await new Promise<void>((done) => server.close(() => done())); replayStore.close(); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP listener');

  const completed: { attemptId: string; artifact: unknown; receipts: readonly unknown[] }[] = [];
  const failed: { attemptId: string; code: string }[] = [];
  const network = stubNetwork();
  const port: ResearchCommandPort = {
    claim: vi.fn().mockResolvedValue(null),
    fail: async (attemptId, code) => { failed.push({ attemptId, code }); return {}; },
    complete: async (attemptId, artifact, receipts) => { completed.push({ attemptId, artifact, receipts }); return {}; },
    recordUsage: vi.fn().mockResolvedValue({}),
  };
  const config: ResearchWorkerConfig = { port, endpoint: { hostname: '127.0.0.1', port: address.port }, keyId: 'worker-key', signingKey: key,
    now: () => NOW,
    dispatch: (endpoint, signed, body, timeoutMs) => dispatchResearchTask(endpoint, signed, body, timeoutMs, { key, now: () => NOW }), observe: (input) => observeSource({ ...input, network }) };
  const claimWith = (claim: unknown) => { (port.claim as ReturnType<typeof vi.fn>).mockResolvedValueOnce(claim); };
  return { config, claimWith, completed, failed, runs: () => hermesRuns };
}

describe.skipIf(!present)('omar staging slice, local end to end', () => {
  beforeAll(() => { if (!present) return; });

  it('carries one task from claim to a persisted, receipt-bound research.v1 artifact', async () => {
    const slice = await startSlice();
    const claim = claimFor('Compare robotics programs');
    slice.claimWith(claim);
    const result = await runResearchWorkerCycle(slice.config);
    expect(result).toEqual({ outcome: 'succeeded', runId: claim.task.runId, attemptId: claim.task.attemptId });
    expect(slice.runs()).toBe(1);
    expect(slice.completed).toHaveLength(1);
    type Receipt = { receiptId: string; inspectedAt: string } & Record<string, unknown>;
    const [{ artifact, receipts }] = slice.completed as unknown as [{ artifact: { evidence: Record<string, unknown>[] } & Record<string, unknown>; receipts: Receipt[] }];
    expect(receipts).toHaveLength(1);
    // Receipt is the observer's: exact task identity, exact source, hash of the exact captured text.
    expect(receipts[0]).toMatchObject({ taskId: claim.task.taskId, runId: claim.task.runId, attemptId: claim.task.attemptId,
      tenantId, sourceUrl: SOURCE, contentHash: createHash('sha256').update(PAGE_TEXT, 'utf8').digest('hex') });
    // Artifact is the model's, and cites exactly that receipt and the host-supplied revision.
    expect(artifact).toMatchObject({ contractVersion: 'research.v1', liveEffects: false, taskId: claim.task.taskId,
      attemptId: claim.task.attemptId, sourceRevisionIds: [revisionId] });
    expect(artifact.evidence[0]).toMatchObject({ inspectionReceiptId: receipts[0]!.receiptId, inspectedAt: receipts[0]!.inspectedAt });
    expect(slice.failed).toEqual([]);
  });

  it('fails a task safely when the model process fails, then handles the next task normally', async () => {
    const slice = await startSlice();
    const bad = claimFor('MODE:exit3');
    slice.claimWith(bad);
    expect(await runResearchWorkerCycle(slice.config)).toEqual({ outcome: 'failed', runId: bad.task.runId, attemptId: bad.task.attemptId, code: 'provider_failure' });
    expect(slice.completed).toEqual([]);
    // The listener keeps its admission guard closed until the child has exited; wait for it to reopen.
    await new Promise((r) => setTimeout(r, 300));
    const good = claimFor('Compare robotics programs');
    slice.claimWith(good);
    expect(await runResearchWorkerCycle(slice.config)).toEqual({ outcome: 'succeeded', runId: good.task.runId, attemptId: good.task.attemptId });
  });

  it('rejects an artifact that cites a receipt the observer never issued', async () => {
    const slice = await startSlice();
    const claim = claimFor('MODE:fabricated');
    slice.claimWith(claim);
    const result = await runResearchWorkerCycle(slice.config);
    expect(result).toEqual({ outcome: 'failed', runId: claim.task.runId, attemptId: claim.task.attemptId, code: 'invalid_contract' });
    expect(slice.completed).toEqual([]);
  });

  it('refuses a task for the wrong tenant before any model run', async () => {
    const slice = await startSlice('20000000-0000-4000-8000-0000000000ee');
    const claim = claimFor('Compare robotics programs');
    slice.claimWith(claim);
    expect(await runResearchWorkerCycle(slice.config)).toEqual({ outcome: 'failed', runId: claim.task.runId, attemptId: claim.task.attemptId, code: 'unauthorized' });
    expect(slice.runs()).toBe(0);
    expect(slice.completed).toEqual([]);
  });

  it('never runs the model twice for one attempt, even when the same claim is delivered again', async () => {
    const slice = await startSlice();
    const claim = claimFor('Compare robotics programs');
    slice.claimWith(claim);
    expect((await runResearchWorkerCycle(slice.config)).outcome).toBe('succeeded');
    slice.claimWith(claim);
    const again = await runResearchWorkerCycle(slice.config);
    expect(again).toEqual({ outcome: 'failed', runId: claim.task.runId, attemptId: claim.task.attemptId, code: 'invalid_contract' });
    expect(slice.runs()).toBe(1);
    expect(slice.completed).toHaveLength(1);
  });
});
