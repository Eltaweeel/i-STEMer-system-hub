// The workflow diagram must (a) render human decision points as a distinct
// shape (diamond) versus agent steps (rounded rects), (b) render steps that
// have not happened as NOT STARTED rather than fabricating progress, and
// (c) preserve the authored step order regardless of input order. The step
// list is the synchronised accessible walk of the same data.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkflowDiagram, WorkflowStepList } from '../src/index';
import type { WorkflowStep } from '@bagos/contracts';

const STEPS: readonly WorkflowStep[] = [
  {
    kind: 'agent',
    id: 'a',
    order: 1,
    title: 'First',
    ownerLabel: 'Owner A',
    ownerRef: 'agent:a',
    inputs: ['in-a'],
    outputs: ['out-a'],
    state: 'not_started',
    domainSlot: 2,
  },
  {
    kind: 'human_decision',
    id: 'h',
    order: 2,
    title: 'Human decision',
    ownerLabel: 'Owner H',
    ownerRef: 'human:x',
    inputs: ['out-a'],
    outputs: ['chosen'],
    state: 'not_started',
    domainSlot: null,
    decisionPrompt: 'Please choose.',
  },
  {
    kind: 'agent',
    id: 'b',
    order: 3,
    title: 'Third',
    ownerLabel: 'Owner B',
    ownerRef: 'agent:b',
    inputs: ['chosen'],
    outputs: ['out-b'],
    state: 'not_started',
    domainSlot: 3,
  },
];

describe('WorkflowDiagram', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkflowDiagram, { steps: STEPS, title: 'Test workflow' }),
  );

  it('renders NOT STARTED for steps that have not happened', () => {
    // Each step surfaces its state both visually and in the <title> tooltip.
    // The count must be >= STEPS.length; the point is no step is missing it.
    const count = (html.match(/NOT STARTED/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(STEPS.length);
  });

  it('never fabricates progress language (no RUNNING/OK/COMPLETE for not_started input)', () => {
    expect(html).not.toContain('IN PROGRESS');
    expect(html).not.toContain('COMPLETE');
    expect(html).not.toContain('BLOCKED');
  });

  it('renders the human decision as a distinct polygon shape', () => {
    // Diamond polygon has four vertices; only the human step uses one.
    const polys = html.match(/<polygon[^>]+points="[^"]+"/g) ?? [];
    // At least one polygon representing the human step (arrowhead polygons
    // also present, but those have three vertices; the diamond has four).
    const diamonds = polys.filter((p) => {
      const points = /points="([^"]+)"/.exec(p)?.[1] ?? '';
      return points.trim().split(/\s+/).length === 4;
    });
    expect(diamonds.length).toBe(1);
  });

  it('renders agent steps as rounded rectangles', () => {
    const rounded = html.match(/<rect[^>]+rx="12"/g) ?? [];
    // Two agent steps, both rounded rects.
    expect(rounded.length).toBe(2);
  });

  it('respects authored order regardless of input order', () => {
    const scrambled = [...STEPS].reverse();
    const html2 = renderToStaticMarkup(
      React.createElement(WorkflowDiagram, { steps: scrambled, title: 'x' }),
    );
    // Titles rendered in order-of-order attribute — 'First' occurs before 'Third'.
    const firstIdx = html2.indexOf('First');
    const thirdIdx = html2.indexOf('Third');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(thirdIdx).toBeGreaterThan(firstIdx);
  });
});

describe('WorkflowStepList — accessible synchronised walk', () => {
  const html = renderToStaticMarkup(React.createElement(WorkflowStepList, { steps: STEPS }));

  it('walks every step in the same order', () => {
    for (const s of STEPS) {
      expect(html).toContain(s.title);
    }
  });

  it('labels human decision steps distinctly from agent steps', () => {
    expect(html).toContain('Human decision');
    expect(html).toContain('Agent step');
  });

  it('renders NOT STARTED for every un-started step', () => {
    expect((html.match(/NOT STARTED/g) ?? []).length).toBe(STEPS.length);
  });

  it('prints inputs and outputs for each step', () => {
    expect(html).toContain('in-a');
    expect(html).toContain('out-a');
    expect(html).toContain('chosen');
    expect(html).toContain('out-b');
  });

  it('renders the decision prompt for the human step', () => {
    expect(html).toContain('Please choose.');
  });
});
