import 'server-only';
import { isAbsolute } from 'node:path';
import { observeSource } from '../../../../packages/core/research-worker/src/source-observer';
import { dispatchResearchTask } from './research-transport';
import type { ResearchCommandPort, ResearchWorkerConfig, WorkerCycleResult } from './research-worker';

/** Configuration is read from variable NAMES only. Secrets are never env values: the database
 * URL and signing key are read from files whose paths are given here. */
export interface WorkerRuntimeConfig {
  readonly databaseUrlFile: string;
  readonly signingKeyFile: string;
  readonly keyId: string;
  readonly agentPort: number;
  readonly intervalMs: number;
  readonly dispatchTimeoutMs: number;
  readonly approvedSources: ReadonlySet<string>;
}

/** A configuration mistake. Its message names a variable or rule and never a value, so it is safe to print. */
export class WorkerConfigError extends Error {}

export const MIN_SIGNING_KEY_BYTES = 32;
const MAX_APPROVED_SOURCES = 50;

/** Whitespace-separated exact URLs (a URL cannot contain raw whitespace, unlike a comma). Each must already be in
 * canonical form, because briefs are matched by exact string: an entry that would normalise differently could never
 * match and would only hide a typo. Redirects are not followed, so list the final URL. */
export function parseApprovedSources(raw: string | undefined): ReadonlySet<string> {
  const entries = (raw ?? '').split(/\s+/).filter(Boolean);
  if (entries.length === 0) throw new WorkerConfigError('RESEARCH_WORKER_APPROVED_SOURCES must list at least one URL');
  if (entries.length > MAX_APPROVED_SOURCES) throw new WorkerConfigError(`RESEARCH_WORKER_APPROVED_SOURCES allows at most ${MAX_APPROVED_SOURCES} URLs`);
  entries.forEach((entry, index) => {
    let url: URL;
    try { url = new URL(entry); } catch { throw new WorkerConfigError(`RESEARCH_WORKER_APPROVED_SOURCES entry ${index + 1} is not a URL`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.href !== entry) {
      throw new WorkerConfigError(`RESEARCH_WORKER_APPROVED_SOURCES entry ${index + 1} must be a canonical https URL without credentials, port or fragment`);
    }
  });
  return new Set(entries);
}

export function loadWorkerRuntimeConfig(env: Readonly<Record<string, string | undefined>>): WorkerRuntimeConfig {
  const need = (name: string): string => {
    const value = env[name];
    if (!value) throw new WorkerConfigError(`Missing required configuration: ${name}`);
    return value;
  };
  const integer = (name: string, fallback: string | undefined, min: number, max: number): number => {
    const raw = env[name] ?? fallback;
    if (raw === undefined) throw new WorkerConfigError(`Missing required configuration: ${name}`);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) throw new WorkerConfigError(`${name} must be an integer ${min}-${max}`);
    return value;
  };
  const databaseUrlFile = need('RESEARCH_WORKER_DATABASE_URL_FILE');
  const signingKeyFile = need('RESEARCH_WORKER_SIGNING_KEY_FILE');
  for (const [name, value] of [['RESEARCH_WORKER_DATABASE_URL_FILE', databaseUrlFile], ['RESEARCH_WORKER_SIGNING_KEY_FILE', signingKeyFile]] as const) {
    if (!isAbsolute(value)) throw new WorkerConfigError(`${name} must be an absolute path`);
  }
  const keyId = need('RESEARCH_WORKER_KEY_ID');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) throw new WorkerConfigError('RESEARCH_WORKER_KEY_ID must match [A-Za-z0-9_-]{1,64}');
  return {
    databaseUrlFile, signingKeyFile, keyId,
    agentPort: integer('RESEARCH_WORKER_AGENT_PORT', undefined, 1024, 65535),
    intervalMs: integer('RESEARCH_WORKER_INTERVAL_MS', '5000', 1000, 300_000),
    // Hermes gets 180s by default and the lease is 5 minutes; the worker also holds back a completion margin.
    dispatchTimeoutMs: integer('RESEARCH_WORKER_DISPATCH_TIMEOUT_MS', '200000', 5000, 240_000),
    approvedSources: parseApprovedSources(env.RESEARCH_WORKER_APPROVED_SOURCES),
  };
}

/** Wires the real source observer and the real loopback dispatcher around an injected command port. */
export function buildResearchWorkerConfig(input: {
  runtime: WorkerRuntimeConfig; port: ResearchCommandPort; signingKey: Uint8Array;
  /** The process clock, injected by the composition root; this module never reads wall-clock time. */
  now: () => number;
}): ResearchWorkerConfig {
  if (input.signingKey.byteLength < MIN_SIGNING_KEY_BYTES) throw new WorkerConfigError('signing key must be at least 32 bytes');
  return {
    port: input.port,
    observe: observeSource,
    dispatch: (endpoint, signed, body, timeoutMs) => dispatchResearchTask(endpoint, signed, body, timeoutMs,
      { key: input.signingKey, now: input.now }),
    // Loopback only; dispatchResearchTask itself refuses any other hostname.
    endpoint: { hostname: '127.0.0.1', port: input.runtime.agentPort },
    keyId: input.runtime.keyId,
    signingKey: input.signingKey,
    now: input.now,
    approvedSources: input.runtime.approvedSources,
    dispatchTimeoutMs: input.runtime.dispatchTimeoutMs,
  };
}

/** The worker reaches the database over the public internet, and `pg` defaults to plaintext when the URL carries no
 * sslmode. Refuse to start rather than send briefs, artifacts and executor commands unencrypted. The message never
 * includes the URL (it holds the password). */
export function assertDatabaseUrlUsesTls(connectionString: string): void {
  let params: URLSearchParams;
  try { params = new URL(connectionString).searchParams; }
  catch { throw new WorkerConfigError('database url file does not hold a valid PostgreSQL connection URL'); }
  // No parameter may repeat: URLSearchParams reads the first value but the pg driver uses the last, so
  // `sslmode=verify-full&sslmode=disable` would pass this check and then connect in plaintext.
  const names = [...params.keys()];
  if (new Set(names).size !== names.length) throw new WorkerConfigError('database url must not repeat a parameter');
  // `ssl=` is not needed alongside sslmode and only adds a second way to say something else.
  if (params.has('ssl')) throw new WorkerConfigError('database url must not set ssl=; use sslmode=verify-full');
  // Only verify-full. node-postgres 8 aliases require/verify-ca to verify-full, but `uselibpqcompat=true` (or pg 9)
  // gives them libpq meaning, where the server certificate or its hostname is not checked.
  if (params.get('sslmode') !== 'verify-full') {
    throw new WorkerConfigError('database url must set sslmode=verify-full (with sslrootcert for the provider CA); plaintext connections are refused');
  }
}

/** One log record per cycle that did something. Identifiers and outcome codes only: never artifacts,
 * source text, URLs, SQL text or error messages (which may carry connection details). */
export function describeCycle(result: WorkerCycleResult): Record<string, string> | null {
  if (result.outcome === 'idle') return null;
  const record: Record<string, string> = { event: 'cycle', outcome: result.outcome, runId: result.runId };
  if ('attemptId' in result) record.attemptId = result.attemptId;
  if ('code' in result) record.code = result.code;
  if ('stage' in result) record.stage = result.stage;
  return record;
}
