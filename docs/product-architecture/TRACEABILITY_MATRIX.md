# Traceability matrix

Status: final planning trace. Every master-plan requirement is grouped under an R ID and linked to an authoritative source or an explicit decision. Route, table, command and test IDs are implementation identifiers from the master plan, not existing application endpoints or schema. D01–D12 selections are APPROVED from the 2026-09-08 owner instruction; four setup inputs still block Phase 1. D13–D20 remain OPEN and non-blocking for restricted Phase 1.

## Source keys

| Key | Source and authority |
|---|---|
| B1 | User-approved baseline in the architecture-planning brief: Next.js App Router + TypeScript; Supabase Auth/Postgres/RLS/Storage; role-based multi-tenancy; real Auth/RLS demo; trusted privileged work; no browser service-role key; v3.2 visual reference only. |
| S1 | IMPLEMENTATION_BLUEPRINT.md, sections 1–8: prototype surfaces, roles, semantic backend requirements, fixtures, approval tiers, connector placeholders and phases. |
| S2 | PHASE_0_ARCHITECTURE.md, sections 1–10: proposed repository/routes, role model, tables, RLS, trust boundaries, auth, demo, threat model and Phase 1. |
| S3 | OWNER_DECISIONS.md and DECISION_REGISTER.md: D01–D12 approvals recorded from the explicit 2026-09-08 owner message; four remaining setup inputs; D13–D20 later gates. PHASE_0_OWNER_DECISION_BRIEF.md supplies option labels and remains an unchanged historical choice brief. |
| S4 | RELEASE_NOTES.md: immutable approved v3.2 visual reference, verified SVG fix, supported HTTP mode and inherited defects. |
| C | ARCHITECTURE_DEBATE_ROUND_1.md and ARCHITECTURE_DEBATE_ROUND_2.md: Claude findings C01–C15 and final dispositions. |
| A | DECISION_REGISTER.md, A01–A09: conditional technical implementation rulings. |

## Master requirements

| Requirement | Master-plan coverage | Source / decision trace | Verification or gate |
|---|---|---|---|
| R01 Product vision, pilot scope, users, non-goals | §1; synthetic pilot; approved owner/operator roles; no billing, invented business or live effects | S1 §§1–2, S4, B1; D01,D03,D07,D11 | D01/D03/D07/D11; X04 |
| R02 Architecture and repository | §2; App Router tree; request-scoped DAL; server actions/routes/Edge; no service role in browser | B1; S2 §§1,6,7; A01,A03; D08,D09 | Phase 0 architecture gate; X05; CI |
| R03 Route map and module ownership | §3; U01–U19; locale/tenant prefix; no invented product pages | S1 §1; S2 §2; D12 | D12-A approved; D05 recovery procedure outstanding; X04/X07 |
| R04 Data model, ownership, retention, migrations | §4; T01–T25; global records; composite tenant keys; phased migration order; retention codes | S1 §§3–4; S2 §4; D02,D10,D17,D19; A02 | migration review; X02/X03; D10/D19 |
| R05 Auth and permission model | §5; invitation saga; recovery; role matrix; platform grant boundary; transfer | S1 §2; S2 §§3,7; D03–D06,D20; A09; C02,C10 | X02/X03/X04/X05; D05/D06/D20 |
| R06 RLS and grants | §6; policy matrix for every T table; Storage; helpers; no direct workflow DML | B1; S2 §5; A03; C01,C09,C10,C13,C14 | X03 direct SQL/RPC/Storage; policy review |
| R07 Trusted commands and contracts | §7; K01–K12; envelope, auth, idempotency, atomic audit, failure/reconciliation | S1 §3; S2 §6; A01,A03,A05,A09; C04,C06,C11,C15 | X01/X02/X05/X06; route/action contract review |
| R08 Agent execution and safety | §8; lifecycle, revisions, approvals, tools, prompt-injection controls, retries, evidence | S1 §§4–6; S2 §9; D13,D14,D16,D19; A04,A05 | Phase 2/3/4 gates; X06 |
| R09 Knowledge and Storage | §9; private files, server streaming, object authorization, later ingestion controls | S1 §§3,6; S2 §§4–5,8; D17,D19; A06; C05,C07 | X03/X04/X05; D17/D19 |
| R10 Notifications and integrations | §10; outbox, recipient scope, adapter contract, secrets and reconciliation | S1 §§6–7; S2 §6; D09,D15,D16; A05 | Phase 3/4; X06/X08 |
| R11 Demo and reset | §11; approved isolated nonproduction, real Auth/RLS, synthetic tenants; irreversible reset disabled | S1 §4; S2 §8; D07,D10; A09 | X02/X03; D10-A prohibits irreversible reset; later policy required for activation |
| R12 Operations and security | §12; correlation, redaction, audit limits, backup/object restore, incidents | S1 §3; S2 §9; D10,D19; A07 | X05/X08; D19 |
| R13 Visual, accessibility, bilingual/RTL | §13; v3.2 as immutable reference; EN/AR, RTL, responsive and inherited defects | S1 §1; S4; D12 | X07; immutable visual contract and approved D12-A direction |
| R14 Test strategy | §14; X01–X08; positive/negative Auth/RLS/Storage and recovery evidence | S2 §10; C13–C15; D18,D19; A08 | phase exit gates |
| R15 Deployment and release | §15; environment/secrets/CI/CD/migrations/rollback/staging verification | B1; S2 §§6–10; D08,D09,D19; A08 | CI, staging E2E, restore rehearsal |
| R16 Phased roadmap and exclusions | §16; phases 0–4, dependencies, exit gates and explicit exclusions | S1 §7; S2 §10; D01–D20 | owner phase approvals |
| R17 Exact Phase 1 slice | §17; invitation → real Auth → tenant shell → Today → read-only package → private Storage → two-tenant RLS | S2 §10; D01–D12; A01–A09; C01–C15 | numbered acceptance 1–8; X01–X05,X07 |
| R18 Traceability and handoff | §18; this matrix; decision register; immutable source artifacts | S3,S4; B1; A08 | docs gate; owner decision gate |

