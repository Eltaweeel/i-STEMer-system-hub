// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandPalette } from '../src/components/CommandPalette';

const ROUTES = [
  { href: '/', label: 'Command center' },
  { href: '/agents/', label: 'Agents' },
  { href: '/system-health/', label: 'System health' },
] as const;

afterEach(cleanup);

describe('CommandPalette', () => {
  it('opens from Ctrl+K, filters routes, closes on Escape, and restores trigger focus', async () => {
    render(<CommandPalette items={ROUTES} />);
    const trigger = screen.getByRole('button', { name: /Search/ });
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    const input = screen.getByPlaceholderText('Search routes');
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: 'health' } });
    expect(screen.getByRole('option', { name: 'System health' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Agents' })).toBeNull();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('moves the active route with arrow keys and traps Tab focus', async () => {
    render(<CommandPalette items={ROUTES} />);
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    const input = screen.getByPlaceholderText('Search routes');
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Agents' }).getAttribute('aria-selected')).toBe('true');

    const links = screen.getAllByRole('link');
    const last = links[links.length - 1];
    if (!last) throw new Error('Expected at least one palette link.');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
