#!/usr/bin/env node
// Applies reviewed migration files and records each exact version in supabase_migrations.schema_migrations, all in ONE
// transaction: either every listed migration, its ledger row and the post-check commit together, or nothing does. It
// never chooses what to apply: the operator names each file and its reviewed SHA-256, in order.
//
// One file (Phase A) or several (Phase B). Several files in one transaction is the Phase B access gate: no other session
// can ever see an intermediate state between them (PostgreSQL's own transaction isolation), and if this process or its
// connection dies the server rolls everything back, so the ledger holds all of the batch or none of it.
//
// Refuses, and leaves nothing behind, when:
// - a file's SHA-256 differs from the reviewed one, or it is not exactly one top-level begin;...commit; transaction, or
//   its body holds top-level transaction control (COMMIT, END, ROLLBACK, ABORT, BEGIN, SAVEPOINT, ...), which is checked
//   by a SQL-aware scan BEFORE anything runs, so --rehearse cannot commit;
// - a version is already recorded, or a --require-present version is not, or the batch is not in ascending order;
// - the ledger table's columns, types or version uniqueness differ from the CLI's, or it carries triggers or rules;
// - the inserted ledger row cannot be read back exactly as written;
// - the post-check raises, or ANY statement (migration, ledger write or post-check) raises a WARNING, which is how
//   PostgreSQL reports a GRANT/REVOKE it silently skipped;
// - WARNINGs do not reach this client (proved with a probe first).
// Connection: the URL is parsed here, never handed to the driver. Only postgres:/postgresql: over TCP to a DNS host,
// with exactly sslmode=verify-full and an absolute sslrootcert; the driver receives an explicit TLS configuration
// (that CA only, certificate and hostname verified). On POSIX the URL file must be private to the operator.
//
// Usage (operator, on the VPS):
//   node apply-migration.mjs --database-url-file /abs/url --file /abs/<version>_<name>.sql --sha256 <hex> \
//     [--file ... --sha256 ...]... [--require-present v1,v2] [--postcheck /abs/check.sql --postcheck-sha256 <hex>] [--rehearse]
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { assertNoTransactionControl, SqlScanError } from './sql-scan.mjs';

const FILE_NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const LEDGER = 'supabase_migrations.schema_migrations';
// The two reviewed plans. Their versions can only be applied as written here: Phase B as one batch of all six (never
// one at a time, never a subset), and each with its own reviewed post-check.
export const PHASE_A = { versions: ['20261008120000'], postcheck: 'phase-a-postcheck.sql' };
export const PHASE_B = {
  versions: ['20260921090000', '20260921100000', '20260921110000', '20260921120000', '20260921130000', '20260921140000'],
  postcheck: 'phase-b-postcheck.sql',
};

/** Refuses any batch that touches a reviewed plan's versions without being exactly that plan. */
export function assertPlan(versions, postcheck) {
  for (const plan of [PHASE_A, PHASE_B]) {
    if (!versions.some((v) => plan.versions.includes(v))) continue;
    if (versions.length !== plan.versions.length || versions.some((v, i) => v !== plan.versions[i])) {
      throw new MigrationRefused(`versions ${plan.versions.join(',')} can only be applied together, exactly and in that order`);
    }
    if (postcheck?.fileName !== plan.postcheck) throw new MigrationRefused(`this plan requires its post-check ${plan.postcheck}`);
  }
}

// What a migration run must leave exactly as it found it: the runner's role memberships (temporary windows must be
// closed) and which bagos_* roles may create objects in schema private.
const AUTHORITY_SNAPSHOT = `select coalesce(jsonb_agg(row_to_json(m) order by m.role, m.grantor), '[]'::jsonb) as members,
    (select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb) from pg_roles r
       where r.rolname like 'bagos\\_%' and has_schema_privilege(r.oid, 'private', 'CREATE')) as creators
  from (select r.rolname as role, pg_get_userbyid(a.grantor) as grantor, a.admin_option, a.inherit_option, a.set_option
        from pg_auth_members a join pg_roles r on r.oid = a.roleid where a.member = (select oid from pg_roles where rolname = current_user)) m`;

export class MigrationRefused extends Error {}

const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
function checkDigest(text, expectedSha256) {
  const sha256 = digest(text);
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 ?? '') || sha256 !== expectedSha256) throw new MigrationRefused(`sha256 mismatch: file is ${sha256}`);
  if (text.includes('\r')) throw new MigrationRefused('file must use LF line endings, as reviewed');
  return sha256;
}
function scan(sql, what) {
  try { return assertNoTransactionControl(sql); } catch (error) {
    if (error instanceof SqlScanError) throw new MigrationRefused(`${what}: ${error.message}`);
    throw error;
  }
}

