# Supabase integration readiness

Audit: 2026-09-09. **Not ready to connect the new project.** This is a repository-only assessment and proposed implementation scope, not authorization to implement or provision.

## 1. Evidence and implemented foundation

Inspected both apps, all six workspace manifests plus root manifest, contracts, adapters, tests/scripts, lockfile, Git diff, and both implementation documents. `FULL_PROJECT_MASTER_PLAN.md`, `PHASE_0_ARCHITECTURE.md`, `DECISION_REGISTER.md`, and `TRACEABILITY_MATRIX.md` are absent throughout this repository. Their requirements cannot be verified; no neighboring workspace was inspected.

Root `package.json` provides npm workspaces, lint, typecheck, Vitest and both-app build scripts. Both apps pin Next 14.2.15 and React 18.3.1; both `next.config.mjs` files enable static export.

Reusable implementation includes asynchronous read interfaces (`packages/core/contracts/src/ports.ts:13`), Zod tenant/manifest validation (`schemas.ts:30`), organization graph projections, presentational UI and provenance (`view-meta.ts`). The uncommitted `revision-approval.ts:37` models tenant/action/artifact/destination bindings and compares revisions/digests. It neither authenticates humans nor authorizes execution.

## 2. Mock/demo-only boundaries

`apps/istemer-demo/adapters/fixture-adapter.ts:222` returns authored records. Routes instantiate it directly; detail routes enumerate fixture slugs with `generateStaticParams` and disable dynamic parameters. Shell provenance is hardcoded to fixture/sample (`app/layout.tsx:21`). Approvals remain pending with disabled controls (`app/approvals/[id]/page.tsx:22`); rehearsal records no decision. Agent roles, health, evidence and notification previews are descriptive data.

No Supabase dependency, client, auth handler, session validation, membership contract, SQL file, migration/config tree, seed script or database integration suite was found. Tenant slugs are branding/configuration, not security boundaries. `HumanApproverRole` and graph approval tiers are read-model vocabulary, not RBAC.

## 3. Reuse for the i-STEMer pilot

Keep tenant-neutral contracts, Zod boundaries, presenters, organization projection, deterministic fixtures and Northwind conformance coverage. Introduce authenticated adapter composition behind existing query interfaces; keep writes in separate command services. Bind each adapter to a server-verified tenant membership: existing queries accept IDs/domain slots without tenant context.

Proposed Phase 1 is authenticated tenant selection and persisted organization/agent reads. Other screens remain explicitly demo-only until their own persistence and authorization gates pass. Do not relabel fixtures as live or import the full sample dataset as production truth.

## 4. Gaps before connection

Reconcile missing master documents against `docs/PRODUCTION-IMPLEMENTATION-PLAN.md` sections 6/10, which defer identity/storage and specify owner-only approval initially. Define tenant provisioning, invitation/revocation, owner/operator permissions, domain assignments and protected data scope.

Choose a supported server-capable Next version and deployment target; replace static export for protected pilot routes. Add validated environment loading, request-scoped Supabase clients, verified sessions, cookie refresh/logout, safe callback redirects, membership checks and uncached tenant-sensitive reads. Fail closed on missing configuration, expired identity or database failure; never silently substitute fixtures.

## 5. Required `.env.example` variables

Proposed names, currently unused:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key |
| `APP_URL` | Server-side canonical origin for validated auth redirects |

Use empty placeholders. Document loading from `apps/istemer-demo/.env.local`; the existing root `.env.local` is not automatically the app's environment file when Next runs in its workspace. Validate deployment injection separately.

No privileged key is required for normal user-scoped reads. If later approved provisioning requires one, use server-only `SUPABASE_SECRET_KEY`; never a `NEXT_PUBLIC_` variant. CLI access tokens/database passwords belong in protected tooling configuration, not the browser or examples. Do not configure a trusted tenant ID through an environment variable.

## 6. Required migrations and RLS

Proposed migration sequence; no files created:

1. Identity/tenancy: `tenants`, `memberships` referencing `auth.users`, unique `(tenant_id,user_id)`, explicit role/status and domain-assignment representation. Define last-owner protection and privileged invitation/provisioning paths.
2. Pilot registry: tenant-owned departments, agent roles and organization relationships; immutable tenant ownership, indexes on membership/tenant lookups, unique tenant-local identifiers and composite foreign keys preventing cross-tenant relationships. Map fixture slugs to stable database IDs explicitly.
3. Security: ship grants and RLS with each table, default deny, no anonymous business-data access. Reads require current active membership and permitted domain scope. Membership self-escalation and tenant reassignment must be impossible. Initially deny client registry writes; later writers need operation-specific policies with both existing-row and new-row checks.

