# Implementation phases and file-level work packages

2026-09-15 scope update: the owner requests implementation and GitHub/Supabase publication of a functional web release. See [web release status](WEB_RELEASE_STATUS.md). This supersedes historical planning-only/no-commit wording for reviewed release work; preserve security and live-operation prerequisites and report partial results honestly. The first implementation package is the server/session foundation, not full Phase 1 acceptance.

2026-09-12 — planning only. Read the [master plan](MASTER_IMPLEMENTATION_PLAN.md) for contracts, [trace matrix](TRACEABILITY_MATRIX.md) for tests, and [owner inputs](OWNER_INPUTS_REQUIRED.md) for gates. All file lists below are **proposed future changes**, except the five planning documents in P0. They are not claims that these files already exist.

## Supersession boundary

`IMPLEMENTATION_PHASES.md` and `MASTER_IMPLEMENTATION_PLAN.md` are the current planning authority for implementation order, file names, routes and gates. `IMPLEMENTATION-CHECKPOINT.md`, `PRODUCTION-IMPLEMENTATION-PLAN.md`, `SUPABASE_INTEGRATION_READINESS.md` and `SUPABASE_DRY_RUN_DIAGNOSIS.md` are preserved historical evidence; their older M0–M7/milestone or activation instructions must not be followed as current work. Those files are intentionally not edited in this planning pass so the user's existing uncommitted baseline remains intact.

## Execution rules

Order: P0 → P1A reconciliation → P1B → P1C → P1D → P1E → P1F → P1G. P1A is an applied baseline, not another migration deployment. P2 → P3 → P4 are the conditional full-system roadmap outside this task's implementation target. Do not activate later phases merely because a scaffold exists.

Before P1B code starts, OI01–OI03 must be **Settled** (owner decisions recorded and procedures written), satisfying frozen source [FULL_PROJECT_MASTER_PLAN.md §17](product-architecture/FULL_PROJECT_MASTER_PLAN.md); project selection is already resolved. **Configured** delivery and **Rehearsed** evidence are required at each earliest live operation per [OWNER_INPUTS_REQUIRED.md](OWNER_INPUTS_REQUIRED.md) and are not deferred to P1G. This pass stops at P0. Complete planning does not override that gate. OI04 separately blocks identity creation/invitation execution; OI05/OI06 block relevant environment/visual acceptance; OI08–OI10 block the affected Auth/role/read decisions. No user invitation is authorized now. Three-tier reconciliation recorded in [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md).

At every increment: refresh git status/diff, preserve all pre-existing work, make the smallest coherent change, run its focused checks, inspect the result, and update evidence before progressing. Keep reviewed work unstaged/uncommitted unless separately requested. A failed gate stops activation of dependent work; an unresolved owner input stays visible. No database reset, blind retry, real/client data, or privileged browser key.

Paths are relative to repository root. Each entry states create/modify/preserve. Migration paths use `<CLI timestamp>` deliberately: run `supabase migration new <semantic_name>` only during implementation and record the actual generated filename; do not hand-invent timestamps or edit applied migration history. A table's identifier (Txx/Gxx) refers to the source architecture, not a new schema name.

## P0 — complete, internally check and hand off the plan

Create the following planning-only files:

- `docs/MASTER_IMPLEMENTATION_PLAN.md`
- `docs/IMPLEMENTATION_PHASES.md`
- `docs/TRACEABILITY_MATRIX.md`
- `docs/DECISION_REGISTER.md` — needed to reconcile latest baseline without rewriting frozen source decisions.
- `docs/OWNER_INPUTS_REQUIRED.md`

Close when requirements/gates/file maps agree, links resolve, unsupported behavior is marked unresolved, source/uncommitted files remain unchanged, and no implementation or remote mutation occurred. Record the actual checks in the trace matrix. P0 closure is not R17 acceptance.

## P1A — reconcile the already-applied schema/security baseline

Dependencies: P0; operational setup gate before implementation. No baseline reapplication.

Work: confirm intended project/environment and migration ledger using read-only commands when implementation resumes; compare remote catalog/grants/function ownership/bucket policy to the preserved source; classify drift rather than repairing it silently. Verify no unexpected identities, invitations or real data before testing. Do not dump sensitive rows or secrets. The recorded migration list must contain exactly `20260909165106`; if the ledger is absent, mismatched or unavailable, stop with `BLOCKED/REMOTE UNVERIFIED`, escalate to the owner and do not apply, recreate, repair or re-run the migration. P1B cannot start from the negative branch.

Files:

- Preserve `supabase/migrations/20260909165106_phase_1a_schema_security.sql` and `supabase/tests/phase-1a.test.mjs`.
- Preserve `supabase/tests/platform-stubs.sql` as the baseline test's platform model.
- Create `docs/evidence/phase-1/baseline.md` with redacted ledger/catalog results and source hashes.
- Update `docs/PHASE_1A_SCHEMA_SECURITY.md` and `docs/TRACEABILITY_MATRIX.md` only with dated, observed evidence; retain historical local results as historical.

Close: ledger contains the exact applied migration; no unexplained security drift; current schema inventory agrees with T01–T06/T09–T12/T17/T22/G02–G04; historical PGlite evidence remains clearly separated from real-service proof. Real Supabase read-only verification is required. A permission/configuration/network failure is a blocker, not a passed baseline. Before P1B, produce the redacted out-of-tree baseline hash/archive reference described in the master plan without staging or committing the existing worktree.

## P1B — supported server runtime, contracts and test foundations

Dependencies: P1A and OI01–OI03. First code task: convert i-STEMer from static export to a supported server runtime while preserving fixture behavior and Northwind conformance. Select exact compatible stable Next 16/React/Node patches against current advisories and lock them; do not copy obsolete example APIs blindly.

Modify:

- `package.json`, `package-lock.json` — compatible engines/scripts/dependencies and locked installs.
- `apps/istemer-demo/package.json`, `apps/istemer-demo/next.config.mjs`, `apps/istemer-demo/tsconfig.json`.
- `apps/northwind-demo/package.json`, `apps/northwind-demo/next.config.mjs`, `apps/northwind-demo/tsconfig.json` — compatibility only; retain fixture static export.
- `packages/core/ui/package.json` — compatible peer/type ranges.
- `packages/core/contracts/src/index.ts`, `packages/core/contracts/src/ports.ts`, `packages/core/contracts/src/view-meta.ts` — additive neutral exports/read DTOs; preserve existing uncommitted revision export.
- `packages/core/ui/src/components/DemoIndicator.tsx` — adapt only after checking its actual exported contract; transport must not hide synthetic provenance.

Create:

- `.env.example` — placeholders and public/server classification only; never copy `.env.local`.
- `supabase/config.toml` — **conditional after OI05 and a local-config review**; explicit local/nonproduction configuration only, safe Auth redirect placeholders, and no remote application or link change in this step. Do not create it merely because the repository is linked.
- `packages/core/contracts/src/identity.ts`, `packages/core/contracts/src/phase-one.ts`.
- `packages/core/contracts/__tests__/identity.test.ts`, `packages/core/contracts/__tests__/phase-one.test.ts`.
- `apps/istemer-demo/lib/env.ts`, `apps/istemer-demo/lib/supabase/browser.ts`, `apps/istemer-demo/lib/supabase/server.ts`, `apps/istemer-demo/lib/supabase/database.types.ts`.
- `apps/istemer-demo/lib/observability/redaction.ts`, `apps/istemer-demo/__tests__/redaction.test.ts`.
- `supabase/tests/migration-chain.test.mjs` — cumulative additive replay, separate from pinned baseline test.
- `tests/integration/fixtures/identity-matrix.ts`, `tests/integration/fixtures/service-clients.ts` — no embedded accounts/tokens.
- `vitest.integration.config.ts` — explicit integration project/configuration; it must include `tests/**` without changing the focused unit guard coverage.
- `docs/evidence/phase-1/runtime.md`.

If lint/type/test configuration genuinely needs compatibility changes, modify the existing `eslint.config.js`, `.dependency-cruiser.cjs`, `tsconfig.base.json` and `vitest.config.ts` only after verifying the selected tool versions; record necessity and preserve all boundary/token/domain checks. Add explicit root scripts/configuration for `test:unit`, `test:db`, `test:integration` and `test:e2e`; run the separate `supabase/tests` package explicitly rather than assuming root workspaces discover it. Do not weaken guards to get a green build. Generated framework declaration changes must be reviewed, not manually fabricated.

Close: locked install; `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db`, `npm run build`; both app smoke checks; no privileged dependency in client graph; no secret value in tracked/example files; fixture outputs/provenance preserved. `npm run test:integration` and `npm run test:e2e` must be explicit projects and are run only at their later gates; `npm --prefix supabase/tests test` remains the PGlite baseline. These checks are local and do not prove Auth/Storage. OI05 values may remain placeholders until environment activation.

## P1C — Auth, MFA, membership and administrative commands

