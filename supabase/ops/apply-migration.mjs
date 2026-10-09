#!/usr/bin/env node
// Applies ONE reviewed migration file and records its exact version in supabase_migrations.schema_migrations, in a
// single transaction: either the migration and its ledger row both commit, or neither does. It exists because the
// Omar migration is applied before six older pending ones, which `supabase db push` would either apply together or
// refuse as out-of-order history. It never chooses what to apply: the operator names one file and its SHA-256.
//
// Refuses (and rolls back) when: the file's SHA-256 differs from the reviewed one; the file is not a single
// begin;...commit; transaction; the version is already recorded; a version it requires is not recorded; the ledger
// table has an unexpected shape; any statement raises a WARNING (a skipped GRANT/REVOKE is reported as a WARNING by
// PostgreSQL, which would otherwise leave privileges silently wrong); or the body ended the transaction itself (detected
// after the fact: whatever it committed stays, but no ledger row is written). --rehearse runs everything, then rolls back.
//
// Usage (operator, on the VPS):
//   node apply-migration.mjs --database-url-file /abs/path --file /abs/path/<version>_<name>.sql \
//     --sha256 <hex> [--require-present v1,v2] [--rehearse]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

const FILE_NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export class MigrationRefused extends Error {}

/** Checks the reviewed digest and the begin;/commit; envelope, and returns the statements between them. */
export function prepareMigration({ fileName, text, expectedSha256 }) {
  const match = FILE_NAME.exec(fileName);
  if (!match) throw new MigrationRefused('file name must be <14-digit version>_<name>.sql');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 ?? '') || sha256 !== expectedSha256) {
    throw new MigrationRefused(`sha256 mismatch: file is ${sha256}`);
  }
  if (text.includes('\r')) throw new MigrationRefused('file must use LF line endings, as reviewed');
  const lines = text.split('\n');
  const begins = lines.flatMap((line, index) => (line === 'begin;' ? [index] : []));
  const commits = lines.flatMap((line, index) => (line === 'commit;' ? [index] : []));
  if (begins.length !== 1 || commits.length !== 1) throw new MigrationRefused('file must hold exactly one top-level begin; and commit;');
  const isFiller = (line) => line.trim() === '' || line.trimStart().startsWith('--');
  if (!lines.slice(0, begins[0]).every(isFiller) || !lines.slice(commits[0] + 1).every(isFiller) || begins[0] > commits[0]) {
    throw new MigrationRefused('only comments may surround the begin;...commit; block');
  }
  return { version: match[1], name: match[2], sha256, body: lines.slice(begins[0] + 1, commits[0]).join('\n') };
}

const LEDGER = 'supabase_migrations.schema_migrations';

/** Runs the prepared migration and its ledger row in one transaction on an open client. Never commits on a WARNING. */
export async function applyMigration(client, prepared, { requirePresent = [], rehearse = false } = {}) {
  const warnings = [];
  const onNotice = (notice) => { if (notice.severity === 'WARNING') warnings.push(notice.message); };
  client.on('notice', onNotice);
  await client.query('begin');
  try {
    await client.query("set local lock_timeout = '10s'");
    const columns = (await client.query(`select column_name, is_nullable, column_default from information_schema.columns
      where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'`)).rows;
    const names = new Set(columns.map((c) => c.column_name));
    const unknownRequired = columns.filter((c) => !['version', 'name', 'statements'].includes(c.column_name)
      && c.is_nullable === 'NO' && c.column_default === null);
    if (!['version', 'name', 'statements'].every((c) => names.has(c)) || unknownRequired.length) {
      throw new MigrationRefused('ledger table does not have the expected shape');
    }
    // Serialises against a concurrent CLI push or a second operator.
    await client.query(`lock table ${LEDGER} in share row exclusive mode`);
    const recorded = new Set((await client.query(`select version from ${LEDGER}`)).rows.map((r) => r.version));
    if (recorded.has(prepared.version)) throw new MigrationRefused(`version ${prepared.version} is already recorded`);
    const missing = requirePresent.filter((v) => !recorded.has(v));
    if (missing.length) throw new MigrationRefused(`required versions not recorded: ${missing.join(',')}`);
    const xid = (await client.query('select txid_current() as x')).rows[0].x;
    await client.query(prepared.body);
    // A top-level COMMIT/END/ROLLBACK inside the body would end this transaction early, after which the ledger row
    // would be written separately. That cannot be undone here; detect it, write no ledger row, and stop loudly.
    if ((await client.query('select txid_current() as x')).rows[0].x !== xid) {
      throw new MigrationRefused('migration body ended its own transaction: ledger NOT written; inspect the database before anything else');
    }
    if (warnings.length) throw new MigrationRefused(`migration raised WARNING: ${warnings.join(' | ')}`);
    await client.query(`insert into ${LEDGER}(version, name, statements) values ($1, $2, $3)`,
      [prepared.version, prepared.name, [prepared.body]]);
    if (rehearse) { await client.query('rollback'); return { version: prepared.version, committed: false }; }
    await client.query('commit');
    return { version: prepared.version, committed: true };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.off('notice', onNotice);
  }
}

/** Same rule as the research worker: verify-full only, and no repeated parameter the driver would read differently. */
export function assertVerifiedTls(connectionString) {
  let params;
  try { params = new URL(connectionString).searchParams; } catch { throw new MigrationRefused('database url file does not hold a URL'); }
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || params.has('ssl') || params.get('sslmode') !== 'verify-full') {
    throw new MigrationRefused('database url must set sslmode=verify-full once (with sslrootcert), and no ssl= parameter');
  }
}

function parseArgs(argv) {
  const out = { requirePresent: [], rehearse: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--rehearse') { out.rehearse = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new MigrationRefused(`${flag} needs a value`);
    i += 1;
    if (flag === '--database-url-file') out.databaseUrlFile = value;
    else if (flag === '--file') out.file = value;
    else if (flag === '--sha256') out.sha256 = value;
    else if (flag === '--require-present') out.requirePresent = value.split(',').filter(Boolean);
    else throw new MigrationRefused(`unknown option ${flag}`);
  }
  for (const key of ['databaseUrlFile', 'file', 'sha256']) if (!out[key]) throw new MigrationRefused(`missing --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  if (!isAbsolute(out.databaseUrlFile) || !isAbsolute(out.file)) throw new MigrationRefused('paths must be absolute');
  if (!out.requirePresent.every((v) => /^\d{14}$/.test(v))) throw new MigrationRefused('--require-present takes 14-digit versions');
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prepared = prepareMigration({ fileName: basename(args.file), text: readFileSync(args.file, 'utf8'), expectedSha256: args.sha256 });
  const connectionString = readFileSync(args.databaseUrlFile, 'utf8').trim();
  assertVerifiedTls(connectionString);
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString, application_name: 'istemer-apply-migration' });
  await client.connect();
  try {
    const result = await applyMigration(client, prepared, args);
    process.stdout.write(`${JSON.stringify({ ...result, name: prepared.name, sha256: prepared.sha256 })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((error) => {
    // Never the connection string: a refusal names its rule; anything else is reported by SQLSTATE/errno only.
    process.stderr.write(`${error instanceof MigrationRefused ? error.message : `failed (${error?.code ?? 'unknown'})`}\n`);
    process.exit(1);
  });
}
