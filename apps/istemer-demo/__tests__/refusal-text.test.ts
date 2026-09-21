import { describe, expect, it } from 'vitest';
import { refusalText } from '../lib/workflow/refusal-text';

describe('refusalText', () => {
  it('prefers the named reason over the SQLSTATE that accompanies it', () => {
    // The defect this module exists to fix: `code` is present on every error
    // body, so reading it first made the named reason dead code.
    const shown = refusalText(false, { error: 'strategy_not_approved', code: '55000' }, 'decision_failed');
    expect(shown).toMatch(/Approve the calendar first/);
    expect(shown).not.toMatch(/55000/);
  });

  it('separates two refusals that share one SQLSTATE', () => {
    const lost = refusalText(false, { error: 'strategy_not_approved', code: '55000' }, 'decision_failed');
    const settled = refusalText(false, { error: 'approval_is_not_pending', code: '55000' }, 'decision_failed');
    expect(lost).not.toEqual(settled);
  });

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__proto__'])(
    'returns a usable string for the inherited property name %s', (name) => {
      // MESSAGES inherits from Object.prototype, so a plain truthiness test on
      // the lookup finds an inherited function here, reads .en off it, and
      // returns undefined -- a blank line where a refusal belongs.
      const shown = refusalText(false, { error: name, code: '23514' }, 'decision_failed');
      expect(typeof shown).toBe('string');
      expect(shown).not.toBe('');
      expect(shown).toContain(name);
      expect(shown).toContain('23514');
    });

  it.each([
    ['a null body', null],
    ['a string body', 'boom'],
    ['an array body', []],
    ['an error that is not a string', { error: 500 }],
    ['an empty error', { error: '' }],
  ])('falls back to the caller-supplied reason for %s', (_name, body) => {
    expect(refusalText(false, body, 'decision_failed')).toBe('The decision could not be recorded.');
  });

  it('keeps an unrecognised reason and its code rather than flattening them', () => {
    // A refusal nobody anticipated is still something the reader should be able
    // to report accurately.
    expect(refusalText(false, { error: 'some_new_reason', code: '23514' }, 'decision_failed'))
      .toBe('some_new_reason (23514)');
  });

  it('omits a code that is not a usable string instead of printing undefined', () => {
    expect(refusalText(false, { error: 'some_new_reason', code: 42 }, 'decision_failed')).toBe('some_new_reason');
  });

  it('answers in Arabic when asked, for every message it knows', () => {
    // A guard that held in only one language would fail the reader who needs
    // it, so the two are checked as a pair rather than one at a time.
    for (const reason of ['strategy_not_approved', 'approval_is_not_pending', 'owner_access_required',
      'persistence_not_configured', 'allowance_failed', 'decision_failed', 'package_failed']) {
      const arabic = refusalText(true, { error: reason, code: '55000' }, 'decision_failed');
      const english = refusalText(false, { error: reason, code: '55000' }, 'decision_failed');
      expect(arabic).not.toBe(english);
      expect(arabic).toMatch(/[؀-ۿ]/);
      expect(english).not.toMatch(/[؀-ۿ]/);
      expect(arabic).not.toMatch(/55000/);
    }
  });

  it('names the same action in both languages where it tells the owner what to do', () => {
    // These two diverged: the English said "approve the calendar", the Arabic
    // said "review" it. An owner reading Arabic was sent to look rather than to
    // act, for the most common refusal in the whole flow.
    for (const reason of ['strategy_not_approved', 'strategy_approval_missing']) {
      expect(refusalText(true, { error: reason }, 'decision_failed')).toMatch(/اعتمد التقويم/);
      expect(refusalText(false, { error: reason }, 'decision_failed')).toMatch(/Approve the calendar/);
    }
  });
});
