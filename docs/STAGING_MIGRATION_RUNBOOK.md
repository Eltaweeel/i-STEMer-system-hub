# Staging migration path: Phase A (Omar usage) and Phase B (the six approval migrations)

Audience: **Hunter, on the VPS.** Nothing here has been run against the hosted project. Claude Code prepared and
rehearsed it locally; every remote step below is for the operator, after the approvals named in each phase.

Adam, Nour and Ziad worker services stay **disabled** throughout and after both phases (see "Workers stay off").

## Recorded baseline and local evidence

| Kind of evidence | Source | What it says |
|---|---|---|
| Hosted ledger (owner SELECT, 2026-09-26) | owner-run query | 26 versions recorded, through `20260921080000` |
| Hosted catalog (owner SELECT) | owner-run query; `docs/evidence/phase-1/baseline.md` | PostgreSQL 17.6. `postgres` is not superuser; CREATEROLE, BYPASSRLS, INHERIT. Its memberships in `bagos_*` roles are the automatic creator grants only (ADMIN true, INHERIT false, SET false). `bagos_approval_command` has no CREATE on `private`. None of the six pending migrations' objects exist. |
| Local rehearsal, real PostgreSQL 17.6, non-superuser `postgres` | `supabase/tests/hosted-roles.test.mjs` and `tls-handshake.test.mjs` (`npm run test:hosted`, as an unprivileged user) | Replaying the 26 as non-superuser `postgres` reproduces exactly the membership row and the missing CREATE above. Failures and repairs below are measured there. |
| Local PGlite suites | `supabase/tests/*.test.mjs` (others) | Functional SQL behaviour. **PGlite runs as superuser** and cannot show ownership or grant failures. |
| Hosted application | — | **NOT RUN.** |

To rerun the rehearsal: `cd supabase/tests && npm ci && npm run test:hosted` (serial execution; real PostgreSQL 17.6
binaries come from the pinned `embedded-postgres` packages). On Linux, npm must be allowed to run the binary package's
postinstall step, which restores its library symlinks.

The recorded hosted observations are snapshots, not current verification. The local rehearsal cannot establish the
target's current role graph, function owners/ACLs, platform identities, auth GRANT OPTION, database hooks or active
sessions. The preflight below must be repeated on the target under separately authorized hosted work.

## The hosted-role problem in the six pending migrations (reproduced, then repaired)

Run as non-superuser `postgres` on PostgreSQL 17.6, the **unrepaired** files fail like this:

| File:line (unrepaired) | Statement | Result as non-superuser postgres | Why |
|---|---|---|---|
| 090000:32 | `grant execute on function private.is_member(...) to bagos_approval_command` | **ERROR 42501** "permission denied for function is_member"; only a WARNING if `postgres` inherits `authenticated` | `is_member` belongs to `bagos_membership_reader`; ADMIN on that role confers no object authority |
| 090000:147 | `alter function create_finished_post_package ... owner to bagos_approval_command` | **ERROR 42501** "permission denied for schema private" | line 146's self-grant gives SET, but the new owner also needs CREATE on `private`, which it lacks |
| 090000:149-151 | revoke/grant on that function, after the membership is revoked | **WARNING only**; PUBLIC and `anon` keep EXECUTE on the SECURITY DEFINER function | postgres no longer owns it, so GRANT/REVOKE silently do nothing |
| 100000:82, 110000:63, 120000:9 | `create or replace function private.create_finished_post_package` | **ERROR 42501** "must be owner of function create_finished_post_package" | replacing needs the owner's privileges, i.e. an INHERIT membership |
| 090000:30-31 | grants on `auth` to `bagos_approval_command` | WARNING only, **unless** `postgres` holds GRANT OPTION on `auth` | the same pattern is in already-applied migrations; see preflight P6 |

Each migration is one transaction, so every ERROR above rolls its whole file back; nothing partial is left. 130000 and
140000 only replace `postgres`-owned functions and have no ownership problem.

**Repair** (in place, because none of these versions is recorded anywhere and 090000 can never commit as written, so a
later forward repair could not rescue it). Each temporary authority is the least the statement needs, and is revoked in
the same transaction:

| File | Change |
|---|---|
| 090000 | `is_member` grant inside `grant bagos_membership_reader to postgres with inherit true, set false` ... `revoke` |
| 090000 | function ACL set **before** the transfer (it carries over); transfer inside `grant create on schema private to bagos_approval_command` + `grant bagos_approval_command to postgres with inherit false, set true` ... both revoked |
| 100000, 110000, 120000 | each `create or replace` of that function inside `grant bagos_approval_command to postgres with inherit true, set false` ... `revoke` |

