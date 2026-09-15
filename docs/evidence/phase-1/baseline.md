# P1A baseline reconciliation evidence

Phase: P1A, per [IMPLEMENTATION_PHASES.md](../../IMPLEMENTATION_PHASES.md).

| Attempt | Date | Result |
| --- | --- | --- |
| 1 | 2026-09-12 | BLOCKED at project access |
| 2 | 2026-09-13 | BLOCKED at project access |
| 3 | 2026-09-13 | **PASS**, with two open items recorded below |

All checks were read-only. No write of any kind was attempted or performed at any point: no `db push`, no migration creation or repair, no `db reset`, no seed, no Auth Admin call, no invitation, no Storage write, no configuration change.

This file records observed results. It closes P1A only. It closes no R17 criterion.

## Target identity, verified before any other check

```
ref             ezsfdlkuzusylbqxqnod
name            i-STEMer
organization    cdqpgjxqkwztasiqigns
region          eu-west-2
status          ACTIVE_HEALTHY
postgres        17.6.1.166
created_at      2026-09-09T09:01:05Z
```

Every field matches the documented target. The Postgres version matches the value cached locally by the earlier CLI link in `supabase/.temp/`, which is independent corroboration that this is the same project that checkout was linked to. No other project was queried at any point.

## Migration ledger

```
supabase_migrations.schema_migrations
  version 20260909165106, name phase_1a_schema_security
```

Exactly one migration, matching the single local file. Applied statement count 92, applied length 25023 characters, md5 of the newline-joined statement array `cae8f52be1169ceda0fa2c07e15e2003`. That md5 is a fingerprint of the stored statement array, not of the source file, and is recorded so future runs can detect ledger tampering.

The ledger table carries no apply-time column, so the apply date cannot be read from it. The `phase-one-artifacts` bucket row was created `2026-09-12 12:37:51+00`, which indicates the migration was applied on 2026-09-12 rather than on the date in its filename. A CLI-generated migration filename records generation time, not apply time, so this is expected and is not drift.

## Schema and row-level security

All fifteen tables created by the migration are present, all with RLS enabled **and forced**, all owned by `postgres`.

| Schema | Tables |
| --- | --- |
| `public` | tenants, memberships, tenant_invitations, audit_log, command_receipts, campaigns, objectives, agent_runs, file_objects, artifacts, artifact_revisions, approvals |
| `private` | platform_admins, platform_audit, provisioning_operations |

Inventory agrees with T01 to T06, T09 to T12, T17, T22 and G02 to G04. No future-phase table exists. No view, materialized view, foreign table or partitioned table exists in `public`. Both private domains `sha256` and `bounded_payload` are present.

Trigger count on those fifteen tables is 40, which is the exact expected total: 15 identity guards, 15 delete rejections, 6 evidence-immutability triggers, the membership tenant lock, two deferred active-owner constraint triggers and the invitation transition guard. Zero triggers are disabled.

## Grants

Table-level SELECT to `authenticated` on exactly the nine tables the migration grants: tenants, memberships, campaigns, objectives, agent_runs, artifacts, artifact_revisions, approvals, file_objects.

Column-level SELECT to `authenticated` on exactly two tables, with the sensitive columns withheld as designed.

| Table | Granted | Withheld |
| --- | --- | --- |
| `tenant_invitations` | id, tenant_id, normalized_email, intended_role, issuer_reference, expires_at, state, created_at, updated_at | `token_hash`, `auth_delivery_reference`, `accepted_by`, `accepted_at`, `revoked_at` |
| `audit_log` | id, tenant_id, actor_kind, actor_reference, event_type, target_reference, target_revision, command_id, created_at | `evidence`, `updated_at` |

`anon` has no privilege on any `public` or `private` table. `service_role` has no privilege on any `public` or `private` table. `PUBLIC` has none. `command_receipts` has no client grant at all, satisfying the T22 rule that it is not directly client-readable.

## Helper roles and functions

| Role | canlogin | bypassrls | inherit | superuser | relations owned | authenticated is member |
| --- | --- | --- | --- | --- | --- | --- |
| `bagos_membership_reader` | false | false | false | false | 0 | false |
| `bagos_platform_reader` | false | false | false | false | 0 | false |

Both are NOLOGIN, NOBYPASSRLS, non-table-owners, and `authenticated` cannot reach either by role membership.

