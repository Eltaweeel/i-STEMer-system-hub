// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UsageAllowancePanel } from '../app/[locale]/t/[tenantId]/UsageAllowancePanel';

const tenantId = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const employee = '00000000-0000-4000-8000-000000000003';

const capped = { userId: employee, role: 'operator', limitTokens: 50_000,
  consumedTokens: 12_000, unreportedRuns: 0, remainingTokens: 38_000 };
const uncapped = { userId: owner, role: 'owner', limitTokens: null,
  consumedTokens: 4_000, unreportedRuns: 0, remainingTokens: null };

function summary(members: unknown[], viewerRole = 'owner') {
  return { schemaVersion: 1, tenantId, periodStart: '2026-09-01', viewerId: owner,
    viewerRole, providerBalance: 'unavailable', members };
}

function stubApi(members: unknown[], viewerRole = 'owner') {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      posts.push(JSON.parse(String(options.body)));
      return Response.json({ allowance: {} });
    }
    return Response.json(summary(members, viewerRole));
  });
  return posts;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('lets the owner set a limit for an employee, sending that employee and figure', async () => {
  const posts = stubApi([capped, uncapped]);
  vi.stubGlobal('prompt', () => '25000');
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Change limit' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  // No period is sent: the command derives the window enforcement also reads,
  // so a caller cannot cap a window that is never checked.
  expect(posts[0]).toEqual({ memberUserId: employee, limitTokens: 25_000 });
});

it('offers no limit control to a viewer who is not the owner', async () => {
  const posts = stubApi([capped, uncapped], 'operator');
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  // Both members render, so the figures are matched as a set.
  expect(await screen.findAllByText(/Reported consumption/)).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /limit/i })).toBeNull();
  expect(posts).toHaveLength(0);
});

it('renders an unset limit as unlimited, never as a zero balance', async () => {
  stubApi([uncapped]);
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  await screen.findByText(/no limit set \(unlimited\)/i);
  // The distinction that matters: null means no allowance row for this period,
  // which the submission command treats as unlimited. Showing 0 would read as
  // exhausted and stop work that is in fact uncapped.
  expect(screen.getByText(/not applicable without a limit/i)).toBeTruthy();
  expect(screen.queryByText(/Remaining: 0/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Set a limit' })).toBeTruthy();
});

it('shows the remaining figure for a capped member', async () => {
  stubApi([capped]);
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  await screen.findByText(/Remaining: 38000/);
  expect(screen.getByText(/Limit: 50000/)).toBeTruthy();
  expect(screen.getByText(/Reported consumption: 12000/)).toBeTruthy();
});

it('states that the provider subscription balance is unavailable instead of estimating it', async () => {
  stubApi([capped]);
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  const note = await screen.findByText(/Remaining balance on the provider subscription is not available/i);
  expect(note.textContent).toMatch(/will not be estimated/i);
});

it('warns that a total understates consumption when runs reported no usage', async () => {
  // An unreported run is not a free one, so the total must not be read as complete.
  stubApi([{ ...capped, unreportedRuns: 3 }]);
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  await screen.findByText(/3 run\(s\) returned no usage figure/i);
});

it.each([
  ['a fraction', '1.5'],
  ['zero', '0'],
  ['a negative figure', '-100'],
  ['text', 'lots'],
])('refuses %s without sending a request', async (_name, entered) => {
  const posts = stubApi([capped]);
  vi.stubGlobal('prompt', () => entered);
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Change limit' }));
  await screen.findByText(/must be a positive whole number/i);
  expect(posts).toHaveLength(0);
});

it('sends nothing when the owner cancels the prompt', async () => {
  const posts = stubApi([capped]);
  vi.stubGlobal('prompt', () => null);
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Change limit' }));
  await waitFor(() => expect(posts).toHaveLength(0));
});

it('surfaces a refused allowance write rather than showing it as applied', async () => {
  vi.stubGlobal('prompt', () => '25000');
  vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return Response.json({ error: 'allowance_failed', code: '42501' }, { status: 409 });
    return Response.json(summary([capped]));
  });
  render(<UsageAllowancePanel ar={false} tenantId={tenantId} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Change limit' }));
  const shown = await screen.findByRole('alert');
  // The reason, not the SQLSTATE the route also carries.
  expect(shown.textContent).toMatch(/limit could not be set/i);
  expect(shown.textContent).not.toMatch(/42501/);
  // The old limit stays on screen: a write that was refused must not repaint
  // as though it succeeded.
  expect(screen.getByText(/Limit: 50000/)).toBeTruthy();
});

it('states the unlimited case in Arabic rather than leaving the figure blank', async () => {
  stubApi([uncapped]);
  render(<UsageAllowancePanel ar tenantId={tenantId} />);
  await screen.findByText(/لم يُضبط حد \(غير محدود\)/);
  expect(screen.getByText(/لا ينطبق بدون حد/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ضبط حد' })).toBeTruthy();
});
