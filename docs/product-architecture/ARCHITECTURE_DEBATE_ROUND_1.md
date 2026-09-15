# Architecture debate — Round 1

Status: proposal for independent review, not owner approval. Planning only; 2026-09-08. Codex proposes and integrates; Claude reviews. Two review rounds maximum.

## Structured source fact sheet

| Source ID | Authoritative input | Extracted constraints |
|---|---|---|
| S1 | IMPLEMENTATION_BLUEPRINT.md, sections 1–8 | Nineteen prototype modules; component-state navigation rather than production URLs. Owner approves consequential actions; operator configures/inspects, never business-approves. Agents draft, stage and package; cannot self-approve. Revisions, provenance, tiered approval and append-only evidence are required. All operational values and integrations are fixtures/placeholders. |
| S2 | PHASE_0_ARCHITECTURE.md, sections 1–10 | Proposed Next.js/TypeScript, Supabase Auth/Postgres/RLS/Storage; tenant-aware keys and policies; trusted commands; private files; real authenticated synthetic demo. Architecture is a proposal, not implemented behavior. |
| S3 | OWNER_DECISIONS.md, D01–D20 | Twenty unresolved owner decisions; D01–D12 block Phase 1. Recommendations are not consent. Later decisions govern execution, approval scope, notifications, integrations, knowledge, success criteria, operations and owner transfer. |
| S4 | RELEASE_NOTES.md | Approved v3.2 visual reference is immutable. SVG fix has recorded verification; HTTP supported. Invisible org labels and file fetch limitations are inherited. No redesign without a new brief; archived evidence is not production verification. |

## Proposal for attack

### P01 — Boundaries
Build a tenant-isolated operational SaaS around the nineteen existing modules, retaining EN/AR, RTL/LTR and approved visuals. Translate behavior into React components rather than embedding prototype runtime. Phase 1 is precisely invitation → real auth → tenant shell → Today → read-only approval package → private Storage → two-tenant RLS tests. No agent execution, approval writes, business notifications or integrations in that slice. Access UI needs D12 brief. No billing, invented clients, metrics or providers.

### P02 — Identity and permissions
Auth user is global; membership is tenant-scoped with one active role. Proposed roles: owner, operator; viewer disabled pending D03. Platform admin is a separate private grant with provisioning authority, not implicit tenant content access or approval. Agent is a constrained machine principal, not a human role. Default one active owner with auditable transfer, last-owner protection and explicitly granted support access. Current DB membership and tenant status govern each action; neither route IDs nor editable JWT metadata authorize access. D01–D06 and D20 remain open.

### P03 — Data ownership
Tenant-owned tables carry immutable tenant_id; composite unique keys and foreign keys prevent cross-tenant references. Major entities: tenants, memberships, invitations, objectives, campaigns, manifests, SOP revisions, agent runs, artifacts and immutable revisions, approvals, decisions, feedback, knowledge and versions, notifications, connector metadata, audit events. Auth users and platform grants are global/private. Add run attempts, durable outbox and file records only in their consuming phase. Retention and deletion are D10/D19, not invented durations.

### P04 — Run, consent and evidence
Separate draft/staged/approved/executed/verified facts. Proposed run lifecycle requested → queued → running → awaiting approval → succeeded/failed/cancelled, with retry attempts and evidence; simulation never reports real execution. Tier 0 internal draft may proceed under authorized SOP; Tier 1 staging owner single-click; Tier 2 creative typed confirmation; live action separately locked. Decisions bind tenant, action, exact revision digest, tier, actor and server timestamp. A revision change invalidates consent. No self-approval or chat-derived consent. Atomic command validates state and membership, writes decision and audit together, and stages effect through an outbox. D13/D14 define actual permitted execution.

### P05 — Runtime boundaries
App Router Server Components read using request-scoped user credentials. Client handles interactions only. Server Actions or route handlers validate session, tenant, role, payload, revision and idempotency. Edge Functions hold Auth-admin/provisioning and later narrowly scoped privileged integration work. Service role never reaches browser and must not become a tenant-data convenience client. Narrow DB commands perform transactional transitions; private helpers with fixed search_path and restricted EXECUTE must retain caller identity and enforce RLS. Authentication and DB onboarding are reconciled, not falsely claimed atomic.