/** Checks the reviewed digest, the begin;/commit; envelope and the absence of inner transaction control. */
export function prepareMigration({ fileName, text, expectedSha256 }) {
  const match = FILE_NAME.exec(fileName);
  if (!match) throw new MigrationRefused('file name must be <14-digit version>_<name>.sql');
  const sha256 = checkDigest(text, expectedSha256);
  const lines = text.split('\n');
  const begins = lines.flatMap((line, index) => (line === 'begin;' ? [index] : []));
  const commits = lines.flatMap((line, index) => (line === 'commit;' ? [index] : []));
  if (begins.length !== 1 || commits.length !== 1) throw new MigrationRefused('file must hold exactly one top-level begin; and commit;');
  const isFiller = (line) => line.trim() === '' || line.trimStart().startsWith('--');
  if (!lines.slice(0, begins[0]).every(isFiller) || !lines.slice(commits[0] + 1).every(isFiller) || begins[0] > commits[0]) {
    throw new MigrationRefused('only comments may surround the begin;...commit; block');
  }
  const body = lines.slice(begins[0] + 1, commits[0]).join('\n');
  const statements = scan(body, fileName);
  if (statements.length === 0) throw new MigrationRefused(`${fileName}: empty migration`);
  return { version: match[1], name: match[2], sha256, text, body };
}

/** A reviewed post-check: assertions only, no envelope, no transaction control. */
export function preparePostcheck({ fileName, text, expectedSha256 }) {
  const sha256 = checkDigest(text, expectedSha256);
  if (scan(text, fileName).length === 0) throw new MigrationRefused(`${fileName}: empty post-check`);
  return { fileName, sha256, text };
}

async function checkLedgerShape(client) {
  const columns = (await client.query(`select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'`)).rows;
  const byName = new Map(columns.map((c) => [c.column_name, c]));
  const isText = (c) => c && c.data_type === 'text';
  if (!isText(byName.get('version')) || !isText(byName.get('name'))
    || byName.get('statements')?.data_type !== 'ARRAY' || byName.get('statements')?.udt_name !== '_text') {
    throw new MigrationRefused('ledger table columns are not version text, name text, statements text[]');
  }
  if (columns.some((c) => !['version', 'name', 'statements'].includes(c.column_name) && c.is_nullable === 'NO' && c.column_default === null)) {
    throw new MigrationRefused('ledger table has another required column');
  }
  const uniqueVersion = (await client.query(`select exists (select 1 from pg_index i join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = '${LEDGER}'::regclass and i.indisunique and i.indnkeyatts = 1 and a.attname = 'version'
      and i.indpred is null) as ok`)).rows[0].ok;
  if (!uniqueVersion) throw new MigrationRefused('ledger version is not unique');
  const hooks = (await client.query(`select
      (select count(*) from pg_trigger where tgrelid = '${LEDGER}'::regclass and not tgisinternal)::int as triggers,
      (select count(*) from pg_rewrite where ev_class = '${LEDGER}'::regclass and rulename <> '_RETURN')::int as rules`)).rows[0];
  if (hooks.triggers || hooks.rules) throw new MigrationRefused('ledger table has triggers or rules; refusing to write through them');
}

/**
 * Runs every prepared migration, its ledger row and the optional post-check in ONE transaction on an open client.
 * Returns { versions, committed }. Commits only when nothing raised and no WARNING arrived at any point.
 */