## Prototype route and module trace

These routes are proposed production mappings of component-state surfaces; they are not claimed to exist in the HTML as URLs. All trace to R03, S1 §1 and S2 §2, with D12 controlling locale/access treatment.

| Route ID | Proposed route / surface | Phase | Trace |
|---|---|---:|---|
| U01 | /today — Today | 1 | R03,R17; S1; S2 |
| U02 | /approvals?package=id — approvals/package detail | 1 read, 3 decisions | R03,R17; S1 §§1,5 |
| U03 | /campaign — campaign | 2 | R03; S1 |
| U04 | /studio — studio | 2 | R03; S1 |
| U05 | /team — team | 2 | R03; S1,S2 |
| U06 | /results — results | 2 | R03; S1 |
| U07 | /ask — ask | 2 fixture; real execution D13 | R03,R08; S1 §§1,6; D13 |
| U08 | /ops/org — organization | 2 | R03; S1,S2 |
| U09 | /ops/manifests — manifests | 2 | R03,R08; S1 |
| U10 | /ops/sops — SOPs | 2 | R03,R08; S1 |
| U11 | /ops/runs — runs | 2 | R03,R08; S1 |
| U12 | /ops/artifacts — artifacts | 2 | R03,R09; S1 |
| U13 | /ops/rules — rules | 2 | R03,R08; S1 |
| U14 | /ops/connectors — connector metadata | 2, 4 adapters | R03,R10; S1 §6; D16 |
| U15 | /ops/memory — knowledge/memory | 2 | R03,R09; S1,S2 |
| U16 | /ops/cost — cost fixture/metering | 2 | R03; S1 §4; D18 |
| U17 | /ops/audit — audit | 2 read, security audit 1 | R03,R12; S1,S2 |
| U18 | /ops/diagnostics — sanitized diagnostics | 2 | R03,R12; S1,S2 |
| U19 | /ops/system — sanitized system view | 2 | R03,R12; S1,S2 |

## Data and authorization trace