Prevent membership-policy recursion; audit any narrowly scoped private helper and its execution grants. Do not trust editable user metadata or request-body roles. Use invoker-security views; privileged clients cannot serve as isolation-test actors. These controls follow [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Before enabling approval persistence, add campaigns/tasks/runs, immutable artifact revisions, evidence, action revisions, approval packages, append-only decisions/audit, execution requests/outbox and verification records. Require tenant-consistent foreign keys, authoritative hashes, atomic revision/expiry checks and idempotency. Owner approves staging/live under the current plan; operator approval remains denied. Private Storage buckets/policies are required only when uploading artifacts; execution/connectors remain a later gate.

## 7. Required two-tenant isolation tests

Use a disposable test database with tenants A/B, separate owners/operators, a dual-member user, revoked membership and an unauthenticated client:

- Positive same-tenant reads; deny cross-tenant list/detail/join/count access, including guessed IDs and altered tenant parameters.
- Test SELECT/INSERT/UPDATE/DELETE permissions individually; deny tenant reassignment, cross-tenant foreign keys, membership creation/role escalation and unauthorized domain access.
- Verify dual-member switching, revoked membership with an existing token, expired/forged sessions, logout, direct URLs and cross-session cache separation.
- Verify anonymous access fails and authenticated clients cannot reach privileged helpers or bypass policies through views/RPCs.
- Before later approvals/storage: deny operator/agent decisions, cross-tenant files/signed URLs, stale revisions and staging-to-live reuse; prove atomic decisions, append-only history and duplicate-request handling.

Existing `test-fixtures/scale/second-tenant-conformance.test.ts` proves fixture portability only. `packages/core/__tests__/leakage-scanner.ts` scans vocabulary, not secrets or RLS. No database tests were run.

## 8. Exact proposed Phase 1 files

Paths below are relative to the repository; this is a conditional implementation map, pending architecture reconciliation.

**Modify:** root `package.json`, `package-lock.json`, `apps/istemer-demo/package.json`, `apps/istemer-demo/next.config.mjs`, `packages/core/contracts/src/index.ts`; `apps/istemer-demo/app/layout.tsx`, `app/organization/page.tsx`, `app/agents/page.tsx`, `app/agents/[id]/page.tsx`; `apps/istemer-demo/__tests__/routes-render.test.tsx`, `__tests__/demo-indicator.test.tsx`.

**Create:** root `.env.example`; `packages/core/contracts/src/identity.ts`; under `apps/istemer-demo/`: `lib/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/auth/session.ts`, `lib/auth/tenant-context.ts`, `adapters/supabase-adapter.ts`, `adapters/resolve-adapter.ts`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/auth/logout/route.ts`, `app/tenant/select/route.ts`, `__tests__/tenant-access.test.ts`. Add `proxy.ts` for Next 16+, or `middleware.ts` if the selected supported version requires it; do not create both. Follow [current SSR guidance](https://supabase.com/docs/guides/auth/server-side/nextjs).

Add `supabase/config.toml`, CLI-generated timestamped files under `supabase/migrations/`, `supabase/tests/tenant_isolation.test.sql`, `tests/integration/supabase-isolation.test.ts` and `vitest.integration.config.ts`. Exact migration timestamps cannot be prescribed before creation. Keep Northwind fixture-only; coordinate any shared framework upgrade with its manifest and regression checks.

## 9. Git state and secret review

Branch `main`; HEAD `5c425e3ab1c4a48e11762676efe73c95517b0cd8`; origin `https://github.com/Eltaweeel/i-STEMer-system-hub.git`.

Pre-existing review items: modified `.gitignore` (+8 lines) and `packages/core/contracts/src/index.ts` (+1 export); untracked `docs/PRODUCTION-IMPLEMENTATION-PLAN.md`, `docs/IMPLEMENTATION-CHECKPOINT.md`, `packages/core/contracts/src/revision-approval.ts`, and `packages/core/contracts/__tests__/revision-approval.test.ts`. Nothing staged.

Credential-pattern scan: zero findings across 121 tracked/untracked files. `.env.local` is empty, untracked and ignored. No tracked environment file found. History, ignored build outputs and remote settings were not secret-audited; this is not proof of no historical exposure.

## 10. Blocking prerequisites

Missing architecture documents and unresolved membership/provisioning policy block an authoritative Phase 1 specification. Server deployment/version choice, schema/RLS review, environment validation and passing isolation tests block pilot data use. The checkpoint reports older Next/PostCSS advisories; their current status was not retested. Revised design/handoff blocks design-dependent UI work. Only this report was created; no project connection, users, migrations, code changes, builds, staging or commits occurred.
