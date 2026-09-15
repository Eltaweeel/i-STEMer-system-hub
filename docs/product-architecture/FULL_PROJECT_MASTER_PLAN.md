# Business Agent OS — full project master plan

Status: D01–D12 selections APPROVED and recorded on 2026-09-08 from the owner's explicit instruction in this task. Phase 1 remains BLOCKED pending the four inputs below. D13–D20 remain OPEN, non-blocking for the restricted synthetic Phase 1 slice. Approval records planning decisions only; it does not authorize implementation or deployment. The approved v3.2 release remains immutable. Requirement mapping is in TRACEABILITY_MATRIX.md; DECISION_REGISTER.md records owner evidence and technical rulings A01–A09. No application, repository, migration or deployment was created for this update.

## Remaining owner inputs and Phase 1 gate

1. **Exact Supabase project/account/region — OWNER INPUT REQUIRED** (D07/D08).
2. **Recovery email provider and recovery procedure — OWNER INPUT REQUIRED** (D05; D12 recovery destination follows that procedure).
3. **Secret rotation/recovery handover procedure — OWNER INPUT REQUIRED** (D09).
4. **Exact support escalation procedure — OWNER INPUT REQUIRED** (D04).
5. **Remaining non-blocking decisions: D13–D20 OPEN.** Later data/operations gates include exact retention, deletion/reset and backup-expiry schedules; D10 is approved for synthetic-only operation with irreversible deletion/reset disabled.

Phase 1 is **BLOCKED**, not READY: the four setup inputs above remain outstanding. D01–D12 option selections are not reopened. D12-A settles route/access/availability direction and the localized revocation-denial outcome; it supplies no invented recovery provider, procedure or final UI copy. Detailed implementation and verification remain future work. No additional owner-choice blocker is introduced here.

## 1. Product vision, pilot scope, users and non-goals [R01]

Provide an authenticated, tenant-isolated bilingual workspace for the prototype's owner oversight and operator inspection/configuration, with attributable agent artifacts and explicit human consent before consequential actions. The approved pilot is i-STEMer/Hadeer, tenant owner Hadeer, accountable owner Abdo, with synthetic data only (D01); prototype names, totals, costs, timestamps and connector states are synthetic, not business commitments.

D03-A approves tenant owner and operator, including operator Today/package inspection without approval rights; viewer is disabled. D04-A names Abdo as provisioning custodian with no implicit tenant-content access; support requires explicit membership and its escalation procedure remains outstanding. D02-A sets one client organization per tenant and permits separate memberships in multiple tenants. Machines never inherit a human role. Phase 1 is restricted by R17. The full roadmap describes later capabilities without approving their activation.

Non-goals: billing/pricing, invented customers or metrics, additional product modules, automatic live publishing/spend, unreviewed agent tools, chat-as-consent, browser-only mock authentication, prototype runtime as production architecture, or repair/redesign of inherited visual defects. Product changes require a new approved brief (S4).

## 2. Architecture and proposed repository [R02]

One Next.js App Router + TypeScript application; Supabase provides Auth, Postgres, RLS and private Storage. Server-only data access validates identity and minimizes returned fields; RLS remains authoritative. Server Actions are untrusted public mutation entry points just like route handlers. Their identifiers and hidden UI controls are not authorization. [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication) supports this boundary; A01 governs the proposal.

Proposed structure, to create only after owner gates:
- `src/app/[locale]/(access)/`: owner-approved access screens; `src/app/auth/callback/route.ts`: technical Auth callback.
- `src/app/[locale]/(tenant)/t/[tenantId]/`: the R03 modules; route groups add no URL segments.
- `src/components/`: approved shared shell and visual primitives.
- `src/features/{dashboard,approvals,campaign,studio,team,results,ask,operations}/`: module views and typed contracts.
- `src/lib/{auth,authorization,supabase,commands,i18n,observability}/`: server/browser boundaries explicitly separated.
- `supabase/migrations/`, `supabase/functions/`, `supabase/seed/`: reviewed schema, privileged adapters and synthetic seeds.
- `tests/{unit,integration,rls,e2e,security,load}/`, `docs/`: contract evidence and operational runbooks.

No generic agent framework, additional service or queue vendor is chosen. Pin compatible supported versions at implementation and review current advisories; no guessed version is prescribed. Storage and database clients receive request-specific credentials; never reuse a mutable authenticated client across requests. No shared private-response cache by default. Locale is presentation state, not an authorization attribute.

## 3. Route map and module ownership [R03]

Approved prefix `/{locale}/t/{tenantId}`, locale `en|ar`, under D12-A. These are production mappings of component-state surfaces, not existing prototype URLs. Owner has both business and operational read access; operator operational access plus the agreed R17 review surface. Viewer permissions are disabled under D03-A. “Owner” below means feature responsibility, not a new role.

