// The Restriction type is prohibited from carrying an action. We assert:
//   - the exported keys are exactly { id, label, reason }
//   - there is no href, onActivate, or action field surfaced.
// A future edit that adds a handler will break this test.

import { describe, expect, it } from 'vitest';
import { makeRestriction, type Restriction } from '../src/index';

describe('Restriction is content, not a control', () => {
  it('only exposes id, label, reason', () => {
    const r: Restriction = makeRestriction({
      id: 'x',
      label: 'send_external_message',
      reason: 'declared prohibited',
    });
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(['id', 'label', 'reason']);
  });

  it('has no handler-like properties', () => {
    const r: Restriction = makeRestriction({ id: 'x', label: 'l', reason: 'r' });
    // Access via `as unknown as` guarantees we're probing runtime shape, not
    // asserting the type does have these fields.
    const asRecord = r as unknown as Record<string, unknown>;
    expect(asRecord['onActivate']).toBeUndefined();
    expect(asRecord['href']).toBeUndefined();
    expect(asRecord['action']).toBeUndefined();
    expect(asRecord['onClick']).toBeUndefined();
  });
});
