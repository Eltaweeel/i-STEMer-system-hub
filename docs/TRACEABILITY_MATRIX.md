# Hadeer / i-STEMer implementation traceability matrix

Planning baseline: 2026-09-12. **No application or remote change was made in this pass.** `PLANNED` identifies future work; `APPLIED-BASELINE` identifies the owner-confirmed migration only; `NOT-RUN` identifies required evidence not executed here; `BLOCKED` identifies a required input or service proof that is absent; `DEFERRED` identifies an approved later capability. Route, table, command and test IDs are architecture identifiers, not claims that an endpoint or table is implemented.

The source pack remains authoritative for product requirements: [master plan](product-architecture/FULL_PROJECT_MASTER_PLAN.md), [source trace](product-architecture/TRACEABILITY_MATRIX.md), [decision register](product-architecture/DECISION_REGISTER.md), [Phase 0 architecture](product-architecture/PHASE_0_ARCHITECTURE.md), [implementation blueprint](../../Business%20Agent%20OS%20v3.2%20release%20handoff/IMPLEMENTATION_BLUEPRINT.md) and [release notes](product-architecture/RELEASE_NOTES.md). This overlay adds current repository/remote status and file/evidence ownership. The current owner report and [remote preflight](REMOTE_SUPABASE_APPLY_PREFLIGHT.md) supersede the source pack's older “project unresolved” snapshot; D01–D12 are not reopened.

## Source and status keys

| Key | Meaning |
| --- | --- |
| B1 | Owner-approved baseline: Next App Router/TypeScript; Supabase Auth/Postgres/RLS/Storage; role-scoped multi-tenancy; real Auth/RLS demonstration; no browser service-role key; frozen v3.2 visual reference |
| S1 | Canonical implementation blueprint and prototype surface contracts |
| S2 | Canonical Phase 0 architecture: routes, roles, tables, RLS, trust boundaries, Auth and Phase 1 |
| S3 | Canonical owner decisions and decision register: D01–D20 |
| S4 | Canonical v3.2 release notes/checksums and inherited visual defects |
| C | Architecture debate findings C01–C15, with Round 2 dispositions |
| A | Technical rulings A01–A09 |
| E0 | This repository's current files, git state, local migration/tests and supplied current baseline |
| E1 | Future redacted evidence under `docs/evidence/phase-1/` (files are created only during implementation) |
| E2 | Real Supabase Auth/Postgres/Storage/browser evidence produced only after explicit test authorization |
| E3 | Owner procedure/acceptance evidence; no credentials or tokens stored in the repository |

## Master requirements R01–R18

