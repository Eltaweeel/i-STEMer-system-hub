// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApprovalsPanel } from '../app/[locale]/t/[tenantId]/ApprovalsPanel';

const tenantId = '00000000-0000-4000-8000-000000000001';
const approvalId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';

const row = {
  approvalId, stage: 'finished_post' as const, status: 'pending' as const,
  artifactRevisionId: revisionId, contentDigest: 'a'.repeat(64), revision: 1,
  createdAt: '2026-09-21T10:00:00Z',
  finishedPost: { dayIndex: 2, caption: 'The real post body', assetKind: 'supplied' as const,
    platform: 'instagram', accountLabel: 'i_stemers' },
};

function payload(approvals: unknown[], canDecide = true) {
  return { schemaVersion: 1, tenantId, viewerRole: canDecide ? 'owner' : 'operator', canDecide, approvals };
}

/** Serves the list, and records every decision POST so a test can assert that
 *  no decision was sent at all -- the assertion that matters for a control the
 *  panel should never have offered. */
function stubApi(approvals: unknown[], canDecide = true) {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      posts.push(JSON.parse(String(options.body)));
      return Response.json({ approval: {}, decision: 'approve', externalPublication: false });
    }
    return Response.json(payload(approvals, canDecide));
  });
  return posts;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('offers no decision at all for a finished post whose detail did not arrive', async () => {
  // The app deployed ahead of its migration: the row exists, the content does not.
  const posts = stubApi([{ ...row, finishedPost: undefined }]);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  await screen.findByText(/could not be shown in full/i);
  // Not merely disabled -- absent. A disabled control still tells the owner a
  // decision is available here, and disabled state is one prop away from gone.
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  expect(posts).toHaveLength(0);
});

it('treats an explicit null detail the same as a missing one', async () => {
  // nullable and optional are different types but the same predicament.
  stubApi([{ ...row, finishedPost: null }]);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  await screen.findByText(/could not be shown in full/i);
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it('shows the caption and the asset state before offering the decision', async () => {
  stubApi([row]);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  await screen.findByRole('button', { name: 'Approve' });
  expect(screen.getByText(/The real post body/)).toBeTruthy();
  expect(screen.getByText(/Asset: supplied and produced/)).toBeTruthy();
  // Day 2 is the third day; the panel counts from one for the reader.
  expect(screen.getByText(/Day: 3/)).toBeTruthy();
});

it('raises a placeholder asset as an alert while still allowing the decision', async () => {
  // A placeholder is decidable -- the owner may legitimately approve copy before
  // the graphic exists -- but they must not be able to mistake it for finished.
  stubApi([{ ...row, finishedPost: { ...row.finishedPost, assetKind: 'placeholder' } }]);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/placeholder only/i);
  expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
});

it('binds the decision to the digest of the revision on screen', async () => {
  const posts = stubApi([row]);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({ tenantId, approvalId, contentDigest: row.contentDigest, decision: 'approve' });
});

it('sends no rejection when the reason is cancelled', async () => {
  const posts = stubApi([row]);
  vi.stubGlobal('prompt', () => null);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
  // A rejection with no stated reason is not a decision anyone can act on, and
  // an empty one would be refused by the command anyway.
  await waitFor(() => expect(posts).toHaveLength(0));
});

it('offers nothing to a viewer who cannot decide, and says why', async () => {
  const posts = stubApi([row], false);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  await screen.findByText(/Only the organization owner can decide/i);
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  expect(posts).toHaveLength(0);
});

it('offers no decision on a row a newer revision has invalidated', async () => {
  stubApi([{ ...row, status: 'invalidated' }]);
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/invalidated by a newer revision/i);
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it('explains a refused decision instead of showing the shared SQLSTATE', async () => {
  // Faithful to what the route actually returns: `code` is the Postgres
  // SQLSTATE and is present on EVERY error body. An earlier fixture omitted it
  // and so proved nothing -- the panel read `code` before `error`, and the
  // named reason it was supposed to surface was dead code.
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      return Response.json({ error: 'strategy_not_approved', code: '55000' }, { status: 409 });
    }
    return Response.json(payload([row]));
  });
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  const shown = await screen.findByRole('alert');
  expect(shown.textContent).toMatch(/no longer carry a valid approval/i);
  // The five digits say nothing: a lost calendar approval and an item someone
  // else already decided both raise 55000.
  expect(shown.textContent).not.toMatch(/55000/);
});

it('distinguishes two refusals that share one SQLSTATE', async () => {
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      return Response.json({ error: 'approval_is_not_pending', code: '55000' }, { status: 409 });
    }
    return Response.json(payload([row]));
  });
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  const shown = await screen.findByRole('alert');
  expect(shown.textContent).toMatch(/already recorded/i);
});

it('shows an unrecognised refusal as it arrived rather than flattening it', async () => {
  // A refusal nobody anticipated is still something the reader should be able
  // to report accurately, so it is never swallowed into a generic failure.
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return Response.json({ error: 'some_new_reason', code: '23514' }, { status: 409 });
    return Response.json(payload([row]));
  });
  render(<ApprovalsPanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  const shown = await screen.findByRole('alert');
  expect(shown.textContent).toContain('some_new_reason');
  expect(shown.textContent).toContain('23514');
});

it('explains a refused decision in Arabic too', async () => {
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      return Response.json({ error: 'strategy_not_approved', code: '55000' }, { status: 409 });
    }
    return Response.json(payload([row]));
  });
  render(<ApprovalsPanel ar tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'موافقة' }));
  const shown = await screen.findByRole('alert');
  expect(shown.textContent).toMatch(/لم تعد الاستراتيجية والتقويم يحملان موافقة سارية/);
  expect(shown.textContent).not.toMatch(/55000/);
});

it('states the undecidable case in Arabic too, with the controls equally absent', async () => {
  stubApi([{ ...row, finishedPost: undefined }]);
  render(<ApprovalsPanel ar tenantId={tenantId} />);
  await screen.findByText(/تفاصيل المنشور غير متاحة/);
  expect(screen.queryByRole('button', { name: 'موافقة' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});