Every tenant table is owned by its tenant, carries an immutable tenant key, and maps to R04/R06. T01–T04 are the Phase 1 identity/evidence base; later tables are phased as stated in the master plan.

| Table IDs | Entities | Owner/permission contract | Trace |
|---|---|---|---|
| T01–T04 | tenants, memberships, invitations, audit_log | tenant/platform lifecycle and append-only evidence | R04–R07,R12; S2 §§4–7; D04–D06,D20; C02,C04 |
| T05–T06 | campaigns, objectives | tenant business data | R04,R08; S1 §§1,3; D02 |
| T07–T08 | agent_manifests, sop_revisions | tenant configuration and immutable versions | R04,R08; S1 §§2–5; D13,D14 |
| T09–T11 | agent_runs, artifacts, artifact_revisions | tenant run/evidence data; append-only revisions | R04,R08,R09; S1 §§3–5; D13,D14; A04 |
| T12–T14 | approvals, approval_decisions, feedback | exact revision/tier human consent and history | R04,R08; S1 §5; D14; A04 |
| T15–T16 | knowledge_items, knowledge_revisions | tenant knowledge and provenance | R04,R09; S1 §§3,6; D17,D19 |
| T17 | file_objects | private linked Storage metadata | R04,R06,R09; S2 §§4–5,8; C05,C07; A06 |
| T18–T19 | notifications, notification_receipts | recipient-scoped delivery/read state | R04,R10; S1 §6; D15 |
| T20 | connector_status | nonsecret adapter metadata only | R04,R10; S1 §6; D16 |
| T21 | run_attempts | durable run attempt/retry evidence | R04,R08,R10; S1 §§3–5; A05 |
| T22 | command_receipts | idempotent command replay and result reference | R04,R07; S2 §6; C11 |
| T23 | outbox_events | transactional delivery intent | R04,R10; S1 §6; D15; A05 |
| T24–T25 | execution_authorizations, integration_deliveries | later exact effect grants and receipts | R04,R08,R10; D13,D16; A04,A05 |

Global records G01–G04 in the master plan trace to R04–R07/R11/R12, S2 §§4–7, D04–D10 and C01/C10/C13. G04 provisioning_operations is the C02/C15 reconciliation state.

## Command, agent and test trace

| IDs | Scope | Trace and gate |
|---|---|---|
| K01–K02 | platform provisioning and invitations | R05,R07,R11; S2 §7; D04–D06,D09; C02,C15; Phase 1 |
| K03–K05 | Today/package reads, private artifact; K05 irreversible reset deferred under D10-A | R07,R09,R11,R17; S2 §§8,10; D07,D10,D11; C05 |
| K06–K07 | membership transfer and later configuration | R05,R07,R08; D20,D13,D14; Phase 2 |
| K08–K09 | approval decisions and notification receipts | R07,R08,R10; S1 §5; D14,D15; Phase 3 |
| K10–K12 | knowledge ingestion, effects and integration events | R07–R10; D13,D16,D17,D19; Phase 4 |
| X01 | unit validation and authorization predicates | R07,R14; A03,A04,A08 |
| X02 | migrations, constraints, transactions, Auth saga and races | R04,R05,R07,R14; C02,C04,C15; A08 |
| X03 | two-tenant RLS, roles, revoked valid JWT, RPC/FK/Storage/platform grant | R06,R09,R14,R17; C01,C09,C10,C13,C14; D02,D03 |
| X04 | browser invitation/login/locale/Today/package/file flow and denial paths | R05,R09,R13,R14,R17; D05,D11,D12; C02,C12,C14,C15 |
| X05 | direct entry points, CSRF, secrets, cache, path tampering, injection | R06,R07,R08,R12,R14; B1; C06,C08,C10 |
| X06 | stale consent, concurrency, worker lease and reconciliation | R07,R08,R10,R14; D13,D14,D16; A04,A05 |
| X07 | EN/AR, RTL, keyboard, focus, responsive and reference checks | R03,R13,R14,R17; S4; D12 |
| X08 | owner-defined load, queue recovery, backup/object restore and rollback | R12,R14,R15,R16; D10,D18,D19; A07,A08 |

