# Staging migration path: Phase A (Omar usage) and Phase B (the six approval migrations)

Audience: **Hunter, on the VPS.** Nothing here has been run against the hosted project. Claude Code prepared and
rehearsed it locally; every remote step below is for the operator, after the approvals named in each phase.

Adam, Nour and Ziad worker services stay **disabled** throughout and after both phases (see "Workers stay off").

## What is true today, and how we know

| Kind of evidence | Source | What it says |
|---|---|---|
| Hosted ledger (owner SELECT, 2026-09-26) | owner-run query | 26 versions recorded, through `20260921080000` |
| Hosted catalog (owner SELECT) | owner-run query; `docs/evidence/phase-1/baseline.md` | PostgreSQL 17.6. `postgres` is not superuser; CREATEROLE, BYPASSRLS, INHERIT. Its memberships in `bagos_*` roles are the automatic creator grants only (ADMIN true, INHERIT false, SET false). `bagos_approval_command` has no CREATE on `private`. None of the six pending migrations' objects exist. |
| Local rehearsal, real PostgreSQL 17.6, non-superuser `postgres` | `supabase/tests/hosted-roles.test.mjs` (12 tests) | Replaying the 26 as non-superuser `postgres` reproduces exactly the membership row and the missing CREATE above. Failures and repairs below are measured there. |
| Local PGlite suites | `supabase/tests/*.test.mjs` (others) | Functional SQL behaviour. **PGlite runs as superuser** and cannot show ownership or grant failures. |
| Hosted application | — | **NOT RUN.** |

The rehearsal cannot know two hosted facts; the preflight below reads them: whether `postgres` is a member of
`authenticated`, and whether `postgres` may re-grant `auth` access (GRANT OPTION).

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

## Why not `supabase db push`

`db push` applies every local version missing from the ledger, in order: it would apply the six together with Omar. After
Phase A, the six sort **before** the ledger head, and the CLI refuses such out-of-order history unless run with
`--include-all`. Do not rely on either. Both phases use `supabase/ops/apply-migration.mjs`, which applies **one named
file** and records **its** version in one transaction. Do not run `db push` against staging until Phase B is complete
and `supabase migration list` shows no difference.

### The apply tool

`node supabase/ops/apply-migration.mjs --database-url-file <abs> --file <abs .sql> --sha256 <hex> [--require-present v,...] [--rehearse]`

It refuses, and rolls back, when the file's SHA-256 differs from the reviewed value below; the file is not exactly one
`begin;`...`commit;` block; the version is already recorded; a `--require-present` version is not recorded; the ledger
table has an unexpected shape; or **any statement raises a WARNING**. If a body ended its own transaction (a top-level
`commit`/`end`/`rollback`), the tool detects it afterwards, writes **no** ledger row and stops; what that body already
committed stays, so stop and inspect. None of the seven reviewed files contains such a statement. It locks the ledger table against a concurrent
push. `--rehearse` runs everything and rolls back. It requires `sslmode=verify-full` (once, no `ssl=`) and prints no
connection details. Rehearsed tests: wrong digest, recorded version, missing prerequisite, rehearse-only, injected
failure (migration, ledger row and temporary grants all rolled back), refusal on WARNING, and early-commit detection.

Reviewed digests (LF line endings, as committed on this branch):

| File | SHA-256 |
|---|---|
| 20261008120000_omar_research_usage_command.sql | `d7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25` |
| 20260921090000_hadeer_finished_post_package.sql | `23cd7282ee4ebcbfa7c307e47956ba94bb64711eec5f8a68badb39f4294a12cd` |
| 20260921100000_hadeer_approval_binding_repairs.sql | `73da70f085485c9dff4c3a817d62da1708dbf22e5d5236a8842d2c70f9746144` |
| 20260921110000_hadeer_approval_gate_hardening.sql | `917f0aef8b6de2aa2004552e2475e9a6bd8d3d3cdcb2953844c1039f10607f5e` |
| 20260921120000_hadeer_supersede_scope_repair.sql | `9dd93d1af3f6595a1e8bb5c39a4287d2d75e46f7a6a9a59d66730f60012a7978` |
| 20260921130000_hadeer_approval_role_null_repair.sql | `90e450c9c21a0a8343175333e53bbc0fb67365f2b4e52734465fcfc54ab9e5b9` |
| 20260921140000_hadeer_retry_missing_run_repair.sql | `f20523f1f43644c11e3da139fae3fdcd4ae211bd96715162a10da578c8026409` |