| ID | Requirement and plan coverage | Decision/source trace | Implementation / evidence owner | Status at planning close |
| --- | --- | --- | --- | --- |
| R01 | Product vision, Hadeer/i-STEMer restricted pilot, owner/operator roles, synthetic-only scope, exclusions | S1 §§1–2; S4; D01,D03,D07,D10,D11 | `MASTER_IMPLEMENTATION_PLAN.md` §§2–3; P1G acceptance; E3 | PLANNED; owner identity/data remain restricted |
| R02 | App/package boundaries, request-scoped DAL, server/Edge writes, no browser privileged key | B1; S2 §§1,6–7; A01,A03; D08,D09 | Master §4; P1B file list; lint/dependency/build and X05 evidence; phase map supersedes illustrative gap-matrix filenames | PLANNED; existing fixture code is not a DAL |
| R03 | `/{locale}/t/{tenantId}` map, U01–U19, ownership and honest availability | S1 §1; S2 §2; D12-A | P1D `routes.ts`, `availability.ts`, route files; X04/X07 | PLANNED; U01/U02 only enabled in Phase 1 |
| R04 | T01–T25/G01–G04 data model, composite ownership, immutable revisions, migration order, retention gates | S1 §§3–4; S2 §4; A02; D02,D10,D17,D19 | P1A baseline; additive migrations P1C/P1E/P2–P4; X02/X03 | APPLIED-BASELINE for Phase 1A schema; later work NOT-RUN |
| R05 | Invite-only verified Auth, recovery, logout, MFA, membership/role/platform boundary, rate limiting and transfer gate | S2 §§3,7; A09; C02,C10; D03–D06,D20 | P1C auth/command/rate-limit files, OI01/OI04/OI08/OI09; X02–X05 | PLANNED / BLOCKED for live identity tests |
| R06 | RLS, grants, helper roles, Storage policy with direct membership/assurance guard and no direct business DML | B1; S2 §5; A03; C01,C09,C10,C13,C14 | P1A applied policy; P1C assurance/command grants; P1E/P1F Storage invariant; X03/X05 | APPLIED-BASELINE with assurance/command gaps; NOT-RUN real proof |
| R07 | Trusted command envelope, fresh authority, idempotency, atomic audit/receipt, rate limiting and saga reconciliation | S1 §3; S2 §6; A01,A03,A05,A09; C04,C06,C11,C15 | P1C command/rate-limit/observability modules; X01/X02/X05; E1 | PLANNED |
| R08 | Agent lifecycle, safety, revisions, approval binding, tools, retries and evidence | S1 §§4–6; S2 §9; A04,A05; D13,D14,D16,D19 | P2–P4 contracts/workers; X06/X08 | DEFERRED; no execution endpoint in Phase 1 |
| R09 | Private linked Storage, server streaming, object authorization and later ingestion controls | S1 §§3,6; S2 §§4–5,8; A06; C05,C07; D17,D19 | P1E stream/seed and P1F direct Storage tests; X03–X05 | PLANNED; bucket baseline applied, bytes not seeded |
| R10 | Notifications, outbox, integration adapters, scoped secrets and reconciliation | S1 §§6–7; S2 §6; A05; D09,D15,D16 | P3/P4 functions/contracts; X06/X08 | DEFERRED; no business notifications/integrations |
| R11 | Isolated nonproduction, real Auth/RLS, synthetic tenants and reset disabled | S1 §4; S2 §8; A09; D07,D10 | P1A/P1F/P1G; X02/X03; E2/E3 | PLANNED / BLOCKED by identity authorization and operational inputs |
| R12 | Redaction, correlation, append-only audit limits, Auth-denial/onboarding observability, backup/object recovery and incidents | S1 §3; S2 §9; A07; D10,D19 | P1B/P1C redaction/correlation/observability; P1F/P1G runbooks/evidence; X05/X08 | PLANNED; RPO/RTO/retention not invented |
| R13 | v3.2 visual parity, EN/AR, RTL/LTR, responsive, accessibility, reduced motion and honest inherited defects | S1 §1; S4; D12-A | P1D shell/dictionaries and e2e/a11y/visual tests at 1440×900/1024×768/390×844; E1 | PLANNED; exact missing copy OI06 |
| R14 | Unit, DB, RLS, browser, security, workflow, visual/a11y, load/recovery strategy with explicit test projects | S2 §10; C13–C15; A08; D18,D19 | P1B–P1F test configs/files; each phase exit evidence | PLANNED; this pass runs no application suite |
| R15 | Environments, CI/CD, secrets, compatible migrations, staging, rollback/recovery | B1; S2 §§6–10; A08; D08,D09,D19 | P1B/P1G Docker/CI/runbooks; OI02/OI05; E2/E3 | PLANNED / BLOCKED by deployment inputs |
| R16 | Conditional phases, dependencies, exit gates and explicit exclusions | S1 §7; S2 §10; D01–D20 | `IMPLEMENTATION_PHASES.md` P1–P4; owner gates | PLANNED; later phases remain gated |
| R17 | Exact Phase 1 vertical slice and eight acceptance criteria | S2 §10; D01–D12; A01–A09; C01–C15 | R17 rows below; P1A–P1G; E1/E2/E3 | NOT ACCEPTED; planning complete only |
| R18 | Traceability, handoff and immutable source artifacts | S3,S4; B1; A08 | This matrix, decision register, source hashes, P0 checks including HTML/support.js hashes and stale-doc precedence | PLANNING CHECKS PASS; R17 unaccepted |

## R17 acceptance criteria, closure evidence and blockers

