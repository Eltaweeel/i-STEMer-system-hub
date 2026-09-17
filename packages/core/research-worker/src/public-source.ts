import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';

export type SourceGapCode = 'blocked_address' | 'unsupported_url' | 'unavailable' | 'timeout'
  | 'redirect' | 'http_status' | 'unsupported_content' | 'too_large' | 'empty_content';

export class SourceReadError extends Error {
  constructor(readonly code: SourceGapCode) { super(code); }
}

// Conservative whole-prefix exclusions: no special-purpose exceptions are needed
// for business research. IPv6-only sources are unavailable in this first adapter.
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');

export type SourceNetwork = {
  resolve: (hostname: string) => Promise<readonly { address: string; family: number }[]>;
  request: typeof request;
};
const network: SourceNetwork = {
  resolve: (hostname) => lookup(hostname, { family: 4, all: true, verbatim: true }),
  request,
};
const MAX_BODY_BYTES = 1024 * 1024;

function sourceUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SourceReadError('unsupported_url'); }
  const hostname = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.hash
    || (url.port && url.port !== '443') || isIP(hostname) || hostname.startsWith('[')
    || !hostname.includes('.') || hostname.endsWith('.')
    || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(hostname)) {
    throw new SourceReadError('unsupported_url');
  }
  return url;
}

async function pinnedAddress(hostname: string, signal: AbortSignal, io: SourceNetwork): Promise<string> {
  signal.throwIfAborted();
  let cancel: () => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(new SourceReadError('timeout'));
    signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    const addresses = await Promise.race([io.resolve(hostname), cancelled]);
    if (!addresses.length) throw new SourceReadError('unavailable');
    if (addresses.some(({ address, family }) => family !== 4 || isIP(address) !== 4 || blocked.check(address, 'ipv4'))) {
      throw new SourceReadError('blocked_address');
    }
    return addresses[0]!.address;
  } finally { signal.removeEventListener('abort', cancel); }
}

function requestOptions(url: URL, address: string, signal: AbortSignal): RequestOptions {
  return {
    protocol: 'https:', hostname: url.hostname, servername: url.hostname, port: 443,
    path: url.pathname + url.search, method: 'GET', family: 4, agent: false,
    rejectUnauthorized: true, signal, maxHeaderSize: 16384,
    // Pin DNS for the socket, while retaining hostname-based TLS verification.
    lookup: (_hostname, _options, callback) => callback(null, address, 4),
    headers: { Accept: 'text/html, text/plain', 'Accept-Encoding': 'identity',
      'User-Agent': 'BusinessAgentOS-Research/1.0', Connection: 'close' },
  };
}

function contentKind(response: IncomingMessage): 'html' | 'plain' {
  if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) throw new SourceReadError('redirect');
  if (response.statusCode !== 200) throw new SourceReadError('http_status');
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
    throw new SourceReadError('unsupported_content');
  }
  const media = response.headers['content-type'] ?? '';
  if (!/^text\/(?:html|plain)(?:\s*;\s*charset\s*=\s*"?(?:utf-8|us-ascii)"?)?\s*$/i.test(media)) {
    throw new SourceReadError('unsupported_content');
  }
  return /^text\/html/i.test(media) ? 'html' : 'plain';
}

async function readResponse(response: IncomingMessage) {
  try {
    const kind = contentKind(response);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) throw new SourceReadError('too_large');
      chunks.push(bytes);
    }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new SourceReadError('unsupported_content'); }
    return { kind, text };
  } finally { response.destroy(); }
}

function download(url: URL, address: string, signal: AbortSignal, io: SourceNetwork) {
  return new Promise<{ kind: 'html' | 'plain'; text: string }>((resolve, reject) => {
    const outgoing = io.request(requestOptions(url, address, signal), (response) => {
      void readResponse(response).then(resolve, reject);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

export async function readPublicSource(raw: string, signal: AbortSignal, io: SourceNetwork = network) {
  try {
    const url = sourceUrl(raw);
    const address = await pinnedAddress(url.hostname, signal, io);
    signal.throwIfAborted();
    return await download(url, address, signal, io);
  } catch (error) {
    if (signal.aborted) throw new SourceReadError('timeout');
    if (error instanceof SourceReadError) throw error;
    // DNS, TLS, and socket errors are source gaps, never successful inspections.
    throw new SourceReadError('unavailable');
  }
}
