#!/usr/bin/env node
// Applies reviewed migration files and records each exact version in supabase_migrations.schema_migrations, all in ONE
// transaction: either every listed migration, its ledger row and the post-check commit together, or nothing does. It
// never chooses what to apply: the operator names each file, and for the two reviewed plans the tool itself knows the
// only acceptable files, order and SHA-256 digests (PHASE_A, PHASE_B below).
//
// Phase B is gated in three steps, all enforced by PostgreSQL, not by traffic expectations:
//   1. --quarantine phase-b-quarantine.sql, committed on its own: revokes EXECUTE on the approval decision commands
//      from authenticated. The tool also rejects effective access from every non-platform role (P12).
//   2. The Phase B batch refuses to start unless the quarantine is in effect, and waits until no other session has a
//      transaction older than the batch (so no call begun before the quarantine can still be running, and none can
//      be blocked on the batch's locks and resume an old body after COMMIT).
//   3. Inside the batch, after B1..B6, phase-b-reopen.sql restores EXECUTE; the post-check verifies everything; then one
//      COMMIT makes the repaired bodies and the restored access visible together.
// Once B0 commits, a failed batch keeps that quarantine. Platform authority and concurrent administrative changes
// remain outside this gate; see P12 and the maintenance-window requirements in the runbook.
//
// Refuses, and leaves nothing behind, when:
// - a file's SHA-256 differs from the reviewed one; it is not exactly one top-level begin;...commit; transaction; or a
//   SQL-aware scan finds top-level transaction control (or a change of standard_conforming_strings) BEFORE anything runs;
// - a version is already recorded, a --require-present version is not, or a reviewed plan is incomplete or reordered;
// - the ledger table's columns, types or version uniqueness differ from the CLI's, or it carries triggers or rules;
// - an inserted ledger row does not read back exactly as written;
// - the post-check raises, or a WARNING arrives from the pinned plan (including reopen, ledger and post-check), which
//   is how PostgreSQL reports a skipped GRANT/REVOKE; or initial WARNING delivery fails its probe. Pinning excludes
//   files that hide their own warnings; this is not a sandbox for arbitrary SQL or pre-existing database code;
// - the runner's role memberships or the bagos_* schema-private CREATE rights differ at the end from the start.
// Connection: the URL is parsed here, never handed to the driver, and no PG* environment variable may be set. Only
// postgres:/postgresql: over TCP to a DNS host, with exactly sslmode=verify-full and an absolute sslrootcert; the driver
// gets an explicit TLS configuration (that CA only, certificate and host name verified) and TCP keepalive. On POSIX the
// URL file must be private to the operator. The session settings the scan relies on are forced for the transaction.
//
// Usage (operator, on the VPS; see docs/STAGING_MIGRATION_RUNBOOK.md):
//   node apply-migration.mjs --database-url-file /abs/url --quarantine /abs/phase-b-quarantine.sql --quarantine-sha256 <hex>
//   node apply-migration.mjs --database-url-file /abs/url --file /abs/<version>_<name>.sql --sha256 <hex> [--file ...]... \
//     --postcheck /abs/check.sql --postcheck-sha256 <hex> [--reopen /abs/reopen.sql --reopen-sha256 <hex>] \
//     [--require-present v1,v2] [--rehearse]
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { assertNoTransactionControl, SqlScanError } from './sql-scan.mjs';

const FILE_NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const LEDGER = 'supabase_migrations.schema_migrations';

export class MigrationRefused extends Error {}

