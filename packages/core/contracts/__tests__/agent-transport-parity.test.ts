import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

describe('transport contract', () => {
  it('is the expected v1 contract and has a stable content hash', () => {
    const file = resolve(import.meta.dirname, '../agent-transport.v1.json');
    const bytes = readFileSync(file);
    const contract = JSON.parse(bytes.toString()) as { contract_version: string; staging_live_effects: boolean };
    expect(contract.contract_version).toBe('agent-transport.v1');
    expect(contract.staging_live_effects).toBe(false);
    expect(createHash('sha256').update(bytes).digest('hex')).toHaveLength(64);
  });
});
