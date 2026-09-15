# Phase 0 architecture proposal — Business Agent OS v3.2

Status: proposed, not implemented. Product sources: [IMPLEMENTATION_BLUEPRINT.md](IMPLEMENTATION_BLUEPRINT.md) and [RELEASE_NOTES.md](RELEASE_NOTES.md). The user has selected Next.js App Router + TypeScript and Supabase Auth, Postgres, RLS, Storage and privileged Edge Functions. Versions will be pinned when implementation is authorized. No application, repository, database or deployment is created by this document.

The approved prototype remains the visual contract. Platform admin and viewer, membership management, authentication and notifications are requested architecture additions, not previously approved prototype screens. All proposed choices require confirmation through [OWNER_DECISIONS.md](OWNER_DECISIONS.md). These two planning documents supplement the frozen package; they are not covered by its unchanged SHA256SUMS.txt.

## 1. Proposed repository structure

One repository and one Next.js application for the pilot; no monorepo or additional frontend is assumed.

```text
src/
  app/
    [locale]/
      (access)/auth/             # proposed access flows; visual brief needed
      (tenant)/t/[tenantId]/     # shared authenticated shell and routes below
    auth/callback/              # technical auth return handler, not a product page
  components/                   # faithful shell and shared controls
  features/                     # existing product modules, queries and commands
  lib/
    supabase/                   # separate browser and request-scoped server clients
    auth/                       # verified identity and membership checks
    contracts/                  # domain inputs, outputs and validation
    i18n/                       # unchanged approved English/Arabic strings
supabase/
  migrations/                   # schema, constraints, grants, RLS, command routines
  functions/                    # privileged invitation/provisioning boundaries
  seed/                         # synthetic demo data only
tests/
  database/                     # direct API/RLS and transaction tests
  integration/                  # Auth, membership and command boundaries
  acceptance/                   # later pilot verification, not run in Phase 0
docs/                           # decisions and approved contract references
```

