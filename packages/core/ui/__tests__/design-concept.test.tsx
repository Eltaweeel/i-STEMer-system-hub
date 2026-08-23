// The three design concepts must be visually distinguishable. Each variant
// carries a distinct SVG geometry — circles for orbit, rects for grid, path
// curves for ribbon. The presenter also emits data-concept-variant so the
// DOM shows the choice explicitly. Concepts are built from tokens only —
// no external assets, no photographs, no data: URLs.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignConceptCard } from '../src/index';
import type { DesignConcept } from '@bagos/contracts';

function make(variant: DesignConcept['variant'], id: string, label: string): DesignConcept {
  return {
    id,
    label,
    variant,
    domainSlot: 4,
    rationale: `Rationale for ${variant}`,
    slogan: label.toUpperCase(),
    altText: `Test alt text for ${label}`,
  };
}

const ORBIT = make('orbit', 'concept:orbit', 'orbit');
const GRID = make('grid', 'concept:grid', 'grid');
const RIBBON = make('ribbon', 'concept:ribbon', 'ribbon');

describe('DesignConceptCard renders three distinguishable variants', () => {
  const orbit = renderToStaticMarkup(React.createElement(DesignConceptCard, { concept: ORBIT }));
  const grid = renderToStaticMarkup(React.createElement(DesignConceptCard, { concept: GRID }));
  const ribbon = renderToStaticMarkup(React.createElement(DesignConceptCard, { concept: RIBBON }));

  it('emits data-concept-variant matching each variant', () => {
    expect(orbit).toContain('data-concept-variant="orbit"');
    expect(grid).toContain('data-concept-variant="grid"');
    expect(ribbon).toContain('data-concept-variant="ribbon"');
  });

  it('emits geometry that differs between variants', () => {
    // orbit relies on circles; grid on rects; ribbon on path curves.
    const orbitCircles = (orbit.match(/<circle/g) ?? []).length;
    const gridRects = (grid.match(/<rect/g) ?? []).length;
    const ribbonPaths = (ribbon.match(/<path/g) ?? []).length;
    expect(orbitCircles).toBeGreaterThan(3);
    expect(gridRects).toBeGreaterThan(6);
    expect(ribbonPaths).toBeGreaterThanOrEqual(3);
    // and they are actually distinct outputs — same-length identical strings
    // would be a red flag.
    expect(orbit).not.toEqual(grid);
    expect(grid).not.toEqual(ribbon);
    expect(orbit).not.toEqual(ribbon);
  });

  it('is deterministic — rendering the same input twice yields identical output', () => {
    const again = renderToStaticMarkup(React.createElement(DesignConceptCard, { concept: ORBIT }));
    expect(again).toEqual(orbit);
  });

  it('renders alt text on the img-role SVG', () => {
    expect(orbit).toContain('Test alt text for orbit');
    expect(grid).toContain('Test alt text for grid');
    expect(ribbon).toContain('Test alt text for ribbon');
  });

  it('uses no external assets — no image, no url(), no data:, no http', () => {
    for (const html of [orbit, grid, ribbon]) {
      expect(html).not.toMatch(/<img\b/i);
      expect(html).not.toMatch(/url\s*\(/i);
      expect(html).not.toMatch(/data:image/i);
      expect(html).not.toMatch(/https?:\/\//i);
    }
  });

  it('scopes the composition with data-domain-slot so tokens resolve', () => {
    expect(orbit).toContain('data-domain-slot="4"');
  });
});