### P06 — Isolation
Default deny all tables; no anonymous grants. Read policies use current active membership and appropriate role. No direct browser writes to controlled workflow tables. Command routines use narrowly granted execution, explicit authorization and RLS rather than broad owner/service-role writes. Owner can see operational data; operator cannot approve; viewer sees only approved business projections if enabled. Foreign keys, Storage, RPCs, signed URLs, cache keys, invitations and worker payloads all undergo cross-tenant tests. Cache personalized results only when tenant/user/authorization scope is unambiguous; default no shared private cache.

### P07 — Demo
Recommend isolated nonproduction Supabase project with two synthetic tenants, individually invited real Auth users, production-equivalent policies and clearly synthetic data. No shared login or browser bypass. Reset requires trusted operator tooling, explicitly selected demo tenant, no effects or credentials, bounded idempotent changes, protected audit evidence and post-reset isolation checks. Exact reset retention is D10; no unsafe global truncation. Production demo alternative remains D07.

### P08 — Knowledge and files
Private Storage objects link immutable file records to tenant and authorized artifact/knowledge revision. Path prefix is not authority. Short-lived signed links are bearer capabilities; use authenticated streaming if immediate revocation is mandatory. Uploads later require limits, quarantine, type validation and provenance before retrieval or agent use. Documents/prompts are untrusted data, never permission instructions. No provider, embedding scheme or document limits assumed; D17/D19 govern.

### P09 — Notifications/integrations
Phase 1 uses Auth invitation/recovery delivery only. Later notification events enter transactional outbox, recipient-constrained in-app records and owner-approved channel adapters. Integrations are disabled placeholders until D16 approval, scoped credentials and verifiable effect receipts. Credentials stay in trusted secret stores, with only metadata/references in app data. Retries use idempotency; uncertain external results require reconciliation rather than blind replay.

### P10 — Delivery and proof
Phase 0 resolves D01–D12 and specifies access brief, threat model and contracts. Phase 1 delivers the exact limited slice. Phase 2 adds persisted workflow data and synthetic run evidence. Phase 3 adds human decisions, immutable audit and approved notification behavior. Phase 4 activates only separately approved integrations/execution, deployment and operational readiness. Every phase has migration, rollback and automated acceptance gates. Test real Auth/RLS with two tenants, every role and revoked membership, direct SQL/API/RPC/Storage attempts, transactional failure and concurrency, bilingual accessibility/browser paths and operational recovery. Load targets, hosting, backup/retention and incident ownership remain owner decisions; no unsupported production-readiness claim.

## Independent Claude review

Claude Code 2.1.119, configured model claude-sonnet-4-6; read-only session 0b4a2cbc-00f3-40b6-ae6f-f910e624d31d. Initial invocation exhausted its tool-turn limit without a review; the same Round 1 was resumed for final text and completed successfully in one turn. No integrator feedback occurred between these attempts. Read-only Git tripwire coverage was unavailable; independent input hashes are checked at final integration. The following response is preserved verbatim, including disputed technical claims; dispositions are in Round 2.

## Blocking issues

**C01 — active_member helper: SECURITY DEFINER vs INVOKER recursion trap unresolved**
Source: P05/P06, PHASE_0 §5. The entire RLS model rests on `active_member(tenant_id)` but its privilege mode is never stated. SECURITY INVOKER causes infinite recursion: the memberships SELECT policy calls the helper, which reads memberships, which triggers the policy again. SECURITY DEFINER owned by the proposed NOLOGIN/NOBYPASSRLS command role avoids recursion but requires explicit SELECT on memberships for that role, widening its grants. Neither path is resolved anywhere in the proposal.
*Resolution:* Declare a dedicated read-only NOLOGIN/NOBYPASSRLS role for the helper, mark it SECURITY DEFINER, pin search_path, grant EXECUTE only to the authenticated role. Write a direct-RPC adversarial test calling active_member as each role and asserting it returns only the caller's own authorization result — never another tenant's.

**C02 — Auth+DB provisioning non-atomicity: no reconciliation mechanism specified**
Source: P05, PHASE_0 §7. The proposal acknowledges Auth and DB provisioning are not one transaction and requires "retain pending status and safely retry/reconcile failures." No pending-state schema, idempotency key structure, or retry table is proposed. A failed DB write after `inviteUserByEmail` leaves a live Auth identity with no membership record; a naive re-invite creates a duplicate Auth account.
*Resolution:* Propose a minimal `pending_provisions(tenant_id, intended_email, status, idempotency_key)` table. The Edge Function upserts before calling Auth Admin; the acceptance command checks status before activating. Verify by injecting a DB write failure after Auth Admin success and confirming safe idempotent retry with exactly one Auth user and one membership row.

