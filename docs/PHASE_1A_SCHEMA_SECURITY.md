# Phase 1A local schema and security foundation

2026-09-09. Local implementation only, authorized by the owner's Phase 1A request.
No remote SQL, application, push, reset, deletion, Auth user creation, invitation
creation/delivery, UI or route change occurred. Existing uncommitted files were
preserved. The owner's latest report says the linked i-STEMer project is
ACTIVE_HEALTHY with zero recorded migrations; this work does not independently
verify that report or assume the database has no tables. The older project-context
and planning gate documents remain historical and were not rewritten.

## Files and scope

- `supabase/migrations/20260909165106_phase_1a_schema_security.sql`: generated using
  Supabase CLI 2.109.1 `migration new`, then populated locally. One transaction
  creates the approved schema, helpers, constraints, indexes, explicit grants,
  RLS and the empty private `phase-one-artifacts` bucket.
- `supabase/tests/phase-1a.test.mjs`, `platform-stubs.sql`, `package.json`,
  `package-lock.json`: isolated, pinned PGlite 0.5.8 executable SQL/static suite.
  No root or application package dependency changes.
- `supabase/preflight-phase-1a.sql`: catalog-only review prepared for later use.
  It has not been executed against the linked project.

Authority: [master plan](product-architecture/FULL_PROJECT_MASTER_PLAN.md) R04,
R05, R06, R09 and R17; [gap matrix](PHASE_1_GAP_MATRIX.md); Phase 0 architecture.
The latest restricted implementation request authorizes this local foundation,
not activation of the full Phase 1 flow or resolution of operational gates.

| Approved records | Created schema |
| --- | --- |
| T01–T04, T22 | tenants, memberships, tenant_invitations, audit_log, command_receipts |
| T05, T06, T09 | campaigns, objectives, minimal synthetic agent_runs |
| T17, T10, T11, T12 | file_objects, artifacts, artifact_revisions, read-only approvals |
| G02–G04 | private.platform_admins, private.platform_audit, private.provisioning_operations |
| G01 | References existing Supabase-managed auth.users; never creates/replaces it |

No future entities, users, invitation records, privileged command RPCs, seed
deployment, uploads or object bytes are created. The invitation/provisioning
tables provide storage for later commands, not a working acceptance saga.

## Security decisions and assumptions

Every application table has enabled and forced RLS. Anonymous access and direct
authenticated DML/TRUNCATE are revoked explicitly, including legacy default
grants. Service-role grants on these new application tables are also revoked;
service_role is inherently BYPASSRLS and must never represent a tenant caller.
No mutation policy or command grant is enabled. Private schema must stay outside
Data API exposed schemas; schema USAGE enables policy evaluation only.

Membership reads consult current database status and the current Auth subject,
never editable metadata or JWT role labels. Owner/operator are the only accepted
membership roles. Operators see their own active membership; owners see their
tenant roster. Platform grants do not grant tenant content. Invitations expose
only selected management columns to the owning issuer. Token hashes, delivery
references and audit evidence are not granted to clients. Receipts and all private
platform tables have no client table grants.

The two SECURITY DEFINER helpers are owned by separate NOLOGIN/NOBYPASSRLS roles
that own no tables, have fixed empty search paths, read-only column grants and
nonrecursive own-subject policies. They return booleans and cannot accept another
user ID. PUBLIC/anon execution is revoked. Temporary postgres role membership and
schema CREATE needed for ownership transfer are removed in the transaction.
Other functions are invoker trigger functions, not callable workflow commands.

Tenant-owned references use composite foreign keys. The current revision FK also
includes artifact ID, preventing a same-tenant pointer to another artifact's
revision. IDs, tenant IDs and creation times cannot change; membership user IDs
cannot change. Evidence, receipts, approvals, revisions and file metadata reject
updates; deletion is disabled. Mutable rows get server update timestamps.
Deferred owner constraints reject active/suspended tenants without an active
owner. Membership writes update/lock the tenant row to serialize changes and
invalidate stale repeatable-read writers. Future command roles must have narrow
grants/policies and use this same lock; concurrent multi-connection proof remains
outstanding. A pending tenant supports the approved provisioning saga and is not
readable. Synthetic-only constraints prevent live runs/non-demo tenants.

Engineering choices within the approved model: UUID opaque file names; bounded
version-1 JSON objects (16 KiB, an implementation safety bound rather than a
product upload quota); positive revision numbers; canonical lowercase SHA-256;
pending-only approval state and numeric tiers 0–2. Digests are format-checked,
not recomputed against bytes by SQL. A later trusted seed/command must compute
digests and validate/redact complete payloads. JSON bounds do not detect secrets.
Exposed business snapshots must contain only synthetic, safe review data.
The existing DTO's operator approver vocabulary is preserved but grants no rights.

Invitation expiry and acceptance-field consistency, terminal-state protection,
immutable invite intent and one-open-invite-per-email constraints exist. Actual
verified email matching, MFA, role ceilings, wall-clock expiry at acceptance,
atomic membership/audit/receipt writes and delivery reconciliation require later
commands. No acceptance function exists to bypass these missing checks. Receipt
uniqueness is scoped to tenant/actor/kind/key; comparing a replay digest and returning
its result is future command work, not claimed by uniqueness alone.