export async function applyMigrations(client, preparedList, { requirePresent = [], rehearse = false, postcheck = null } = {}) {
  if (!Array.isArray(preparedList) || preparedList.length === 0) throw new MigrationRefused('nothing to apply');
  const versions = preparedList.map((p) => p.version);
  if (!versions.every((v, i) => i === 0 || versions[i - 1] < v)) throw new MigrationRefused('files must be given in ascending version order');
  assertPlan(versions, postcheck);
  const warnings = [];
  const onNotice = (notice) => { if (notice.severity === 'WARNING') warnings.push(notice.message); };
  const assertNoWarnings = (stage) => {
    if (warnings.length) throw new MigrationRefused(`${stage} raised WARNING: ${warnings.join(' | ')}`);
  };
  client.on('notice', onNotice);
  await client.query('begin');
  try {
    await client.query("set local lock_timeout = '10s'");
    await client.query("set local statement_timeout = '120s'");
    // The WARNING gate only works if WARNINGs reach this client: a role, database or proxy setting could silence them,
    // so force the level and prove the channel with a probe before running anything.
    await client.query('set local client_min_messages = warning');
    await client.query("do $probe$ begin raise warning 'apply-migration-probe'; end $probe$");
    if (warnings.length !== 1 || warnings[0] !== 'apply-migration-probe') {
      throw new MigrationRefused('WARNING notices do not reach this client; refusing to run without the WARNING gate');
    }
    warnings.length = 0;
    await checkLedgerShape(client);
    // Serialises against a concurrent CLI push or a second operator.
    await client.query(`lock table ${LEDGER} in share row exclusive mode`);
    const recorded = new Set((await client.query(`select version from ${LEDGER}`)).rows.map((r) => r.version));
    const already = versions.filter((v) => recorded.has(v));
    if (already.length) throw new MigrationRefused(`already recorded: ${already.join(',')}`);
    const missing = requirePresent.filter((v) => !recorded.has(v));
    if (missing.length) throw new MigrationRefused(`required versions not recorded: ${missing.join(',')}`);
    const xid = (await client.query('select txid_current() as x')).rows[0].x;
    const sameTransaction = async (stage) => {
      // Defence in depth: the scan already refused transaction control, so this must still be the transaction we opened.
      if ((await client.query('select txid_current() as x')).rows[0].x !== xid) {
        throw new MigrationRefused(`the transaction changed during ${stage}; inspect the database before anything else`);
      }
    };
    const authorityBefore = (await client.query(AUTHORITY_SNAPSHOT)).rows[0];
    for (const prepared of preparedList) {
      await client.query(prepared.body);
      await sameTransaction(prepared.version);
      assertNoWarnings(prepared.version);
      // The whole reviewed file, so the ledger row reproduces exactly what was reviewed (and its digest).
      const inserted = await client.query(`insert into ${LEDGER}(version, name, statements) values ($1, $2, $3)
        returning version, name, statements`, [prepared.version, prepared.name, [prepared.text]]);
      const readBack = await client.query(`select version, name, statements from ${LEDGER} where version = $1`, [prepared.version]);
      const exact = (rows) => rows.length === 1 && rows[0].version === prepared.version && rows[0].name === prepared.name
        && Array.isArray(rows[0].statements) && rows[0].statements.length === 1 && rows[0].statements[0] === prepared.text;
      if (inserted.rowCount !== 1 || !exact(inserted.rows) || !exact(readBack.rows)) {
        throw new MigrationRefused(`ledger row for ${prepared.version} did not read back exactly as written`);
      }
      assertNoWarnings(`ledger write for ${prepared.version}`);
    }
    if (postcheck) {
      await client.query(postcheck.text);
      await sameTransaction(`post-check ${postcheck.fileName}`);
      assertNoWarnings(`post-check ${postcheck.fileName}`);
    }
    const authorityAfter = (await client.query(AUTHORITY_SNAPSHOT)).rows[0];
    if (JSON.stringify(authorityAfter) !== JSON.stringify(authorityBefore)) {
      throw new MigrationRefused('the run left the runner\'s role memberships or schema private CREATE changed');
    }
    assertNoWarnings('final check');
    if (rehearse) { await client.query('rollback'); return { versions, committed: false }; }
    await client.query('commit');
    return { versions, committed: true };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.off('notice', onNotice);
  }
}

/** One file: the Phase A shape. */
export async function applyMigration(client, prepared, options = {}) {
  const { versions, committed } = await applyMigrations(client, [prepared], options);
  return { version: versions[0], committed };
}

/**
 * Parses the operator's URL into an explicit pg client configuration. The URL never reaches the driver, so its own
 * parser (socket: URLs, host=, sslnegotiation=, uselibpqcompat=, options=, ...) cannot change what is enforced here.
 */