Dependencies: P1B. OI01–OI03 completed; OI04 explicitly required before any test user or invitation is created. OI08 rate-limit policy is recorded before activation; OI09 revoked-member re-invitation semantics and OI10 operator projection are recorded before the affected acceptance tests. Use designated individual identities only. No operational dashboard or generic admin API.

Implement verified email/password login, server-validated session refresh, recovery/callback, safe logout, owner/admin MFA enrolment/challenge and current membership resolution. Tenant URL is a requested context, never authority. Platform grants never grant content access. Resolve current active tenant/membership/role and aal at every DAL/action/RPC boundary. Add database enforcement for owner/admin assurance so direct API/Storage cannot bypass UI MFA. Enrolment must be reachable before aal2 without opening tenant data.

Administrative commands: K01 provision/suspend; K02 issue/revoke/accept role-bounded invitation; and a restricted, time-bounded Abdo platform/custodian membership-revocation operation needed for the revoked-member negative test. There is no tenant-owner revoke screen, owner-role mutation or transfer in Phase 1. Narrow command roles are NOLOGIN/NOBYPASSRLS, not table owners, with fixed search paths, precise grants and per-command checks. Validate caller, request, origin/session, actor, tenant and current role; never accept actor ID from payload. Database time controls expiry. Bind receipts to actor/tenant/command/key/request digest; conflicting replay fails; concurrent same-key execution returns one result. Audit and receipt commit atomically with DB state.

Before migration execution, publish the exact grants/policies for each command role. The membership command role must satisfy the invoker `lock_membership_tenant` and deferred `require_active_owner` triggers with only the necessary column-level `SELECT` and `UPDATE(updated_at)` access on `public.tenants` plus the required membership reads. The restricted suspension/revocation role may change only approved status columns after transition validation; it cannot change tenant identity, `is_demo`, name or owner role. `WITH CHECK` pins protected tenant fields. If the invoker-trigger coupling cannot be made safe, stop and introduce a separately reviewed lock helper; never grant broad table-owner or bypass-RLS authority.

Assurance is role-aware and tenant-local. The additive migration must replace the role-agnostic read helper/policies with a helper that requires `aal2` for an owner row, permits `aal1` for an operator row, and requires `aal2` for platform commands without granting platform content access. Temporarily re-grant the helper-owner role to the migration runner only for the reviewed function/policy alteration, then revoke it and prove final role membership. A user who is owner in tenant A and operator in tenant B is tested independently in both contexts.

Rate limiting is mandatory for invitation issue/revoke/accept, login and recovery. Use a durable server/Edge mechanism with normalized recipient, actor/session and origin/IP keys as appropriate; it must fail closed during limiter failure, avoid email enumeration and emit redacted evidence. OI08 supplies exact windows, thresholds, lockout and copy before live activation.

Auth Admin delivery is outside the DB transaction: G04 records intent/stage/result for recoverable provisioning/invitation work. No claim of distributed atomicity. Simulate Auth success/DB failure, DB intent/mail failure, duplicate delivery, restart and lost response. Reconcile authoritative state before retrying. Invitation token reuse is rejected even when a same-request receipt can be returned safely. Last-owner invariants remain locked/transactional; suspension/revocation immediately blocks the next authorized read.

Create:

- `supabase/migrations/<CLI timestamp>_phase_1b_auth_commands.sql` — additive assurance helpers, command roles/policies/functions, durable transitions and bounded safe return values; never reopen general DML.
- `supabase/functions/_shared/authorization.ts`, `supabase/functions/_shared/contracts.ts`, `supabase/functions/_shared/auth-admin.ts`, `supabase/functions/_shared/operation-reconciliation.ts`.
- `supabase/functions/_shared/rate-limit.ts`, `supabase/functions/_shared/observability.ts`.
- `supabase/functions/provision-tenant/index.ts`, `supabase/functions/invitations/index.ts`, `supabase/functions/suspend-tenant/index.ts`, `supabase/functions/memberships/index.ts`.
- `apps/istemer-demo/proxy.ts` — selected Next version's session/cookie plumbing; not the sole authorization boundary.
- `apps/istemer-demo/lib/auth/session.ts`, `apps/istemer-demo/lib/auth/redirects.ts`, `apps/istemer-demo/lib/auth/mfa.ts`.
- `apps/istemer-demo/lib/authorization/tenant-context.ts`.
- `apps/istemer-demo/lib/commands/session.ts`, `apps/istemer-demo/lib/commands/invitations.ts`, `apps/istemer-demo/lib/commands/memberships.ts` — membership commands are platform/custodian-only; no tenant-owner role-management UI.
- `apps/istemer-demo/lib/observability/correlation.ts`.
- `apps/istemer-demo/app/auth/callback/route.ts` — allowlisted locale/tenant return target; no external open redirect.
- `scripts/phase-one-admin.mjs` — restricted operator CLI, no secrets in command arguments or logs, no default send/reset behavior.
- `supabase/tests/auth-commands.test.mjs` — PGlite schema/policy shape only; it cannot prove multi-connection races.
- `tests/integration/auth-lifecycle.test.ts`, `tests/integration/admin-saga.test.ts`, `tests/integration/tenant-isolation.test.ts`, `tests/integration/mfa-authorization.test.ts`.
- `tests/integration/rate-limit.test.ts`, `tests/integration/audit-failure.test.ts`, `tests/integration/membership-transition.test.ts` — rate limits, audit INSERT rollback, suspended/pending/revoked membership cases and operator-versus-owner command denial.
- `apps/istemer-demo/__tests__/tenant-context.test.ts`, `apps/istemer-demo/__tests__/auth-redirects.test.ts`.
- `docs/runbooks/IDENTITY_AND_SUPPORT.md`, `docs/evidence/phase-1/auth-and-commands.md`.
- `docs/runbooks/OBSERVABILITY.md`.