| R17 criterion | Required result | Planned implementation | Evidence required before closure | Status |
| --- | --- | --- | --- | --- |
| R17.1 approved scope and operational setup | D01–D12/D12-A aligned; recovery, secret handover and support runbooks; designated test authorization; OI08–OI10 affected-scope inputs | P0/P1A/P1G; OI01–OI10 | E3 signed inputs/runbooks; E1 baseline and release record | BLOCKED: OI01–OI03 and OI04/OI05 not supplied/authorized; OI08–OI10 affect later closure |
| R17.2 invitations and Auth saga | Two synthetic tenants; individual one-use role-bounded invites; wrong/expired/revoked/replayed denial; suspended-tenant and pending non-initial-owner denial; recoverable Auth/DB partial failure; rate limiting and non-enumerating login/recovery | P1C functions/commands/rate-limit/observability and saga tests | E2 real Auth/Admin/Postgres traces with redaction; X02/X04 retry/race results; OI08/OI09 | BLOCKED: no users/invitations and no OI04 authorization |
| R17.3 verified session and bilingual shell | Membership via RLS; EN/AR and locale-preserving tenant/package context; no permission change on locale switch; explicit canonical Auth paths | P1C/P1D | E2 browser session evidence, screenshots, a11y output, denial/callback tests | PLANNED / NOT-RUN |
| R17.4 Today and read-only package | Same-tenant persisted reads, exact revision/provenance, synthetic indicator; no approval/execution endpoint | P1E queries/views | E2 SQL/API/browser responses for both tenants and safe malformed/foreign package cases | PLANNED / NOT-RUN |
| R17.5 linked private artifact | K04 permitted member can stream; other tenant/revoked/anonymous denied; no public URL or browser secret; direct Storage policy remains guarded if parent SELECT widens | P1E stream/seed; P1F direct/invariant tests | E2 Storage HTTP + stream hash/headers/policy evidence, managed-helper semantics and negative cases | PLANNED / NOT-RUN |
| R17.6 two-tenant isolation | Positive own reads and negative cross-tenant SQL/API/RPC/FK/Storage; current revoked JWT denied; platform admin without membership denied content | P1F integration matrix | E2 two real user sessions, direct PostgREST/RPC/Storage and catalog policy outputs | PLANNED / NOT-RUN |
| R17.7 audit/failure/suspension/reset | Attributable admin audit; injected audit INSERT failure rolls back membership mutation; failed command has no false success; suspension blocks next read without erasing audit; reset/deletion absent | P1C/P1F/P1G | E2 receipts/audit queries, failure injection/recovery and suspension traces; E3 review | PLANNED / NOT-RUN |
| R17.8 test and handoff quality | Relevant unit/integration/security/browser/visual/a11y checks pass; no production/live-agent claim | P1B–P1G | CI/build reports, browser/a11y/visual artifacts, source/diff preservation and owner sign-off | PLANNED / NOT-RUN |

## Route and surface trace (U01–U19)

All product URLs below are under `/{locale}/t/{tenantId}` and are proposed production mappings. Route groups do not add URL segments. Canonical technical Auth URLs are `/{locale}/auth/login`, `/{locale}/auth/accept-invitation`, `/{locale}/auth/recovery`, `/{locale}/auth/reset-password` and `/{locale}/auth/mfa`; they are implementation routes, not additional product modules. P1D must implement bounded access/availability states; it must not expose fixture data after an Auth/DAL failure. `IMPLEMENTATION_PHASES.md` is the canonical future file/test map when the gap matrix uses illustrative alternatives.

