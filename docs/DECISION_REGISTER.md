# Implementation decision register

As of 2026-09-12. This is a status reconciliation and engineering overlay, not a replacement for the approved [source register](product-architecture/DECISION_REGISTER.md). Read with the [master plan](MASTER_IMPLEMENTATION_PLAN.md) and [owner inputs](OWNER_INPUTS_REQUIRED.md). No new product decisions are approved by writing this file.

## Approved owner decisions retained

| ID | Binding decision | Implementation implication |
| --- | --- | --- |
| D01-A | Hadeer is tenant owner; Abdo accountable; synthetic i-STEMer demonstration | No inferred real-user invitation or real-data permission |
| D02-A | One organization per tenant; separate memberships allowed | Tenant ID is mandatory in routes, reads, commands and relationships |
| D03-A | Owner/operator; viewer disabled; operator can inspect Today/packages but cannot approve | Role comes from current membership; frontend/read-contract role names grant nothing |
| D04-A | Abdo provisioning custodian; no implicit tenant-content access | Platform grants authorize operational commands only; support needs explicit membership and escalation procedure |
| D05-A | Invite-only verified email/password; owner/platform-admin MFA | Recovery delivery/procedure still required; enforce assurance at direct data and command boundaries |
| D06-A | Platform invites initial owner; tenant owner invites lower role | Phase 1 lower role is operator only; no operator-to-owner elevation or ownership transfer |
| D07-A | Isolated nonproduction Supabase; individual invited identities | Project selection resolved by current owner baseline; test identities not yet authorized/created |
| D08-B | Existing Contabo VPS with Node/container and managed Supabase | Origin/TLS, deployment access and environment mapping remain setup inputs |
| D09-A | Abdo holds infrastructure/Auth-mail secrets; tenant holds future integration credentials | Private rotation, recovery and handover procedure required; never document secret values |
| D10-A | Synthetic only; no irreversible reset/delete | Preserve audit, failed provisioning and orphan metadata for reconciliation; no cleanup by blanket deletion |
| D11-A | Restricted Phase 1 | Security administration plus read-only Today/package/private-file slice; no business writes |
| D12-A | Locale/tenant routes, package query and minimal localized access/availability states | Implement existing direction; obtain missing exact access copy without redesign or a new route-choice gate |

The earlier C12/D12-Q2 uncertainty is resolved by D12-A. D01–D12 are not reopened by historical OPEN text. The source A01–A09 technical dispositions remain binding: request-scoped DAL, composite integrity, narrow non-bypass command/helper roles, exact revision binding, durable Auth saga, private current-authority file reads, append-only audit limits and real-service testing. Round 2's rejection of blanket navigation middleware and mechanical layout lint remains applicable.

## Current-state reconciliation

| ID | Status | Evidence / consequence |
| --- | --- | --- |
| S01 | Project resolved | Owner confirms i-STEMer / `ezsfdlkuzusylbqxqnod` / `eu-west-2`. Organization previously recorded in repository preflight. No remote recheck in this pass |
| S02 | Baseline migration applied | Owner confirms `20260909165106_phase_1a_schema_security.sql`. Preserve it byte-for-byte; all changes use additive CLI-generated migrations |
| S03 | Identity activation absent | Owner confirms no real users/invitations; this request prohibits invitations. Do not interpret the implementation roadmap as permission to send one |
| S04 | Local security evidence only | Historical 23/23 PGlite baseline tests use stubs. Real Auth/Storage, cross-service saga, HTTP policy and concurrency acceptance remain open |
| S05 | Approved visual handoff available | Seven repository architecture documents match canonical v3.2 copies. Old missing-design checkpoint is historical; application parity remains unverified |

## Engineering decisions for implementation, subject to verification

These resolve repository adaptation, not missing business policy. A failed compatibility/security check requires a documented technical revision, not silent weakening of a requirement.

