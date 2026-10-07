// Standalone Omar research worker process. Built to dist/research-worker.cjs by build-research-worker.mjs.
// Not part of the Next.js app; it shares the lib/workflow modules and nothing else.
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createSqlResearchCommandPort } from '../lib/workflow/research-command-port';
import { startResearchWorkerService } from '../lib/workflow/research-worker-service';
import { assertDatabaseUrlUsesTls, buildResearchWorkerConfig, describeCycle, loadWorkerRuntimeConfig } from '../lib/workflow/research-worker-runtime';

// This process is the composition root, so it owns the one real clock; everything below receives it injected.
// eslint-disable-next-line no-restricted-syntax -- real clock at the process boundary
const now = () => Date.now();
const log = (record: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ ts: new Date(now()).toISOString(), ...record })}\n`);

function main() {
  const runtime = loadWorkerRuntimeConfig(process.env);
  const connectionString = readFileSync(runtime.databaseUrlFile, 'utf8').trim();
  assertDatabaseUrlUsesTls(connectionString);
  const signingKey = new Uint8Array(readFileSync(runtime.signingKeyFile));
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000,
    // Connect (10s) + query (10s) per cold call; two calls plus a backoff fit the 45s completion margin.
    query_timeout: 10_000, statement_timeout: 10_000, application_name: 'istemer-research-worker' });
  // An idle-client error (e.g. the server restarted) must not crash the process; the next query reconnects.
  pool.on('error', (error) => log({ event: 'pool_error', name: error.name }));

  const service = startResearchWorkerService({
    config: buildResearchWorkerConfig({ runtime, port: createSqlResearchCommandPort(pool), signingKey, now }),
    intervalMs: runtime.intervalMs,
    keepAlive: true,
    onCycle: (result) => { const record = describeCycle(result); if (record) log(record); },
    onCycleError: (error) => log({ event: 'cycle_error', name: error instanceof Error ? error.name : 'unknown',
      // SQLSTATE / errno only (e.g. 28P01, ECONNREFUSED); never the message, which can carry connection details.
      code: typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined }),
  });
  log({ event: 'started', keyId: runtime.keyId, agentPort: runtime.agentPort, intervalMs: runtime.intervalMs });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log({ event: 'stopping', signal });
    // Let the in-flight cycle finish (it holds an attempt lease), then close the pool.
    void service.stop().then(() => pool.end()).then(() => process.exit(0), () => process.exit(1));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

try { main(); }
catch (error) {
  // Configuration errors name the missing variable and nothing secret.
  console.error(error instanceof Error ? error.message : 'worker failed to start');
  process.exit(1);
}
