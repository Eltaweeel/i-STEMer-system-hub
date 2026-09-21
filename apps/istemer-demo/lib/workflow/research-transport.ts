import 'server-only';
import { request as httpRequest } from 'node:http';
import { RESEARCH_TASK_PATH, type SignedResearchRequest } from './research-signing';

export { RESEARCH_TRANSPORT_VERSION, RESEARCH_TASK_PATH, signingInput, signResearchRequest, freshMetadata,
  type SignedResearchRequest } from './research-signing';

const MAX_RESPONSE_BYTES = 1024 * 1024;

export type DispatchOutcome =
  // reportedTokens is absent whenever the responder gave no usage figure, which
  // is every response while inference is a double. Absent is not zero, and the
  // metering path keeps the two apart all the way into the database.
  | { status: 'ok'; artifact: unknown; reportedTokens?: number | null }
  | { status: 'error'; error: unknown }
  | { status: 'transport_failure' };

/** Loopback-only by contract; the agents-hub listener must bind 127.0.0.1. This
 * client does not perform TLS and must never be pointed at a non-local host. */
export interface ResearchEndpoint { readonly hostname: string; readonly port: number; }

export function dispatchResearchTask(
  endpoint: ResearchEndpoint, signed: SignedResearchRequest, body: Uint8Array, timeoutMs: number,
): Promise<DispatchOutcome> {
  if (endpoint.hostname !== '127.0.0.1') return Promise.resolve({ status: 'transport_failure' });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: DispatchOutcome) => { if (!settled) { settled = true; resolve(outcome); } };
    const outgoing = httpRequest({
      host: endpoint.hostname, port: endpoint.port, path: RESEARCH_TASK_PATH, method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.byteLength,
        'X-Istemer-Auth': JSON.stringify(signed) },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) { response.destroy(); finish({ status: 'transport_failure' }); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode === 200 && parsed && typeof parsed === 'object' && 'artifact' in parsed) {
            finish({ status: 'ok', artifact: (parsed as { artifact: unknown }).artifact });
          } else if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            finish({ status: 'error', error: (parsed as { error: unknown }).error });
          } else finish({ status: 'transport_failure' });
        } catch { finish({ status: 'transport_failure' }); }
      });
      response.on('error', () => finish({ status: 'transport_failure' }));
      // A safety net, not the primary path: 'close' also fires after a normal
      // 'end', but finish() already no-ops once settled, so this only matters
      // for an abrupt connection drop that neither emits 'error' nor reaches
      // 'end' (observed inconsistently across Node versions/platforms).
      response.on('close', () => finish({ status: 'transport_failure' }));
    });
    outgoing.on('timeout', () => outgoing.destroy());
    outgoing.on('error', () => finish({ status: 'transport_failure' }));
    outgoing.on('close', () => finish({ status: 'transport_failure' }));
    outgoing.end(body);
  });
}