Modify `apps/istemer-demo/lib/supabase/database.types.ts` after migration generation; `supabase/tests/package.json` and `supabase/tests/package-lock.json` for cumulative/local versus real test commands; root `package.json`/`package-lock.json` only for necessary test tooling. Create `tests/integration/command-concurrency.test.ts` for real multi-connection Postgres races; do not place that proof in the PGlite package. Record generated migration filename in the trace matrix.

Close local implementation only after unit, baseline replay, cumulative replay and failure-injection tests pass. **Phase closure additionally requires real Supabase Auth + Postgres**: verified/unverified/expired sessions; identical known/unknown login and recovery responses; rate-limit behavior; wrong email, expired/revoked/reused invitations; suspended-tenant acceptance denied; pending non-initial-owner acceptance denied; owner aal1 denied and aal2 allowed; mixed owner/operator memberships evaluated per tenant; admin without tenant membership denied content; operator attempting owner-only work rejected; last-owner concurrency; interrupted saga safely reconciled; audit INSERT failure rolls back the membership mutation; revoked-member re-invitation follows OI09; receipt/audit transactional results. Also demonstrate ordinary anonymous/authenticated/service-role business DML remains denied as designed. Missing OI04/OI08/OI09 means closure remains BLOCKED, never substitute mocks or a service-role session. Real multi-connection Postgres proves races; the PGlite harness does not.

## P1D — approved EN/AR shell and access states

Dependencies: P1C authorization contracts; OI06 exact missing access copy before visual acceptance; OI10 operator projection confirmation before protected read acceptance. Approved D12 routes stay `/{locale}/t/{tenantId}` with `en|ar`; technical Auth paths use the canonical `/{locale}/auth/login`, `/{locale}/auth/accept-invitation`, `/{locale}/auth/recovery`, `/{locale}/auth/reset-password` and `/{locale}/auth/mfa` URLs; no invented tenant selector or route gate.

Implement v3.2 shell, logical CSS directions, keyboard/focus flow, localized dates/numbers and consistent message dictionaries. Locale change preserves authorized tenant and `package` query, including browser back/forward. Reject unsupported locale/tenant/parameter combinations without leaking existence. Direct deep links recheck current authority. Only Today/package are enabled; other source routes show approved unavailable behavior. Error/loading/empty/denied/offline responses must not silently fall back to fixture content.

Create:

- `apps/istemer-demo/lib/i18n/en.ts`, `apps/istemer-demo/lib/i18n/ar.ts`, `apps/istemer-demo/lib/i18n/index.ts`.
- `apps/istemer-demo/lib/routing/routes.ts`, `apps/istemer-demo/lib/routing/availability.ts`.
- `apps/istemer-demo/features/shell/TenantShell.tsx`, `apps/istemer-demo/features/shell/LocaleSwitch.tsx`, `apps/istemer-demo/features/shell/AccessState.tsx`, `apps/istemer-demo/features/shell/shell.css`.
- `apps/istemer-demo/features/auth/AccessForms.tsx` — presentation only; server commands enforce authority.
- `apps/istemer-demo/features/demo/FixtureShell.tsx` — preserve old fixture navigation separately from protected tenant navigation.
- `apps/istemer-demo/app/[locale]/layout.tsx`.
- `apps/istemer-demo/app/[locale]/auth/login/page.tsx`, `apps/istemer-demo/app/[locale]/auth/accept-invitation/page.tsx`, `apps/istemer-demo/app/[locale]/auth/recovery/page.tsx`, `apps/istemer-demo/app/[locale]/auth/reset-password/page.tsx`, `apps/istemer-demo/app/[locale]/auth/mfa/page.tsx`, `apps/istemer-demo/app/[locale]/access-denied/page.tsx`.
- `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/layout.tsx`, `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/loading.tsx`, `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/error.tsx`, `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/not-found.tsx`.
- `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/[...unavailable]/page.tsx` — allowlisted source routes only, unknown routes remain not-found.
- `apps/istemer-demo/__tests__/locale-routing.test.ts`, `tests/e2e/access.spec.ts`, `tests/e2e/shell-locale.spec.ts`.
- `playwright.config.ts` — base e2e project configuration; P1F adds the authorized nonproduction origin/session fixtures.
- `docs/evidence/phase-1/bilingual-shell.md`.

Modify `apps/istemer-demo/app/layout.tsx` for minimal document/session-safe locale composition without fixture chrome on protected routes. Retain fixture shell on each legacy page by modifying the exact existing paths: `apps/istemer-demo/app/page.tsx`, `apps/istemer-demo/app/organization/page.tsx`, `apps/istemer-demo/app/agents/page.tsx`, `apps/istemer-demo/app/agents/[id]/page.tsx`, `apps/istemer-demo/app/workflows/page.tsx`, `apps/istemer-demo/app/workflows/[id]/page.tsx`, `apps/istemer-demo/app/approvals/page.tsx`, `apps/istemer-demo/app/approvals/[id]/page.tsx`, `apps/istemer-demo/app/coordination-cycle/page.tsx`, `apps/istemer-demo/app/workspaces/[agentId]/page.tsx`, `apps/istemer-demo/app/system-health/page.tsx`. These existing segment names were verified against `rg --files`; preserve their data and behavior. No global visual changes to Northwind/core tokens. If a legacy path changes during implementation, correct this manifest before editing rather than creating a duplicate route.

Close: real-session browser login/recovery/logout/MFA and denial states; EN/AR screenshot comparison to frozen v3.2 at **1440×900, 1024×768 and 390×844**, in both LTR and RTL directions; keyboard-only navigation, visible skip-link/focus, semantic labels, appropriate lang/dir, screen-reader names, contrast, reduced-motion behavior and automated accessibility checks. No owner copy placeholder at acceptance. Assert no forbidden callback/network action on unavailable controls. Both legacy fixture consumers still pass their relevant checks. Requires real Auth for lifecycle closure; visual/locale tests alone may run locally.

## P1E — persisted Today, exact package query and private synthetic artifact

Dependencies: P1C/P1D; OI04 for real-session evidence and OI10 for the operator projection. Follow R17 order: Today → package → private file. No business decision/feedback endpoint.

Create:

- `apps/istemer-demo/adapters/supabase-read-adapter.ts` — request-scoped implementation of read ports, current user JWT, no service-role fallback.
- `apps/istemer-demo/features/dashboard/queries.ts`, `apps/istemer-demo/features/dashboard/TodayView.tsx`.
- `apps/istemer-demo/features/approvals/queries.ts`, `apps/istemer-demo/features/approvals/ApprovalPackageView.tsx`.
- `apps/istemer-demo/features/storage/read-private-artifact.ts`.
- `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/today/page.tsx`, `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/approvals/page.tsx`.
- `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/artifacts/[fileId]/route.ts` — reauthorize each stream/request; private no-store; safe content headers and no bucket-key authority from caller.
- `supabase/seed/phase-one.ts`, `supabase/seed/phase-one-manifest.json`, `supabase/seed/assets/synthetic-artifact.txt` — explicitly synthetic data mapped from approved brief, deterministic hashes and tenant-local revision links; no automatic remote seeding.
- `supabase/migrations/<CLI timestamp>_phase_1c_synthetic_seed.sql` — mandatory additive seed-command schema/role/policies if the controlled seed graph cannot be expressed by the P1C command migration; never a client-side service-key grant.
- `apps/istemer-demo/__tests__/supabase-adapter.test.ts`, `apps/istemer-demo/__tests__/package-query.test.ts`.
- `tests/integration/read-provenance.test.ts`, `tests/integration/private-storage.test.ts`, `tests/integration/synthetic-seed-recovery.test.ts`.
- `tests/e2e/today-package.spec.ts`, `docs/evidence/phase-1/reads-and-storage.md`.