// The two reviewed plans, with the only digests they accept. A changed file is a new review, not a new digest argument.
export const PHASE_A = {
  migrations: { '20261008120000': 'd7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25' },
  names: { '20261008120000': 'omar_research_usage_command' },
  postcheck: { fileName: 'phase-a-postcheck.sql', sha256: 'f02d2f5a9e50b5fca96327a09663e422ac45749a17707e4ee299bd9fd17ebca7' },
  reopen: null,
};
export const PHASE_B = {
  migrations: {
    '20260921090000': '23cd7282ee4ebcbfa7c307e47956ba94bb64711eec5f8a68badb39f4294a12cd',
    '20260921100000': '73da70f085485c9dff4c3a817d62da1708dbf22e5d5236a8842d2c70f9746144',
    '20260921110000': '917f0aef8b6de2aa2004552e2475e9a6bd8d3d3cdcb2953844c1039f10607f5e',
    '20260921120000': '9dd93d1af3f6595a1e8bb5c39a4287d2d75e46f7a6a9a59d66730f60012a7978',
    '20260921130000': '90e450c9c21a0a8343175333e53bbc0fb67365f2b4e52734465fcfc54ab9e5b9',
    '20260921140000': 'f20523f1f43644c11e3da139fae3fdcd4ae211bd96715162a10da578c8026409',
  },
  names: {
    '20260921090000': 'hadeer_finished_post_package',
    '20260921100000': 'hadeer_approval_binding_repairs',
    '20260921110000': 'hadeer_approval_gate_hardening',
    '20260921120000': 'hadeer_supersede_scope_repair',
    '20260921130000': 'hadeer_approval_role_null_repair',
    '20260921140000': 'hadeer_retry_missing_run_repair',
  },
  postcheck: { fileName: 'phase-b-postcheck.sql', sha256: 'ccd52550e99d08c542fbeac584975286eae0aadecab9c1d18ee6306629ded499' },
  reopen: { fileName: 'phase-b-reopen.sql', sha256: '3e84b8ceb98bbb3409ee8ab0209b2d0e92a39203235738ed563a3682ab483b3a' },
  quarantine: { fileName: 'phase-b-quarantine.sql', sha256: 'ef101e6b108f8872851c48b268a3642348ca8343560a1003d50cb397d4c388b7' },
  // The functions the quarantine closes; the batch requires them closed before it starts.
  gated: ['public.approve_agent_revision(uuid,uuid,text)', 'public.reject_agent_revision(uuid,uuid,text,text)',
    'private.approve_agent_revision(uuid,uuid,text)', 'private.reject_agent_revision(uuid,uuid,text,text)'],
};
const PLANS = [PHASE_A, PHASE_B];
for (const plan of PLANS) {
  for (const member of Object.values(plan)) if (member && typeof member === 'object') Object.freeze(member);
  Object.freeze(plan);
}

const sameStep = (step, pinned) => (step === null && pinned === null)
  || (step && pinned && step.fileName === pinned.fileName && step.sha256 === pinned.sha256);

/** Only these two reviewed plans may execute, including rehearsals. Caller-supplied digests cannot add a plan. */
export function assertPlan(preparedList, postcheck = null, reopen = null) {
  const versions = preparedList.map((p) => p.version);
  for (const plan of PLANS) {
    const planVersions = Object.keys(plan.migrations);
    if (!versions.some((v) => planVersions.includes(v))) continue;
    if (versions.length !== planVersions.length || versions.some((v, i) => v !== planVersions[i])) {
      throw new MigrationRefused(`versions ${planVersions.join(',')} can only be applied together, exactly and in that order`);
    }
    const wrong = preparedList.filter((p) => p.sha256 !== plan.migrations[p.version] || p.name !== plan.names[p.version]).map((p) => p.version);
    if (wrong.length) throw new MigrationRefused(`not the reviewed file for ${wrong.join(',')}`);
    if (!sameStep(postcheck, plan.postcheck)) throw new MigrationRefused(`this plan requires its reviewed post-check ${plan.postcheck.fileName}`);
    if (!sameStep(reopen, plan.reopen)) {
      throw new MigrationRefused(plan.reopen ? `this plan requires its reviewed ${plan.reopen.fileName}` : 'this plan takes no reopen step');
    }
    return plan;
  }
  throw new MigrationRefused('only the reviewed Phase A or Phase B may be applied; unpinned plans are refused');
}

// What a migration run must leave exactly as it found it: the runner's role memberships (temporary windows must be
// closed) and which bagos_* roles may create objects in schema private.
const AUTHORITY_SNAPSHOT = `select coalesce(jsonb_agg(row_to_json(m) order by m.role, m.grantor), '[]'::jsonb) as members,
    (select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb) from pg_roles r
       where r.rolname like 'bagos\\_%' and has_schema_privilege(r.oid, 'private', 'CREATE')) as creators
  from (select r.rolname as role, pg_get_userbyid(a.grantor) as grantor, a.admin_option, a.inherit_option, a.set_option
        from pg_auth_members a join pg_roles r on r.oid = a.roleid where a.member = (select oid from pg_roles where rolname = current_user)) m`;

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

/** Checks the supplied digest and transaction envelope; execution separately requires an exact pinned plan. */
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

/** Prepares a SQL step without an envelope; execution separately requires its reviewed name and digest. */
export function prepareStep({ fileName, text, expectedSha256 }) {
  const sha256 = checkDigest(text, expectedSha256);
  if (scan(text, fileName).length === 0) throw new MigrationRefused(`${fileName}: empty`);
  return { fileName, sha256, text };
}
export const preparePostcheck = prepareStep;

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

