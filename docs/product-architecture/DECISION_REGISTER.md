# Decision register

Status: D01–D12 selections APPROVED and recorded on 2026-09-08 from the owner's explicit instruction in this task. Phase 1 remains BLOCKED pending the four inputs below. D13–D20 remain OPEN, non-blocking for the restricted synthetic Phase 1 slice. Approval records planning decisions only; it does not authorize implementation or deployment.

Evidence: explicit owner decision message dated 2026-09-08; option letters map to PHASE_0_OWNER_DECISION_BRIEF.md. That unchanged brief is historical, not the current status ledger. Named accountability is recorded only where supplied.

## Owner decisions

| ID | Approved option | Recorded owner decision | Remaining input / effect |
|---|---|---|---|
| D01 | A — APPROVED | i-STEMer/Hadeer pilot; tenant_owner=Hadeer; accountable_owner=Abdo; approved_data=synthetic only. | Resolved. |
| D02 | A — APPROVED | One client organization per tenant; users may hold separate memberships in multiple tenants. | Resolved. |
| D03 | A — APPROVED | Owner and operator enabled; owner reads business and operational surfaces; operator inspects, including Today/package, but cannot approve; viewer disabled. | Resolved. |
| D04 | A — APPROVED | Platform custodian=Abdo; provisioning only; no implicit tenant-content access; explicit tenant membership required for support; no global business-approval bypass. | Exact support escalation procedure: OWNER INPUT REQUIRED. |
| D05 | A — APPROVED | Invite-only verified email/password; MFA for tenant owners and platform admins; accountable_owner=Abdo. | Recovery email provider and recovery procedure: OWNER INPUT REQUIRED. |
| D06 | A — APPROVED | Platform provisions tenants/initial owners; tenant owners invite permitted lower roles; viewer remains disabled; accountable_owner=Abdo. | Resolved. |
| D07 | A — APPROVED | Separate nonproduction Supabase project; real individual invited Auth identities; synthetic content only; reset_authority=Abdo. | Exact Supabase project/account/region: OWNER INPUT REQUIRED; irreversible reset remains disabled under D10. |
| D08 | B — APPROVED | Existing Contabo VPS for owner-operated Node/container hosting; managed Supabase for database/Auth. | Exact Supabase project/account/region: OWNER INPUT REQUIRED. |
| D09 | A — APPROVED | Infrastructure/Auth-email custodian=Abdo; tenant owns future integration credentials and grants bounded access. | Secret rotation/recovery handover procedure: OWNER INPUT REQUIRED. |
| D10 | A — APPROVED | Synthetic-only; no irreversible deletion/reset policy authorized; security audit remains separate from disposable content. | Resolved for restricted Phase 1; irreversible deletion/reset disabled. Retention/backup-expiry schedules deferred to later data/operations gates. |
| D11 | A — APPROVED | Invitation → real Auth/RLS → bilingual tenant shell → Today → read-only package → private synthetic Storage → two-tenant tests; no business approval writes or agent execution. | Resolved; D10 limits reset activation. |
| D12 | A — APPROVED | Locale/tenant-prefixed routes; existing package query detail; minimal access/availability scope accepted; localized access-denied state with safe sign-out/recovery (D12-Q2); accountable_owner=Abdo. | Resolved, including D12-Q2; recovery procedure remains the D05 input, not a new routing decision. |

## Remaining owner inputs and Phase 1 gate

1. **Exact Supabase project/account/region — OWNER INPUT REQUIRED** (D07/D08).
2. **Recovery email provider and recovery procedure — OWNER INPUT REQUIRED** (D05; D12 recovery destination follows that procedure).
3. **Secret rotation/recovery handover procedure — OWNER INPUT REQUIRED** (D09).
4. **Exact support escalation procedure — OWNER INPUT REQUIRED** (D04).
5. **Remaining non-blocking decisions: D13–D20 OPEN.** Later data/operations gates include exact retention, deletion/reset and backup-expiry schedules; D10 is approved for synthetic-only operation with irreversible deletion/reset disabled.

Phase 1 is **BLOCKED**, not READY: the four setup inputs above remain outstanding. D01–D12 option selections are not reopened. D12-A settles route/access/availability direction and the localized revocation-denial outcome; it supplies no invented recovery provider, procedure or final UI copy. Detailed implementation and verification remain future work. No additional owner-choice blocker is introduced here.

## Later owner decisions — OPEN, non-blocking for restricted Phase 1