| ID | Disposition | Reason / verification gate |
| --- | --- | --- |
| I01 | Adapt logical source tree into `apps/istemer-demo`; retain core packages and Northwind | Existing monorepo boundaries; dependency guards and both-app build required |
| I02 | Target supported Next 16 server runtime and supported Node; pin exact patches in P1B | Current Next 14 is unsupported. Verify current advisories, React compatibility, lockfile and both apps; preserve Northwind fixture behavior |
| I03 | Keep baseline migration and its pinned local test; add cumulative migration suite | Applied SQL cannot be retroactively edited; later migrations must preserve baseline invariants |
| I04 | Enforce owner/admin MFA beyond UI, through read helpers/command checks | Current baseline checks membership but not assurance. Prove aal1 denial via direct Data API/RPC/Storage as well as browser |
| I05 | Security commands may write in Phase 1; business commands remain absent | Required invitation/membership lifecycle must be transactional and audited; does not authorize K08 or execution |
| I06 | Controlled synthetic file upload precedes final immutable linked metadata | Baseline file rows cannot be updated to publish. Use idempotent reconciliation; no general upload UI or new client write grants |
| I07 | Separate transport from synthetic provenance in DTO/UI | API-backed synthetic content must not lose its sample indicator |
| I08 | Use current user JWT for normal reads and private file requests | Privileged credentials are confined to narrowly checked Auth Admin/operational paths; no privileged read adapter |
| I09 | Current no-invitation restriction is a live-test gate | Local code/tests may later progress, but live lifecycle acceptance requires explicitly designated and authorized individual test identities |
| I10 | `IMPLEMENTATION_PHASES.md` is the canonical future file/test map; technical Auth URLs are `/{locale}/auth/login`, `/{locale}/auth/accept-invitation`, `/{locale}/auth/recovery`, `/{locale}/auth/reset-password` and `/{locale}/auth/mfa` | Resolves illustrative filename/route differences in the gap matrix without changing D12 product URLs; all route groups and authorization checks remain explicit |
| I11 | Synthetic seed is a mandatory restricted command, not a client/service-key script | Pre-allocate file IDs, use a protected nonproduction seed role/command with exact grants/policies and tenant allowlist, verify bytes/digests, and insert immutable published links; no broad DML or applied-baseline rewrite |
| I12 | Phase 1 membership revocation is restricted custodian security administration; routine owner role mutation/transfer remains D20-gated | R17 revoked-member tests use Abdo's audited platform path; no tenant-owner revoke UI or self-elevation |

## Unresolved decisions retained, with activation deadlines

| Source ID | Unresolved topic | Earliest blocked capability |
| --- | --- | --- |
| D13 | Execution model/provider/tools, SOP operational definition | Phase 2 execution-facing contracts, then Phase 4 runtime |
| D14 | Action tiers, destinations, confirmation and approval expiry | Phase 3 approval command and Phase 4 authorization |
| D15 | Business notification recipients/channels/UI/copy | Phase 3 business notifications; not Auth recovery mail |
| D16 | Integration choices/scopes/sandbox/effect verification | Phase 4 external adapters |
| D17 | Real knowledge sources and ingestion policy | Real ingestion after restricted synthetic Phase 1 |
| D18 | Pilot success metrics and sign-off | Phase 2/pilot gate; does not add a new restricted Phase 1 start decision |
| D19 | Retention/backup targets, scanning/types/limits, workload/SLO, incident authority | Relevant upload/operations/production capability; minimum Phase 1 safe deployment/recovery evidence still required |
| D20 | Ownership transfer/emergency recovery | Transfer/routine role-management tooling and external pilot |

Three outstanding operational inputs under approved decisions still block full Phase 1 readiness: D05 recovery provider/procedure, D09 secret handover/recovery, D04 support escalation. See the owner-input register for precise deliverables. Do not replace them with invented defaults, or turn D13–D20 into blockers for unrelated restricted read-only work.

The following affected-scope inputs are also unresolved and must be recorded before their tests or activation: OI08 rate-limit windows/lockout/copy; OI09 behavior when a revoked member is re-invited; and OI10 whether the Phase 1 operator read projection matches the owner's or is reduced. Until OI09 is decided, re-invitation is rejected and audited; until OI10 is decided, the read projection is not assumed; these are fail-closed implementation gates, not permission to invent behavior.