| ID | Surface | Phase | Files / evidence | Status |
| --- | --- | --- | --- | --- |
| U01 | `/today` Today | 1 | P1E `features/dashboard/*`, `today/page.tsx`; R17.4/X04 | PLANNED |
| U02 | `/approvals?package=<id>` package detail | 1 read; 3 decisions | P1E `features/approvals/*`, page; R17.4/X04 | PLANNED |
| U03 | `/campaign` | 2 | P2 page/modules/data; D13/D17 as applicable | DEFERRED |
| U04 | `/studio` | 2 | P2 page/modules/data | DEFERRED |
| U05 | `/team` | 2 | P2 page/modules/data; membership boundary rechecked | DEFERRED |
| U06 | `/results` | 2 | P2 page/modules/data; no invented metrics | DEFERRED |
| U07 | `/ask` | 2 fixture; execution only after D13/P4 | P2 honest unavailable/read surface; P4 authorization | DEFERRED |
| U08 | `/ops/org` | 2 | P2 module/data; security audit remains P1 admin path | DEFERRED |
| U09 | `/ops/manifests` | 2 | P2 T07 configuration surface | DEFERRED |
| U10 | `/ops/sops` | 2 | P2 T08 revision surface | DEFERRED |
| U11 | `/ops/runs` | 2 | P2 T09/T21 sanitized runs | DEFERRED |
| U12 | `/ops/artifacts` | 2 | P2 T10/T11; P1 private file read is narrower | DEFERRED |
| U13 | `/ops/rules` | 2 | P2 approved configuration only | DEFERRED |
| U14 | `/ops/connectors` | 2 metadata; 4 adapters | P2 metadata/P4 D16 adapters | DEFERRED |
| U15 | `/ops/memory` | 2 | P2 T15/T16; D17 | DEFERRED |
| U16 | `/ops/cost` | 2 | P2 approved metering only; D18 | DEFERRED |
| U17 | `/ops/audit` | 2 read; Phase 1 security audit through restricted command/evidence | P1C/P2 reads; D04/D19 | DEFERRED surface; P1 security evidence required |
| U18 | `/ops/diagnostics` | 2 | P2 sanitized diagnostics | DEFERRED |
| U19 | `/ops/system` | 2 | P2 sanitized system view | DEFERRED |

## Data, global records and authorization trace

| IDs | Entities and boundary | Phase / planned file or migration | Verification |
| --- | --- | --- | --- |
| T01–T04 | `tenants`, `memberships`, `tenant_invitations`, append-only `audit_log` | Phase 1A applied baseline; P1C lifecycle commands | X02/X03: composite ownership, last-owner, suspension, role/revocation, audit atomicity |
| T05–T06 | `campaigns`, `objectives` | Phase 1A applied; P1E synthetic seed/read | X03/X04 same-tenant reads and no business writes |
| T07–T08 | `agent_manifests`, `sop_revisions` | P2 `<CLI timestamp>_phase_2_workflow_data.sql` | X06 later exact revision/config authority |
| T09 | minimal synthetic `agent_runs` | Phase 1A applied; P1E seed/read | X03/X04 synthetic mode and tenant links |
| T10–T11 | `artifacts`, immutable `artifact_revisions` | Phase 1A applied; P1E linked read | X03/X04 exact revision/artifact FK and provenance |
| T12–T14 | `approvals`, future `approval_decisions`, `feedback` | T12 Phase 1A read-only; T13/T14 P3 | P1 no decision route; P3 X06 owner-only exact binding |
| T15–T16 | `knowledge_items`, immutable `knowledge_revisions` | P2 | D17/D19 and X06/X08 before ingestion |
| T17 | immutable `file_objects` linked to private Storage | Phase 1A applied; P1E controlled synthetic link | X03/X04/X05 exact bucket/key/revision and forged-path denial |
| T18–T19 | notifications and own recipient receipts | P3 | D15, X06 selected channel and failure recovery |
| T20 | nonsecret connector status | P2 metadata; P4 real adapters | D16 and X08 |
| T21 | durable run attempts | P2 synthetic; P4 worker | D13, X06/X08 |
| T22 | command receipts, no direct client read | Phase 1A applied; P1C command replay | X02/X05 unique actor/tenant/kind/key and digest conflict |
| T23 | transactional outbox | P3 | X06 delivery intent/retry |
| T24–T25 | execution authorizations and integration deliveries | P4 | D13/D16/D20, X06/X08 |
| G01 | Supabase-managed `auth.users` | Existing managed service | E2 Auth lifecycle; never recreate or dump identities |
| G02 | private platform admin grants | Phase 1A applied; P1C assurance/command checks | X03 admin-without-membership cannot read content; OI02 |
| G03 | private platform audit | Phase 1A applied; P1C command evidence | X02/X05 attributable sanitized operations |
| G04 | private provisioning operations/saga state | Phase 1A applied; P1C Auth/DB reconciliation | C02/C15, X02 failure/retry evidence |