| ID | Exact question / accountable owner | Concrete options; recommended default | Rationale | Deadline and phase impact |
|---|---|---|---|---|
| D13 | When and how may real agent execution begin? Product owner + security custodian | **Recommend:** synthetic until approved SOPs/tool permissions; alternative: human-triggered execution after gates; alternative: reviewed scheduling after same gates | No provider, autonomous authority or fake execution assumed | Before Phase 4 execution activation; Phase 2 stays synthetic |
| D14 | Which human approval actions may be activated first? Product owner | **Recommend:** Tier 1 staging and Tier 2 creative, live locked; alternative: Tier 2 creative only; alternative: later live action after separate evidence/credential gates | S1 consent model preserved; no operator/agent approval | Before Phase 3 decisions; define action payload, confirmation and evidence requirements |
| D15 | Which business notification channels and UI are authorized? Product owner | **Recommend:** defer to Phase 3, in-app recipient scope with new brief; alternative: approved email; alternative: both | Auth mail does not authorize business messaging | Before Phase 3 notification activation; provider/recipients/copy required |
| D16 | Which depicted integration, if any, should be enabled? Product owner + tenant credential owner | **Recommend:** none early; alternative: separately review Instagram/Facebook placeholder; alternative: separately review WhatsApp placeholder | Placeholder is not a connector contract | Before Phase 4 adapter work; specify scopes, effects, verification and sandbox |
| D17 | Which real knowledge sources and ingestion method are allowed? Product owner + data custodian | **Recommend:** small owner-approved manual import after provenance controls; alternative: synthetic-only pilot; alternative: approved depicted-source connector later | No unapproved retrieval/provider/data ingestion | Before non-synthetic Phase 2 knowledge or uploads |
| D18 | How will the owner accept the pilot? Product owner | **Recommend:** functional/security checklist plus owner signoff; alternative: owner-defined additional metrics; alternative: structured qualitative user evaluation | No invented success targets | Define by Phase 2; required before pilot acceptance |
| D19 | What operational and file-security envelope is required? Product owner + security/operations custodians | **Recommend:** specify allowed file types/limits, scanning, audit protection, backup/restore objectives, incident owner and workload targets before external use; alternative: internal synthetic/no-general-upload operation until specified | Architecture cannot invent threat tolerance, RPO/RTO or SLOs | Before external pilot or Phase 4; blocks affected Phase 2 uploads and final acceptance |
| D20 | How may ownership transfer and emergency recovery occur? Product owner + security custodian | **Recommend:** current-owner audited transfer, last-owner protection, verified emergency process; alternative: platform-mediated tenant-consented transfer; alternative: no routine transfer during internal-only evaluation | Avoid tenant lockout or silent platform takeover | Before external pilot; required recovery specification before routine role tooling |

### D12-Q2 — APPROVED within D12-A

Localized access-denied state with a safe sign-out/recovery route; no private content rendered after revocation. Accountable owner: Abdo. Evidence: 2026-09-08 owner selection of D12-A. Recovery procedure remains the D05 input above. This is not an additional decision.

## Technical architecture decisions

These are Codex's proposed implementation rulings, not resolved business choices. Status: adopted for this plan, conditional on owner-selected alternatives. Each is traceable to S1/S2, the user's approved baseline, or debate rulings. Exact mechanisms must pass the implementation tests, not be accepted on prose alone.

| ID | Decision / accountable owner | Options and recommended adopted default | Rationale | Deadline / impact |
|---|---|---|---|---|
| A01 | Trust boundary; lead architect | **Adopt:** request-scoped Next.js DAL + narrow database commands + privileged Edge adapters; alternative: Edge-first command boundary | One authorization contract; no browser service role or shared private cache | Phase 1; R02/R07 |
| A02 | Tenant data ownership; database lead | **Adopt:** immutable tenant IDs, composite FKs, immutable revisions, phased migrations; alternative: separate schema/project per tenant requires owner rebrief | Testable same-tenant joins and references | Phase 1; R04 |
| A03 | Grant/RLS mechanics; security + database leads | **Adopt:** user-scoped reads, constrained command functions and narrowly scoped, nonrecursive private membership/platform-grant helpers; alternative: explicit trusted transactional service with equivalent RLS and contract proof | No table-owner/service-role shortcut for business commands; helper exception explicit | Prove before Phase 1 gate; R06 |
| A04 | Consent binding; lead architect + security lead | **Adopt:** exact immutable action/revision digest, current authority and atomic decision/audit; alternative: looser run-level consent rejected | Prevent stale consent and self-approval | Define in 1 read schema, activate 3; R08 |
| A05 | Effects and retries; backend lead | **Adopt:** durable attempts/outbox, idempotency, fenced leases and reconciliation; alternative: synchronous best-effort effects rejected | No distributed atomicity/exactly-once promise | Before Phase 3 outbox / Phase 4 effects |
| A06 | Private file delivery; security lead | **Adopt:** authenticated streaming in Phase 1; any later signed-URL helper has a centrally enforced five-minute maximum; alternative: shorter lifetime or streaming-only after explicit revocation tradeoff | Current membership checked on each new request; signed links remain bearer capabilities until expiry | Phase 1; R09 |
| A07 | Evidence and operations; security/operations leads | **Adopt:** append-only application audit, separate redacted telemetry, explicit backup/object restore runbooks; alternative: external tamper-resistant evidence sink if D19 requires | Truthful limits and recoverability | Audit in 1; operational release gate D19 |
| A08 | Verification and release; engineering lead | **Adopt:** real Auth/RLS positive/negative tests, staged compatible migrations and rollback rehearsal; alternative: browser mocks alone rejected | Test actual trust boundaries and recovery | Every phase; R14/R15 |
| A09 | Administrative lifecycle; lead architect | **Adopt:** restricted bootstrap/invitation saga/suspend tooling; irreversible reset deferred under D10-A and transfer gated by D20; alternative: new admin dashboard deferred to new brief | Account administration is required even in business-read-only Phase 1 | Phase 1 with D04–D06/D20; R05/R11 |

## Change control

Only the accountable owner may change OPEN to APPROVED with chosen option, date and evidence. Alternative selections trigger review of mapped requirements/tests in TRACEABILITY_MATRIX.md. No deadline above supplies an invented calendar date. D01–D12 selections are approved; the four remaining setup inputs must close before Phase 1 begins. D13–D20 remain open until their affected work. D10 does not authorize irreversible deletion/reset. No third debate round is authorized.