Modify `packages/core/contracts/src/phase-one.ts`, `packages/core/contracts/src/ports.ts`, `packages/core/contracts/src/index.ts` only for verified read needs; preserve `packages/core/contracts/src/revision-approval.ts` and its existing tests unless a separately evidenced defect requires a scoped fix. Modify `apps/istemer-demo/lib/supabase/database.types.ts` only when schema actually changes. The seed path is mandatory: use a dedicated protected nonproduction command/role with exact grants/policies and an explicit tenant allowlist, never a browser or generic service-role read adapter. The process allocates each `file_id` before upload, builds the required object key, verifies bytes/digest/length, then inserts immutable published metadata and links in the controlled transaction. If any trigger/RLS dependency cannot be made narrow, stop rather than broaden privileges or change the applied baseline.

Seed T05/T06/T09/T10/T11/T12/T17 graph for two synthetic tenants after provisioning: exact artifact/run/campaign/objective/revision references, safe provenance, digest and byte length. Allocate `file_objects.id` before upload, derive `tenant_id/file_id/opaque_uuid`, upload with the protected seed credential, and insert the immutable published row only after verification. Incomplete uploads remain inaccessible. Re-run converges on the same graph or reports conflict; it cannot overwrite published bytes or erase audit. Lost response/partial upload is reconciled without blind deletion. No fictional performance metrics or execution claim.

Today and package queries scope every join by tenant; selection must name exact immutable revisions, never resolve a stale approval to latest content. Missing, malformed, duplicate or foreign `package` input yields bounded approved state without leaking object existence. Source/read failure is shown honestly. Display synthetic status for API transport, locale-safe timestamp/provenance and read-only controls.

Close: real Supabase Postgres + Auth + Storage tests prove correct bytes/hash for permitted owner aal2/operator, denial for other tenant/revoked/suspended/anonymous/aal1 owner, and no public bucket/listing/signing or direct upload/update/delete bypass. The object policy must independently require current membership/assurance and exact revision linkage; add a negative test showing that a deliberately widened `file_objects` SELECT policy does not widen `storage.objects` access. Verify the target semantics of managed `storage.allow_any_operation`; a local stub is not evidence. Test linked-object/revision ownership and mismatched path IDs. No approved public signed-URL flow in Phase 1. App/API responses are private/no-store and do not expose mail, tokens, credentials or arbitrary metadata. Read DTO/unit/e2e tests pass; no business write/execution endpoint exists.

## P1F — integrated acceptance, security and failure recovery

Dependencies: all P1C–P1E real-service gates. Maintain two actual synthetic tenants plus deliberately separate memberships/roles; Northwind's fixture app does not qualify.

Create:

- `tests/e2e/fixtures.ts` — dedicated nonproduction origin/session fixtures; private temporary session state excluded from version control and reports.
- `tests/rls/phase-one-isolation.test.ts` — real two-tenant SQL/API/Storage isolation and multi-connection race entry points.
- `tests/security/phase-one-boundaries.test.ts`, `tests/security/storage-policy-invariant.test.ts` — direct entry-point, secret/cache, path-tampering and widened-parent-policy checks.
- `tests/e2e/revocation.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/visual-parity.spec.ts`, `tests/e2e/phase-one.spec.ts`.
- `tests/integration/direct-api-security.test.ts`, `tests/integration/failure-recovery.test.ts`.
- `scripts/check-phase-one-surface.mjs` — inspect enabled routes/commands/client imports for accidental business mutation or secret exposure, explicitly failing if authenticated routes import `NotificationPreviewCard`, `RehearsalFlowPanel`, `ContentCalendar`, `TrendAlertCard` or `DesignConceptCard`; not a substitute for functional/security tests.
- `docs/evidence/phase-1/isolation.md`, `docs/evidence/phase-1/failure-recovery.md`, `docs/evidence/phase-1/accessibility-and-visual.md`, `docs/evidence/phase-1/acceptance.md`.

Modify `playwright.config.ts`, `package.json`, `package-lock.json` for explicit local/live/integration/e2e test scripts; `.gitignore` only for private test state and generated sensitive traces; extend the tests introduced in P1B–P1E. Do not weaken existing guards or print environment files.

Execute every applicable X01–X08 scenario in the trace matrix: positive and negative direct SQL/API/RPC/Storage, real session assurance/revocation, cross-tenant joins and FKs, command retries/races/rollback, Auth/DB and object-store partial failures, network errors, stale browser navigation and locale state, keyboard/a11y/visual comparison at 1440×900, 1024×768 and 390×844 in both directions, reduced-motion behavior, and explicit excluded-component import checks. Real concurrent DB connections are required for race proof; an in-process stub loop is insufficient.

