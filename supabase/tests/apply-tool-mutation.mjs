// In-memory mutants only: never edits the apply tool or changes its public execution policy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export async function loadApplyToolMutation(kind) {
  const original = readFileSync(new URL('../ops/apply-migration.mjs', import.meta.url), 'utf8');
  let source;
  if (kind === 'allow-unpinned') {
    source = original.replace("throw new MigrationRefused('only the reviewed Phase A or Phase B may be applied; unpinned plans are refused');", 'return null;');
  } else if (kind === 'acl-only') {
    source = original.replace(/export async function quarantineInEffect\(client, gated\) \{[\s\S]*?\n\}/,
      `export async function quarantineInEffect(client, gated) {
        return (await client.query(\`select bool_and(p.oid is not null and not exists (
          select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner)) as ok
          from unnest($1::text[]) f left join pg_proc p on p.oid = to_regprocedure(f)\`, [gated])).rows[0].ok === true;
      }`);
  } else throw new Error(`unknown mutation: ${kind}`);
  assert.notEqual(source, original, 'mutation must change the tested guard');
  source = source.replace("'./sql-scan.mjs'", JSON.stringify(new URL('../ops/sql-scan.mjs', import.meta.url).href));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
