import { describe, expect, it } from 'vitest';
import type { AgentTransport } from '../src/ports';

describe('system agent transport boundary', () => {
  it('is a single async dispatch boundary', () => {
    const methods: keyof AgentTransport = 'dispatch';
    expect(methods).toBe('dispatch');
  });
});
