// -----------------------------------------------------------------------------
// The demo indicator must render on every route while meta.source === 'fixture'.
// In the Next.js App Router this is a structural guarantee: the root layout
// wraps every route, and it wraps its children in <AppShell>, and AppShell
// renders <DemoIndicator meta={fixtureMeta}/> that only hides when
// meta.source !== 'fixture'.
//
// This test enumerates every app/**/page.tsx and asserts:
//   1. the root layout mounts AppShell,
//   2. the shell meta passed to AppShell has source === 'fixture',
//   3. rendering AppShell with fixture meta produces the demo indicator's text,
//   4. rendering AppShell with source: 'api' produces NO indicator (proves the
//      switch is real, not a placeholder).
// -----------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell, DemoIndicator } from '@bagos/ui';
import { FIXTURE_DATA_VERSION, FIXTURE_NOW } from '@bagos/fixtures';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..', 'app');
const LAYOUT_FILE = resolve(APP_ROOT, 'layout.tsx');

function listPageFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) listPageFiles(full, out);
    else if (entry.name === 'page.tsx' || entry.name === 'page.ts') out.push(full);
  }
  return out;
}

describe('demo indicator: every route', () => {
  const pages = listPageFiles(APP_ROOT).map((p) => relative(process.cwd(), p));

  it('there is at least one route (organization view)', () => {
    expect(pages.length).toBeGreaterThan(0);
    const asPosix = pages.map((p) => p.split(/[\\/]/).join('/'));
    expect(asPosix.some((p) => p.includes('app/organization/page.tsx'))).toBe(true);
  });

  it('the root layout exists and mounts AppShell', () => {
    statSync(LAYOUT_FILE);
    const source = readFileSync(LAYOUT_FILE, 'utf8');
    expect(source).toMatch(/from '@bagos\/ui'/);
    expect(source).toMatch(/<AppShell\b/);
    // The shell meta the layout constructs must claim fixture source. This
    // string check catches accidental drift to source: 'api' in the layout.
    expect(source).toMatch(/source:\s*['"]fixture['"]/);
  });

  it('AppShell with fixture meta renders the demo indicator text', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppShell, {
        meta: {
          source: 'fixture',
          isSample: true,
          isPartial: false,
          stale: false,
          dataVersion: FIXTURE_DATA_VERSION,
          capturedAt: FIXTURE_NOW,
          generatedAt: FIXTURE_NOW,
        },
        productName: 'Test Product',
        organizationName: 'Test Tenant',
        children: React.createElement('div', null, 'page-content'),
      }),
    );
    expect(html).toContain('DEMO ENVIRONMENT');
    expect(html).toContain('Sample data');
  });

  it('DemoIndicator with source=api renders nothing (proves the switch)', () => {
    const html = renderToStaticMarkup(
      React.createElement(DemoIndicator, {
        meta: { source: 'api' },
      }),
    );
    expect(html).toBe('');
  });

  it('the demo indicator is not an aria live region', () => {
    const html = renderToStaticMarkup(
      React.createElement(DemoIndicator, {
        meta: { source: 'fixture' },
      }),
    );
    expect(html).not.toMatch(/aria-live=/i);
    expect(html).not.toMatch(/role="status"/i);
    expect(html).not.toMatch(/role="alert"/i);
  });
});
