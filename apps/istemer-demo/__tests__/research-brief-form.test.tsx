// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowBriefForm } from '../app/[locale]/t/[tenantId]/WorkflowBriefForm';

const runId = '00000000-0000-4000-8000-000000000001';
const taskId = '00000000-0000-4000-8000-000000000002';
const attemptId = '00000000-0000-4000-8000-000000000003';
const tenantId = '00000000-0000-4000-8000-000000000004';
const revisionId = '00000000-0000-4000-8000-000000000005';
const queued = { contractVersion: 'research.v1', runId, taskId, status: 'queued', attempt: null,
  artifact: null, revisionId: null, liveEffects: false };

beforeEach(() => window.history.replaceState(null, '', '/en/t/example'));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reuses the submission key after a lost response and shows queued rather than completed', async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method !== 'POST') return Response.json(queued);
    requests.push(JSON.parse(String(options.body)));
    if (requests.length === 1) throw new TypeError('Network response lost');
    return Response.json({ accepted: { runId }, liveEffects: false }, { status: 202 });
  });
  render(<WorkflowBriefForm locale="en" />);
  fireEvent.click(screen.getByRole('button', { name: 'Submit brief' }));
  await screen.findByText('Network response lost');
  fireEvent.click(screen.getByRole('button', { name: 'Submit brief' }));
  await screen.findByText('Run status: queued');
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  expect(Object.keys(requests[0]!).sort()).toEqual(['idempotencyKey', 'objective', 'sources']);
  expect(new URL(window.location.href).searchParams.get('researchRun')).toBe(runId);
  expect(screen.queryByText(/waiting for approval/i)).toBeNull();
});

it('reloads the artifact from the API after remount instead of keeping it only in React state', async () => {
  window.history.replaceState(null, '', `?researchRun=${runId}`);
  const artifact = { contractVersion: 'research.v1', runId, taskId, attemptId, tenantId,
    producedBy: 'competitor_analyst', sourceRevisionIds: [revisionId], liveEffects: false, gaps: ['Fixture only'],
    evidence: [{ sourceUrl: 'https://example.org', inspectionReceiptId: revisionId, inspectedAt: '2026-09-16T12:00:00Z',
      observation: 'Fixture observation', interpretation: null, confidence: 'low', gaps: ['No live inspection in this test'] }] };
  vi.stubGlobal('fetch', async () => Response.json({ ...queued, status: 'succeeded', artifact, revisionId }));
  const first = render(<WorkflowBriefForm locale="en" />);
  await screen.findByText('Run status: succeeded');
  expect(screen.getByLabelText('research-artifact').textContent).toContain('Fixture observation');
  first.unmount();
  render(<WorkflowBriefForm locale="en" />);
  await screen.findByText('Run status: succeeded');
  expect(screen.getByLabelText('research-artifact').textContent).toContain(revisionId);
});

it('shows a failed attempt and exposes explicit retry without treating it as success', async () => {
  window.history.replaceState(null, '', `?researchRun=${runId}`);
  let retried = false;
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      expect(JSON.parse(String(options.body))).toEqual({ attemptId }); retried = true;
      return Response.json({ retry: { status: 'retry_requested', runId } }, { status: 202 });
    }
    return Response.json(retried ? queued : { ...queued, status: 'failed', attempt: {
      id: attemptId, state: 'failed', retryable: true, errorCode: 'provider_failure',
    } });
  });
  render(<WorkflowBriefForm locale="en" />);
  await screen.findByText('Run status: failed');
  expect(screen.getByRole('alert').textContent).toBe('provider_failure');
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed attempt' }));
  await screen.findByText('Run status: queued');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry failed attempt' })).toBeNull());
});