| Route ID | S2 suffix / prototype surface | Feature owner | First functional phase |
|---|---|---|---|
| U01 | /today — Today | dashboard | 1 |
| U02 | /approvals?package=<id> — approvals and existing package detail | approvals | 1 read; 3 decisions |
| U03 | /campaign — campaign | campaign | 2 |
| U04 | /studio — studio | studio | 2 |
| U05 | /team — team | team | 2 |
| U06 | /results — results | results | 2 synthetic/read |
| U07 | /ask — ask | ask | 2 fixture; real behavior D13 |
| U08 | /ops/org | operations | 2 |
| U09 | /ops/manifests | operations | 2 |
| U10 | /ops/sops | operations | 2 |
| U11 | /ops/runs | operations | 2 |
| U12 | /ops/artifacts | operations | 2 |
| U13 | /ops/rules | operations | 2 |
| U14 | /ops/connectors | operations | 2 metadata; 4 adapters |
| U15 | /ops/memory | operations | 2 |
| U16 | /ops/cost | operations | 2 fixture; actual metering only if approved |
| U17 | /ops/audit | operations | 2 read; security audit exists in 1 |
| U18 | /ops/diagnostics | operations | 2 sanitized read |
| U19 | /ops/system | operations | 2 sanitized read |

No new product detail, admin, billing or tenant-picker page is inferred. D12-A approves the minimal access/invitation/recovery and phase-availability direction; recovery procedure is the remaining D05 input. Do not ship active-looking links that silently do nothing or fabricate backend results; implementation must follow the accepted D12-A direction and preserve the approved visual contract. Platform operations use restricted operational tooling, not an invented dashboard. Unknown tenant/package IDs return a non-enumerating denial.

## 4. Data model, ownership, retention and migrations [R04]

All proposed tenant tables below have `id` UUID PK, immutable non-null `tenant_id`, server timestamps, and `UNIQUE(tenant_id,id)`. For tenants, `id` is the tenant key. Every reference between tenant-owned rows uses a composite FK including tenant_id. Tenant IDs, actors, status transitions and digests cannot be reassigned by clients. Auth identifiers reference Auth users where lifecycle permits; historical audit attribution retains a stable pseudonymous actor reference when policy permits account removal. Payload schemas are versioned, bounded and validated.

Retention codes: B = business data; I = identity/admin; E = audit/evidence; F = files; Q = operational delivery. D10-A approves synthetic-only operation with no irreversible deletion/reset policy. Exact retention and backup-expiry schedules are deferred to later data/operations gates; no irreversible purge or reset is authorized. Immutability means no normal mutation, not infinite retention or protection against a database administrator.

| Table ID | Table / minimum fields and relationships beyond shared keys | First migration phase | Retention |
|---|---|---|---|
| T01 | tenants: name, active/suspended status, is_demo | 1 | I |
| T02 | memberships: user_id, role, status; unique tenant/user; active-owner invariant | 1 | I/E |
| T03 | tenant_invitations: normalized email, intended role, issuer, expiry, one-use state, Auth delivery reference; hashed token if application token is used | 1 | I/E |
| T04 | audit_log: actor kind/reference, event type, target and revision, request/command ID, server time, redacted evidence | 1 | E |
| T05 | campaigns: title, owner reference, status | 1 seed/read, 2 commands | B |
| T06 | objectives: campaign FK, objective content/revision | 1 seed/read, 2 commands | B |
| T07 | agent_manifests: identity, permitted capabilities, immutable version reference | 2 | B/E |
| T08 | sop_revisions: manifest FK, immutable procedure/version and allowed actions | 2 | B/E |
| T09 | agent_runs: objective FK, optional manifest/SOP refs, mode synthetic/live, state, requester, input snapshot, authorization version | 1 synthetic/read; 2 full model | B/E |
| T10 | artifacts: campaign/run FKs as applicable, type and current revision pointer | 1 | B |
| T11 | artifact_revisions: artifact FK, revision number, digest, producer, provenance, QA and file FK; immutable | 1 | B/E/F |
| T12 | approvals: artifact revision FK, action snapshot/digest, tier, confirmation requirement, status; immutable request payload | 1 read; 3 commands | E |
| T13 | approval_decisions: request FK, decision, actor, confirmation evidence, reason/feedback FK; append-only | 3 | E |
| T14 | feedback: request/revision FK, author and content | 3 | B/E |
| T15 | knowledge_items: title, source category, current revision pointer | 2 | B |
| T16 | knowledge_revisions: item FK, provenance, freshness and file FK; immutable | 2 | B/F |
| T17 | file_objects: private bucket/object key, content digest/type/size, classification, state and provenance; immutable published object identity | 1 | F/E |
| T18 | notifications: recipient user_id, event FK, redacted content, channel state | 3 | Q |
| T19 | notification_receipts: notification FK and recipient, read_at; unique notification/recipient | 3 | Q |
| T20 | connector_status: approved adapter key, status and nonsecret credential reference, last verification evidence | 2 metadata; 4 real | B/E |
| T21 | run_attempts: run FK, attempt number, lease/fencing token, start/end, outcome and sanitized failure evidence | 2 synthetic; 4 worker | Q/E |
| T22 | command_receipts: actor, command kind, idempotency key, input digest and bounded result reference; unique tenant/actor/kind/key | 1 | Q/E |
| T23 | outbox_events: event type, aggregate/version, payload reference, state, retry/lease metadata; unique causal command/event | 3; Auth delivery uses T03 saga in 1 | Q/E |
| T24 | execution_authorizations: run/action/revision binding, approved capability set, expiry, revocation, consent FK; no human role grant | 4 | E |
| T25 | integration_deliveries: outbox/run FK, effect identity, external receipt, attempt and reconciliation state | 4 | Q/E |