/** Opens the tool's transaction with the settings everything else relies on, and proves WARNINGs arrive. */
async function openTransaction(client, warnings) {
  await client.query('begin');
  await client.query("set local lock_timeout = '10s'");
  await client.query("set local statement_timeout = '120s'"); // per statement
  // A connection that silently disappears must not hold the batch's locks for long.
  await client.query("set local idle_in_transaction_session_timeout = '60s'");
  // The transaction-control scan reads '...' the way this setting says; never let a role or session default differ.
  await client.query('set local standard_conforming_strings = on');
  // The WARNING gate only works if WARNINGs reach this client: force the level and prove the channel with a probe.
  await client.query('set local client_min_messages = warning');
  await client.query("do $probe$ begin raise warning 'apply-migration-probe'; end $probe$");
  if (warnings.length !== 1 || warnings[0] !== 'apply-migration-probe') {
    throw new MigrationRefused('WARNING notices do not reach this client; refusing to run without the WARNING gate');
  }
  warnings.length = 0;
}

/**
 * Re-asserts the three session settings before each migration/step, and refuses unless
 * they hold. This is defence in depth for the pinned plans, NOT protection against arbitrary SQL: set_config can
 * suppress a later WARNING within the same string. Only exact reviewed text is admitted for execution.
 */
async function reassertSession(client) {
  await client.query('set local standard_conforming_strings = on');
  await client.query('set local client_min_messages = warning');
  await client.query("set local client_encoding = 'UTF8'");
  const row = (await client.query(`select current_setting('standard_conforming_strings') as scs,
    current_setting('client_min_messages') as cmm, current_setting('client_encoding') as enc`)).rows[0];
  if (row.scs !== 'on' || row.cmm !== 'warning' || row.enc !== 'UTF8') {
    throw new MigrationRefused('session settings the tool relies on could not be restored');
  }
}

// No prefix-based platform exemption: postgres is the reviewed owner/operator, supabase_admin the platform superuser.
// All other roles are checked, including NOLOGIN roles and unexpected superusers. SET followed by USAGE catches mixed
// paths that neither pg_has_role(actor, owner, 'SET') nor 'USAGE' alone detects.
/** Requires the reviewed owner, owner-only ACLs, and no effective non-platform owner/EXECUTE access. */
export async function quarantineInEffect(client, gated) {
  return (await client.query(`select bool_and(p.oid is not null
      and p.proowner = 'postgres'::regrole and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner)
      and not exists (
        select 1 from pg_roles actor cross join pg_roles target
        where not (actor.rolname = 'postgres' or (actor.rolname = 'supabase_admin' and actor.rolsuper))
          and pg_has_role(actor.oid, target.oid, 'SET')
          and (pg_has_role(target.oid, p.proowner, 'USAGE')
            or has_function_privilege(target.oid, p.oid, 'EXECUTE')))) as ok
      from unnest($1::text[]) f left join pg_proc p on p.oid = to_regprocedure(f)`, [gated])).rows[0].ok === true;
}

/**
 * Waits until no other client session has a transaction older than this one. Refuses if the operator role cannot see
 * other roles' sessions (PostgreSQL then hides their backend type, state and timestamps entirely), and if the wait
 * runs out. pg_stat_activity is a per-transaction snapshot, so it is cleared before every poll.
 */
async function drainOlderTransactions(client, { timeoutMs, pollMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const canSee = (await client.query("select pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') as ok")).rows[0].ok;
  if (!canSee) throw new MigrationRefused('cannot see other sessions in pg_stat_activity (needs pg_read_all_stats); the drain cannot be verified');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await client.query('select pg_stat_clear_snapshot()');
    const row = (await client.query(`select
        count(*) filter (where a.backend_type is null
          or (a.backend_type = 'client backend' and (a.state is null or a.state = 'disabled')))::int as unseen,
        count(*) filter (where a.backend_type = 'client backend'
          and a.xact_start < (select xact_start from pg_stat_activity where pid = pg_backend_pid()))::int as older
      from pg_stat_activity a where a.pid <> pg_backend_pid()`)).rows[0];
    if (row.unseen) throw new MigrationRefused(`${row.unseen} other session(s) are not visible in pg_stat_activity; the drain cannot be verified`);
    if (!row.older) return;
    if (Date.now() >= deadline) throw new MigrationRefused(`${row.older} other session(s) still have a transaction older than Phase B; retry when they have finished`);
    await sleep(pollMs);
  }
}

/**
 * Runs every prepared migration, its ledger row, the reopen step (Phase B only) and the post-check in ONE transaction.
 * Returns { versions, committed }. Commits only when nothing raised and no WARNING arrived at any point.
 */