Route groups organize code without adding URL segments. Request-time auth integration must follow the pinned Next.js/Supabase SSR versions; layouts and navigation guards are not security boundaries. [Next.js structure](https://nextjs.org/docs/app/getting-started/project-structure).

## 2. Route map derived from the prototype

Proposed prefix `/{locale}/t/{tenantId}`; locales `en` and `ar`. These URLs are new implementation mappings of existing component-state screens, not evidence of prototype deep links. D12 must approve the mapping. Tenant IDs and query parameters are untrusted selectors, never authorization.

| Existing owner surface | Proposed suffix |
| --- | --- |
| Today | `/today` |
| Approval inbox and package detail | `/approvals`, with `?package=<id>` for the existing detail |
| Campaign and stages | `/campaign` |
| Designer studio | `/studio` |
| AI team | `/team` |
| Results and recommendations | `/results` |
| Ask the team | `/ask` |

| Existing operator surface | Proposed suffix |
| --- | --- |
| Organization topology | `/ops/org` |
| Agent manifests | `/ops/manifests` |
| SOP revisions | `/ops/sops` |
| Workflow runs | `/ops/runs` |
| Artifacts/evidence | `/ops/artifacts` |
| Approval rules | `/ops/rules` |
| Connector health | `/ops/connectors` |
| Shared knowledge | `/ops/memory` |
| Model usage/cost | `/ops/cost` |
| Audit trail | `/ops/audit` |
| Diagnostics | `/ops/diagnostics` |
| System health | `/ops/system` |

Exactly 19 product surfaces; no added customer, billing, tenant-management or platform-admin dashboard. Access/onboarding/recovery are technical necessities outside this map and need a small approved access-flow brief, not a redesign of product screens. Administrative provisioning initially uses trusted operations rather than an invented UI. Direct navigation to an unauthorized route returns a neutral denied/not-found outcome and no tenant data.

## 3. Role model and assumptions

| Role | Proposed scope and authority | Explicit assumption/decision |
| --- | --- | --- |
| Platform admin | Global provisioning and account operations; no automatic business-content access or business approval | New role. Separate private platform grant, not a tenant role. Support access requires explicit tenant membership; D04 |
| Tenant owner | Existing consequential business authority; manage approved tenant memberships | Real person is unnamed. Membership powers and owner succession are additions; D01, D03, D06, D20 |
| Operator | Existing configuration/connector/schema authority; no business approval, publishing or spending | Start read-only in Phase 1; privileged configuration comes later; D03 |
| Viewer | Read approved owner-facing business records only; no writes, technical diagnostics or decisions | New role, disabled until approved; D03 |
| Agent principal | Tenant/run-scoped machine identity with permitted capabilities; not a human membership role | No self-approval or human impersonation; disabled execution in Phase 1; D13 |

Recommended assumption: one active tenant owner initially; operator and owner roles cannot be combined into an implicit approval shortcut. Multiple tenant memberships may exist, with one role per `(tenant_id, user_id)`; roles never transfer between tenants. Tenant owner can inspect tenant operational records; viewer excludes audit/security and administrative metadata. These visibility proposals require D03, not new content.

## 4. Data-model proposal

Names below are proposed tables, not existing APIs. Tenant-owned rows have a non-null `tenant_id`, an identifier and server-managed timestamps. Tenant ownership is immutable. Use tenant-qualified foreign keys, such as `(tenant_id, artifact_revision_id)`, so an in-tenant row cannot reference another tenant's object. Authorization and lifecycle constraints belong in the database, not JSON conventions.

| Proposed entity | Essential information and relationship | Delivery |
| --- | --- | --- |
| `tenants` | Name, lifecycle status, demo marker | Phase 1 |
| `memberships` | Tenant, Supabase Auth user ID, role, active/revoked status; unique tenant/user | Phase 1 |
| `tenant_invitations` | Tenant, verified intended email, permitted role, issuer, expiry, acceptance/revocation status; hashed application acceptance token if one is used | Phase 1 |
| `audit_log` | Tenant, actor identity/kind, action, target/revision, server time, request correlation; append-only event | Phase 1 security events; business decisions later |
| `objectives`, `campaigns` | Objective, campaign/stage references; actual state, not display-only scenario toggles | Read-only synthetic seed in Phase 1 |
| `agent_manifests`, `sop_revisions` | Capabilities, enablement and approved revision references | Later; fixture views remain explicit |
| `agent_runs` | Tenant, agent/SOP revision, run state, requester, input/output references, execution evidence | Phase 1 synthetic reads; execution deferred |
| `artifacts`, `artifact_revisions` | Producer, immutable revision, content digest, provenance, QA/evidence, optional private storage object | Phase 1 synthetic package reads |
| `approvals`, `approval_decisions`, `feedback` | Exact action/revision/tier and pending state; immutable actor/decision/confirmation evidence; revision-bound feedback | Phase 1 read-only; commands deferred |
| `knowledge_items`, `knowledge_revisions` | Collection, versioned content/object reference, provenance, freshness, writer | Deferred; no vector/search technology assumed |
| `notifications` | Tenant, recipient user, event reference, read state; no channel provider or new notification page assumed | Phase 3, subject to D15 |
| `connector_status` | Tenant, existing placeholder identity, capability/status; never credential values | Deferred, subject to D16 |

Private global `platform_admins` maps approved Auth user IDs to platform grants. It is not a tenant membership or a route-access bypass. Supabase `auth.users` is not a public user directory. Secrets live outside business rows; secret storage/rotation ownership is D09. Storage object names are tenant-qualified and linked to an authorized artifact/knowledge revision. No subscriptions, pricing, billing ledger, customer directory or live performance metric tables are proposed.

## 5. RLS strategy for every tenant-scoped entity

Enable RLS on all exposed tables and explicitly grant only intended operations. No tenant-data access for unauthenticated callers. A conceptual `active_member(tenant_id)` checks `auth.uid()` against current database membership and active tenant status; never trust client-supplied role, editable user metadata or stale JWT role claims. Updates constrain both existing and replacement rows; foreign keys and immutable tenant IDs prevent reassignment. Views must preserve caller security. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Role abbreviations below: O = tenant owner, P = operator, V = approved viewer. Every allowance also requires active membership in that exact tenant. This is a deny-by-default proposal, pending D03.

| Entity | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `tenants` | Own active membership only; minimal tenant metadata | Provisioning/owner metadata commands only; no browser deletion |
| `memberships` | Own row; O may read their tenant roster | Membership commands only; no self-promotion, cross-tenant edit or removal of last active owner |
| `tenant_invitations` | O sees own tenant invitations; acceptance command checks intended authenticated identity | Restricted invite/accept/revoke commands only |
| `audit_log` | O/P within tenant; no V access by default | Transactional event insertion only; no ordinary update/delete, including by O/P |
| `objectives`, `campaigns` | O/P/V | O commands later; Phase 1 clients read-only |
| `agent_manifests`, `sop_revisions` | O/P | Explicit authorized configuration/revision commands later; no client mutation of approved revisions |
| `agent_runs` | O/P/V for business-safe run records; do not place secret diagnostics in this entity | Trusted run commands only; no client-authored completion or evidence |
| `artifacts`, `artifact_revisions` | O/P/V | Authorized owner/agent command appends revisions; no overwrite of approved content |
| `approvals`, `approval_decisions`, `feedback` | O/P/V for business packages and their decision history | O decision/feedback commands only; no P/V/agent approvals; decisions immutable |
| `knowledge_items`, `knowledge_revisions` | O/P; V denied until knowledge visibility is agreed | Owner content commands; future agent writes only revision-bound outputs within granted scope |
| `notifications` | Recipient equals `auth.uid()` and active tenant membership | Event service inserts; recipient may mark only their own record read; no recipient/content/tenant reassignment |
| `connector_status` | O/P | Trusted configuration/status commands; no credentials in exposed rows |
| Storage objects | Active membership plus access to linked artifact/knowledge revision | Authorized tenant-bound upload command only; immutable revision paths; deletion only through approved retention process |

Membership-policy recursion must be avoided with a narrowly scoped private lookup helper returning only the caller's authorization result. Its privileges, fixed search path and execution grants require review; it must not become a membership enumeration API. Platform grants have private access rules and no broad tenant-table SELECT policy.

Private Storage buckets require policies on `storage.objects`; a path prefix alone is insufficient. Authorize the referenced tenant row too. Do not issue public URLs; any signed URL has a defined short lifetime and remains a bearer capability until expiry. Revocation-sensitive downloads should be authorized on each request. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## 6. Trusted-server / Edge Function boundary

| Boundary | Responsibility |
| --- | --- |
| Browser | Publishable Supabase key and user's session only; approved UI; all direct data requests subject to RLS |
| Next.js server | Verify identity, load request-scoped Supabase client, forward user context, validate inputs; never cache authenticated output across users/tenants |
| Edge Functions | Auth administration/invitation, tightly authorized provisioning and future privileged work; verify caller then authorization, not merely possession of a valid token |
| Postgres commands | Atomic business checks, writes and audit insertion; reject stale action/revision, duplicate/replayed intent and unauthorized state changes |

No service-role or secret key in browser code, public environment variables, logs, prompt input or generated artifacts. Normal server and Edge data access carries the user's JWT so RLS applies; privilege is not permission to use a service-role client for arbitrary tenant reads. Supabase's admin client bypasses RLS and must be isolated to narrowly scoped Auth Admin tasks. [Edge authentication](https://supabase.com/docs/guides/functions/auth).

Proposed write design: deny general client table mutations. Grant only narrow command entry points. For a command that needs table privileges beyond the caller, use a reviewed routine owned by a dedicated NOLOGIN/NOBYPASSRLS role that is not the table owner, with explicit RLS policies, fixed search path and restricted EXECUTE. Preserve the verified caller's `auth.uid()` and recheck membership inside the transaction. Do not use a postgres/service-role-owned SECURITY DEFINER routine as an RLS workaround. Ordinary reads/functions stay invoker-scoped. This design must be proven with direct-RPC negative tests before any privileged command ships. [Database functions](https://supabase.com/docs/guides/database/functions).

Semantic commands, not finalized endpoint names: provision tenant; invite/accept/revoke member; later decide on an exact approval revision; append feedback/revision; later dispatch an authorized run. A decision transaction locks/checks current state and atomically records its audit event. A retry reuses a tenant/actor-bound request key and verifies the same payload. Cross-tenant/not-authorized failures disclose no target content. No external publication command is enabled for the Phase 1 slice.

## 7. Authentication, onboarding, invitation and recovery

Recommended pilot flow, subject to D05/D06/D12:

1. A named platform administrator provisions the owner-approved tenant; no public tenant creation. The owner receives an invitation. Auth creation and database provisioning are not one transaction: retain pending status and safely retry/reconcile failures before activation.
2. Invite-only email/password Auth; email verification establishes identity. Verified identity does not establish membership. A trusted acceptance command checks the intended email/user, tenant, role, expiry, revocation and single-use status, then activates membership atomically. Existing Auth users accept membership without duplicate-account assumptions. Auth admin invitation support does not itself create tenant membership. [Auth invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
3. Sign-in establishes the Supabase session; request-scoped SSR validates identity and RLS resolves current membership. Do not authorize from an unverified session object. Root navigation uses an authorized tenant context; a tenant URL cannot grant access. Language preference survives independently of membership. [SSR Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).
4. Owners issue only approved tenant invitations through the protected boundary; owner transfer and last-owner protection follow D20. Revoked members lose data access through current-membership checks even if a JWT remains valid.
5. Password recovery uses a short-lived Auth recovery session and allowlisted redirects; responses avoid email enumeration. Recovery does not change role or tenant membership. Require fresh authentication for sensitive account operations; propose MFA for owners/platform admins (D05). [Password recovery](https://supabase.com/docs/guides/auth/passwords).
6. Sign-out clears the browser session. Administrative revocation must account for issued tokens and signed URLs; short-lived tokens alone are not immediate revocation. A compromised owner's recovery/escalation procedure must be agreed in D20.

No email provider is selected. Auth email delivery credentials are an operational prerequisite; email business notifications are a separate D15 decision. Validate redirect/origin restrictions and protect cookie-authenticated mutations against CSRF.

## 8. Demo-tenant strategy

Default: isolated non-production Supabase project with synthetic tenant data and real, individually invited Supabase Auth identities. Include two synthetic tenants for isolation testing; these are test fixtures, not invented pilot clients. No anonymous sign-in, shared demo password, mock authorization or demo RLS bypass.

Seed proposed domain tables through controlled operations; the same migrations and policies apply to demo and pilot. Mark demo data explicitly, use fake content only, and never import client credentials or operational records into demo. External agent execution/publication stays disabled. A demo marker must never relax authorization. Reset only an explicitly selected demo tenant through trusted operations, preserving security-event evidence according to D10. D07 decides isolation policy; no reset control is added to the approved UI.

## 9. Threat model

These are proposed controls and future test obligations, not claims of implemented security.

| Threat | Boundary and required adversarial test |
| --- | --- |
| Cross-tenant ID substitution or nested foreign key | RLS plus tenant-qualified references; test direct API, RPC, storage, route and relationship access using another tenant's IDs |
| Revoked member/stale claims | Resolve live membership, not editable metadata or JWT-only role; revoke and retry without token refresh |
| Shared SSR/cache leakage | Per-request clients; no shared caching of authenticated responses; test alternating identities and tenant selection |
| Prompt injection from knowledge/artifacts | Treat retrieved text as untrusted data, never authority; tool allowlist and tenant/run capabilities enforced outside the model; model output cannot approve, dispatch beyond scope or reveal secrets |
| Secret exfiltration | Separate Auth admin/operational secrets from browser bundles, logs and model context; inspect generated output and failing requests for leakage |
| Audit tampering or partial decisions | Transactional append-only audit, no ordinary edit/delete grants; fail the mutation if required audit insertion fails; retention is a separate privileged process |
| Agent permission escalation | Separate machine principal/run capabilities from human memberships; deny approvals, spending and live effects; server checks apply even if an agent fabricates a user/tenant ID |
| Invitation replay, role escalation or recovery abuse | Intended verified recipient, expiry/single-use/revocation checks, constrained grantable roles, allowlisted redirects, throttling and protected owner succession |
| Stored injection/unsafe uploads | Render untrusted text safely; validate file type/size under an agreed policy and preserve private storage authorization; limits are not yet specified (D19) |

Database/project administrators can still alter data and infrastructure; append-only application policies are not tamper-proof against project owners. Independent evidence export/retention is a D10/D19 decision. No external integrations or agents are enabled to test in Phase 1.

## 10. Recommended Phase 1 vertical slice and acceptance

**Invite → real Auth → tenant-scoped bilingual shell → Today dashboard → read-only approval package**, with synthetic Supabase rows, a private synthetic artifact and security audit events. This proves the chosen stack and isolation while retaining the blueprint's Phase 3 boundary for business approval writes. Audit here records access-management changes; it is not a new audit UI or a claim of live execution.

Resolve D01–D12 before committing to Phase 1. Defaults elsewhere mean deferred capabilities remain disabled. No production client data enters the slice unless D01/D07/D10 authorize it. No new application is created by this decision pack.

Acceptance criteria for the later build:

- Real invite/sign-in/recovery with no mock Auth; inactive/revoked membership and unsigned requests cannot read tenant content.
- Existing shell, Today and approval-detail surfaces use the exact approved English/Arabic copy and responsive direction behavior. Remaining existing routes remain within agreed Phase 1 scope; no fabricated live states or invented product screens.
- Owner/operator visibility matches confirmed roles; operator/viewer/agent cannot issue business approvals through either UI or direct calls. Viewer is disabled unless D03 enables it.
- Two synthetic tenants pass positive and negative RLS tests across every slice table, relation, RPC and private object; foreign-key reassignment and membership escalation fail.
- Request-scoped SSR does not leak content between identities; refresh, reload and direct authorized URLs work without frontend filtering as isolation.
- Invitation/membership changes persist with server-authored audit. Replays, stale state, partial failures and recovery redirects are tested; no tests are claimed as already run.
- No service-role key in client assets or model context; no customer credentials, live agent runs, notifications to business recipients or external publishing.
- The approved prototype, runtime and inherited org-label/file-protocol defects remain untouched. Any visual repair requires a new approved brief.

Technical documentation was checked on 2026-09-08. The [Supabase changelog](https://supabase.com/changelog) includes self-hosted Auth URL and GraphQL introspection changes; neither is assumed by this managed-Supabase/no-GraphQL default. Recheck relevant guidance when versions and deployment are chosen. No browser QA, schema changes, repository initialization or deployment occurred for this pack.