Global/private records (G01–G04 respectively): Supabase-managed `auth.users`; `private.platform_admins` (user, active grant, grant/revoke attribution); `private.platform_audit` (provisioning/security operations without tenant content); `private.provisioning_operations` (operation UUID, intended tenant/email/role, payload digest, idempotency key, Auth user/delivery references, state pending/auth_issued/activation_ready/completed/reconciliation_required, retry metadata and sanitized failure). They are not tenant content stores and are not exposed through the Data API. G02–G04 have RLS enabled, no anon/authenticated table grants or direct client policies. A separate private platform-grant helper uses a dedicated read-only role and nonrecursive policy to test only the current authenticated caller's active platform grant; provisioning/audit commands use separately constrained private roles and policies. Tenant-user calls cannot enumerate grants. G01 remains Supabase-managed. Platform administrator means an authenticated person with a private grant, not the service_role credential. That credential inherently bypasses RLS and cannot be tested as though it were a tenant role; isolate it to Auth administration and never use it for ordinary tenant reads. No table stores plaintext service keys, credentials, complete prompts in logs or invented analytics.

Migration order: roles/private helpers and global grants → T01–T04/T22 → T03 lifecycle constraints → T05/T06 → T09 minimal synthetic → T17 → T10/T11 → T12 → RLS/grants/Storage policies and seed. Create nullable circular “current revision” pointers last with same-tenant FKs; actual revision rows always reference their parent. Phase 2 adds T07/T08 and run references, T15/T16/T20/T21. Phase 3 adds T13/T14/T18/T19/T23. Phase 4 adds T24/T25 and worker grants. Each migration declares constraints, indexes on membership predicates/FKs, policy tests, upgrade/backfill and safe rollback strategy. Do not create all future tables prematurely.

## 5. Auth and permission model [R05]

Under approved D01–D06, Abdo as platform custodian provisions a pending tenant and initial owner Hadeer; tenant owners may invite permitted operators. Later transfer remains D20. The invitation is issued to the exact approved email. Auth delivery and database membership form a recoverable saga: persist intended invite, issue/link Auth invitation idempotently, reconcile partial failure, accept only after authenticated verified identity matches unexpired unrevoked invite, then consume and activate membership atomically. A verified email alone creates no membership. Existing users reuse their account. No public tenant signup or domain-based joining.

Recovery restores identity, not roles. Redirect destinations are allowlisted. Each tenant page's server data access and every action/handler independently verifies session and membership; layouts and middleware are optional navigation aids, never required authorization boundaries. A revoked membership returns a typed denial instead of silently interpreting empty rows as a valid empty dashboard. D12-A/D12-Q2 approves localized access denial with safe sign-out/recovery; the exact recovery procedure remains D05. Session verification occurs at trusted boundaries; current tenant/membership status is checked even if a token is valid. D05-A requires invite-only verified email/password and owner/admin MFA; accountable owner is Abdo; privileged operations require the approved assurance level. First platform grant and emergency recovery require a documented custodian-controlled bootstrap runbook, never a public self-grant. Audit issuance, acceptance, revocation, recovery/security changes and denied administrative actions without leaking tokens.

| Capability | Platform admin without tenant membership | Tenant owner | Operator | Viewer (disabled; future reference only) |
|---|---|---|---|---|
| Provision/suspend tenant | restricted operational command | no platform grant | no | no |
| Read tenant business content | no | yes | agreed review data only | business read projection |
| Read operational content | no | yes, sanitized | yes, sanitized | no |
| Issue lower-role invitations | D06-authorized tooling only | permitted lower roles under D06-A | no | no |
| Change roles / transfer owner | D20 recovery route only | D20 command | no | no |
| Approve/reject consequential action | never by platform grant | Phase 3, exact binding | never | never |
| Configure SOP/connector metadata | no implicit access | later command | later allowed config only | no |
| Execute external action | no implicit access | authorize separately, not direct worker privilege | cannot bypass consent | no |
| Read recipient notification | own authorized tenant membership only | own only | own only | own only |