If a later commit changes any of these files, its digest changes, the tool refuses, and the file needs review again.

## Operator setup (both phases)

- Check out the reviewed commit of this branch on the VPS; confirm `git status` is clean and the digests above match
  (`sha256sum supabase/migrations/<file>`).
- `cd supabase/ops && npm ci` (installs only `pg`).
- **Credential.** Migrations must run as `postgres`, the owner of these functions; the worker login cannot and must not.
  Put the `postgres` connection URL in a file `0400`, owned by the operator, outside the repository, ending in
  `?sslmode=verify-full&sslrootcert=<abs path to the provider CA>`. Never pass it on the command line, in the
  environment, in a ticket or in a commit. Delete the file when the phase is done.
- Use the **session-mode** connection (direct host or pooler port 5432); not the transaction pooler (6543).

## Preflight (read-only, before each phase)

Run in `psql` with the same URL. Every answer must match; any difference is a **stop**.

| # | Query | Expected |
|---|---|---|
| P1 | `select version from supabase_migrations.schema_migrations order by 1;` | Phase A: the 26, ending `20260921080000`. Phase B: those 26 plus `20261008120000`. |
| P2 | `select rolsuper, rolbypassrls, rolcreaterole, rolinherit from pg_roles where rolname='postgres';` | `f, t, t, t` |
| P3 | `select r.rolname, a.admin_option, a.inherit_option, a.set_option, pg_get_userbyid(a.grantor) from pg_auth_members a join pg_roles r on r.oid=a.roleid where a.member='postgres'::regrole and r.rolname like 'bagos\_%' order by 1;` | every row `t, f, f`, grantor the platform superuser (save this output; it is compared after the phase) |
| P4 | `select r.rolname from pg_roles r where r.rolname like 'bagos\_%' and has_schema_privilege(r.oid,'private','CREATE');` | no rows |
| P5 | `select pg_has_role('postgres','authenticated','USAGE');` | record it (either value is handled by the repair) |
| P6 | `select has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION'), has_function_privilege('postgres','auth.uid()','EXECUTE WITH GRANT OPTION'), has_function_privilege('postgres','auth.jwt()','EXECUTE WITH GRANT OPTION');` | Phase A: record. **Phase B: all `t`, else stop** (090000 would warn and the tool would refuse it). |
| P7 | `select has_function_privilege('bagos_research_command','auth.uid()','EXECUTE');` | `t`. If `f`, an applied migration's auth grant was silently skipped and Omar brief submission will fail; stop and report (not fixable in these phases). |
| P8 | `select column_name, is_nullable, column_default from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations';` | contains `version`, `name`, `statements`; any other column nullable or defaulted |
| P9 | `select defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl where defaclrole='postgres'::regrole;` | record; any entry for schema `private` or for functions globally must be reviewed before applying |
| P10 | `select to_regclass('public.finished_post_revision_bodies'), to_regprocedure('private.record_research_usage(uuid,integer,boolean)');` | Phase A: both null. Phase B: second not null. |

## Phase A: apply ONLY the Omar usage migration

Prerequisites: P1-P10 pass; the Omar worker build from `omar-usage-boundary` (or later) is ready to deploy in the same
window (that worker refuses to start before this migration, and the old worker fails every usage write after it); no
research worker is running during the apply.

1. Rehearse (writes nothing):
   `node supabase/ops/apply-migration.mjs --database-url-file <url> --file <abs>/supabase/migrations/20261008120000_omar_research_usage_command.sql --sha256 d7a630498f73af88a9785751ac80f4bcfbcaee472b6c2bc5060fb9f66d2e7e25 --require-present 20260921080000 --rehearse`
   Expected output: `{"version":"20261008120000","committed":false,...}`.
