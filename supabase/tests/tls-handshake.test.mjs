// Real TLS handshakes between the installed pg driver and a local PostgreSQL 17.6, using exactly the client
// configuration supabase/ops/apply-migration.mjs builds from an operator URL (clientConfig). Proves the effective
// behaviour, not only the URL rule: the supplied CA is the only trust root, and the server name is verified.
// Certificates are throwaway, made with the openssl CLI in a temporary directory; skipped (and reported as skipped)
// when openssl is not on PATH. Local only: nothing here reaches a network service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { applyRecorded, startHostedLikeCluster } from './hosted-pg.mjs';
import { migrationNames } from './migration-inventory.mjs';
import { clientConfig, PHASE_A } from '../ops/apply-migration.mjs';

const haveOpenssl = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'tls-handshake-'));
const openssl = (...args) => {
  const run = spawnSync('openssl', args, { cwd: dir, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl ${args[0]} failed: ${run.stderr}`);
};
function makeCa(name) {
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.crt`, '-days', '2', '-subj', `/CN=${name}`);
}
function makeServerCert(name, ca, dnsName) {
  writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${dnsName}\n`);
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${dnsName}`);
  openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${ca}.crt`, '-CAkey', `${ca}.key`, '-CAcreateserial', '-out', `${name}.crt`, '-days', '2', '-extfile', `${name}.ext`);
  chmodSync(join(dir, `${name}.key`), 0o600);
}
const urlFor = (port, caName) => `postgresql://postgres@localhost:${port}/staging?sslmode=verify-full&sslrootcert=${encodeURIComponent(join(dir, `${caName}.crt`))}`;
async function connectWith(port, caName) {
  const client = new pg.Client(clientConfig(urlFor(port, caName), (path) => readFileSync(path, 'utf8')));
  client.on('error', () => undefined);
  await client.connect();
  try { return (await client.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')).rows[0].ssl; }
  finally { await client.end(); }
}
async function withTlsCluster(certName, run) {
  const cluster = await startHostedLikeCluster({ tls: { certFile: join(dir, `${certName}.crt`), keyFile: join(dir, `${certName}.key`) } });
  try { await run(cluster.port); } finally { await cluster.owner.end().catch(() => undefined); await cluster.stop(); }
}

test('TLS handshakes through the apply tool\'s client configuration', { skip: haveOpenssl ? false : 'openssl is not on PATH' }, async (t) => {
  try {
    makeCa('trusted-ca');
    makeCa('other-ca');
    makeServerCert('right-name', 'trusted-ca', 'localhost');
    makeServerCert('wrong-name', 'trusted-ca', 'db.example.invalid');

    await t.test('connects only with the supplied CA, encrypted', () => withTlsCluster('right-name', async (port) => {
      assert.equal(await connectWith(port, 'trusted-ca'), true);
      await assert.rejects(connectWith(port, 'other-ca'), (e) => /self[- ]signed|unable to (get|verify)|certificate/i.test(e.message));
    }));

    await t.test('refuses a certificate issued by the supplied CA for another host name', () => withTlsCluster('wrong-name', async (port) => {
      await assert.rejects(connectWith(port, 'trusted-ca'), (e) => /altnames|hostname|does not match/i.test(e.message));
    }));

    await t.test('refuses a server that offers no TLS at all', async () => {
      const cluster = await startHostedLikeCluster({ listenLocalhost: true });
      try {
        await assert.rejects(connectWith(cluster.port, 'trusted-ca'), (e) => /does not support SSL/i.test(e.message));
      } finally { await cluster.owner.end().catch(() => undefined); await cluster.stop(); }
    });

    await t.test('the command line applies Phase A end to end over verified TLS, exactly as the runbook runs it', () => withTlsCluster('right-name', async (port) => {
      const cluster = { port };
      const history = migrationNames.filter((name) => name.slice(0, 14) <= '20260921080000');
      const owner = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'staging' });
      await owner.connect();
      try {
        await applyRecorded(Object.assign(owner, { warnings: [] }), history, { failOnWarning: false });
      } finally { await owner.end(); }
      const urlFile = join(dir, 'database.url');
      writeFileSync(urlFile, `${urlFor(cluster.port, 'trusted-ca')}\n`);
      chmodSync(urlFile, 0o600);
      const repo = fileURLToPath(new URL('../', import.meta.url));
      const omar = join(repo, 'migrations', '20261008120000_omar_research_usage_command.sql');
      const check = join(repo, 'ops', 'phase-a-postcheck.sql');
      const cli = (...extra) => spawnSync(process.execPath, [join(repo, 'ops', 'apply-migration.mjs'),
        '--database-url-file', urlFile, '--file', omar, '--sha256', PHASE_A.migrations['20261008120000'],
        '--postcheck', check, '--postcheck-sha256', PHASE_A.postcheck.sha256, '--require-present', '20260921080000', ...extra],
      { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^PG/i.test(name))) });
      const rehearsal = cli('--rehearse');
      assert.equal(rehearsal.status, 0, rehearsal.stderr);
      assert.equal(JSON.parse(rehearsal.stdout).committed, false);
      const applied = cli();
      assert.equal(applied.status, 0, applied.stderr);
      assert.deepEqual(JSON.parse(applied.stdout).versions, ['20261008120000']);
      const again = cli();
      assert.equal(again.status, 1);
      assert.match(again.stderr, /already recorded: 20261008120000/);
      assert.doesNotMatch(again.stderr + again.stdout, /postgresql:\/\//, 'no connection details in output');
      // A PG* variable in the environment stops the tool before it connects.
      const withPg = spawnSync(process.execPath, [join(repo, 'ops', 'apply-migration.mjs'), '--database-url-file', urlFile,
        '--file', omar, '--sha256', PHASE_A.migrations['20261008120000']], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c x=y' } });
      assert.equal(withPg.status, 1);
      assert.match(withPg.stderr, /unset these environment variables first: PGOPTIONS/);
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