Every tenant-owned reference must carry the composite tenant-qualified FK. Membership, tenant IDs, revisions, file metadata, approvals and receipts are immutable where the baseline requires it. `file_objects.id` is allocated before its object key/upload; state is not promoted by a normal update. P1E must upload/verify bytes and insert final immutable published metadata in the approved seed command. The Storage policy independently checks current membership/assurance and exact revision linkage, and X03/X05 prove that a widened `file_objects` SELECT cannot widen object access. P1A's forced RLS/grants remain applied baseline; P1C adds assurance/command capability additively and must verify the managed `storage.allow_any_operation` behavior on the target service.

## Commands K01–K12 and tests X01–X08

| ID | Scope, authorization and phase | Planned files / required proof | Status |
| --- | --- | --- | --- |
| K01 | Provision/suspend tenant; platform grant + required assurance; no content access | P1C Edge commands/SQL; X02/X03 audit, owner and suspension tests | PLANNED |
| K02 | Issue/revoke/accept invitation; D06 issuer boundary, lower-role ceiling, exact recipient, expiry, one-use, suspended/pending-tenant checks and rate limit | P1C invitation command/function/rate limiter; OI04/OI08/OI09 + X02/X04 saga/race/replay proof | BLOCKED for live proof |
| K03 | Read Today/package; verified current membership and same-tenant joins | P1E DAL/views; X03/X04 | PLANNED |
| K04 | Read private linked artifact; same K03 authority + file linkage | P1E stream; X03/X05 Storage/HTTP | PLANNED |
| K05 | Reset synthetic tenant; design only, irreversible reset disabled D10-A | No Phase 1 implementation; P4 only after policy | DEFERRED/disabled |
| K06 | Membership change/owner transfer; last-owner and D20 gate | P1C restricted Abdo custodian revoke-operator operation for R17 denial proof; no owner UI/elevation; transfer later if approved | PLANNED restricted subset / DEFERRED routine tooling |
| K07 | Objective/revision/config commands | P2 after D13/D14 | DEFERRED |
| K08 | Owner-only approval decision, exact current revision/action/destination and confirmation | P3 after D14; X06 | DEFERRED |
| K09 | Own notification receipt | P3 after D15 | DEFERRED |
| K10 | Knowledge ingest/finalize upload; limits/scanning/ownership | P2–P4 after D17/D19 | DEFERRED |
| K11 | Machine effect authorization/dispatch/reconcile | P4 after D13/D14/D16 | DEFERRED |
| K12 | Signed/deduplicated integration event, server tenant mapping | P4 after D16 | DEFERRED |
| X01 | Unit: schemas, predicates, revision binding, state/idempotency; locale formatting is tested with the P1D dictionaries | P1B–P1D unit suites; no service substitute | PLANNED |
| X02 | Database/integration: migrations, exact command grants/triggers, constraints, transactions, Auth saga, rate limits, audit-failure rollback, races | P1A baseline/cumulative + P1C real Postgres/Auth; `tests/integration/command-concurrency.test.ts`; E2 | PLANNED / NOT-RUN |
| X03 | Real two-tenant RLS: role-aware aal, revoked valid JWT, RPC/FK/Storage/platform grant, widened-parent Storage invariant | P1F direct SQL/API/Storage; E2 | PLANNED / NOT-RUN |
| X04 | Browser: invitation/login/locale/Today/package/file and denial/recovery; known/unknown email equivalence and abuse limits | P1D–P1F Playwright; OI04/OI08/E2 | BLOCKED for live identity flow |
| X05 | Direct entry points, CSRF/redirects, secrets, cache, path tampering, injection, excluded-component imports and no email enumeration | P1F security scripts/tests and bundle/log review | PLANNED / NOT-RUN |
| X06 | Later stale consent, races, worker lease/effect reconciliation | P3/P4 only; selected sandbox | DEFERRED |
| X07 | EN/AR, RTL, keyboard/focus, responsive at 1440×900/1024×768/390×844, reduced motion and frozen-reference comparison | P1D/P1F e2e/a11y/visual evidence; OI06 | PLANNED / NOT-RUN |
| X08 | Owner workload/SLO, queue recovery, backup/object restore, rollback | P1G minimum recovery; P4 full owner targets D18/D19 | BLOCKED for full targets; minimum rehearsal planned |