Rehearsal result for the repaired files: all six apply in order with **zero WARNINGs**; afterwards `postgres`'s
memberships are exactly as before, no `bagos_*` role has CREATE on `private`, PUBLIC/anon/service_role have no EXECUTE
on `create_finished_post_package`, `authenticated` has it, and `bagos_approval_command` can execute `is_member`.

## Order and dependencies

| Version | Depends on (beyond the 26 applied) | Touches | Applied in |
|---|---|---|---|
| 20261008120000 Omar usage | none | new `private.record_research_usage`; revokes `record_agent_usage` from `bagos_research_executor` | **Phase A** |
| 20260921090000 | none | new table, `create_finished_post_package`, `is_member` grant | Phase B, 1st |
| 20260921100000 | 090000 | replaces approve/reject/create_finished_post_package/read_tenant_approvals | Phase B, 2nd |
| 20260921110000 | 100000 | new `finished_post_calendar_approved`; replaces approve/create/reject | Phase B, 3rd |
| 20260921120000 | 110000 | replaces create/reject | Phase B, 4th |
| 20260921130000 | 120000 | replaces approve/reject | Phase B, 5th |
| 20260921140000 | 130000 | replaces `retry_agent_workflow` | Phase B, 6th |

The Omar migration and the six share no object. The rehearsal applies Omar first and the six after, and compares the
result with applying all seven in file order: functions (owner, SECURITY DEFINER, config, body hash, ACL), tables (owner,
RLS flags, ACL), policies, schema ACLs, role memberships and the ledger rows are **identical**.


That comparison covers the objects in that snapshot and the ledger's version, name and stored statements; it does not
cover every catalog object.

## A pre-existing exposure, and the pilot decision it forces

The approve/reject commands **in the recorded staging baseline** (`20260915225738`, `20260920140000`, exposed to
`authenticated` by the public wrappers in `20260920160000`) have NULL-blind checks: a caller with no membership row, or
a JWT without an `aal` claim, passes them, and a NULL `expected_digest` skips the digest check. Any signed-in user who
knows a tenant id and an approval id could approve or reject that tenant's pending decision. The rehearsal reproduces it
(an outsider reaches `approval not found` instead of `owner approval required`). Phase B's `20260921130000` is the fix.

The earlier staging notes reported no tenant or Auth user; that has not been reverified here and is not an access gate.
Applying the Phase A **migration** does not change this exposure. **Provisioning a tenant or any Auth user, or starting
the Omar pilot, requires an owner decision first**, one of:

1. Apply Phase B (quarantine, then the atomic batch, below) before any tenant or Auth user is provisioned. Recommended.
2. Apply only the Phase B **quarantine** (step B0 below) before provisioning: it makes the vulnerable approve/reject
   commands uncallable by client roles under P12's platform-identity and administrative-freeze conditions. The Omar
   research path does not use them. Approvals remain unavailable until Phase B.
3. Proceed with Phase A and the pilot first, under conditions that can be checked: public sign-up disabled in the
   platform settings; `auth.users` holds only the provisioned pilot users, all members of the one tenant;
   `select count(*) from public.approvals` is 0 before and after the pilot; Phase B scheduled before a second user or any
   approval exists.
4. A separately reviewed, narrow migration closing the exposure first.

## Why not `supabase db push`

`db push` applies every local version missing from the ledger, in order: it would apply the six together with Omar, and
after Phase A the six sort **before** the ledger head, which the CLI refuses unless run with `--include-all`. Do not rely
on either. Both phases use `supabase/ops/apply-migration.mjs`. Do not run `db push` or `supabase migration repair`
against staging until Phase B is complete and `supabase migration list` shows no difference.

## The apply tool

```
node supabase/ops/apply-migration.mjs --database-url-file <abs> --quarantine <abs .sql> --quarantine-sha256 <hex> [--rehearse]
node supabase/ops/apply-migration.mjs --database-url-file <abs> --file <abs .sql> --sha256 <hex> [--file ... --sha256 ...]... \
  --postcheck <abs .sql> --postcheck-sha256 <hex> [--reopen <abs .sql> --reopen-sha256 <hex>] [--require-present v,...] [--rehearse]
```

