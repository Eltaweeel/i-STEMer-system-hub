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

export type WorkerLoginRejection = 'reserved_login' | 'escalated_session' | 'elevated_attributes'
  | 'unexpected_memberships' | 'executor_not_inherited' | 'missing_command_privilege' | 'direct_table_access';

export class WorkerLoginRejectedError extends Error {
  constructor(readonly reason: WorkerLoginRejection) { super(`worker_login_rejected:${reason}`); }
}

const COMMANDS = ['private.claim_research_task()', 'private.fail_research_attempt(uuid,text)',
  'private.complete_research_attempt(uuid,jsonb,jsonb)', 'private.record_agent_usage(uuid,text,integer,boolean)'];
// Platform and capability roles. A worker connecting as any of them is not the dedicated login, whatever it can do.
const RESERVED_LOGIN = /^(?:postgres|service_role|authenticator|anon|authenticated|dashboard_user|pgbouncer|supabase_.*|bagos_.*|pg_.*)$/;

/**
 * Read-only startup check that the connection is a dedicated login whose only authority is membership in
 * bagos_research_executor. It refuses the postgres/service-role credentials, superuser-like attributes, a session
 * that switched roles, any extra or administrable membership, and direct privileges on application tables. The error
 * carries a reason code only; the role name and connection details are never included.
 */
export async function verifyWorkerLogin(client: SqlClient): Promise<void> {
  const { rows } = await client.query(`select current_user::text as login, session_user::text as session_login,
      r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication as elevated,
      coalesce((select array_agg(g.rolname::text order by g.rolname::text) from pg_auth_members m
        join pg_roles g on g.oid = m.roleid where m.member = r.oid), '{}'::text[]) as memberships,
      exists (select 1 from pg_auth_members m where m.member = r.oid and m.admin_option) as administers,
      pg_has_role(current_user, 'bagos_research_executor', 'USAGE') as inherits_executor,
      -- to_regprocedure itself needs USAGE on the schema, so ask about the functions only when that holds.
      case when has_schema_privilege('private', 'USAGE') then (select bool_and(coalesce(has_function_privilege(
        to_regprocedure(f), 'EXECUTE'), false)) from unnest($1::text[]) f) else false end as can_execute,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f')
          and has_table_privilege(c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as table_access
    from pg_roles r where r.rolname = current_user`, [COMMANDS]);
  const row = rows[0];
  if (!row) throw new WorkerLoginRejectedError('reserved_login');
  if (typeof row.login !== 'string' || RESERVED_LOGIN.test(row.login)) throw new WorkerLoginRejectedError('reserved_login');
  if (row.session_login !== row.login) throw new WorkerLoginRejectedError('escalated_session');
  if (row.elevated !== false) throw new WorkerLoginRejectedError('elevated_attributes');
  const memberships = row.memberships;
  if (!Array.isArray(memberships) || memberships.length !== 1 || memberships[0] !== 'bagos_research_executor'
    || row.administers !== false) {
    throw new WorkerLoginRejectedError('unexpected_memberships');
  }
  if (row.inherits_executor !== true) throw new WorkerLoginRejectedError('executor_not_inherited');
  if (row.can_execute !== true) throw new WorkerLoginRejectedError('missing_command_privilege');
  if (row.table_access !== false) throw new WorkerLoginRejectedError('direct_table_access');
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
