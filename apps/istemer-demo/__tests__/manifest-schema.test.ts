// The agent-manifests.json is imported JSON — a trust boundary. Parse it with
// Zod to prove the schema in @bagos/contracts matches the file we ship.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AgentManifestFileSchema } from '@bagos/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(HERE, '..', 'data', 'agents', 'agent-manifests.json');

describe('agent manifest zod schema', () => {
  it('parses the shipped manifest cleanly', () => {
    const raw: unknown = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const result = AgentManifestFileSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Manifest failed schema: ${result.error.message}`);
    }
    expect(result.data.agents.length).toBe(37);
  });

  it('rejects a manifest with a missing required field', () => {
    const broken = { schema_version: '1.0.0' };
    const result = AgentManifestFileSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });
});