## Owner-decision coverage

D01–D12 selections are approved; the four inputs below remain the Phase 1 start blockers. D13–D20 remain non-blocking for restricted Phase 1 and gate later activation or final acceptance.

## Remaining owner inputs and Phase 1 gate

1. **Exact Supabase project/account/region — OWNER INPUT REQUIRED** (D07/D08).
2. **Recovery email provider and recovery procedure — OWNER INPUT REQUIRED** (D05; D12 recovery destination follows that procedure).
3. **Secret rotation/recovery handover procedure — OWNER INPUT REQUIRED** (D09).
4. **Exact support escalation procedure — OWNER INPUT REQUIRED** (D04).
5. **Remaining non-blocking decisions: D13–D20 OPEN.** Later data/operations gates include exact retention, deletion/reset and backup-expiry schedules; D10 is approved for synthetic-only operation with irreversible deletion/reset disabled.

Phase 1 is **BLOCKED**, not READY: the four setup inputs above remain outstanding. D01–D12 option selections are not reopened. D12-A settles route/access/availability direction and the localized revocation-denial outcome; it supplies no invented recovery provider, procedure or final UI copy. Detailed implementation and verification remain future work. No additional owner-choice blocker is introduced here.

## Recorded selection trace

| Decisions | Approved result | Requirements / verification impact |
|---|---|---|
| D01-A, D02-A, D03-A | i-STEMer/Hadeer; tenant owner Hadeer; accountable owner Abdo; synthetic only; organization tenants, multiple memberships; owner/operator, no viewer | R01,R03–R06,R17; X03/X04 role and tenant cases |
| D04-A, D05-A, D06-A | Abdo provisioning custodian without implicit content access; verified password and privileged MFA; platform creates initial owners, owners invite lower roles; D05/D06 accountable owner Abdo | R05,R07,R17; X02–X05; support escalation and recovery procedure/provider remain inputs |
| D07-A, D08-B | Separate nonproduction project; reset authority Abdo; existing Contabo VPS with managed Supabase | R02,R11,R15,R17; project/account/region outstanding; future VPS build/runtime and staged checks required, none run |
| D09-A | Abdo owns infrastructure/Auth-email credentials; tenant owns future integration credentials | R10,R15; X05 secrets isolation; rotation/recovery handover procedure outstanding |
| D10-A | Synthetic-only, no irreversible deletion/reset policy | R04,R07,R11,R12,R17; disable irreversible reset/deletion; later schedules do not block restricted slice |
| D11-A, D12-A including D12-Q2 | Exact read-only slice; locale/tenant prefix and package query; localized access denial; D12 accountable owner Abdo | R03,R13,R16,R17; X04/X07; no new route/UX owner-choice blocker; recovery follows D05 |



| Decisions | Affected requirements | Primary consequence |
|---|---|---|
| D01–D03 | R01,R03–R06,R11,R17 | pilot identity, tenant shape, enabled roles and tests |
| D04–D06 | R05,R07,R11,R17 | platform grant, invite issuer, onboarding and recovery |
| D07–D10 | R02,R04,R09,R11,R12,R15,R17 | environment, credentials, synthetic reset, retention and backups |
| D11–D12 (including D12-Q2) | R01,R03,R13,R16,R17 | exact slice, route/access brief, revoked-session outcome and phased navigation |
| D13–D14 | R08,R10,R16 | execution timing and human approval gates |
| D15–D16 | R10,R16 | business notification and integration activation |
| D17–D19 | R04,R08–R12,R14–R16 | knowledge sources, operational envelope and acceptance |
| D20 | R05,R07,R11,R16 | ownership transfer and emergency recovery |

## Debate disposition coverage

C01–C15 are all preserved exactly once in the two debate files. Round 2 records 11 accepted, 3 rejected (with valid underlying concerns retained where stated), and 1 deferred owner question. Claude's final contradiction check returned no blocking contradictions. C findings trace into R05–R09, R14 and R17, with acceptance tests X02–X06.