export function clientConfig(connectionString, readCa = (path) => readFileSync(path, 'utf8')) {
  let url;
  try { url = new URL(connectionString); } catch { throw new MigrationRefused('database url file does not hold a URL'); }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') throw new MigrationRefused('database url must be postgres:// or postgresql://');
  const host = url.hostname;
  if (!host || host.startsWith('[') || isIP(host) || host.startsWith('%2f') || host.startsWith('%2F') || !/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new MigrationRefused('database url must name a TCP host by DNS name (hostname verification needs a name)');
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new MigrationRefused('database url has an invalid port');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || database.includes('/')) throw new MigrationRefused('database url must name exactly one database');
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 2 || new Set(keys).size !== 2 || url.searchParams.get('sslmode') !== 'verify-full' || !url.searchParams.get('sslrootcert')) {
    throw new MigrationRefused('database url must carry exactly sslmode=verify-full and sslrootcert, and nothing else');
  }
  const caPath = url.searchParams.get('sslrootcert');
  if (!isAbsolute(caPath)) throw new MigrationRefused('sslrootcert must be an absolute path');
  if (!url.username) throw new MigrationRefused('database url must name the user');
  const ca = readCa(caPath);
  if (!/-----BEGIN CERTIFICATE-----/.test(ca)) throw new MigrationRefused('sslrootcert does not hold a PEM certificate');
  return {
    host, port, database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    // Only this CA; the certificate chain AND the server name are verified by Node's TLS layer.
    ssl: { ca, rejectUnauthorized: true, servername: host },
    application_name: 'istemer-apply-migration',
  };
}

/** Validation only, without reading the CA file (kept for callers and tests that check the URL rule). */
export function assertVerifiedTls(connectionString) {
  clientConfig(connectionString, () => '-----BEGIN CERTIFICATE-----');
}

/** On POSIX the URL file holds a privileged credential: it must belong to the operator and be unreadable by others. */
export function assertPrivateFile(path, stat = statSync(path), uid = process.getuid?.()) {
  if (process.platform === 'win32' && uid === undefined) return;
  if ((stat.mode & 0o077) !== 0 || stat.uid !== uid) {
    throw new MigrationRefused('database url file must be owned by the operator with mode 0400 or 0600');
  }
}

function parseArgs(argv) {
  const out = { files: [], hashes: [], requirePresent: [], rehearse: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--rehearse') { out.rehearse = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new MigrationRefused(`${flag} needs a value`);
    i += 1;
    if (flag === '--database-url-file') out.databaseUrlFile = value;
    else if (flag === '--file') out.files.push(value);
    else if (flag === '--sha256') out.hashes.push(value);
    else if (flag === '--require-present') out.requirePresent = value.split(',').filter(Boolean);
    else if (flag === '--postcheck') out.postcheck = value;
    else if (flag === '--postcheck-sha256') out.postcheckSha256 = value;
    else throw new MigrationRefused(`unknown option ${flag}`);
  }
  if (!out.databaseUrlFile) throw new MigrationRefused('missing --database-url-file');
  if (out.files.length === 0 || out.files.length !== out.hashes.length) throw new MigrationRefused('give one --sha256 for each --file');
  if (Boolean(out.postcheck) !== Boolean(out.postcheckSha256)) throw new MigrationRefused('--postcheck and --postcheck-sha256 go together');
  for (const path of [out.databaseUrlFile, ...out.files, ...(out.postcheck ? [out.postcheck] : [])]) {
    if (!isAbsolute(path)) throw new MigrationRefused('paths must be absolute');
  }
  if (!out.requirePresent.every((v) => /^\d{14}$/.test(v))) throw new MigrationRefused('--require-present takes 14-digit versions');
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prepared = args.files.map((file, index) => prepareMigration({ fileName: basename(file), text: readFileSync(file, 'utf8'), expectedSha256: args.hashes[index] }));
  const postcheck = args.postcheck
    ? preparePostcheck({ fileName: basename(args.postcheck), text: readFileSync(args.postcheck, 'utf8'), expectedSha256: args.postcheckSha256 })
    : null;
  assertPrivateFile(args.databaseUrlFile);
  const config = clientConfig(readFileSync(args.databaseUrlFile, 'utf8').trim());
  const { default: pg } = await import('pg');
  const client = new pg.Client(config);
  await client.connect();
  try {
    const result = await applyMigrations(client, prepared, { requirePresent: args.requirePresent, rehearse: args.rehearse, postcheck });
    process.stdout.write(`${JSON.stringify({ ...result, files: prepared.map((p) => ({ version: p.version, sha256: p.sha256 })) })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((error) => {
    // Never the connection details: a refusal names its rule; anything else is reported by SQLSTATE/errno only.
    process.stderr.write(`${error instanceof MigrationRefused ? error.message : `failed (${error?.code ?? 'unknown'})`}\n`);
    process.exit(1);
  });
}
