// A throwaway, local PostgreSQL 17.6 cluster shaped like the hosted Supabase roles, for rehearsing migrations as a
// NON-superuser. PGlite cannot do this: it runs every statement as a superuser, which skips exactly the ownership and
// grant checks that decide whether a migration applies on the hosted project.
//
// Modelled from recorded evidence (docs/evidence/phase-1/baseline.md, read-only hosted preflight):
// - the cluster superuser is a platform role (supabase_admin); migrations run as `postgres`, which is NOT a superuser
//   and has CREATEROLE, CREATEDB, BYPASSRLS and INHERIT, and owns the database and schema public;
// - roles postgres creates get the automatic PG16+ creator membership (ADMIN true, INHERIT false, SET false, granted by
//   the bootstrap superuser). This is produced by PostgreSQL itself, not written by hand here.
// Not known from evidence, so explicit options rather than assumptions:
// - platformMembers: whether postgres is a member of anon/authenticated/service_role;
// - authGrantOption: whether postgres may re-grant USAGE on schema auth and EXECUTE on auth.uid()/auth.jwt().
// Approximation: the auth/storage stubs come from platform-stubs.sql and storage.buckets/objects are given to postgres,
// because the applied phase-1a migration alters them and did apply on the hosted project.
// Local only: binds 127.0.0.1, trust auth inside a temporary directory, no credentials, nothing remote.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const migrationsDir = new URL('../migrations/', import.meta.url);
export const readMigration = (name) => readFileSync(new URL(name, migrationsDir), 'utf8');

const PLATFORM_PACKAGE = { win32: '@embedded-postgres/windows-x64', linux: '@embedded-postgres/linux-x64',
  darwin: process.arch === 'arm64' ? '@embedded-postgres/darwin-arm64' : '@embedded-postgres/darwin-x64' }[process.platform];
/** initdb/postgres paths from the PostgreSQL 17.6 binary package pinned in package.json. */
const binaries = () => import(PLATFORM_PACKAGE);

/** tls: { certFile, keyFile } turns on server TLS (used only by the driver handshake tests). */
export async function startHostedLikeCluster({ platformMembers = false, authGrantOption = true, tls = null, listenLocalhost = false } = {}) {
  // initdb and postgres refuse to run as root. Say so plainly instead of failing every test at setup.
  if (process.getuid?.() === 0) {
    throw new Error('ENVIRONMENT: PostgreSQL will not run as root; run `npm run test:hosted` as an unprivileged user (this is not a migration result)');
  }
  const { initdb, postgres, pg_ctl: pgCtl } = await binaries();
  const dir = mkdtempSync(join(tmpdir(), 'hosted-pg17-'));
  const init = spawnSync(initdb, ['-D', dir, '-U', 'supabase_admin', '-A', 'trust', '-E', 'UTF8', '--locale=C'], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr}`);
  const port = 56000 + Math.floor(Math.random() * 4000);
  // Loopback only. The TLS tests connect by the name 'localhost' (hostname verification needs a name), which may resolve
  // to ::1 first, so that cluster listens on every loopback address the name has.
  const tlsArgs = tls ? ['-c', 'ssl=on', '-c', `ssl_cert_file=${tls.certFile}`, '-c', `ssl_key_file=${tls.keyFile}`] : [];
  const listen = tls || listenLocalhost ? 'localhost' : '127.0.0.1';
  const server = spawn(postgres, ['-D', dir, '-p', String(port), '-c', `listen_addresses=${listen}`, '-c', 'fsync=off', ...tlsArgs], { stdio: 'ignore' });
  const connect = async (user, database = 'staging') => {
    let lastError;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const client = new pg.Client({ host: '127.0.0.1', port, user, database });
      client.warnings = [];
      client.on('notice', (notice) => { if (notice.severity === 'WARNING') client.warnings.push(notice.message); });
      try { await client.connect(); return client; } catch (error) { lastError = error; await new Promise((r) => setTimeout(r, 100)); }
    }
    throw lastError;
  };
  const stop = async () => {
    // A clean fast shutdown; killing only the postmaster leaves backends holding the data directory on Windows.
    spawnSync(pgCtl, ['stop', '-D', dir, '-m', 'fast', '-w'], { encoding: 'utf8' });
    if (server.exitCode === null) await new Promise((r) => server.once('exit', r));
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  };
  try {
    const bootstrap = await connect('supabase_admin', 'postgres');
    await bootstrap.query('create role postgres login createrole createdb bypassrls inherit noreplication nosuperuser');
    await bootstrap.query('create database staging owner postgres');
    await bootstrap.end();
    const platform = await connect('supabase_admin');
    await platform.query('alter schema public owner to postgres');
    await platform.query('create schema extensions; create extension pgcrypto with schema extensions');
    await platform.query(readFileSync(new URL('./platform-stubs.sql', import.meta.url), 'utf8'));
    const option = authGrantOption ? ' with grant option' : '';
    await platform.query(`create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
      grant execute on function auth.jwt() to authenticated;
      grant usage on schema extensions to postgres;
      grant usage on schema auth, storage to postgres${option};
      grant execute on function auth.uid(), auth.jwt() to postgres${option};
      grant all on all tables in schema auth, storage to postgres;
      grant execute on all functions in schema storage to postgres;
      alter table storage.buckets owner to postgres;
      alter table storage.objects owner to postgres;`);
    if (platformMembers) await platform.query('grant anon, authenticated, service_role to postgres');
    await platform.end();
    const owner = await connect('postgres');
    // The Supabase CLI ledger, as the hosted project has it (owned by postgres).
    await owner.query(`create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
    return { port, connect, stop, owner };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Runs migrations as the connected (non-superuser) client, recording each one in the ledger like the CLI would. */
/** failOnWarning is off only to replay already-applied history, whose warnings cannot be changed any more. */
export async function applyRecorded(client, names, { failOnWarning = true } = {}) {
  for (const name of names) {
    const before = client.warnings.length;
    await client.query(readMigration(name));
    const warnings = client.warnings.slice(before);
    if (warnings.length && failOnWarning) throw Object.assign(new Error(`${name} raised WARNING: ${warnings.join(' | ')}`), { warnings });
    await client.query('insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
      [name.slice(0, 14), name.slice(15, -4), [readMigration(name)]]);
  }
}

/** Everything the six pending migrations and the Omar migration can change, as comparable rows. */
export async function catalogSnapshot(client) {
  const rows = async (sql) => (await client.query(sql)).rows;
  return {
    functions: await rows(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as fn,
        pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig, md5(p.prosrc) as src,
        coalesce(array(select a::text from unnest(p.proacl) a order by 1), '{}') as acl
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1`),
    relations: await rows(`select n.nspname||'.'||c.relname as rel, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity,
        c.relforcerowsecurity, coalesce(array(select a::text from unnest(c.relacl) a order by 1), '{}') as acl
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p','v') order by 1`),
    policies: await rows(`select schemaname||'.'||tablename||'.'||policyname as pol, roles::text, cmd, qual, with_check from pg_policies
      where schemaname in ('public','private') order by 1`),
    schemas: await rows(`select nspname, coalesce(array(select a::text from unnest(nspacl) a order by 1), '{}') as acl from pg_namespace
      where nspname in ('public','private','auth') order by 1`),
    memberships: await rows(`select r.rolname as role, m.rolname as member, g.rolname as grantor, a.admin_option, a.inherit_option, a.set_option
      from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor
      where r.rolname like 'bagos\\_%' or m.rolname = 'postgres' order by 1,2,3`),
  };
}