export async function applyMigrations(client, preparedList, {
  requirePresent = [], rehearse = false, postcheck = null, reopen = null, drainTimeoutMs = 30_000,
  // Test seam only (the CLI never sets it): awaited after every check has passed, immediately before COMMIT.
  beforeCommit = null,
} = {}) {
  if (!Array.isArray(preparedList) || preparedList.length === 0) throw new MigrationRefused('nothing to apply');
  // Snapshot and derive executable bodies from re-hashed source, never trust mutable prepared metadata/body fields.
  preparedList = preparedList.map((p) => prepareMigration({ fileName: `${p.version}_${p.name}.sql`, text: p.text, expectedSha256: p.sha256 }));
  postcheck = revalidateStep(postcheck);
  reopen = revalidateStep(reopen);
  const versions = preparedList.map((p) => p.version);
  if (!versions.every((v, i) => i === 0 || versions[i - 1] < v)) throw new MigrationRefused('files must be given in ascending version order');
  const plan = assertPlan(preparedList, postcheck, reopen);
  const warnings = [];
  const onNotice = (notice) => { if (notice.severity === 'WARNING') warnings.push(notice.message); };
  const assertNoWarnings = (stage) => {
    if (warnings.length) throw new MigrationRefused(`${stage} raised WARNING: ${warnings.join(' | ')}`);
  };
  client.on('notice', onNotice);
  try {
    await openTransaction(client, warnings);
    if (plan?.gated) {
      if (!(await quarantineInEffect(client, plan.gated))) {
        throw new MigrationRefused('the Phase B quarantine is not in effect; apply phase-b-quarantine.sql first');
      }
      await drainOlderTransactions(client, { timeoutMs: drainTimeoutMs });
    }
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
      await reassertSession(client);
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
    for (const step of [reopen, postcheck]) {
      if (!step) continue;
      await reassertSession(client);
      await client.query(step.text);
      await sameTransaction(step.fileName);
      assertNoWarnings(step.fileName);
    }
    const authorityAfter = (await client.query(AUTHORITY_SNAPSHOT)).rows[0];
    if (JSON.stringify(authorityAfter) !== JSON.stringify(authorityBefore)) {
      throw new MigrationRefused('the run left the runner\'s role memberships or schema private CREATE changed');
    }
    assertNoWarnings('final check');
    if (rehearse) { await client.query('rollback'); return { versions, committed: false }; }
    if (beforeCommit) await beforeCommit();
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

/** Applies the reviewed Phase B quarantine on its own (no ledger row) and verifies it before COMMIT. */
export async function applyQuarantine(client, quarantine, { rehearse = false } = {}) {
  quarantine = assertQuarantine(quarantine);
  const warnings = [];
  const onNotice = (notice) => { if (notice.severity === 'WARNING') warnings.push(notice.message); };
  client.on('notice', onNotice);
  try {
    await openTransaction(client, warnings);
    await reassertSession(client);
    await client.query(quarantine.text);
    if (warnings.length) throw new MigrationRefused(`quarantine raised WARNING: ${warnings.join(' | ')}`);
    if (!(await quarantineInEffect(client, PHASE_B.gated))) throw new MigrationRefused('quarantine did not take effect');
    if (rehearse) { await client.query('rollback'); return { quarantine: true, committed: false }; }
    await client.query('commit');
    return { quarantine: true, committed: true };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.off('notice', onNotice);
  }
}

const revalidateStep = (step) => step && prepareStep({ fileName: step.fileName, text: step.text, expectedSha256: step.sha256 });

function assertQuarantine(step) {
  const checked = revalidateStep(step);
  if (!sameStep(checked, PHASE_B.quarantine)) throw new MigrationRefused(`only the reviewed ${PHASE_B.quarantine.fileName} can be applied as the quarantine`);
  return checked;
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
    // A dropped network path is noticed instead of leaving a half-open session (and its locks) behind.
    keepAlive: true,
    application_name: 'istemer-apply-migration',
  };
}

/** Validation only, without reading the CA file (kept for callers and tests that check the URL rule). */
export function assertVerifiedTls(connectionString) {
  clientConfig(connectionString, () => '-----BEGIN CERTIFICATE-----');
}

/** The pg driver falls back to PG* variables (PGOPTIONS, PGPASSWORD, PGSSLNEGOTIATION, ...); none may be set. */
export function assertNoPgEnvironment(env = process.env) {
  const set = Object.keys(env).filter((name) => /^PG/i.test(name));
  if (set.length) throw new MigrationRefused(`unset these environment variables first: ${set.join(', ')}`);
}

/** On POSIX the URL file holds a privileged credential: it must belong to the operator, with no group/other access. */
export function assertPrivateFile(path, stat = statSync(path), uid = process.getuid?.()) {
  if (process.platform === 'win32' && uid === undefined) return;
  if ((stat.mode & 0o077) !== 0 || stat.uid !== uid) {
    throw new MigrationRefused('database url file must be owned by the operator with no group or other permissions (e.g. 0400)');
  }
}

function parseArgs(argv) {
  const out = { files: [], hashes: [], requirePresent: [], rehearse: false };
  const pairs = { '--postcheck': 'postcheck', '--postcheck-sha256': 'postcheckSha256', '--reopen': 'reopen', '--reopen-sha256': 'reopenSha256',
    '--quarantine': 'quarantine', '--quarantine-sha256': 'quarantineSha256', '--database-url-file': 'databaseUrlFile' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--rehearse') { out.rehearse = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new MigrationRefused(`${flag} needs a value`);
    i += 1;
    if (flag === '--file') out.files.push(value);
    else if (flag === '--sha256') out.hashes.push(value);
    else if (flag === '--require-present') out.requirePresent = value.split(',').filter(Boolean);
    else if (pairs[flag]) out[pairs[flag]] = value;
    else throw new MigrationRefused(`unknown option ${flag}`);
  }
  if (!out.databaseUrlFile) throw new MigrationRefused('missing --database-url-file');
  for (const [file, hash] of [['postcheck', 'postcheckSha256'], ['reopen', 'reopenSha256'], ['quarantine', 'quarantineSha256']]) {
    if (Boolean(out[file]) !== Boolean(out[hash])) throw new MigrationRefused(`--${file} and its --${file}-sha256 go together`);
  }
  if (out.quarantine && (out.files.length || out.postcheck || out.reopen)) throw new MigrationRefused('--quarantine runs on its own');
  if (!out.quarantine && (out.files.length === 0 || out.files.length !== out.hashes.length)) throw new MigrationRefused('give one --sha256 for each --file');
  for (const path of [out.databaseUrlFile, ...out.files, out.postcheck, out.reopen, out.quarantine].filter(Boolean)) {
    if (!isAbsolute(path)) throw new MigrationRefused('paths must be absolute');
  }
  if (!out.requirePresent.every((v) => /^\d{14}$/.test(v))) throw new MigrationRefused('--require-present takes 14-digit versions');
  return out;
}

const readStep = (path, sha256) => prepareStep({ fileName: basename(path), text: readFileSync(path, 'utf8'), expectedSha256: sha256 });

async function main() {
  assertNoPgEnvironment();
  const args = parseArgs(process.argv.slice(2));
  const quarantine = args.quarantine ? readStep(args.quarantine, args.quarantineSha256) : null;
  const prepared = args.files.map((file, index) => prepareMigration({ fileName: basename(file), text: readFileSync(file, 'utf8'), expectedSha256: args.hashes[index] }));
  const postcheck = args.postcheck ? readStep(args.postcheck, args.postcheckSha256) : null;
  const reopen = args.reopen ? readStep(args.reopen, args.reopenSha256) : null;
  if (quarantine) assertQuarantine(quarantine);
  else assertPlan(prepared, postcheck, reopen); // refuse before reading credentials or connecting
  assertPrivateFile(args.databaseUrlFile);
  const config = clientConfig(readFileSync(args.databaseUrlFile, 'utf8').trim());
  const { default: pg } = await import('pg');
  const client = new pg.Client(config);
  client.on('error', () => undefined); // a dropped connection surfaces as the failed query below
  await client.connect();
  try {
    const result = quarantine
      ? await applyQuarantine(client, quarantine, { rehearse: args.rehearse })
      : await applyMigrations(client, prepared, { requirePresent: args.requirePresent, rehearse: args.rehearse, postcheck, reopen });
    process.stdout.write(`${JSON.stringify({ ...result, files: prepared.map((p) => ({ version: p.version, sha256: p.sha256 })) })}\n`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((error) => {
    // Never connection details: a refusal names its rule; a database error (it carries a severity) is reported with its
    // SQLSTATE and server message, which identify the failed check; anything else by its code only.
    const text = error instanceof MigrationRefused ? error.message
      : error?.severity ? `${error.code}: ${error.message}` : `failed (${error?.code ?? 'unknown'})`;
    process.stderr.write(`${text}\n`);
    process.exit(1);
  });
}