| Function | Owner | Security definer | search_path | EXECUTE |
| --- | --- | --- | --- | --- |
| `private.is_member` | `bagos_membership_reader` | yes | `""` | owner, `authenticated` |
| `private.is_platform_admin` | `bagos_platform_reader` | yes | `""` | owner, `authenticated` |
| `private.protect_identity` | `postgres` | no | `""` | `postgres` only |
| `private.reject_mutation` | `postgres` | no | `""` | `postgres` only |
| `private.lock_membership_tenant` | `postgres` | no | `""` | `postgres` only |
| `private.require_active_owner` | `postgres` | no | `""` | `postgres` only |
| `private.guard_invitation_transition` | `postgres` | no | `""` | `postgres` only |

No function in `private` retains default PUBLIC EXECUTE.

## Policies

22 policies, exactly the set the migration creates, with no additions.

- Helper-scoped, permissive: `helper_active_tenants` on tenants, `helper_own_membership` on memberships, `helper_own_platform_grant` on private.platform_admins.
- Authenticated, permissive: `tenant_read`, `membership_read`, `invitation_read`, `linked_file_read`, and `member_read` on each of audit_log, campaigns, objectives, agent_runs, artifacts, artifact_revisions, approvals.
- `storage.buckets`, restrictive to public: no insert, no update, no delete for the protected bucket.
- `storage.objects`, permissive to authenticated: `phase_one_artifact_read`. Restrictive to public: `phase_one_artifact_read_guard`, no insert, no update, no delete.

`private.platform_audit`, `private.provisioning_operations` and `public.command_receipts` carry RLS with no policy, which is the intended deny-all state until Phase 1C commands introduce their own constrained roles and policies.

`storage.allow_any_operation(text[])` exists on the target. The Phase 1A storage read policy depends on it, and its absence would have been a blocker.

## Storage

One bucket only.

```
id phase-one-artifacts, public false, file_size_limit null, allowed_mime_types null, owner null
```

Private as required. No second bucket exists.

## Emptiness

Every relevant relation is empty.

| Group | Relations checked | Rows |
| --- | --- | --- |
| Auth | users, identities, sessions, mfa_factors | 0 |
| Identity and evidence | tenants, memberships, tenant_invitations, audit_log, command_receipts | 0 |
| Business | campaigns, objectives, agent_runs, file_objects, artifacts, artifact_revisions, approvals | 0 |
| Private | platform_admins, platform_audit, provisioning_operations | 0 |
| Storage | storage.objects | 0 |

No Auth identity, invitation, platform grant, business row or stored object exists. This is consistent with the owner's report and with the prohibition on creating identities.

## Drift, classified not repaired

**D1. `postgres` is still a member of both helper roles. Not drift. Corrected explanation, 2026-09-13 reconciliation.**

An earlier draft of this file said the platform re-granted the membership after the migration ran. That was wrong, and no evidence supported it. The correct explanation is PostgreSQL 17's automatic role-creation grant.

Observed:

```
server           PostgreSQL 17.6
postgres         rolcreaterole true, rolsuper false
supabase_admin   rolsuper true  (bootstrap superuser)

bagos_membership_reader <- postgres, grantor supabase_admin, admin_option true, inherit false, set false
bagos_platform_reader   <- postgres, grantor supabase_admin, admin_option true, inherit false, set false
```

Exactly two membership rows exist, one per helper role.

In PostgreSQL 16 and later, when a non-superuser holding CREATEROLE creates a role, the server automatically grants the new role back to the creator WITH ADMIN OPTION so the creator can administer it. That automatic grant is recorded with the bootstrap superuser as grantor, and with INHERIT and SET both false.

The observed rows match that signature precisely, and the option flags are what distinguish it. An explicit `GRANT ... TO postgres` issued by `postgres` would record `postgres` as grantor, and would default to INHERIT true, because `postgres` has `rolinherit`, and SET true. Neither is what is stored.

So the sequence was: `create role` produced the automatic superuser-granted membership; the migration's explicit grant added a second row with `postgres` as grantor; the migration's `revoke ... from postgres`, executed as `postgres`, removed that second row and left the automatic one. The applied statement array confirms both the explicit grant and the revoke were present. Nothing re-granted anything, and no platform automation was involved.

Effect is unchanged from the earlier assessment even though the cause is different. `postgres` cannot inherit the helper roles and cannot `SET ROLE` to them, but holds ADMIN OPTION and can grant itself SET and INHERIT at will. This is no practical privilege increase, because `postgres` already has BYPASSRLS and owns every table.