Close: all R17.1–R17.8 technical evidence collected, no unresolved critical isolation/access/audit failures, all required outcomes explicitly pass rather than skipped, no real data, no forbidden endpoint. R17 final owner acceptance remains P1G. Record limitation if any provider cannot exercise a failure deterministically; unresolved required tests block closure.

## P1G — controlled nonproduction deployment and Phase 1 sign-off

Dependencies: P1F; OI05 host/origin/TLS/config and OI07 reviewer availability; valid OI01–OI04 procedures/authorization. No external pilot or production release implied.

Create:

- `Dockerfile`, `.dockerignore`, `deploy/compose.yaml` — proposed existing-VPS Node/container packaging; confirm compatibility with existing host services before choosing ports/applying config.
- `deploy/Caddyfile` — **conditional placeholder only if OI05 confirms Caddy is the existing reverse proxy**. Otherwise create the host-specific reverse-proxy configuration named by the OI05 inventory; do not choose Caddy in advance or apply either configuration during planning.
- `.github/workflows/phase-one-ci.yml` — locked checks/build; live environment job protected and not automatic on untrusted PRs.
- `docs/runbooks/DEPLOYMENT_AND_RECOVERY.md`, `docs/runbooks/SECRET_HANDOVER.md` — approved procedure references, never secrets.
- `docs/evidence/phase-1/deployment.md`.

Modify `apps/istemer-demo/next.config.mjs` if standalone packaging is selected; `docs/evidence/phase-1/acceptance.md`, `docs/TRACEABILITY_MATRIX.md`, `docs/IMPLEMENTATION_PHASES.md` for actual evidence/sign-off and status. Application artifact includes all monorepo runtime dependencies.

Sequence: lock artifact/config/migration versions → validate nonproduction target and redacted secret wiring → review backup/recovery access and prior compatible artifact → run clean/prior-schema migration checks → separately authorized additive DB/Edge deployment → deploy app with compatible schema and TLS/redirects → smoke login/MFA/recovery and canary reads → execute target-environment isolation/Storage/revocation tests → owner reviews exact R17 evidence. Pause on failure; do not blindly repeat identity delivery or migrations. The existing baseline is never pending in this sequence.

Recovery: retain database/object/audit state; stop unsafe traffic and workers/adapters; restore prior compatible application artifact, or hold unavailable if schema incompatible; fix schema forward. Reconcile durable Auth/Storage operations before retry. Validate current membership and private object reads after recovery. Rehearse failed deployment, interrupted process and unavailable database without deleting data. Document limits of database-only backup: Auth/configuration and object bytes need their own verified recovery coverage. Destructive restore requires a separately approved target and incident authorization; no invented RPO/RTO, retention or purge promise.

Close: deployed nonproduction artifact is identified; all R17 checks pass on target services; recovery rehearsal has evidence; owner explicitly accepts the restricted synthetic slice and exclusions. Unresolved D13–D20 are retained for later work. Never label this production-ready or live agent execution.

## P2 — remaining approved read modules and workflow data (conditional)

Entry: Phase 1 accepted; D18 pilot criteria; D13 for affected run/SOP semantics, D17/D19 before real ingestion. Reconfirm owner authority before activating scope outside Phase 1. No consequential approvals or effects.

Proposed files:

- Create `supabase/migrations/<CLI timestamp>_phase_2_workflow_data.sql` for T07/T08/T15/T16/T20/T21 and same-tenant run references; no inferred extra tables.
- Create `packages/core/contracts/src/workflow-data.ts`, `apps/istemer-demo/lib/commands/objectives.ts`, `apps/istemer-demo/lib/commands/artifact-revisions.ts`, `apps/istemer-demo/lib/commands/workflow-config.ts`.
- Create `apps/istemer-demo/features/modules/ModuleView.tsx`, `apps/istemer-demo/features/modules/queries.ts`; extend `apps/istemer-demo/lib/routing/availability.ts` only as each approved surface closes.
- Create pages beneath `apps/istemer-demo/app/[locale]/(tenant)/t/[tenantId]/`: `campaign/page.tsx`, `studio/page.tsx`, `team/page.tsx`, `results/page.tsx`, `ask/page.tsx`, `ops/org/page.tsx`, `ops/manifests/page.tsx`, `ops/sops/page.tsx`, `ops/runs/page.tsx`, `ops/artifacts/page.tsx`, `ops/rules/page.tsx`, `ops/connectors/page.tsx`, `ops/memory/page.tsx`, `ops/cost/page.tsx`, `ops/audit/page.tsx`, `ops/diagnostics/page.tsx`, `ops/system/page.tsx`. The preceding prefix is part of every exact path; no alternate route hierarchy is intended.
- Create `tests/integration/workflow-data.test.ts`, `tests/e2e/modules.spec.ts`, `docs/evidence/phase-2/acceptance.md`.
- Modify `packages/core/contracts/src/index.ts`, `apps/istemer-demo/adapters/supabase-read-adapter.ts`, `apps/istemer-demo/lib/supabase/database.types.ts` for approved data only.