## Phase/file/evidence closure map

| Phase | Exact plan | Required closure evidence |
| --- | --- | --- |
| P0 | Five planning documents listed in `IMPLEMENTATION_PHASES.md` | Markdown links/IDs/phase dependencies agree; preserved baseline hash/status; no app/remote action |
| P1A | Preserve applied migration/tests; create `docs/evidence/phase-1/baseline.md`; dated updates only | Read-only migration/catalog result, no drift, historical PGlite separated from real proof. **PASS on 2026-09-13 after two access-blocked attempts; two drift items explained, two open items carried; see [baseline evidence](evidence/phase-1/baseline.md)** |
| P1B | Runtime/core/env/session foundations, explicit test projects/scripts in phase file | locked install, lint/type/unit/db/build, boundary and secret scans, fixture/Northwind smoke; integration/e2e trees are explicitly wired, not implicit |
| P1C | Auth/MFA/membership/commands, exact grant matrix, rate-limit/observability modules, additive migration, Edge adapters, saga tests | real Auth/Postgres assurance, invitation/recovery/revocation/transaction/race evidence; OI01–OI04/OI08/OI09 |
| P1D | Locale shell/access routes, fixture preservation and e2e/a11y files | frozen v3.2 screenshots at three viewports, EN/AR/RTL/focus/reduced-motion/denial/recovery evidence; OI06/OI10 |
| P1E | Today/package DAL/views, private stream and mandatory synthetic seed/link | real two-tenant query and Storage bytes/hash/negative/helper evidence; no business write/execution endpoint |
| P1F | integrated e2e/security/recovery suites and redacted evidence | all applicable R17/X01–X05/X07 scenarios pass; no skipped required negative test; real multi-connection races |
| P1G | deployment/CI/runbooks/evidence | OI05/OI07, target nonproduction pass, recovery rehearsal, owner R17 acceptance and exclusions |
| P2–P4 | conditional files/migrations after decisions | each activated U/K/T scope has own owner decision, real service/sandbox evidence, and release gate |

## Planning validation and current conclusion

This matrix covers R01–R18, R17.1–R17.8, U01–U19, T01–T25, G01–G04, K01–K12 and X01–X08. Proposed paths are not implementation evidence. Existing modified/untracked work is outside these planned edits and must remain unchanged.

## P0 checks recorded for this planning pass

On 2026-09-12 the following checks were run in the repository root:

- The five requested planning files exist; all internal Markdown links in those five files resolve. The canonical seven `product-architecture` copies match their sibling handoff files by SHA-256. Canonical HTML and `support.js` match `SHA256SUMS.txt` with hashes `42b18acfe21ae232e0773a52375471c7ddc371c5eabb21a4c957e6cef9914f34` and `1be5617b5a3d53d8446569aee03399265d6a4342360493e7868da591ba59bbce`.
- The requirement-ID scan found R01–R18, R17.1–R17.8, U01–U19, T01–T25, G01–G04, K01–K12 and X01–X08 in this planning set. The exact existing legacy app paths listed in P1D were checked with `rg --files`; dynamic segments are `[id]` for agents/workflows/approvals and `[agentId]` for workspaces. The canonical future Auth URLs, adapter path, Storage feature path and `tests/rls`/`tests/security`/`tests/e2e` tree are now explicit in the phase map.
- A SHA-256 preservation comparison covered 140 pre-existing non-ignored files (including the user's dirty and untracked baseline). It found zero changed or missing baseline files and zero unexpected additions; the five new planning files are the only additions from this pass.
- `git diff --check` and a trailing-whitespace scan for the five new files passed. No application tests, build, migration, invitation, Auth identity, Storage upload or remote mutation was run; those remain phase evidence requirements.

These checks validate document consistency and preservation only. They do not close any R17 criterion or claim real Supabase behavior.

## P1A execution attempt recorded on 2026-09-12

P1A was executed read-only and stopped at its first check. Full record, including verbatim call results and preserved source hashes, is in [baseline evidence](evidence/phase-1/baseline.md).

- Listing projects for the connected Supabase credential returned exactly one project, `urijxsmvhvxvjzanmivu` in `eu-west-1`, which is not the documented target.
- Requesting the documented target `ezsfdlkuzusylbqxqnod` returned `MCP error -32600: You do not have permission to perform this action`.
- Execution stopped there. No alternative credential or transport was tried, and the unrelated accessible project was deliberately not queried.
- No write of any kind was attempted: no `db push`, migration creation, reset, seed, Auth Admin call, invitation or Storage write.
- Working tree preserved: HEAD `5c425e3ab1c4a48e11762676efe73c95517b0cd8`, nothing staged, 145 non-ignored files hashed before the run and unchanged after it apart from this section and the new evidence file.

## P1A second execution attempt recorded on 2026-09-13

P1A was re-run on the report that the Supabase session had been corrected. Project access was verified first, before any other check, and had not changed.

- Listing projects returned the same single unrelated project, `urijxsmvhvxvjzanmivu` in `eu-west-1`, identical in every field to the 2026-09-12 result.
- Requesting the documented target `ezsfdlkuzusylbqxqnod` returned the identical `MCP error -32600: You do not have permission to perform this action`.
- Both the listing and a direct request were checked, because a stale listing can lag a freshly granted permission. They agreed.
- Execution stopped again. No alternative credential or transport, no query against the unrelated project, and no write of any kind.
- Working tree preserved: HEAD `5c425e3ab1c4a48e11762676efe73c95517b0cd8`, nothing staged, and the only changes are this section and the second-attempt record in the baseline evidence file.

The reported session correction did not reach this session. No P1A close criterion was observed on either of the first two attempts.

## P1A completed on 2026-09-13, third attempt

Access to the documented target was established and P1A ran read-only to completion. Full record in [baseline evidence](evidence/phase-1/baseline.md).

Target identity verified before any other check: ref `ezsfdlkuzusylbqxqnod`, name i-STEMer, organization `cdqpgjxqkwztasiqigns`, region `eu-west-2`, ACTIVE_HEALTHY, Postgres 17.6.1.166. No other project was queried.

Observed and agreeing with the preserved source:

- Ledger holds exactly `20260909165106_phase_1a_schema_security`, 92 statements, statement-array md5 `cae8f52be1169ceda0fa2c07e15e2003`.
- All fifteen baseline tables present, RLS enabled and forced on every one, 40 triggers, none disabled, no future-phase table and no extra view or function of our own.
- Grants exactly as written: table SELECT to `authenticated` on nine tables, column SELECT on two with `token_hash`, `auth_delivery_reference` and `evidence` withheld, nothing to `anon`, `service_role` or `PUBLIC`, and no client grant on `command_receipts`.
- Helper roles NOLOGIN, NOBYPASSRLS, non-table-owners, unreachable from `authenticated`; both helper functions owned by their helper role, SECURITY DEFINER, empty search path, PUBLIC EXECUTE revoked.
- 22 policies, exactly the migration's set; `storage.allow_any_operation(text[])` exists; `phase-one-artifacts` is the only bucket and is private.
- Zero rows in Auth users, identities, sessions and MFA factors, in every identity, evidence and business table, in all three private tables, and in `storage.objects`.

Drift classified, not repaired: `postgres` retains ADMIN OPTION membership of both helper roles, re-granted by `supabase_admin` after the migration's revoke ran, with no inherit and no set option; and `public.rls_auto_enable` with its `ensure_rls` event trigger exists outside the tracked migration, carrying two WARN advisories for anon and authenticated RPC reachability.

Open items carried to P1G, neither blocking P1B: Data API exposed schemas are confirmed only indirectly, and the provenance of `rls_auto_enable` needs an owner answer.

### Evidence reconciliation, 2026-09-13

A focused read-only reconciliation corrected two statements in the first P1A record and closed one provenance question. Detail in [baseline evidence](evidence/phase-1/baseline.md).

- The helper-role membership is **not** a later platform re-grant. It is PostgreSQL 17's automatic grant to a CREATEROLE creator, recorded with the bootstrap superuser as grantor and with INHERIT and SET both false. The migration's own explicit grant and revoke cancelled each other, leaving the automatic row. Evidence: server 17.6, `postgres` has CREATEROLE and is not superuser, `supabase_admin` is superuser, exactly two membership rows, and option flags that an explicit grant would not produce.
- `public.rls_auto_enable` and `ensure_rls` are a **verbatim copy of Supabase's documented "Auto-enable RLS for new tables" example**, matching body, tag filter, schema condition, exception handler and pinned `search_path = pg_catalog`. The earlier concern about an unpinned search path is withdrawn. The two advisories are inherited from the documented example, which omits an EXECUTE revoke. Disposition is low risk; a revoke is proposed for the P1C migration and was not executed.
- Exposed schemas remain the one closure input without current direct evidence. The remote preflight's Management API read of `db_schema = public,graphql_public` is direct but dated 2026-09-09, before the migration applied. The applied statement array contains no statement touching API configuration; this is a scan of what was recorded at apply time, not a live check of current PostgREST state. The earlier assertion that the setting "cannot be changed by SQL" is withdrawn: PostgREST documents in-database configuration surfaces such as `pgrst.db_schemas` (https://docs.postgrest.org/en/v12/references/configuration.html), and whether this project's PostgREST instance honours in-database overrides has not been established. Advisor behaviour is consistent but is inference and is not treated as a substitute. Re-run the same read-only Management API call before P1G sign-off and again before any P1C deployment.

P1A remains PASS. All six stated closure criteria are complete; the three unresolved items above are tracked separately and none is a closure failure. An OI01 to OI03 decision worksheet is prepared at [OI01-OI03_DECISION_WORKSHEET.md](OI01-OI03_DECISION_WORKSHEET.md); it approves nothing and does not unblock P1B on its own.

Consequences for status rows above, kept explicitly separated by attempt:

- Historical, and preserved as historical: the two access-blocked attempts on 2026-09-12 and 2026-09-13 produced no independent confirmation, and the 23/23 PGlite result in [PHASE_1A_SCHEMA_SECURITY.md](PHASE_1A_SCHEMA_SECURITY.md) remains an in-process stubbed harness result. Neither is promoted here, and neither is merged into the current-attempt claim.
- Current-attempt evidence, from the 2026-09-13 third attempt: the Phase 1A rows previously reading APPLIED-BASELINE on the owner's report are now additionally backed by dated real-service **catalog** read-only evidence for schema, policy, grant, role, bucket and emptiness state on the documented target. This is catalog-baseline closure only. It exercised no Auth session, JWT claim, assurance level, PostgREST or RPC behaviour, Storage HTTP or concurrency, and it is not live runtime proof.
- Status rows unchanged: X02, X03, X04, X05 and X07 remain NOT-RUN. R17.1 remains BLOCKED on OI01 to OI03; the earlier target-project access blocker is resolved, the operational-input blockers are not.
- Gate consequence: P1A PASS is catalog-baseline closure only. It is not permission for P1B. P1B additionally requires OI01 to OI03 settled, and OI04 remains a separate gate before any identity creation or invitation.

Current conclusion: the planning artifacts are internally checked, but Phase 1 implementation/acceptance cannot close. The project and applied migration are resolved, subject to P1A's safe negative branch if a future ledger check is absent or mismatched. Remaining operational blockers are OI01 recovery procedure/provider, OI02 secret handover/recovery, and OI03 support escalation; OI04 blocks live identity creation/invitation because this request says do not invite users. OI05/OI06/OI07 gate environment, copy/visual acceptance and owner sign-off; OI08/OI09/OI10 gate the affected Auth/role/read behavior. D13–D20 stay open for the capabilities they govern and do not become new restricted Phase 1 product decisions.