**C03 — Live membership revocation check: binding to request path unspecified**
Source: P02/P06, PHASE_0 §3/§5. "Current DB membership governs each action" is stated but where the check executes is not. If only in RLS, SSR middleware forwards the revoked user's request; RLS returns empty rows and the UI shows broken states rather than a clean redirect. If only in middleware, a direct PostgREST RPC or Storage signed-URL call bypasses it entirely.
*Resolution:* Specify explicitly that (a) RLS via active_member is the authoritative data denial for all DB and Storage paths, AND (b) SSR middleware performs a lightweight DB membership query on each navigation request to issue a redirect. Both must be present and tested independently — not as a combined UI flow.

**C04 — Audit atomicity in Phase 1 membership commands: no schema-level enforcement**
Source: P04, PHASE_0 §6. "Atomic command writes membership change and audit together" is required prose but no constraint enforces it. A deferred constraint violation or application bug that commits the membership change and fails the audit_log INSERT produces an unaudited privileged action — the exact failure the append-only audit is meant to prevent.
*Resolution:* Phase 1 membership command routines must wrap both writes in one transaction with NO DEFERRABLE constraints on audit_log. Add a test that forces audit_log INSERT to fail via a before-insert trigger and asserts the membership change is also absent (full rollback confirmed by re-reading the memberships table).

**C05 — Storage object RLS join path for Phase 1 approval package: unspecified**
Source: P06, PHASE_0 §5. Phase 1 includes reading a private synthetic artifact via the approval package. The proposal states "Active membership plus access to linked artifact/knowledge revision" for storage.objects SELECT but gives no join path, path-naming convention, or lookup function. The policy must navigate from the object path to artifact_revisions to the caller's active membership. Absent this, implementers invent a scheme that may conflict with later phases.
*Resolution:* Define a path convention (e.g., `{tenant_id}/{artifact_revision_id}/{filename}`) and a SECURITY DEFINER lookup function verifying artifact_revisions.tenant_id against the caller's active tenant before granting storage.objects SELECT. Write a negative test using another tenant's signed URL and asserting forbidden with zero tenant data in the response body.

---

## Recommended defaults

**C06 — CSRF protection mechanism unspecified per mutation path type**
Source: PHASE_0 §7. "Protect cookie-authenticated mutations against CSRF" is one line. Next.js Server Actions include same-origin enforcement automatically; App Router route handlers do not. If any command endpoint uses a route handler (Auth callback, Edge Function response), CSRF protection must be added explicitly.
*Resolution:* Default all state-mutating commands to Server Actions. For any route handler accepting POST (e.g., Auth callback redirect), validate Origin/Referer and require a server-issued nonce. Document the chosen mechanism for each command entry point in the contracts layer before Phase 1 ships.

**C07 — Signed URL maximum lifetime must be set before Phase 1**
Source: P06/P08, PHASE_0 §5. "Short-lived signed links" is required but no duration is named. Supabase Storage TTL is caller-configured; absent a project-wide constraint, callsites will vary. A 60-minute URL on a private artifact remains a bearer capability long after membership revocation invalidates the session.
*Resolution:* Set a project-wide maximum of 5 minutes for artifact and knowledge signed URLs; downloads requiring longer access must use per-request authenticated streaming. Enforce this in the Storage helper module — not at individual callsites — so it cannot be overridden silently.

---

## Rejected assumptions

**C08 — Route group layouts treated as an implicit auth perimeter**
Source: PHASE_0 §1. The proposal correctly states "layouts and navigation guards are not security boundaries," yet the `(tenant)` route group implies a shared layout that loads tenant context. If any child page omits the session check during development or refactoring, it silently renders an unauthenticated shell.
*Resolution:* Each `page.tsx` within `(tenant)` must independently invoke the session/membership check, not inherit it from a parent layout. Add a lint rule or server-side assertion verifying this. Verify by removing the parent layout check in a test build and confirming child pages still deny unauthenticated requests independently.