Cross-tenant support membership is explicit, scoped, revocable and audited (D04). No auto-content bypass. Owner transfer locks membership state, preserves at least one active owner and records attribution; no self-promotion or caller-supplied owner role. Concurrent role changes use the same serialization boundary as sensitive commands. Invitations cannot assign platform admin.

## 6. RLS and grants for every tenant table [R06]

Let M = authenticated user with current active membership in an active tenant; O = M owner; P = M operator; V = M viewer only if enabled. “Command” means the authorized transaction in R07, never direct browser DML. Read grants expose only safe fields; use separate private payloads where a row contains secrets. RLS is row-level, so DTO filtering alone cannot protect columns exposed via the Data API.

| Tables | SELECT policy | Mutation policy / authorization |
|---|---|---|
| T01 | M for own tenant | provisioning/suspension restricted platform command; owner metadata only if approved |
| T02 | own active membership; O tenant roster | invitation/role/transfer command; no self-elevation/last-owner loss |
| T03 | O issuer-management scope; recipient only through acceptance result | invite/accept/revoke commands, identity match and lifecycle checks |
| T04 | O/P sanitized tenant audit | append by authorized command/event path; no user update/delete |
| T05–T06 | O/P; V safe business projection | O business command from Phase 2 if approved |
| T07–T08 | O/P | authorized configuration command; immutable versions append |
| T09–T11 | O/P; V safe business projection | synthetic seed in 1; later bounded command/worker; revisions append |
| T12–T14 | O/P; V safe business projection | O decision/feedback command; immutable request/decision history |
| T15–T16 | O/P | authorized knowledge ingestion command; V denied |
| T17 | M plus authorization to a referencing artifact/knowledge revision | trusted seed in 1; later validated upload/finalization command |
| T18 | M and recipient = auth.uid() | event producer insert; no user content/recipient modification |
| T19 | M, own receipt, matching authorized notification | own mark-read command only |
| T20 | O/P sanitized metadata | approved configuration/adapter status command; no credentials returned |
| T21 | O/P sanitized attempts | run-bound worker or synthetic fixture loader; no user terminal-state write |
| T22 | no direct client read; command returns caller's scoped receipt | authorized command only; digest mismatch rejects replay |
| T23 | no direct client reads/writes | transaction insert and scoped dispatcher lease; tenant/event capability |
| T24 | O/P safe authorization summary only | consent-bound mint/revoke command; no arbitrary worker self-grant |
| T25 | O/P sanitized delivery evidence | scoped adapter result/reconciliation command only |