The planning consequence also stands. Phase 1C is not locked out of altering `private.is_member` or `private.is_platform_admin`. It needs an explicit, auditable self-grant first, which belongs in the P1C migration and its review notes rather than being discovered mid-implementation.

**D2. `public.rls_auto_enable` and the `ensure_rls` event trigger are a verbatim copy of Supabase's documented example. Provenance resolved, one hardening decision open.**

The live definition was retrieved in full and compared against the "Auto-enable RLS for new tables" section of Supabase's Row Level Security guide. It matches the documented snippet exactly: same body, same tag filter, same `public`-only schema condition including its redundant second filter, same exception handler, same `RAISE LOG` strings, same `SECURITY DEFINER`, same `SET search_path = pg_catalog`. The only difference is that the documented example creates the function unqualified, which resolves to `public` for this role anyway.

| Property | Live | Documented example |
| --- | --- | --- |
| Owner | `postgres` | creator, here `postgres` |
| Security | DEFINER | DEFINER |
| search_path | `pg_catalog` | `pg_catalog` |
| Returns | `event_trigger` | `EVENT_TRIGGER` |
| Event | `ddl_command_end`, enabled `O` | `ddl_command_end` |
| Tag filter | `CREATE TABLE`, `CREATE TABLE AS`, `SELECT INTO` | identical |
| EXECUTE privilege | default PUBLIC | not revoked by the example |

Provenance is therefore explained: someone applied Supabase's own published recipe. It is neither machine-invented nor hostile. Attribution, meaning who ran it and on what date, is still unrecorded, but the object itself is now accounted for.

Security disposition: **low risk, hardening recommended, not urgent.**

- `search_path` is pinned to `pg_catalog`, so the classic SECURITY DEFINER search-path hijack does not apply. An earlier concern in the P1A review that the path might be unpinned is withdrawn.
- The function returns the `event_trigger` pseudo-type. PostgreSQL refuses to invoke such a function outside event-trigger context, and PostgREST does not expose functions with unsupported return types as RPC endpoints. A call to `/rest/v1/rpc/rls_auto_enable` therefore yields an error, not an effect.
- It reads and writes no tenant data, and touches no Phase 1A object.
- The two advisor warnings are true positives about the **grant** and false positives about **impact**. The grant exists because the documented example omits a revoke, not because of anything this project did.

Concrete remediation proposal, **not executed**, for inclusion in the P1C migration or a small dedicated hardening migration:

```sql
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
```

Rationale: PostgreSQL does not check EXECUTE privilege when firing a trigger or event trigger, so revoking it clears advisories 0028 and 0029 without disabling the auto-enable behaviour. Validate that in the disposable rehearsal environment described in P1G step one before applying it to the target, rather than taking the claim on trust. Do not drop the function or the event trigger, since that would remove a safety net for later phases.

**Operational consequences to carry into P1C and P1E, independent of the security question.** These matter more than the advisory does.

1. The trigger enforces only schema `public`. New tables created in `private` receive nothing. P1C must enable RLS on every new private table explicitly.
2. It runs `enable row level security` only. It does not force RLS and it creates no policy. The Phase 1A baseline forces RLS on all fifteen tables, so any later table that leaned on this trigger would be weaker than the baseline it sits beside.
3. Its exception handler downgrades every failure to `RAISE LOG`. A failure to enable RLS is silent.
4. The local PGlite harness has no equivalent event trigger, so local and remote differ. Migration review for P1C and P1E must state RLS explicitly and must not rely on `ensure_rls` in either environment.

## Security advisor results

Read-only advisor run on 2026-09-13.

| Level | Finding | Assessment |
| --- | --- | --- |
| INFO | `rls_enabled_no_policy` on private.platform_audit, private.provisioning_operations, public.command_receipts | Intended. Deny-all by design until Phase 1C commands add constrained policies. No action. |
| WARN | `anon_security_definer_function_executable` on `public.rls_auto_enable` | See D2. Inherited from Supabase's documented example, which omits a revoke. True positive on the grant, false positive on impact. Remediation proposed, not applied. |
| WARN | `authenticated_security_definer_function_executable` on `public.rls_auto_enable` | See D2. Same object, same disposition. |

No advisory names any table, policy, function or grant created by the Phase 1A migration.

## Exposed schemas, reconciled with the remote preflight

This is the one closure input not covered by current direct evidence, and the reconciliation is recorded rather than papered over.

