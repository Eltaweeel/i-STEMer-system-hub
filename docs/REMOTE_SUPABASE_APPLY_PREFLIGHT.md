# Remote Supabase apply preflight

## Authorized deployment verification — 2026-09-12

**Command/history verdict: PASS — the reviewed migration is already recorded remotely.**

The owner explicitly authorized exactly `npx supabase db push --linked` for
`ezsfdlkuzusylbqxqnod`. This authorization supersedes the historical preflight's
"NOT authorized" statements preserved below; it does not authorize other migrations.

Before execution, project discovery and `supabase/.temp/project-ref` both matched
the linked i-STEMer project in eu-west-2, ACTIVE_HEALTHY. The local migration
directory contained exactly one migration:
`20260909165106_phase_1a_schema_security.sql`. Its SHA-256 still matched the reviewed
file: `9550eee23242a5035d5f9d4644568cf7d35f320f39f0bc57cf94a9449768287b`.

Executed from `D:\Abdo\Private\STEMer\Claude code\Building\business-agent-os`:

```powershell
npx supabase db push --linked
```

**Exit code: 0.** Command output, with terminal control sequences removed:

```text
Initialising login role...
Connecting to remote database...
Remote database is up to date.
A new version of Supabase CLI is available: v2.117.0 (currently installed v2.109.1)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
```

The command reported no pending migration and no application in this run. It did
not report a migration error. No password prompt appeared and no CLI update was
installed. No profile flag, credentials, seed, role-file, or extra migration flags
were supplied. No Auth users or invitations were created by this task; application
code and migration files were unchanged. No additional migrations, resets, repairs,
or commits were performed.

Read-only verification with `npx supabase migration list --linked` also exited 0:

| Local version | Remote version | Migration timestamp shown by CLI |
| --- | --- | --- |
| 20260909165106 | 20260909165106 | 2026-09-09 16:51:06 |

An additional read-only `npx supabase db query --linked` attempted to inspect
migration metadata, installed tables/RLS, functions, triggers, policy counts and
the private bucket. It returned **exit code 1** after waiting for a connection:

```text
LegacyDbConfigConnectTempRoleError
failed to connect as temp role: failed to connect to postgres: effect/sql/SqlError: PgClient: Failed to connect
Suggestion returned by the CLI: Connect to your database by setting the env var correctly: SUPABASE_DB_PASSWORD
```

No SQL result was returned. Those supplementary catalog checks are **UNVERIFIED
in this run**. This is a separate diagnostic connection failure, not a migration
application error. The successful push result and matching migration-history
check remain verified. No password prompt appeared, and no password was requested,
printed, saved or supplied to work around this error. No migration was retried.

The reviewed version is recorded as applied. The filename in the authorization's
verification checklist, `20260909165196_phase_1a_schema_security.sql`, contains a
timestamp typo. The reviewed local filename and remote version both use
`20260909165106`; no file was renamed or created to match the typo.

The earlier empty history is a historical snapshot. This run does not establish
who applied the migration or when; the timestamp displayed above is the migration
version timestamp, not a verified deployment timestamp. The successful command
and matching history do not by themselves prove all runtime Auth/Storage behavior.

## Historical read-only preflight — 2026-09-10

The following records the earlier read-only preflight. Its statements about an
empty application schema, pending migration, and withheld deployment authorization
describe that earlier snapshot, not the current deployment state.

**Verdict: PASS — read-only preflight. Remote application is NOT authorized.**

Updated: 2026-09-10. Repository: `D:\Abdo\Private\STEMer\Claude code\Building\business-agent-os`.

This run supersedes the earlier named-profile failure. Per the owner's corrected instructions, every Supabase command used the current authenticated account without a profile flag. The installed CLI reported **2.109.1**, rather than the 2.109.4 mentioned in the request. Only this report was intentionally edited. No migration, application code, Auth user, invitation, credential configuration or commit was created or changed. No non-dry-run push was run.

## Project identity and repository link

`npx supabase projects list` succeeded and included:

| Field | Verified value |
| --- | --- |
| Name | i-STEMer |
| Project ref | ezsfdlkuzusylbqxqnod |
| Region | eu-west-2 |
| Status | ACTIVE_HEALTHY |
| Organization | cdqpgjxqkwztasiqigns |
| Linked | true |
| PostgreSQL version | 17.6.1.166 |

`supabase/.temp/project-ref` independently matched the exact target. No relinking or reauthentication was performed.

## Migration history and object collisions

`npx supabase migration list --linked` succeeded after the dry-run, with one local migration and an empty remote entry:

`supabase/migrations/20260909165106_phase_1a_schema_security.sql`

Read-only catalog queries independently confirmed:

- Zero public tables, partitioned tables, views, materialized views or sequences.
- No `private` schema.
- Neither `bagos_membership_reader` nor `bagos_platform_reader` exists.
- Zero policies in `public`, `private` and `storage`.
- No bucket with ID or name `phase-one-artifacts`.
- Managed `auth.users`, `storage.buckets` and `storage.objects` exist. Both Storage tables have RLS enabled and are owned by `supabase_storage_admin`.