Close: each activated U03–U19 surface maps to approved content, T relationships and permission tests; K07 revisions/config commands preserve same-tenant authority and atomic audit; unavailable/live indicators stay honest; no invented analytics or Ask execution. Real Postgres/Auth required; real Storage also required for any new object path. Missing product details remain disabled and individually gated. Exact interior component files and migration details are refined after applicable decisions, not invented now.

## P3 — immutable decisions, audit and business notifications (conditional)

Entry: P2, D14/D15 resolved with approved UI/copy; no live publication/spending.

Create `supabase/migrations/<CLI timestamp>_phase_3_approval_notifications.sql` for T13/T14/T18/T19/T23; `packages/core/contracts/src/approval-commands.ts`; `apps/istemer-demo/lib/commands/approval-decisions.ts`; `apps/istemer-demo/lib/commands/notification-receipts.ts`; `apps/istemer-demo/features/notifications/Notifications.tsx`; `supabase/functions/notification-delivery/index.ts`; `tests/integration/approval-transactions.test.ts`; `tests/integration/notification-recovery.test.ts`; `tests/e2e/approval-decisions.spec.ts`; `docs/evidence/phase-3/acceptance.md`. Modify `packages/core/contracts/src/index.ts`, `apps/istemer-demo/features/approvals/ApprovalPackageView.tsx` and `apps/istemer-demo/lib/supabase/database.types.ts`. T12 approval requests remain immutable and pending; P3 inserts T13/T14 evidence and does not relax T12 triggers.

Close: K08 owner-only authority checked fresh; exact tenant/action/revision/destination/artifact/digest binding; stale revision/content/destination and expired/racing/replayed consent rejected; decision/feedback/audit/receipt/outbox atomic; K09 recipient enforcement; failed/duplicate notification delivery recoverable with no false success. X06 plus real Auth/Postgres and actual selected channel sandbox are required. Approval creates evidence, not automatic permission for arbitrary future effects.

## P4 — bounded execution, integrations and operational release (conditional)

Entry: P3; D13/D16/D19/D20 and relevant D14/D17/D18 resolved; explicitly authorized sandbox and effects. No provider, tool, spending limit or notification channel is selected here.

Create `supabase/migrations/<CLI timestamp>_phase_4_execution_authorizations.sql` for T24/T25; `packages/core/contracts/src/execution.ts`; `supabase/functions/execution-worker/index.ts`; `supabase/functions/integration-events/index.ts`; `supabase/functions/_shared/execution-authorization.ts`; `apps/istemer-demo/lib/commands/knowledge-ingestion.ts`; `tests/integration/execution-authorization.test.ts`; `tests/integration/integration-reconciliation.test.ts`; `tests/operations/load.test.ts`; `tests/operations/restore.test.ts`; `docs/runbooks/INCIDENT_RESPONSE.md`; `docs/evidence/phase-4/acceptance.md`. Modify existing revision/approval/adapter contracts only as required by approved choices, and update `apps/istemer-demo/lib/supabase/database.types.ts`.

Provider-specific adapter filenames, upload scanning implementation and K06 transfer/K05 reset implementation remain **OWNER INPUT REQUIRED** under D13/D16/D19/D20/D10; naming a fictitious provider or enabling reset would invent scope. Record exact additional files in this document after approval and before coding those capabilities.

Close: K10 ingestion ownership/security, K11 short-lived exact execution authorization and lease, K12 authenticated scoped integration events; least-privilege tool scopes; duplicate-effect prevention and ambiguous-outcome reconciliation; sandbox end-to-end receipts; no approval bypass or unseen external effect. Real Supabase/Auth/Storage and selected provider sandbox required; X06/X08 load/restore against owner-approved targets, incident/secret/support handover and owner release sign-off. External pilot/production is blocked until these applicable gates close.