Default revoke anonymous access, direct workflow DML and PUBLIC function execution; explicitly grant only intended reads and commands. Enable RLS on all exposed tables and Storage objects; views must preserve caller policies. Use a dedicated NOLOGIN/NOBYPASSRLS non-table-owner helper role with read-only grants and nonrecursive policies: memberships rows only where user_id = auth.uid(), and active tenant status rows. Its fixed-search-path, schema-qualified SECURITY DEFINER helper returns only whether auth.uid() is an active member of the selected active tenant. It cannot accept an arbitrary user ID or return rows. These helper-role policies never call the helper itself. Authenticated callers may execute the boolean helper for policy evaluation; the private schema is not exposed as a Data API RPC surface. Test direct SQL execution with real JWT claims and prove helper ownership/grants cannot escalate through another callable function. Tenant command function owners are non-login, non-table-owner, NOBYPASSRLS roles with minimal DML and explicit RLS; do not confuse SECURITY DEFINER with automatic safety. Public execution is revoked by default. [Supabase functions](https://supabase.com/docs/guides/database/functions) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) inform A03.

Privileged platform bootstrap and later machine commands use separate private authorization paths; they do not pretend to be human memberships. Only verified trusted workloads may enter them. No client-provided actor or custom header may mint authority. Storage metadata and every parent reference receive same-tenant checks. Test direct RPC calls even when the UI normally uses Next.js. Tenant suspension must deny both reads and future effect dispatch.

## 7. Trusted commands and service contracts [R07]

These are proposed semantic contracts, not claims of existing endpoints. Select Server Actions for same-app forms, route handlers for Auth callback/private streaming and later signed webhooks; Edge Functions for Auth administration and privileged adapters. Avoid duplicating one command across multiple implementations. All entry points call a central authorization layer and the same database transition.

Browser form mutations default to Server Actions with their framework origin defenses plus application authorization; configure only approved origins. Cookie-authenticated mutating route handlers require explicit same-origin/CSRF protection. Auth callback uses the provider's verified code/PKCE flow and allowlisted redirects, not an invented generic POST nonce. Bearer-authenticated Edge calls verify the token and authorization; CORS is not authentication. Signed webhooks later use adapter signature/replay validation rather than browser CSRF. Record the mechanism per entry point before shipping.

Common command envelope: authenticated context, tenant selector, validated payload version, idempotency key, expected record/revision version. Actor is derived server-side. Response: typed result/reference or safe unauthenticated/forbidden-or-not-found/conflict/validation/retryable/unavailable failure plus correlation ID. Never convert authorization/backend failure to fake success or fixture fallback.

| Contract ID | Entry / authorization and invariants | Phase |
|---|---|---|
| K01 | provisionTenant / suspendTenant: current platform grant, approved assurance; no content access; auditable idempotent saga | 1 |
| K02 | issue/revoke/acceptInvitation: D06 issuer boundary; lower-role ceiling; exact verified recipient, expiry, one-use transaction; rate limit | 1 |
| K03 | readToday / readApprovalPackage: verified session, current M and permitted projection, RLS; package and all joins same tenant | 1 |
| K04 | readPrivateArtifact: same K03 authority plus file linkage; no caller-controlled bucket/key passthrough | 1 |
| K05 | resetSyntheticTenant: design contract only; irreversible reset disabled by D10-A; authority Abdo does not authorize deletion; R11 | deferred until explicit policy |
| K06 | changeMembership / transferOwner: O or D20 recovery procedure, last-owner/concurrency guard, audit | before external pilot; no business approval |
| K07 | saveObjective / reviseArtifact / configureManifestOrSop: approved O/P capability, expected version, immutable revision history | 2 |
| K08 | decideApproval: O, exact action/revision/tier, required confirmation, current state, concurrent revision/role lock, receipt and audit | 3 |
| K09 | markNotificationRead: own active-tenant recipient; read receipt only | 3 |
| K10 | ingestKnowledge / finalizeUpload: approved O/P permission, limits, quarantine result, immutable file/provenance linkage | D17/D19, 2–4 |
| K11 | authorize/dispatch/reconcileRunEffect: machine capability + current tenant/consent/SOP checks, lease fencing and effect identity | 4 |
| K12 | receiveIntegrationEvent: approved adapter signature/replay checks, server-side tenant mapping, deduplication; no request-selected tenant | 4 |

Database command, audit event and command receipt commit together or roll back together; failures are separately logged as security events without claiming a committed business change. Lock mutable parent revision, relevant authorization/membership state and approval request in a consistent order. Idempotency with the same key/different payload is a conflict. Audit INSERT failure must abort the same transaction: inject a failing audit trigger in tests and re-read state to prove rollback. Deferred constraint failure also aborts a transaction; banning deferrable constraints is not a substitute for atomicity. No distributed transaction is assumed across Postgres, Auth, Storage or an external service. Reconciliation states and operational retry instructions are part of each adapter contract. Phase 1 provisioning_operations carries an operation UUID, intended tenant/email/role, payload digest, idempotency key, state (pending/auth_issued/activation_ready/completed/reconciliation_required), Auth user/delivery references and sanitized last failure. Tenant invitation acceptance verifies the corresponding intent; delivery alone never activates membership. Look up/reuse the Auth identity after an ambiguous result, never blindly issue another creation. Failure injection after Auth issuance must prove one identity and one membership, with attributable attempt and eventual outcome evidence.

## 8. Agent execution, consent and safety [R08]

Phase 1 has seeded synthetic evidence only. Phase 2 persists draft/configuration and labeled synthetic runs; real execution requires D13/D14/D16/D19 and Phase 4 gates. Hermes and other depicted agents are product roles, not selected AI providers or implemented orchestration.

A proposed run follows requested → queued → running → awaiting_approval → queued/running → succeeded, failed or cancelled. Every allowed transition has expected-version checks; attempts are separate rows. “Approved” belongs to a specific action request, not a blanket run status. Synthetic and live modes are immutable and visibly distinguishable. Verification is separate evidence, never inferred from success text.

Tier 0 internal draft is permitted only within an approved SOP/capability scope. Tier 1 staging and Tier 2 creative follow S1; live action has its own locked Tier 2 gate. Confirmation text is a deliberate interaction, not a secret/auth factor. Bind consent to tenant, immutable artifact revision and digest, action payload/digest, tier, approver, time and required evidence. Material changes create a new request. Model output, chat, operator action or generic “approved” flags cannot authorize execution.

A worker receives a short-lived run/action capability, not service-role tenant access or a human owner's session. Before dispatch it verifies active tenant, current permitted SOP, unrevoked capability, exact approved revision and still-valid approving authority; role/ownership change invalidates pending execution conservatively. After the dispatch boundary, cancellation/revocation is best-effort and cannot undo an already accepted external effect; record and reconcile it. D14 must approve any business-specific exception.

Treat retrieved documents, prompts and outputs as untrusted input. Separate instruction/data channels, validate structured output, allowlist tools and destinations, prohibit model-issued credential/role changes, constrain resources and require human approval for consequential effects. Limits/model/provider choice are not invented.

Retry only classified transient failures within an owner-approved execution policy. Use bounded attempts, durable leases with fencing, effect idempotency and backoff; unknown provider outcome becomes reconciliation_required, never blind duplicate execution. No exactly-once promise. Record requested/started/approval_requested/decided/invalidated/dispatched/receipt_received/verification_recorded/failed/cancelled and security denials, with versioned redacted evidence.

## 9. Knowledge and Storage [R09]

Private buckets only. Canonical proposed object key is tenant_id/file_object_id/opaque_object_id, all server-generated; enforce unique(bucket, object_key). Storage SELECT joins storage.objects.(bucket_id,name) to T17.(bucket,object_key), then to an authorized T11.file_id or T16.file_id and current membership. Parent-read policies must not query Storage, avoiding recursive authorization. A missing/mismatched link denies access. Test forged keys and tenant IDs against direct Storage as well as the streaming handler. File records and authorized parent revisions govern access; object names are server-generated immutable identifiers, not client-trusted tenant paths. Phase 1 seeds synthetic private artifacts only; no general upload or retrieval pipeline. Use authenticated server streaming for the initial slice so authorization is checked on each new request; already downloaded bytes cannot be revoked. If a later phase uses a signed URL, the central helper caps it at five minutes; D19 can require stricter handling. A signed link remains a bearer capability until expiry (A06).

Later upload flow: permission check → bounded upload intent → private quarantine → size/type/content validation and approved scanning → digest/provenance capture → atomic metadata finalization → retrieval eligibility. Storage writes and DB records are reconciled if either fails; orphan cleanup is tenant-scoped and respects evidence retention. Prevent overwrite of published revisions. Knowledge ingestion never executes embedded instructions. Upload limits, allowed types, scanning, indexing and deletion are D17/D19; no embeddings/provider choice is assumed.

## 10. Notifications and integration adapters [R10]

Auth delivery is required infrastructure in Phase 1 (D05/D09), not authorization to send business notifications. Phase 3 emits durable event records only for defined workflows; each notification has a validated recipient with current tenant membership and minimal safe content. Receipt updates cannot alter message or recipient. Channel/UI scope remains D15.

Phase 4 adapter contract separates validateConfiguration, authorizeEffect, dispatch, verifyReceipt, reconcile and revokeCredential operations. It records provider-independent effect identity, tenant, action digest and redacted result. The depicted Instagram/Facebook/WhatsApp labels do not authorize any integration. No adapter is enabled until D16 selects it and credential ownership, scopes, sandbox behavior, webhook validation, failure semantics and consent gate are approved. Secrets are referenced by opaque IDs and accessed only by trusted workloads. Notification and integration retries share durable delivery mechanics, not unrestricted business authority.

## 11. Real authenticated demo and reset [R11]

D07-A approves an isolated nonproduction Supabase project with the same migrations, policies and command paths as pilot, two synthetic tenants and individual invited Auth accounts (D07). Never grant anonymous demo access, share passwords, copy production credentials/data or use client-side role toggles as security. Synthetic fixtures include linked packages, revisions, private files and denied-access cases, not claimed real metrics.

Exact project/account/region remains OWNER INPUT REQUIRED. Reset authority is Abdo, but D10-A authorizes no irreversible deletion/reset policy; K05 activation is deferred and is not a Phase 1 start blocker. The following is a future contract, not permission to reset.

When separately authorized, reset is K05: require platform authorization and demo marker/environment allowlist; quiesce target tenant, revoke/fence queued work, capture reset event, replace only disposable synthetic business data in dependency order, reconcile private objects, verify referential integrity, and reactivate only after isolation checks. Preserve identities/memberships by default; preserve audit outside the disposable fixture set. No cascade/truncate that removes evidence, global Auth users or another tenant. D10-A preserves audit and bars irreversible deletion/reset; exact schedules require later explicit authorization. Partial reset leaves the tenant unavailable and recoverable, not falsely ready.

## 12. Operations, security, backups and incidents [R12]

Use structured correlation IDs across request/command/run/attempt/outbox/receipt. Log safe failure class, duration and authorization outcome; redact credentials, tokens, private document bodies and unnecessary PII. Distinguish audit evidence from diagnostics. Monitor Auth delivery failures, denied access, stuck onboarding/leases, outbox backlog, Storage reconciliation and failed backups; thresholds and on-call ownership are D19, not invented metrics.

Database audit is append-only to application roles, not tamper-proof against infrastructure administrators. D19 chooses external evidence protection if required. Backups must account separately for database, Storage objects and Auth/configuration; do not assume a database restore restores object bytes. Before external pilot, approve and test restore, retention and RPO/RTO under D10/D19. Incident runbooks cover tenant suspension, credential/session revocation, stopping workers, preserving evidence, scope investigation, controlled restore and owner communication. Platform grant changes and break-glass recovery require attributable approval and post-event review.

## 13. Visual implementation, accessibility and localization [R13]

Use immutable v3.2 as visual reference; do not copy its support runtime as application architecture. Preserve approved copy/translations, typography, color, spacing, motion, responsive behavior, diagrams and navigation hierarchy. Extract reusable presentation components only as implementation structure. EN/AR use the same permission/data contracts; direction follows locale and logical layout rules. No generated translation “improvements.”

Production acceptance includes keyboard/focus/dialog behavior, accessible names, contrast review, screen-reader semantics, reduced-motion handling where approved and layout at 1440×900, 1024×768 and 390×844 in both directions. Accessibility adjustments that change approved visuals/copy need an approved brief; track conflicts rather than silently redesign. Inherited invisible org labels remain a documented reference defect; remediation requires owner approval and is not smuggled into backend work. Prototype file:// limits do not define SaaS execution behavior.

## 14. Test strategy [R14]

| Test ID | Layer | Required evidence / release failure condition |
|---|---|---|
| X01 | Unit | Permission predicates, validation, revision/action binding, state transitions, locale formatting and idempotency conflicts; meaningful behavior tests |
| X02 | Database/integration | Real migrations, constraints, atomic rollback, race tests for revision/role/owner transfer and duplicate commands; real Auth invitation reconciliation |
| X03 | RLS isolation | Two real Auth tenants, each enabled role, multi-membership, revoked/suspended/anonymous users, including still-valid JWTs after DB revocation; platform-admin user without membership denied content, and with operator membership denied approval; own allowed reads and denied cross-tenant SELECT/INSERT/UPDATE/DELETE/RPC/FK/Storage attempts |
| X04 | Browser/E2E | Invitation → verified login → locale shell → Today → package → private artifact; expired/reused/wrong-recipient invite, recovery, logout, revoked access, direct deep links and forged tenant/package IDs |
| X05 | Security | Direct Server Action/handler/RPC access, hostile payloads, missing assurance, CSRF/redirect misuse, no secrets in bundles/logs, no cross-user SSR/cache leakage, file path tampering and injection boundaries |
| X06 | Workflow | Later stale consent, concurrent decisions, changed SOP/authority, no self-approval, worker lease expiry, unknown external effect and reconciliation; no synthetic result on live path |
| X07 | Accessibility/visual | Approved EN/AR reference comparisons, RTL switching, keyboard/focus and responsive checks; documented inherited defects kept separate |
| X08 | Load/operations | Owner-defined workload and SLOs, policy/query performance, resource limits, queue recovery, backup/object restore and rollback rehearsal before external release |

Tests must prove permitted operations succeed as well as denied operations fail; service-role tests do not prove RLS. Use real Supabase for integration/isolation; pure unit tests may use deterministic data without replacing end-to-end evidence. No targets are invented for X08; D18/D19 block its final pass criteria. This planning task runs none of these application tests.

## 15. Environments, CI/CD and release [R15]

Separate development/test/staging and production credentials/data. D07-A selects a separate nonproduction Supabase project. D08-B selects the existing Contabo VPS for owner-operated Node/container hosting and managed Supabase for database/Auth; exact Supabase project/account/region remains OWNER INPUT REQUIRED. Browser config contains only public project URL/publishable key; protected secrets are server/Edge scoped, never NEXT_PUBLIC-prefixed, stored in owner-controlled secret management and owned by Abdo under D09-A; secret rotation/recovery handover procedure remains OWNER INPUT REQUIRED. Preview environments cannot inherit production secrets. Recovery email provider/procedure remains OWNER INPUT REQUIRED. Future tenant integration credentials stay tenant-owned with bounded access; no credentials are supplied or provisioned by this plan.

CI gates: locked install, type/lint checks, focused unit/integration/RLS suites, migration validation from clean and prior schema, secret/dependency checks, production build and staging E2E/accessibility; later workflow/load/restore tests as required. Pin toolchain and record artifact/migration versions. Deploy database changes compatibly before consuming application code; use expand/migrate/contract across releases. Do not destructively roll schema back to match old application code. Restore only under approved incident procedure.

Production rollout requires owner phase approval, staging evidence, secret/config review, backup readiness and rollback rehearsal. Verify real Auth, two-tenant boundaries, private Storage, bilingual shell and enabled actions using designated synthetic canaries without customer side effects. Stop rollout on failed gates. Hosting, retention or execution decisions still open means corresponding release is blocked.

## 16. Phased roadmap, dependencies and explicit exclusions [R16]

| Phase | Depends on / deliverables | Exit gate | Explicitly out of scope |
|---|---|---|---|
| 0 — architecture/auth decisions | D01–D12 selections approved; four setup inputs above outstanding; accepted D12-A direction, named custodian and technical contracts A01–A09 | signed decisions and security test specification; no unresolved Phase 1 contract contradiction | application/repository creation during this planning task; provider/business assumptions |
| 1 — exact vertical slice | R17; minimal identity/read schema, Auth saga, real private files, protected operational bootstrap; irreversible reset disabled under D10-A | all R17 criteria, X01–X05/X07 relevant subset, owner acceptance | business approval writes, agent execution, uploads, business notifications, external adapters, full nineteen-module implementation |
| 2 — dashboard/workflow data | Phase 1; persisted objectives/artifacts/manifests/SOP/knowledge metadata, remaining read modules, synthetic runs | same-tenant ownership and revisions verified, fixture/live distinction honest; D17/D19 before real knowledge | consequential approvals/effects, invented analytics, autonomous execution, unspecified integrations |
| 3 — approval/audit/notifications | Phase 2; D14/D15, transactional decisions/outbox, recipient policy and approved UI | stale/racing consent rejected, atomic evidence, delivery failure recovery; X06 | live publication/spending, unapproved channels, unapproved delegation |
| 4 — integrations/testing/deployment | prior phases; D13/D16/D19/D20 as applicable, scoped workers/adapters, incident/restore/release runbooks | sandbox E2E, no bypass, receipts/reconciliation, operational/load/restore gates and owner release signoff | any connector/tool/channel not explicitly approved, automatic scope expansion, unsupported production-readiness claims |

A phase is not complete because a mock screen exists. Work can be internally reviewed before its owner gate, but gated functionality cannot be activated. D18 defines business acceptance; technical checks cannot substitute for it.

## 17. Exact Phase 1 vertical slice [R17]

Sequence is deliberately fixed: invitation → real Supabase Auth → tenant-scoped bilingual shell → Today dashboard → read-only approval package → private Storage → two-tenant RLS tests.

Acceptance:
1. Apply recorded D01–D12 approvals and accepted D12-A access/availability direction; resolve the four setup inputs above before Phase 1 begins. Credential ownership is Abdo under D09-A. No missing procedure or provider is inferred.
2. Restricted tooling provisions two synthetic tenants and sends one-use role-bounded invitations to real individual Auth identities. Wrong, expired, revoked and replayed invitations fail; partial Auth/DB delivery is recoverable.
3. Verified login resolves current membership through RLS. English and Arabic show the approved shell and only the agreed phase surfaces; switching locale preserves tenant/package state and never changes permissions.
4. Today and the existing package detail read linked synthetic rows through user-scoped queries. Exact revision/provenance and synthetic status are visible using approved copy/brief. There is no approval-write or execution endpoint enabled.
5. A linked private synthetic artifact is readable through K04 by the permitted member and denied to another tenant, revoked member and anonymous caller. No public object URL or service-role browser secret.
6. X03 proves positive and negative access using real user sessions, not only mocked clients or admin credentials; cross-tenant joins/FKs and direct RPC/Storage attempts fail.
7. Security/admin actions emit attributable audit; failed transactions have no successful business audit claim. Tenant suspension does not expose stale content or erase audit; irreversible deletion/reset remains disabled under D10-A.
8. Relevant unit, integration, security and browser checks pass; source reference remains unchanged. No production readiness or live agent behavior is claimed.

## 18. Traceability, gates and handoff [R18]

TRACEABILITY_MATRIX.md maps every numbered requirement, route, table, command and test to S1–S4 or an explicit architecture/owner decision. DECISION_REGISTER.md is the authoritative approval and remaining-input ledger. The two debate files retain reviewer findings and integrator dispositions once; this plan states the resulting design rather than repeating the debate.

Implementation remains blocked by the four setup inputs above; D01–D12 selections are approved. This request authorizes planning-artifact updates only. Any later implementation must follow the accepted scope and tracked technical acceptance work. New business requirements receive a decision ID and source before entering scope. If an owner selects an alternative that changes routes, permissions, hosting or execution, update the affected requirements and tests explicitly. The immutable release notes/checksums do not cover these new planning documents and are not edited.