## Storage

The migration creates a private bucket without adopting or overwriting an existing
bucket. Object SELECT requires the exact bucket/key linked to a published T17 row
and a readable T11 revision, plus current membership in the active tenant. Parent
policies never query Storage, avoiding recursion. Keys must be
`tenant_id/file_object_id/opaque_uuid`. Orphans and forged prefixes fail.

Operation-aware SELECT permits only `object.get_authenticated` and
`object.get_authenticated_info`. Listing and signed-URL operations are excluded.
Restrictive policies prevent existing permissive object policies from widening
this bucket's reads or allowing writes, while leaving other buckets' policies
alone. Restrictive bucket policies also prevent clients from making the bucket
public, renaming it or deleting it. Supabase-owned storage.objects and
storage.buckets must already have RLS enabled. The migration does not ALTER or
replace those managed tables. Required Storage helper availability
must be verified before application; missing helpers fail migration transactionally.
The future server streaming handler must use the requesting user's JWT and check
access on each new request. This phase does not implement or test that handler.
Database administrators/Storage service bypass credentials remain trusted; SQL
policies cannot revoke bytes already downloaded.

## Verification and honest limits

Run from the repository root:

```powershell
npm ci --prefix supabase/tests --ignore-scripts
npm test --prefix supabase/tests
git diff --check
```

The suite executes the exact migration in an in-memory PostgreSQL engine, then
performs SQL queries under non-superuser session identities. It checks allowed
reads before denied reads for two tenants, owners/operators, multi-membership,
revoked membership, unknown subject and platform-only access; grants, helper
ownership/escalation, private columns, direct DML, same/cross-tenant FK injection,
immutable rows, last-owner protection, revocation/suspension with unchanged
subject claims, Storage linkage/operation/write predicates and invalid payloads.

Auth and Storage interfaces are explicitly stubbed. No Auth users or invitations
are inserted. Only the Auth-user FK triggers are temporarily disabled while
loading synthetic membership/platform subject references in the disposable test
engine; they are restored before security tests and a negative Auth FK test proves
new nonexistent references fail. All application triggers stay enabled. Never run
the stub or fixture harness against any Supabase project.

Initial runs failed on deferred fixture trigger events and test session identity
restoration. The fixture now flushes pending constraints before restoring FK
triggers, uses SESSION AUTHORIZATION for escalation checks, and verifies return
to postgres after each test operation. These were harness failures, not omitted
tests. Final verification: **23/23 SQL/static tests passed**, including collision
rollback preserving pre-existing data, receipt-key uniqueness/immutability and
bucket-publication denial despite broad existing policies. `git diff --check`
passed for tracked changes; new text files also passed the whitespace check.

Docker and psql are unavailable here. Consequently full Supabase/pgTAP, managed
postgres ownership permissions/advisors, real JWT verification and MFA,
PostgREST/RPC, Storage HTTP/signing/public URL behavior, concurrency, invitation
saga, browser and streaming tests were not run. PGlite success is local SQL
evidence; it does not satisfy full R17/X03 acceptance or production readiness.

## Later migration application and recovery

Stop here for this task. Before any remote application, separately authorize and
review the catalog preflight and a schema-only inventory/diff, including existing
private schema, application names, custom roles, helper signatures, Storage bucket,
policies, grants and Data API exposure. Zero migration history is insufficient.
This is a fail-on-collision baseline: even an existing private schema requires
reconciliation. Do not use IF NOT EXISTS, migration repair or drops to conceal a
collision. Determine whether existing objects need a reviewed baseline or additive
upgrade/backfill, preserving their data. No backfill is performed here.

After that review, operational prerequisites, a backup/recovery checkpoint and
separate deployment authorization, run from the repository root:

```powershell
supabase db push --linked --dry-run
supabase db push --linked
```

The second command is the exact later remote application command (CLI 2.109.1
help verified). Neither command was run. Do not add --include-seed, --include-all,
--include-roles, reset, repair, passwords or credentials in command arguments.
Use the already authorized CLI credential mechanism when deployment is approved.

DDL and grants are in one transaction: any collision or failure rolls back that
migration. No destructive down migration is supplied. After a successful future
application, suspend activation and fix forward using reviewed migrations;
restore only under a separately approved recovery procedure. Retention, deletion,
reset and backup expiry remain unresolved owner-policy gates. Recovery email,
secret handover and support escalation procedures remain outstanding in the
planning ledger; this local task does not invent them.

Current implementation references checked on 2026-09-09:
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage operation helpers](https://supabase.com/docs/guides/storage/schema/helper-functions),
[private downloads](https://supabase.com/docs/guides/storage/serving/downloads),
[PGlite runtime](https://pglite.dev/docs/).
The Supabase changelog was checked; no relevant breaking change was identified
for the SQL features used here. Real project compatibility remains unverified.
