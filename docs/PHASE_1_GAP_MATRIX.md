# Phase 1 gap matrix

Date: 2026-09-09. Documentation comparison only; no implementation or service connection authorized by this report.

## Authority and corrections to the readiness audit

The seven requested files in `product-architecture/` are byte-for-byte copies of the supplied release-handoff originals. SHA-256 comparison verified every copy. Their contents and originals are unchanged.

Use [FULL_PROJECT_MASTER_PLAN.md §17](product-architecture/FULL_PROJECT_MASTER_PLAN.md#17-exact-phase-1-vertical-slice-r17), [DECISION_REGISTER.md](product-architecture/DECISION_REGISTER.md) D01–D12/A01–A09, and [TRACEABILITY_MATRIX.md](product-architecture/TRACEABILITY_MATRIX.md) R17 as the current authority. Round 2 dispositions govern the historical Round 1 findings. The later decision register resolves D12-Q2; references in older proposal/debate text to unresolved D01–D12 do not reopen approvals.

The existing [readiness audit](SUPABASE_INTEGRATION_READINESS.md) accurately describes missing backend code, but its conditional scope and decisions are superseded:

- Phase 1 is **invitation → real Auth → bilingual tenant shell → Today → read-only approval package → private Storage → two-tenant RLS tests**, not organization/agent registry persistence.
- Supabase and hosting are selected: managed Supabase plus the existing Contabo VPS (D08-B). Compatible supported runtime versions still need engineering selection.
- D02 permits separate memberships in multiple organization tenants. D03 enables owner/operator, disables viewer, and forbids operator business approvals. D05 requires verified email/password and owner/platform-admin MFA. These are settled requirements.
- Private synthetic artifacts and authenticated streaming are required now; general uploads, business decisions, agent execution, notifications and external integrations remain excluded.
- The previously missing planning documents are now present. The frozen v3.2 visual contract exists per RELEASE_NOTES; the earlier August checkpoint's missing-design statement is historical. The requested seven-file subset does not include the referenced HTML, IMPLEMENTATION_BLUEPRINT.md or OWNER_DECISIONS.md. Their relative links remain unchanged and may not resolve locally; visual implementation must consult the canonical assets without inventing copy or redesigning them.

## Existing implementation baseline

Git history confirms Batch 1 `4b54333`, Batch 2 `8693862`, Batch 3a `d9140ba`, Batch 3b `35437c5`, and Batch 3c/HEAD `5c425e3ab1c4a48e11762676efe73c95517b0cd8`. The existing monorepo contains two demo apps and reusable core packages. The planning tree assumes one application under `src/`; map that logical structure into `apps/istemer-demo/` and retain Northwind as a conformance consumer. This is a proposed repository adaptation, not grounds to create a third app or flatten the repository.

## Requirement-to-code matrix

All paths below are repository-relative. “Missing” means no implementation found, not a failed live test.

| Approved requirement / trace | Existing Batches 1–3c evidence and reuse | Gap and required outcome |
| --- | --- | --- |
| Reusable core; R02, X01 | `packages/core/contracts/src/ports.ts` has async read ports; `schemas.ts` validates tenant/manifest data; `packages/core/organization/src/index.ts` projects graphs. Core UI and dependency/tenant-vocabulary guards are reusable. | Preserve core-to-app dependency direction. Add request-scoped authorization/composition and Today/package read models; a domain-slot filter is not authorization. |
| Honest synthetic data; D01/D07/D10, R11 | Both `adapters/fixture-adapter.ts` implementations return authored fixtures. i-STEMer `app/layout.tsx` fixes sample provenance; `next.config.mjs:3` exports static files. | Real individually invited identities and real RLS over synthetic DB rows. Synthetic data must never bypass auth. Distinguish persisted synthetic provenance from in-memory fixtures; no fallback-to-demo on backend failure. |
| Auth integration; D05/D06, K01/K02 | No Supabase dependencies, auth routes, session checks, invitation handling or MFA. `app/system-health/page.tsx` labels identity planned. | Verified invite-only password login, owner/admin MFA, PKCE callback, recovery, logout and safe redirects. Recoverable provisioning/invitation saga; exact verified recipient, lower-role ceiling, expiry, revocation, single use and retry reconciliation. |
| Tenant/membership enforcement; D02–D04, R05 | `tenant/tenant.config.ts` provides a static slug; `schemas.ts:31` accepts a string. Graph authority and `revision-approval.ts` actor roles are display contracts. | Every DAL read/action/handler checks verified identity and current active membership/tenant; owner/operator scoped separately per tenant. Platform grant gives no content access. Disabled viewer and machine principals gain no human privileges. Revocation yields typed localized denial, not an empty valid dashboard. |
| Bilingual shell and routes; D12, U01/U02, X07 | English shell (`app/layout.tsx:43`); root command center and `/approvals/[id]` use fixture routes. Shared chrome/presenters are reusable, not certified v3.2 parity. | `/{locale}/t/{tenantId}/today` and `/approvals?package=<id>`, EN/AR and RTL, tenant/package-preserving locale switch, approved denial/sign-out/recovery states. Layouts are not security boundaries. Keep other modules outside the authenticated Phase 1 slice or explicitly fixture-only. |
| Today/package reads; K03, R17.4 | `app/page.tsx`, `app/approvals/page.tsx`, `app/approvals/[id]/page.tsx`, `ApprovalDetailView.tsx`, `approval.ts` provide useful presentation/read vocabulary. | User-scoped DB projections with same-tenant joins and immutable revision/provenance. Today is not automatically equivalent to CommandCenterView. Keep all business decision/execution endpoints absent; existing disabled controls remain a useful invariant. |
| Migrations; R04/T/G IDs | No `supabase/` tree, SQL migrations, seed machinery or generated DB types. | Implement only the Phase 1 schema/order below; enforce tenant-qualified references, immutability, lifecycle constraints and indexes. Do not prematurely create all 25 tables. |
| RLS/grants; R06, A03, C01/C09/C10 | No policy or privilege implementation. Tenant vocabulary tests do not exercise database access. | Deny anonymous reads/direct business DML. Current membership and active tenant checks on each exposed relation; private helpers and constrained command roles must not bypass RLS. Test direct APIs/RPCs, not just routes. |
| Private Storage; R09/T17/K04, A06/C05/C07 | Artifact references are strings; no bucket, object linkage, client or streaming handler. | Private synthetic objects, metadata-to-revision authorization and authenticated streaming on each new request. No public URLs, arbitrary caller-selected keys, general uploads or client Storage writes. |
| Admin audit and replay safety; T04/T22/G04, C02/C04/C11/C15 | No authoritative commands, audit or receipts. Uncommitted revision comparison has no I/O. | Restricted provision/suspend/invite/revoke/accept tooling, transactional audit and receipts, recoverable Auth/DB saga. Audit failure rolls back membership mutation; same idempotency key with changed payload fails. Irreversible deletion/reset stays disabled. |
| Two-tenant proof; X02–X05 | `test-fixtures/scale/second-tenant-conformance.test.ts` proves fixture/core portability. Unit/route rendering tests exist. | Real Auth/DB/Storage positive and negative suites plus browser flow; detailed cases below. No current test establishes production isolation. |

## Required Phase 1 schema and policy work

Master plan §4 migration order: private roles/helpers/global grants → **T01–T04/T22** (`tenants`, `memberships`, `tenant_invitations`, `audit_log`, `command_receipts`) → invitation lifecycle constraints → **T05/T06** campaigns/objectives → **T09** minimal synthetic runs → **T17** file_objects → **T10/T11** artifacts/revisions → **T12** read-only approvals → complete RLS/grants/Storage policies and controlled seed. Create nullable circular current-revision pointers last. Each exposed table must be protected before becoming accessible.

G01 is Supabase-managed `auth.users`, not an application-created auth table. G02–G04 are `private.platform_admins`, `private.platform_audit`, `private.provisioning_operations`: RLS enabled, no direct anon/authenticated table grants or client policies. Phase 2/3/4 tables, especially approval decisions/feedback/outbox, are deferred as listed in the master plan.

All tenant relationships require composite tenant-qualified FKs even with globally unique UUIDs. Membership uniqueness, active-owner protection, immutable tenant IDs/revisions, command digest/replay constraints and indexes are missing. Current read authorization must include role and active tenant/membership, not editable metadata or stale JWT role claims. T22 is not directly client-readable; audit is append-only through authorized transactions.

A03/C01 requires a nonrecursive private boolean membership helper owned by a dedicated NOLOGIN/NOBYPASSRLS non-table-owner role with minimal read grants, fixed search path and own-user policies. Separate platform helper/command roles; revoke PUBLIC execution and review every callable function. Normal reads carry user context; Auth Admin privilege is isolated, never used for ordinary tenant reads.

Storage must join `(storage.objects.bucket_id,name)` to T17 `(bucket,object_key)` and an authorized T11 file reference plus current membership. Keys are server-generated `tenant_id/file_object_id/opaque_object_id`; missing/mismatched linkage denies access. Parent policies must not recurse through Storage. Phase 1 streams authenticated content; later signed URL support, if activated, has a five-minute maximum. Downloaded bytes cannot be revoked.

## Required isolation and failure tests

1. Two synthetic organizations with real individual owner/operator sessions, a multi-member user, anonymous caller, revoked member, suspended tenant and platform admin without membership. Prove allowed own-tenant reads before asserting denials.
2. Cross-tenant SELECT/INSERT/UPDATE/DELETE, guessed package/file IDs, joins, FK reassignment, direct RPC/SQL helper calls and Storage access. No private grant enumeration, self-elevation or tenant-ID mutation.
3. Revoke membership while retaining an unexpired JWT; retry PostgREST/RPC, page DAL and Storage. Test suspension and alternating user/tenant SSR requests for cached content leakage.
4. Platform admin without membership cannot read content; with operator membership has only operator rights. Do not treat service-role credentials as an RLS-constrained test user. No business-approval endpoint is enabled, including for owner.
5. Wrong/expired/revoked/reused invitation rejection; existing-user acceptance; owner may invite only permitted lower roles. Inject Auth issuance failure and reconcile without duplicate identities/memberships/success audits. Inject audit failure and prove transaction rollback; test duplicate and changed-payload retries.
6. Private object path/link tampering, anonymous/cross-tenant/revoked streaming denial and direct Storage denial. No public delivery path or client upload privilege.
7. Browser invitation/login/recovery/logout → EN/AR shell → Today → selected package → private file; missing MFA, forged selectors, PKCE/redirect/CSRF abuse and direct handler calls. Check RTL, keyboard/focus, viewport behavior and locale preservation against v3.2. Scan eventual bundles/logs for secrets without exposing values.

## Exact implementation file map — proposed, not created

The approved documents prescribe logical modules rather than repository-specific filenames. The following concrete mapping implements that scope in the existing app; supporting names are engineering proposals, not additional approved features.

| Existing files to modify | Purpose |
| --- | --- |
| `package.json`, `package-lock.json`, `apps/istemer-demo/package.json`, `apps/istemer-demo/next.config.mjs` | Pin supported compatible dependencies; server runtime; integration/security/browser scripts. Coordinate `apps/northwind-demo/package.json` only if a shared framework upgrade requires it. |
| `apps/istemer-demo/app/layout.tsx`, `app/page.tsx`, `app/approvals/page.tsx`, `app/approvals/[id]/page.tsx` | Locale-aware document/composition, authorized entry routing and approved package-query mapping; explicitly classify legacy demo paths. |
| `packages/core/contracts/src/ports.ts`, `schemas.ts`, `view-meta.ts`, `index.ts` | Tenant-authorized read contracts, validated DTOs and truthful persisted-synthetic provenance without importing Supabase into core. |
| `packages/core/ui/src/components/AppShell.tsx`, `DemoIndicator.tsx`, `ApprovalDetailView.tsx`, `packages/core/ui/src/index.ts` | Approved shell/localized presentation and private-file affordance; retain no-decision behavior and Northwind compatibility. |
| `apps/istemer-demo/__tests__/routes-render.test.tsx`, `__tests__/demo-indicator.test.tsx`, `packages/core/ui/__tests__/approval-inbox.test.tsx` | Distinguish fixture conformance from authenticated synthetic behavior; preserve restrictions. |

New paths required when implementation is authorized:

- `apps/istemer-demo/app/[locale]/layout.tsx`; `[locale]/(tenant)/t/[tenantId]/layout.tsx`, `today/page.tsx`, `approvals/page.tsx`, `artifacts/[fileId]/route.ts` beneath that tenant directory.
- Under `apps/istemer-demo/app/[locale]/(access)/auth/`: `login/page.tsx`, `accept-invitation/page.tsx`, `recovery/page.tsx`, `reset-password/page.tsx`, `mfa/page.tsx`, `access-denied/page.tsx`; technical `apps/istemer-demo/app/auth/callback/route.ts`.
- Under `apps/istemer-demo/lib/`: `env.ts`, `supabase/browser.ts`, `supabase/server.ts`, `supabase/database.types.ts`, `auth/session.ts`, `authorization/tenant-context.ts`, `commands/invitations.ts`, `commands/session.ts`, `i18n/en.ts`, `i18n/ar.ts`, `observability/redaction.ts`.
- `apps/istemer-demo/adapters/supabase-read-adapter.ts`; `features/dashboard/queries.ts`, `features/dashboard/TodayView.tsx`, `features/approvals/queries.ts`, `features/storage/read-private-artifact.ts` beneath the app. Add `packages/core/contracts/src/identity.ts` and `phase-one.ts` for scoped DTOs. Keep the fixture adapter available for demo tests only.
- Root `.env.example`, `supabase/config.toml`, `supabase/functions/provision-tenant/index.ts`, `supabase/functions/invitations/index.ts`, `supabase/functions/suspend-tenant/index.ts`, `supabase/seed/phase-one.ts`; CLI-generated migration filenames under `supabase/migrations/` only at implementation time.
- `tests/rls/phase-one-isolation.test.ts`, `tests/integration/invitation-saga.test.ts`, `tests/integration/membership-audit.test.ts`, `tests/security/phase-one-boundaries.test.ts`, `tests/e2e/phase-one.spec.ts`, `vitest.integration.config.ts`, `playwright.config.ts`, `docs/PHASE_1_OPERATIONS.md`.

Request-time session refresh middleware/proxy filename follows the selected Next version; authorization remains in DAL/commands regardless. No auth or policy check belongs solely in layouts. Exact visual copy must come from the canonical handoff, not the older demo.

## Existing uncommitted work requiring review

At entry: modified `.gitignore` (+8 ignore lines) and `packages/core/contracts/src/index.ts` (+1 revision-contract export); untracked `docs/PRODUCTION-IMPLEMENTATION-PLAN.md`, `docs/IMPLEMENTATION-CHECKPOINT.md`, `docs/SUPABASE_INTEGRATION_READINESS.md`, `packages/core/contracts/src/revision-approval.ts`, `packages/core/contracts/__tests__/revision-approval.test.ts`.

Review the older plans for the superseded scope/hosting/design assumptions noted above. `HumanApproverRole = 'owner' | 'operator'` and `requiredApproverRole` in the uncommitted revision DTO must not become permission to grant operator approvals: approved D03 forbids that. The comparison helper is reusable read logic, not a transaction/authorization engine. Existing tests do not prove fresh membership, hash provenance or persistence. Nothing should be committed merely because a type or fixture test passes.

This task adds only the seven copied architecture files and this matrix. The prior audit and all application files remain unchanged. No tests/builds requiring generated outputs or services were run; no Supabase connection, migration creation, staging or commit occurred.

## Phase 1 start gate

The decision register leaves exactly four setup inputs outstanding: **Supabase project/account/region; recovery email provider/procedure; secret rotation/recovery handover procedure; support escalation procedure**. Preserve approved D01–D12 and do not reopen hosting, roles or D12-Q2. D13–D20 remain non-blocking for restricted Phase 1 and gate their later capabilities. No credentials are requested by this document. Phase 1 is not implemented or ready; its start gate and subsequent R17/X01–X05/X07 evidence remain unsatisfied.