2. Apply: the same command without `--rehearse`. Expected `"committed":true`.
3. Read back (all must match):
   - `select version from supabase_migrations.schema_migrations where version > '20260921080000';` → exactly `20261008120000`.
   - `select pg_get_userbyid(proowner), prosecdef, proconfig from pg_proc where oid='private.record_research_usage(uuid,integer,boolean)'::regprocedure;` → `postgres, t, {search_path=""}`.
   - Who may execute each function, read from the function's own ACL (`information_schema.routine_privileges` would hide
     grants that do not involve the role you are connected as):
     `select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'private.record_research_usage(uuid,integer,boolean)'::regprocedure and a.privilege_type = 'EXECUTE' order by 1;` → `bagos_research_executor`, `postgres`.
     The same with `private.record_agent_usage(uuid,text,integer,boolean)` → `bagos_content_calendar_executor`,
     `bagos_reel_analyst_executor`, `postgres`.
   - P3 again → identical to the saved output. P10 → first null, second not null.
4. Six versions remain pending: `20260921090000`..`140000` are not in the ledger. Do not run `db push`.
5. Then deploy and start only the Omar worker per `docs/OMAR_STAGING_RUNBOOK.md`; its startup check must pass.

Rollback: migrations are forward-only. If the function must be withdrawn, stop the Omar worker; a new reviewed
migration revokes `record_research_usage` from `bagos_research_executor`. **Never** re-grant `record_agent_usage` to it.

## Phase B: the six approval migrations (separate review and approval)

Prerequisites: this phase's own approval; Phase A complete (or explicitly skipped, in which case drop
`20261008120000` from every `--require-present` below); P1-P10 pass, including **P6 all true**; no approval UI traffic
expected (the approval commands change between files); Adam, Nour and Ziad workers still off.

For each file in order, rehearse, then apply, with the previous version and Omar's required:

| Step | File | `--require-present` |
|---|---|---|
| B1 | 20260921090000_hadeer_finished_post_package.sql | `20260921080000,20261008120000` |
| B2 | 20260921100000_hadeer_approval_binding_repairs.sql | `20260921090000,20261008120000` |
| B3 | 20260921110000_hadeer_approval_gate_hardening.sql | `20260921100000,20261008120000` |
| B4 | 20260921120000_hadeer_supersede_scope_repair.sql | `20260921110000,20261008120000` |
| B5 | 20260921130000_hadeer_approval_role_null_repair.sql | `20260921120000,20261008120000` |
| B6 | 20260921140000_hadeer_retry_missing_run_repair.sql | `20260921130000,20261008120000` |

With the digest for each from the table above. Stop at the first refusal; earlier steps stay committed and consistent
(each is complete on its own), and the next attempt resumes at the refused step after review.

After **B1**: `select pg_get_userbyid(proowner) from pg_proc where oid='private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)'::regprocedure;` → `bagos_approval_command`;
`select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'private.create_finished_post_package(uuid,uuid,integer,jsonb,jsonb)'::regprocedure and a.privilege_type = 'EXECUTE' order by 1;` → `authenticated`, `bagos_approval_command` only (no `PUBLIC`, no `anon`);
`select has_function_privilege('bagos_approval_command','private.is_member(uuid,text[])','EXECUTE');` → `t`; P3 identical; P4 no rows.
After **B2-B4**: the same owner and grantee checks (a replacement keeps them); P3 identical; P4 no rows.
After **B6**: P1 shows all 33 versions; `supabase migration list` (read-only) shows local and remote identical. From then
on, `db push` sees no pending history.

Rollback: forward-only. A refused step changes nothing. A committed step that misbehaves is corrected by a new reviewed
migration, never by deleting ledger rows or hand-editing functions.

## Ledger reconciliation (why out-of-order is safe here, and what not to do)

- The tool writes the ledger row in the same transaction as the migration, so the ledger can never claim a version
  that did not apply, or miss one that did.
- Applying Omar first and the six later produces the same final catalog and ledger as file order (rehearsed).
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

No migration applied, no ledger written, no role or login created, no tenant or Auth user provisioned, no service
started. The PostgreSQL 17.6 rehearsal approximates the platform (auth/storage ownership is stubbed); P5, P6 and P9 are
the hosted facts it cannot know.