**Prior direct evidence.** [REMOTE_SUPABASE_APPLY_PREFLIGHT.md](../../REMOTE_SUPABASE_APPLY_PREFLIGHT.md) records an authenticated read-only Management API GET to `/v1/projects/ezsfdlkuzusylbqxqnod/postgrest`, returning:

```
db_schema              public,graphql_public
db_extra_search_path   public, extensions
```

That is genuine direct configuration evidence, and it excludes `private`. Its limitation is date. It was captured on 2026-09-09, before the migration was applied on 2026-09-12, at a point when the preflight also records that the `private` schema did not yet exist.

**Current attempt.** No read-only surface available to this session returns the setting. It is PostgREST service configuration, not database state: it is absent from `pg_db_role_setting`, absent from any catalog relation, and no tool on the connected Supabase MCP server exposes the PostgREST service config. This is an unavailable surface, not a failed command.

**Bridging evidence, and its limits.** The applied migration contains zero statements referencing `db_schema` or `pgrst`, confirmed by scanning the stored statement array recorded in the migration ledger; this is a scan of what was recorded at apply time, not a live check of current PostgREST state. The earlier assertion that exposed schemas "cannot be changed by SQL" is withdrawn. PostgREST documents in-database configuration surfaces, including `pgrst.db_schemas` under database role settings (see https://docs.postgrest.org/en/v12/references/configuration.html), which in principle allow SQL to influence the effective exposed-schema list. Whether this project's PostgREST instance honours in-database overrides has not been established here, and no new live check has been run. Only the narrower migration statement-array observation stands. Separately, the security linter reports RPC reachability for `public.rls_auto_enable` and reports nothing for `private.is_member` or `private.is_platform_admin`, which is consistent with `private` being unexposed.

Neither of those is a substitute for reading the setting. The first shows only that one known actor did not write such a statement into the recorded migration; it says nothing about dashboard edits or in-database role SETs whose effective support in this project has not been established. The second is advisor inference, which this reconciliation was explicitly instructed not to substitute for direct evidence.

**Disposition.** Treat exposed-schema exclusion of `private` as supported by dated direct evidence plus consistent indirect evidence, and as **not currently confirmed**. To close it, re-run the same authenticated read-only call the preflight used:

```
GET /v1/projects/ezsfdlkuzusylbqxqnod/postgrest
```

Record only `db_schema` and `db_extra_search_path`, as the preflight did, with no token printed or stored. Alternatively, grant this session a surface that returns the PostgREST service configuration. Required before P1G sign-off, and worth re-checking again immediately before any P1C deployment, since a dashboard edit would not appear in the migration ledger.

## Open items

**O1. Current direct confirmation of Data API exposed schemas.** See the section above. Dated direct evidence is favourable; current direct evidence is outstanding.

**O2. Hardening decision on `public.rls_auto_enable`.** Provenance is resolved, it is Supabase's documented example. What remains is a decision on the proposed EXECUTE revoke in D2, plus an optional attribution note recording who installed it and when. Not repaired here: P1A classifies drift and does not repair it, and repair was not authorized.

Neither open item blocks P1B. Both should close before P1G sign-off.

## Separation of historical from real-service evidence

Historical, and still historical: the 23-of-23 PGlite result in [PHASE_1A_SCHEMA_SECURITY.md](../../PHASE_1A_SCHEMA_SECURITY.md) ran in-process against `supabase/tests/platform-stubs.sql`, with stubbed `auth.uid()`, stubbed `storage.buckets`, stubbed `storage.objects` and a stubbed `storage.allow_any_operation`. It proves SQL shape only. It is not promoted by this run and must not be cited as real-service proof.

Real-service evidence produced here: catalog, grant, policy, role, function, trigger, bucket, row-count and advisor state on the live target, all read-only. It does not exercise Auth sessions, JWT claims, assurance levels, PostgREST or RPC behaviour, Storage HTTP, or concurrency. Those remain X02 to X05 and are unaddressed.

The PGlite harness was not re-run. P1A asks about remote state.

## Preserved source hashes

Unchanged across all three attempts.

| File | SHA-256 |
| --- | --- |
| `supabase/migrations/20260909165106_phase_1a_schema_security.sql` | `9550eee23242a5035d5f9d4644568cf7d35f320f39f0bc57cf94a9449768287b` |
| `supabase/tests/phase-1a.test.mjs` | `862702640ed717fe2160e8c79c4f660e9847c955417681a18636250affd4405c` |
| `supabase/tests/platform-stubs.sql` | `4f104316d9046bc134f1cafa0966a4dd3b93fce19ecc08d30efcbfab641a2b89` |
| `supabase/preflight-phase-1a.sql` | `0eff634f0aaa191d315f082ae2423fe3c1fe50377f5d7bde129e00652b90c0fc` |

Working tree at HEAD `5c425e3ab1c4a48e11762676efe73c95517b0cd8`, nothing staged, no pre-existing file modified.

## Reassessment against the stated P1A closure criteria

P1A closes when: the ledger contains the exact applied migration; there is no unexplained security drift; the schema inventory agrees with T01 to T06, T09 to T12, T17, T22 and G02 to G04; historical PGlite evidence stays separated from real-service proof; real Supabase read-only verification has been performed; and no permission, configuration or network failure has occurred.

| Criterion | State | Basis |
| --- | --- | --- |
| Ledger contains the exact applied migration | **Complete** | One ledger row, 92 statements, fingerprint recorded |
| Schema inventory agrees with the T and G identifiers | **Complete** | Fifteen tables, RLS enabled and forced, 40 triggers, no extras, both domains |
| No unexplained security drift | **Complete** | D1 explained by PostgreSQL 17 role-creation semantics with option-flag evidence; D2 explained as a verbatim documented Supabase example |
| Historical PGlite evidence kept separate | **Complete** | Stated in this file and in the traceability matrix; harness not re-run |
| Real Supabase read-only verification performed | **Complete** | Catalog, grants, policies, roles, functions, triggers, bucket, counts, advisors |
| No permission, configuration or network failure | **Complete** | Every issued command succeeded on the third attempt |

Unresolved, and deliberately not folded into the rows above:

| Item | Why it is not a closure failure | Needed before |
| --- | --- | --- |
| O1 exposed schemas, current direct read | Not a failed command. The PostgREST service-config surface is unavailable to this session. The earlier "cannot be changed by SQL" claim is withdrawn: PostgREST documents in-database configuration such as `pgrst.db_schemas` (https://docs.postgrest.org/en/v12/references/configuration.html), and this project's effective support has not been established. Dated direct Management API evidence from 2026-09-09 excludes `private` | P1G sign-off, and re-check before P1C deployment |
| O2 `rls_auto_enable` EXECUTE revoke | A hardening decision on a pre-existing documented-recipe object, not drift from the Phase 1A source | P1G sign-off |
| Attribution for D2 | Who installed the documented snippet, and when, is unrecorded | P1G sign-off, informational |

Two corrections this reconciliation makes to earlier records, both recorded rather than silently overwritten: the D1 re-grant claim was wrong and is replaced by the PostgreSQL 17 explanation, and the D2 concern about an unpinned search path was wrong, since the path is pinned to `pg_catalog`.

## Gate

P1A is **PASS**, unchanged by this reconciliation. The applied baseline matches its source in schema, row-level security, grants, helper-role constraints, function ownership, policy set, bucket privacy and emptiness. Both drift items are now explained with evidence rather than conjecture, and neither originates in the Phase 1A migration.

**P1B may not begin.** Its stated dependency is P1A **plus OI01 to OI03**, and all three operational owner inputs remain outstanding: D05 recovery provider and procedure, D09 secret rotation and handover, D04 support escalation. P1A passing removes the technical blocker only. OI04 separately continues to block any identity creation or invitation.

## Preservation manifest reference (2026-09-13)

- Snapshot directory: `C:\Users\Eltaweel\AppData\Local\Temp\business-agent-os-preservation\20260913T170057Z-5c425e3ab1c4`
- Durable copy: `D:\Abdo\Private\STEMer\Claude code\Building\_preservation\business-agent-os\20260913T170057Z-5c425e3ab1c4`
- Manifest SHA-256: `93737426a0abdb040d84a8abc8ec2ad050160662660fcb6f8a9cf076016d440c`
- Observed inventory count: `149` (`149` copied, `0` skipped, `0` tracked deletions)
- HEAD SHA at snapshot time: `5c425e3ab1c4a48e11762676efe73c95517b0cd8`

This evidence line is intentionally recorded AFTER the snapshot and is therefore not itself included in the snapshot's manifest; this avoids self-referential hash drift.

Snapshot is source-only. It does not back up secrets, environment configuration, Auth identities, Storage bytes or database state.