**C09 — Composite tenant-qualified FK assumes revision IDs are not globally unique**
Source: P03, PHASE_0 §4. "Tenant-qualified foreign keys such as (tenant_id, artifact_revision_id)" add cross-tenant FK protection only when IDs could collide across tenants. If artifact/revision IDs are UUIDs (globally unique by construction), a single-column FK plus RLS on the target table is sufficient and simpler. The composite FK adds index overhead and migration complexity without benefit when IDs are globally unique — and this assumption is never stated.
*Resolution:* State whether revision/artifact IDs are globally unique. If yes, document that single-column FKs plus RLS are the cross-tenant boundary and remove the composite FK requirement. If not, retain composite FKs and specify the ID generation scheme.

**C10 — platform_admins RLS configuration implicitly assumed correct**
Source: P03, PHASE_0 §4. The table is "private global" with "private access rules" but no explicit RLS policy is stated. In Supabase, RLS enabled with no policy = deny all (correct). RLS not enabled = any postgres-role query can read it (wrong). The misconfiguration is silent — the table simply appears empty to queries, masking the exposure.
*Resolution:* Explicitly state that RLS is enabled on platform_admins with zero SELECT policies (deny all), and that the sole reader is the Edge Function using the Auth Admin service-role client in its narrowly scoped context. Confirm with a test asserting tenant owner and operator JWTs cannot SELECT any row directly or via RPC.

---

## Missing decisions

**C11 — Idempotency key schema for Phase 1 commands not proposed**
Source: P04, PHASE_0 §6. "A retry reuses a tenant/actor-bound request key and verifies the same payload" is required but no schema is proposed. Phase 1 invitation acceptance and membership revocation must be idempotent. Without a schema established in Phase 0, each command invents its own, risking incompatibility when Phase 3 approval commands arrive.
*Resolution:* Propose a minimal `command_attempts(id, tenant_id, actor_id, command_type, payload_hash, status, created_at)` table as a Phase 0 deliverable. Acceptance test: replaying an already-accepted invitation returns the committed result without re-executing or creating duplicate rows.

**C12 — Browser session UX on mid-session revocation unspecified**
Source: P02, PHASE_0 §3. Revocation takes effect at DB layer. Whether the browser shows an immediate redirect, a soft error with re-auth prompt, or a silent empty state is unspecified. This determines whether SSR middleware must query DB membership on every navigation request (one DB round-trip per page load) or only on data-fetch failures — a meaningful architectural and performance consequence.
*Resolution:* Decide before implementing middleware: (a) middleware queries membership on every navigation and redirects on denial, accepting the DB round-trip cost; or (b) middleware trusts the JWT for navigation and surfaces denial through page-level server data fetch failures with a specified error component. Document the chosen path so middleware and error boundaries are implemented consistently.

---

## Acceptance criteria additions

**C13 — Cross-privilege negative tests for the platform_admins boundary are absent**
Source: PHASE_0 §10. Existing criteria cover cross-tenant RLS and approval denial but omit the platform-admin isolation boundary.
*Required additions:* (a) tenant owner JWT cannot SELECT any row from platform_admins directly or via any RPC; (b) platform admin service-role credential cannot SELECT rows from any tenant-scoped table without an active membership record for that tenant; (c) a platform admin who holds explicit operator membership in a tenant has exactly operator privileges — no implicit approval authority in that tenant.

**C14 — Revoked-member negative test must use a still-valid unexpired JWT**
Source: PHASE_0 §10. The existing criterion "inactive/revoked membership cannot read tenant content" does not require the test to use a still-valid unexpired bearer token. A test that only clears the browser session proves nothing about RLS enforcement against live tokens.
*Required addition:* Obtain a valid signed JWT; revoke the membership at DB layer without invalidating the token; issue a direct PostgREST RPC call and a Storage request using that bearer token; assert both return empty or forbidden with zero tenant data in the response body — before any token expiry occurs.

**C15 — Provisioning failure recovery positive test not specified**
Source: PHASE_0 §7/§10. Reconciliation on Auth+DB failure is required (C02) but no acceptance test verifies the recovery path.
*Required addition:* Simulate a DB write failure after Auth Admin invitation issuance; assert the invitation row is in failed/pending state; retry the provisioning command; assert exactly one Auth user exists for the intended email, exactly one active invitation record exists, and audit_log records both the failure attempt and the successful retry without duplication or premature membership activation.