Everything one invocation is given runs in **one transaction**: every listed migration, its ledger row, the reopen step
(Phase B only) and the post-check. It commits only if all of it succeeds; otherwise it rolls back and records nothing.

- **Plans, pinned in the tool.** The tool accepts ONLY the two plans below (or B0 on its own), with exact file names,
  order and SHA-256 digests (`PHASE_A`, `PHASE_B` in `apply-migration.mjs`, equal to the table below). Phase A is `20261008120000` alone
  with `phase-a-postcheck.sql`. Phase B is exactly the six, in order, in one run, with `phase-b-reopen.sql` and
  `phase-b-postcheck.sql`. One of the six alone, a subset, a different order, an edited file, or a missing or different
  step is refused before anything runs. Unknown versions and unpinned post-check/reopen/quarantine files are refused,
  even with an operator-supplied matching digest and even under `--rehearse`. CLI refusal precedes reading the URL/CA
  or connecting. Exported apply functions also re-hash source and derive their own executable bodies before querying.
  The `--sha256` arguments must also match. A new plan requires code review, not a new hash argument.
- **Before running anything.** Each migration must be exactly one top-level `begin;`...`commit;` block, and a SQL-aware
  scan refuses any top-level transaction control inside it or in a step (`COMMIT`, `END`, `ROLLBACK`, `ABORT`, `BEGIN`,
  `START TRANSACTION`, `SAVEPOINT`, `RELEASE`, `PREPARE TRANSACTION`, `SET TRANSACTION`) and top-level `SET`/`RESET` of
  `standard_conforming_strings` (also when the name is quoted). The scan reads identifiers whole the way PostgreSQL does
  (so `é$tag$` is an identifier, not a dollar quote), understands quotes, `$tag$` bodies and comments, and assumes
  `standard_conforming_strings = on`. It refuses outright what it cannot follow with certainty: a top-level `E'...'`
  string (PostgreSQL continues its escape mode into a following line's `'...'`), and any top-level `SET`/`RESET` of
  `client_encoding`, `NAMES` or `client_min_messages`. A scan cannot see every way of changing a setting (for example
  `set_config(...)`). The tool re-asserts `standard_conforming_strings = on`, `client_min_messages = warning` and
  `client_encoding = UTF8` before each migration/step and verifies them. These settings and the scanner are defence in
  depth, not a sandbox for arbitrary SQL. In particular a file can suppress its own later WARNING at runtime, despite
  those resets. This is why unpinned execution is now forbidden. PL/pgSQL bodies remain opaque to the scanner.
  The transaction-id check after each body detects, but cannot undo, an early commit. The rehearsal/rollback guarantee
  is limited to the exact pinned plans in the reviewed catalog, with no concurrent administrative changes.
- **Session.** The tool sets, for its own transaction only: `lock_timeout` 10 s, `statement_timeout` 120 s (per
  statement, not for the whole batch), `idle_in_transaction_session_timeout` 60 s (a connection that silently
  disappears cannot hold the locks for long; this, not TCP keepalive, whose idle time is the OS default, often two hours,
  is the effective bound), `standard_conforming_strings = on`, `client_min_messages = warning`.
- **Ledger.** It checks the ledger's columns and types (`version text`, `name text`, `statements text[]`), that
  `version` is unique, and that the table has no triggers or rules; takes a lock against a concurrent push or operator;
  refuses a version already recorded or a missing `--require-present` version; writes each row with the **whole
  reviewed file** in `statements` (so its SHA-256 equals the digest below), and reads it back exactly before going on.
- **WARNINGs.** PostgreSQL reports a skipped GRANT/REVOKE only as a WARNING. The tool probes delivery at transaction
  start and refuses every WARNING it receives from a migration, ledger write, reopen step or post-check. The pinned
  files do not change the warning threshold. This is NOT a proof for arbitrary SQL or arbitrary existing database code:
  event triggers, called functions, role defaults and catalog drift still require review. The prior unpinned path could
  call `set_config('client_min_messages','error',true)` then emit an unseen warning in the same string; serial local
  regression tests reproduce this and require rejection before execution. Exact pinned-plan restriction is the chosen fix.
- **Authority.** It snapshots the operator role's memberships and which `bagos_*` roles may CREATE in `private` at the
  start, and refuses unless both are identical before COMMIT: no temporary window may survive.
- **Connection.** The URL is parsed by the tool and never handed to the driver, and the tool refuses to run while any
  `PG*` environment variable is set (the driver would read them). The URL must be `postgres://` or `postgresql://` to a
  DNS host name (no IP literal, no socket path), naming a user and one database, with exactly two parameters:
  `sslmode=verify-full` and an absolute `sslrootcert`. The driver receives an explicit TLS configuration (that CA as the
  only trust root; certificate chain and server name verified; tested with real handshakes: another CA, a wrong host
  name and a server without TLS are all refused) and TCP keepalive. On Linux the URL file must belong to the operator
  with no group or other permissions (e.g. 0400). Errors name a rule, or a database SQLSTATE and server message (which
  identifies a failed post-check), never connection details.

Reviewed digests (LF line endings, as committed on this branch; the tool pins the same values):

| File | SHA-256 |
|---|---|
| supabase/migrations/20261008120000_omar_research_usage_command.sql | `d7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25` |
| supabase/migrations/20260921090000_hadeer_finished_post_package.sql | `23cd7282ee4ebcbfa7c307e47956ba94bb64711eec5f8a68badb39f4294a12cd` |
| supabase/migrations/20260921100000_hadeer_approval_binding_repairs.sql | `73da70f085485c9dff4c3a817d62da1708dbf22e5d5236a8842d2c70f9746144` |
| supabase/migrations/20260921110000_hadeer_approval_gate_hardening.sql | `917f0aef8b6de2aa2004552e2475e9a6bd8d3d3cdcb2953844c1039f10607f5e` |
| supabase/migrations/20260921120000_hadeer_supersede_scope_repair.sql | `9dd93d1af3f6595a1e8bb5c39a4287d2d75e46f7a6a9a59d66730f60012a7978` |
| supabase/migrations/20260921130000_hadeer_approval_role_null_repair.sql | `90e450c9c21a0a8343175333e53bbc0fb67365f2b4e52734465fcfc54ab9e5b9` |
| supabase/migrations/20260921140000_hadeer_retry_missing_run_repair.sql | `f20523f1f43644c11e3da139fae3fdcd4ae211bd96715162a10da578c8026409` |
| supabase/ops/phase-a-postcheck.sql | `f02d2f5a9e50b5fca96327a09663e422ac45749a17707e4ee299bd9fd17ebca7` |
| supabase/ops/phase-b-quarantine.sql | `ef101e6b108f8872851c48b268a3642348ca8343560a1003d50cb397d4c388b7` |
| supabase/ops/phase-b-reopen.sql | `3e84b8ceb98bbb3409ee8ab0209b2d0e92a39203235738ed563a3682ab483b3a` |
| supabase/ops/phase-b-postcheck.sql | `ccd52550e99d08c542fbeac584975286eae0aadecab9c1d18ee6306629ded499` |

A changed file changes its digest; the tool then refuses it, and it needs a new review (and a new pinned digest).

The post-checks raise (they do not use `ASSERT`) unless each affected function exists exactly once with the reviewed
body (SHA-256 of its source), language, owner, SECURITY DEFINER flag, `search_path` setting and exact set of roles
holding EXECUTE; a holder WITH GRANT OPTION never matches (no reviewed holder has it). Phase B's also checks that the new
table forces RLS, and calls both approval entry points as an outsider (no assurance claim, `aal1`, and `aal2` without
membership; random ids; NULL digest), requiring the exact refusals `mfa assurance required` and `owner approval required`.
The pre-Phase-B bodies fail that probe. All probe paths raise before any write, and the claims are transaction-local.

## Operator setup (all steps)

- Check out the reviewed commit of this branch on the VPS; confirm `git status` is clean and every digest above matches
  (`sha256sum <file>`).
- `cd supabase/ops && npm ci` (installs only `pg` 8.23.1).
- Unset every `PG*` environment variable in the shell that runs the tool (the tool refuses otherwise).
- **Credential.** Migrations must run as `postgres`, the owner of these functions; the worker login cannot and must not.
  Put the `postgres` connection URL in a file owned by the operator with no group or other permissions (e.g. `0400`),
  outside the repository, of the form
  `postgresql://postgres:<password>@<db host name>:5432/postgres?sslmode=verify-full&sslrootcert=<abs path to the provider CA>`.
  Never pass it on the command line, in the environment, in a ticket or in a commit. Delete it when the phase is done.
- Use the **direct, session-mode** connection (port 5432), not the transaction pooler (6543): each step must stay on one
  backend for its whole transaction.
- To rerun the local rehearsal on the VPS: as an **unprivileged** user (PostgreSQL refuses to run as root),
  `cd supabase/tests && npm ci && npm run test:hosted`. On Linux npm must be allowed to run the PostgreSQL binary
  package's postinstall step; the TLS tests need the `openssl` CLI.

## Preflight (read-only, before each phase)

Run in `psql` with the same URL. Every answer must match; any difference is a **stop**.

| # | Query | Expected |
|---|---|---|
| P1 | `select version from supabase_migrations.schema_migrations order by 1;` | Phase A: the 26, ending `20260921080000`. Phase B: those 26 plus `20261008120000` (or only the 26 if Phase A is skipped). Never one to five of the six: Phase B commits all of them or none. |
| P2 | `select rolsuper, rolbypassrls, rolcreaterole, rolinherit from pg_roles where rolname='postgres';` | `f, t, t, t` |
| P3 | `select r.rolname, a.admin_option, a.inherit_option, a.set_option, pg_get_userbyid(a.grantor) from pg_auth_members a join pg_roles r on r.oid=a.roleid where a.member='postgres'::regrole and r.rolname like 'bagos\_%' order by 1;` | every row `t, f, f`, grantor the platform superuser. Save it; it is compared after the phase. |
| P4 | `select r.rolname from pg_roles r where r.rolname like 'bagos\_%' and has_schema_privilege(r.oid,'private','CREATE');` | no rows |
| P5 | `select pg_has_role('postgres','authenticated','USAGE');` | record it (either value is handled by the repair) |
| P6 | `select has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION'), has_function_privilege('postgres','auth.uid()','EXECUTE WITH GRANT OPTION'), has_function_privilege('postgres','auth.jwt()','EXECUTE WITH GRANT OPTION');` | **Phase B: all `t`, else stop** (090000's auth grants would be skipped, the tool would refuse, and the remedy is an owner/platform decision, not a wider grant improvised here). Phase A: record. |
| P7 | see below | **Both phases, and before the pilot: every row `t`.** |
| P8 | `select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';` | `version`/`name` `text`, `statements` `ARRAY`/`_text`; any other column nullable or defaulted (the tool re-checks) |
| P9 | `select defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl where defaclrole='postgres'::regrole;` | record; any entry for schema `private` or for functions globally must be reviewed before applying |
| P10 | `select to_regclass('public.finished_post_revision_bodies'), to_regprocedure('private.record_research_usage(uuid,integer,boolean)');` | Phase A: both null. Phase B: first null; second not null after Phase A. |
| P11 | `select pg_has_role('postgres','pg_read_all_stats','USAGE');` | **Phase B: `t`, else stop.** The drain check must see other roles' sessions in `pg_stat_activity`; the tool checks this role itself and refuses without it. |
| P12 | see the two queries below | **Phase B/B0: four existing functions owned by `postgres`; zero non-platform owner-access rows.** Includes all roles, direct/multi-hop inheritance, SET ROLE, and SET followed by inheritance. Missing/drifted owners or any returned access path are a **stop**. B0 and the batch additionally enforce owner-only ACLs and no effective non-platform EXECUTE. |

**P7** (effective auth access of the roles whose functions call `auth.uid()`/`auth.jwt()`; `EXECUTE` alone is not
enough, because functions are executable by PUBLIC by default while the schema is not usable by PUBLIC):

```sql
select r.role, c.what, case c.what
    when 'usage on schema auth' then has_schema_privilege(r.role, 'auth', 'USAGE')
    when 'execute auth.uid()' then has_function_privilege(r.role, 'auth.uid()', 'EXECUTE')
    when 'execute auth.jwt()' then has_function_privilege(r.role, 'auth.jwt()', 'EXECUTE') end as ok
  from (values ('bagos_research_command'), ('bagos_membership_reader'), ('bagos_platform_reader')) r(role)
  cross join (values ('usage on schema auth'), ('execute auth.uid()'), ('execute auth.jwt()')) c(what) order by 1, 2;
```

`bagos_research_command` (Omar brief submission) and `bagos_membership_reader` (`is_member`, used by RLS) reach `auth`
only through phase-1a's grant to `bagos_platform_reader`, which needs P6's GRANT OPTION and silently did nothing without
it (rehearsed). A `f` row means Omar submission and member-scoped reads fail on staging today: **stop**; restoring that
access is a platform/owner decision outside both phases. P6 is Phase B's own prerequisite (090000 grants `auth` access to
`bagos_approval_command`); P7 is a prerequisite of the pilot whichever phase runs.

**P12** checks effective owner authority, not just direct members or explicit ACL entries. The only trusted identities
are the reviewed operator/owner `postgres` and `supabase_admin` **when it is a superuser**. Confirm their platform identity
and P2 in the target catalog; there is no `supabase_*`/`pg_*` prefix exemption, no exemption for NOLOGIN roles, and no
automatic exemption for another superuser. A legitimate additional platform role with access requires a new review;
do not widen this gate to make it pass. PUBLIC is not a membership role: B0 separately rejects its EXECUTE ACL, including
the default ACL when `proacl` is null. Normal direct `authenticated` EXECUTE exists before B0 and is revoked by B0.

First query: exactly four rows, every `owner` is `postgres` (null/missing is a stop).

```sql
select f.fn, pg_get_userbyid(p.proowner) as owner
  from unnest(array['public.approve_agent_revision(uuid,uuid,text)', 'public.reject_agent_revision(uuid,uuid,text,text)',
    'private.approve_agent_revision(uuid,uuid,text)', 'private.reject_agent_revision(uuid,uuid,text,text)']) f(fn)
  left join pg_proc p on p.oid = to_regprocedure(f.fn) order by 1;
```

Second query: **zero rows**. `reachable_as` includes the actor itself and roles reachable through a complete SET path;
from each of those, USAGE checks inherited owner authority. Thus SET to a bridge followed by inherited owner access is
also caught. These are possible paths to test, not claims that any such chain exists on staging.

<!-- P12 owner-access query: executed by the local regression suite. -->
```sql
select f.fn, actor.rolname as actor, target.rolname as reachable_as
  from unnest(array['public.approve_agent_revision(uuid,uuid,text)', 'public.reject_agent_revision(uuid,uuid,text,text)',
    'private.approve_agent_revision(uuid,uuid,text)', 'private.reject_agent_revision(uuid,uuid,text,text)']) f(fn)
  join pg_proc p on p.oid = to_regprocedure(f.fn)
  cross join pg_roles actor cross join pg_roles target
  where not (actor.rolname = 'postgres' or (actor.rolname = 'supabase_admin' and actor.rolsuper))
    and pg_has_role(actor.oid, target.oid, 'SET')
    and pg_has_role(target.oid, p.proowner, 'USAGE')
  order by 1, 2, 3;
```

Use a maintenance window with role/ACL/owner and database-code changes frozen from preflight through B0 and the batch.
The checks are catalog observations, not a lock against a platform administrator changing privileges after the check.
The platform superuser and operator retain access. A failed B0 rolls back its revokes and establishes **no** quarantine;
do not provision the pilot on that result. A successful B0 followed by a refused/rolled-back batch keeps B0 in place,
provided no administrator changes access. The SQL quarantine file alone checks ACLs only; run it through this tool.

## Phase A: apply ONLY the Omar usage migration

Prerequisites: P1-P10 pass; verify no research worker is running. Ordering constraint for later: the
worker from `omar-usage-boundary` (or later) refuses to start before this migration, and an older worker fails every
usage write after it, so only that newer worker may ever run against the migrated database.

1. Rehearse (runs everything, including the post-check, then rolls back):

   `node supabase/ops/apply-migration.mjs --database-url-file <url file> --file <repo>/supabase/migrations/20261008120000_omar_research_usage_command.sql --sha256 d7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25 --postcheck <repo>/supabase/ops/phase-a-postcheck.sql --postcheck-sha256 f02d2f5a9e50b5fca96327a09663e422ac45749a17707e4ee299bd9fd17ebca7 --require-present 20260921080000 --rehearse`

   Expected: `{"versions":["20261008120000"],"committed":false,...}`.
2. Apply: the same command without `--rehearse`. Expected `"committed":true`.
3. Read back: P1 shows exactly one version after `20260921080000` (`20261008120000`); P3 identical to the saved output;
   P4 no rows; P10 second not null. Running `phase-a-postcheck.sql` again in `psql` must complete without error.
4. The six stay pending. Do not run `db push`.
5. Deploying and starting the Omar worker, provisioning a tenant or Auth user, and starting the pilot wait for the owner
   decision above and for P7.

Rollback: migrations are forward-only. If the function must be withdrawn, stop the Omar worker; a new reviewed
migration revokes `record_research_usage` from `bagos_research_executor`. **Never** re-grant `record_agent_usage` to it.

## Phase B: quarantine, then the six approval migrations in ONE transaction (separate review and approval)

Prerequisites: this phase's own approval; P1-P12 pass, including **P6, P7, P11 and P12**; Adam, Nour and Ziad workers still
off; a quiet window (the batch briefly stalls member-scoped reads, see below).

**B0. Quarantine** (its own transaction, committed, no ledger row): stops new calls of the approve/reject commands.

```
node supabase/ops/apply-migration.mjs --database-url-file <url file> \
  --quarantine <repo>/supabase/ops/phase-b-quarantine.sql --quarantine-sha256 ef101e6b108f8872851c48b268a3642348ca8343560a1003d50cb397d4c388b7 --rehearse
```

Expected `{"quarantine":true,"committed":false,...}`; then the same without `--rehearse`, expected
`{"quarantine":true,"committed":true,...}`. Before COMMIT the tool verifies all four owners are `postgres`, their ACLs
contain no EXECUTE grantee except the owner, and no non-platform role has effective EXECUTE or owner authority through
inheritance or SET ROLE (including mixed paths). `retry_agent_workflow` (B6) is
not quarantined: its pre-Phase-B defect only writes a misleading audit entry for a missing run and is not cross-tenant. From here until Phase B commits, approval decisions are
unavailable to the app under the P12 maintenance-window assumptions (a call is refused with `permission denied for function ...`).
The committed quarantine stays if the batch rolls back. Re-opening without Phase B would re-expose the NULL-blind functions and needs an
explicit owner decision; no reviewed file here does it.

**B1-B6. The batch.** Rehearse, then apply, the whole phase as **one** command (all six files, in order, each with its
digest, plus the reopen step and the post-check):

```
node supabase/ops/apply-migration.mjs --database-url-file <url file> \
  --file <repo>/supabase/migrations/20260921090000_hadeer_finished_post_package.sql --sha256 23cd7282ee4ebcbfa7c307e47956ba94bb64711eec5f8a68badb39f4294a12cd \
  --file <repo>/supabase/migrations/20260921100000_hadeer_approval_binding_repairs.sql --sha256 73da70f085485c9dff4c3a817d62da1708dbf22e5d5236a8842d2c70f9746144 \
  --file <repo>/supabase/migrations/20260921110000_hadeer_approval_gate_hardening.sql --sha256 917f0aef8b6de2aa2004552e2475e9a6bd8d3d3cdcb2953844c1039f10607f5e \
  --file <repo>/supabase/migrations/20260921120000_hadeer_supersede_scope_repair.sql --sha256 9dd93d1af3f6595a1e8bb5c39a4287d2d75e46f7a6a9a59d66730f60012a7978 \
  --file <repo>/supabase/migrations/20260921130000_hadeer_approval_role_null_repair.sql --sha256 90e450c9c21a0a8343175333e53bbc0fb67365f2b4e52734465fcfc54ab9e5b9 \
  --file <repo>/supabase/migrations/20260921140000_hadeer_retry_missing_run_repair.sql --sha256 f20523f1f43644c11e3da139fae3fdcd4ae211bd96715162a10da578c8026409 \
  --reopen <repo>/supabase/ops/phase-b-reopen.sql --reopen-sha256 3e84b8ceb98bbb3409ee8ab0209b2d0e92a39203235738ed563a3682ab483b3a \
  --postcheck <repo>/supabase/ops/phase-b-postcheck.sql --postcheck-sha256 ccd52550e99d08c542fbeac584975286eae0aadecab9c1d18ee6306629ded499 \
  --require-present 20260921080000,20261008120000 --rehearse
```

(Drop `,20261008120000` if Phase A was explicitly skipped.) Expected `"committed":false`, then, without `--rehearse`,
`"committed":true` with all six versions.

**After.** P1 shows all six (33 versions with Phase A); P3 identical to the saved output; P4 no rows; running
`phase-b-postcheck.sql` again in `psql` completes without error; `supabase migration list` (read-only) shows local and
remote identical. Approval decisions are available again, through the repaired functions only.

**The gate, and what enforces it** (all rehearsed on PostgreSQL 17.6):

1. *No new call can start.* After B0 commits, PostgreSQL refuses EXECUTE on the four functions to every client role at
   call start, except the two reviewed platform identities (P12). Effective access by any other role makes B0 or the batch
   refuse; the batch checks again before the drain. This depends on the administrative freeze described in P12.
2. *No old call can still be running.* The batch refuses outright unless the operator role has `pg_read_all_stats`
   (P11; without it PostgreSQL hides other roles' sessions, including the API's, entirely). It then polls, with a fresh
   `pg_stat_activity` snapshot each time, until no other client session has a transaction older than the batch itself,
   for up to 30 s, and refuses if one remains or if any session is not visible. So no call that
   began before the quarantine can be in flight, waiting on the batch's locks, or resume an old body after COMMIT.
   (Without the quarantine, a call made during the batch would wait on its locks and then continue in the OLD body after
   COMMIT; the reviewer reproduced that, and it is why B0 exists.)
3. *Nothing becomes visible early.* B1-B6, their ledger rows, the reopen grants and the post-check (with the outsider
   probe) run in one transaction; other sessions see none of it until the single COMMIT, which makes the repaired bodies
   and the restored access visible together.

While the batch is open it holds ACCESS EXCLUSIVE locks on `approvals`, `memberships`, `artifacts`,
`artifact_revisions`, `objectives` and `content_calendar_revision_bodies` (taken by B1's policies and constraints), so
every query that reads `memberships`, including RLS checks across the app, waits for those seconds.

**Interruption and recovery.**
- The operator's process or connection dies before COMMIT: the server rolls the batch back. P1 shows none of the six;
  the quarantine is still in effect; start the batch again from the top (rehearsed by killing the backend at the last
  moment before COMMIT).
- The network path is lost silently (the backend does not notice): `idle_in_transaction_session_timeout` ends the
  session after at most 60 s of inactivity and rolls it back. If a retry still meets a lock timeout, find the old session
  with `select pid, state, xact_start from pg_stat_activity where application_name = 'istemer-apply-migration';`, end it
  with `select pg_terminate_backend(<pid>);`, re-read P1, and start again.
- The connection is lost **during** COMMIT: the outcome is unknown until checked. Read P1: **none of the six** means it
  rolled back (retry); **all six** means it committed (run the "After" checks). **One to five** cannot be produced by the
  tool; if seen, stop and escalate, and run nothing further.

Rollback after a successful COMMIT: forward-only, by a new reviewed migration; never by deleting ledger rows or
hand-editing functions.

## Ledger reconciliation (why out-of-order is safe here, and what not to do)

- The tool writes each ledger row in the same transaction as its migration and reads it back, so the ledger cannot
  claim a version that did not apply, or miss one that did.
- Applying Omar first and the six later (with the quarantine and reopen) produces the same final snapshot and ledger
  rows as file order (rehearsed). That snapshot covers functions, tables, policies, schema ACLs and role memberships, not
  every catalog object.
- Do **not** insert, delete or edit ledger rows by hand, and do not use `supabase migration repair` for these versions:
  both can record a version whose statements never ran.
- Alternative not taken: renumbering the six after `20261008120000` would keep history linear for the CLI, but changes
  reviewed file identities; it remains available if the owner prefers it.

## Workers stay off

- Install no unit for Adam, Nour or Ziad; `systemctl list-unit-files 'istemer-*'` must show only the Omar listener and
  the research worker. No login role is granted `bagos_reel_analyst_executor` or `bagos_content_calendar_executor`.
- Before either of those roles is ever granted to a login: replace their access to the broad `record_agent_usage` with
  pipeline-bound commands (as `20261008120000` did for Omar) with negative cross-pipeline tests, in its own reviewed
  packet. Today they can record usage under any category, including Omar's.

## Not done here

No migration, quarantine, ledger or role change was applied outside disposable local test clusters. No hosted tenant
or Auth user was provisioned; no worker/service was enabled or started. Neither Phase A nor Phase B is cleared for
hosted execution by these local results. The PostgreSQL 17.6 rehearsal approximates the platform (auth/storage
ownership is stubbed; the hosted `auth.uid()` may read its claim differently from the stub, which the Phase B probe would
then refuse) and does not run Supabase's own platform extensions and hooks (for example supautils) or PostgREST. P5, P6,
P7, P9, P11 and P12 (actual owners, complete effective role graph and platform identities) remain hosted unknowns.
Existing database code, event triggers, platform hooks and concurrent administration are outside the pinned-file proof.
No credentials were sought and no hosted rehearsal was attempted; any future hosted work requires its own approval.
