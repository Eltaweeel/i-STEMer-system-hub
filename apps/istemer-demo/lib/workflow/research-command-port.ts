import 'server-only';
import type { ResearchArtifact, SourceInspection } from '@bagos/contracts';
import type { FailureCode, ResearchCommandPort } from './research-worker';

/** The one capability the port needs from a database driver. `pg`'s Pool/Client satisfy it. */
export interface SqlClient {
  query(text: string, values: readonly unknown[]): Promise<{ rows: ReadonlyArray<Record<string, unknown>> }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKENS = 2_147_483_647;

function requireAttempt(attemptId: string): string {
  if (!UUID.test(attemptId)) throw new Error('invalid_attempt_id');
  return attemptId;
}

/**
 * Calls the private research commands as the dedicated executor login. Every statement is
 * parameterized and fixed; no caller-supplied text is ever interpolated into SQL. The login
 * must be able to execute exactly these functions and nothing else (see the runbook).
 */
export function createSqlResearchCommandPort(client: SqlClient): ResearchCommandPort {
  const result = async (text: string, values: readonly unknown[]) => {
    const response = await client.query(text, values);
    return response.rows[0]?.result ?? null;
  };
  return {
    claim: () => result('select private.claim_research_task() as result', []),
    fail: (attemptId: string, code: FailureCode) =>
      result('select private.fail_research_attempt($1::uuid, $2::text) as result', [requireAttempt(attemptId), code]),
    complete: (attemptId: string, artifact: ResearchArtifact, receipts: readonly SourceInspection[]) =>
      result('select private.complete_research_attempt($1::uuid, $2::jsonb, $3::jsonb) as result',
        [requireAttempt(attemptId), JSON.stringify(artifact), JSON.stringify(receipts)]),
    recordUsage: (attemptId: string, reportedTokens: number | null) => {
      // null stays null + usage_reported=false: an unreported figure is never written as a measured zero.
      if (reportedTokens !== null && (!Number.isSafeInteger(reportedTokens) || reportedTokens < 0 || reportedTokens > MAX_TOKENS)) {
        throw new Error('invalid_reported_tokens');
      }
      return result('select private.record_agent_usage($1::uuid, $2::text, $3::integer, $4::boolean) as result',
        [requireAttempt(attemptId), 'competitor_analyst', reportedTokens, reportedTokens !== null]);
    },
  };
}