No collision was found among the inspected objects. Zero migration history was not treated as proof of an empty database. The future bucket's private setting remains a migration definition, not an already-deployed bucket.

## Effective Data API exposure

A read-only authenticated Management API GET to `/v1/projects/ezsfdlkuzusylbqxqnod/postgrest` returned:

| Setting | Current value |
| --- | --- |
| `db_schema` | `public,graphql_public` |
| `db_extra_search_path` | `public, extensions` |

**PASS: `private` is excluded from the configured Data API exposed schemas and extra search path.** This resolves the earlier uncertainty from NULL session settings. The existing CLI credential was used only in process memory for the official API request; no token was printed or saved. Only the two non-secret settings above were output.

Reference: [Supabase Management API: retrieve PostgREST configuration](https://supabase.com/docs/reference/api/v1-get-postgrest-service-config).

## Managed Storage and function permissions

Remote catalog SELECTs executed as `postgres`.

| Required capability or dependency | Result |
| --- | --- |
| CREATE on database and public schema | true |
| CREATEROLE | true |
| USAGE on auth and storage schemas | true |
| REFERENCES on auth.users(id) | true |
| EXECUTE on auth.uid() | true |
| INSERT on storage.buckets | true |
| SELECT WITH GRANT OPTION on storage.objects | true |
| storage.allow_any_operation(text[]) | present |
| postgres and authenticated EXECUTE on that helper | true |
| authenticated EXECUTE on storage.operation() | true |
| postgres inherited supabase_privileged_role privileges | true |
| postgres membership in supabase_storage_admin | false |

The effective `supautils.policy_grants` setting explicitly lists `storage.buckets` and `storage.objects` for `postgres`. This establishes the managed permission to create policies on those tables despite their different owner. Supabase documents that this setting permits CREATE/ALTER/DROP/COMMENT ON POLICY without table ownership: [supautils table ownership bypass](https://github.com/supabase/supautils#table-ownership-bypass).

The helper normalizes an optional `storage.` prefix and delegates operation matching to `storage.operation()`. The migration uses existing managed helpers; it does not replace their definitions or transfer ownership of managed functions.

The new helper-owner roles are absent from both the reserved-role patterns and reserved-membership list. The migration creates ordinary NOLOGIN/NOINHERIT/NOBYPASSRLS roles, grants temporary membership to postgres and temporary CREATE on the new private schema, transfers ownership of its own functions, then revokes the temporary grants. Catalog privileges and the SQL sequence support this path; the ownership-transfer sequence was not executed during this read-only preflight.

**No missing helper or required catalog-level permission was identified.** Actual migration execution and Storage HTTP behavior remain untested by this preflight.

## Dry-run result

Exact command from the repository:

```powershell
npx supabase db push --linked --dry-run
```

**Exit code: 0.** Output:

```text
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
Finished supabase db push.
 • 20260909165106_phase_1a_schema_security.sql
```

The CLI also advertised an available update to 2.117.0 while identifying its installed version as 2.109.1. No update was installed. No database password prompt appeared.

The dry-run successfully planned exactly the Phase 1A migration. It does not execute the SQL, prove transactional replay or validate application behavior. Docker was not required for this successful command.

## Evidence limits and errors

Commands included `npx supabase projects list`, `npx supabase --version`, `npx supabase migration list --linked`, read-only CLI help, `npx supabase db query --linked` with catalog SELECTs, and the dry-run above. Effective API configuration was obtained through the GET documented above.

One multiline catalog-query invocation failed with HTTP 400 and PostgreSQL `42601: syntax error at end of input`. The same consolidated SELECT submitted as a single-line argument succeeded. This was a failed read-only diagnostic invocation; no DDL or migration was submitted by it.

The CLI printed `Initialising login role...` during database operations. This is the CLI's managed connection setup; no custom remote DDL, application/Auth user creation or data-mutation SQL was issued by this task.

Docker is unavailable and was not installed. Docker-dependent `db diff --linked`, full local Supabase replay and pgTAP remain **UNVERIFIED**. The earlier reported 23/23 PGlite tests were not rerun here and are not evidence of production Auth/Storage behavior. This preflight does not substitute for the separate Phase 1A schema/security review or post-deployment verification.

## Remaining blockers and authorization

No technical blocker remains in the requested read-only identity, migration-plan, collision, Data API configuration and managed permission checks. Execution-level validation remains outside this task, as described above. Results are a point-in-time snapshot; recheck the target and pending migration list before a later authorized deployment.

**Remote apply is NOT authorized.** A separate explicit owner instruction is required. The exact later command, only after that authorization and from this repository, is:

```powershell
npx supabase db push --linked
```

**Final verdict: PASS — read-only preflight only.**
