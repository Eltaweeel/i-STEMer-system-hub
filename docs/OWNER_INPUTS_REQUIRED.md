# Owner inputs required

2026-09-12. Owner decisions D01–D12 remain approved; the Supabase project/region and applied baseline are resolved. This register distinguishes missing operational inputs from later product decisions. It contains no credentials, recipient addresses or secret values. Companion files: [master plan](MASTER_IMPLEMENTATION_PLAN.md), [phases](IMPLEMENTATION_PHASES.md), [decision register](DECISION_REGISTER.md).

## Phase 1 readiness blockers under approved decisions

| ID | Accountable person | Required concrete input | Deadline / blocked work | Evidence needed |
| --- | --- | --- | --- | --- |
| OI01 — D05 | Abdo, with Hadeer for owner recovery | Auth mail provider/sender/domain configuration, verified-password recovery flow, who handles lockout/MFA loss, identity-verification and escalation procedure | Before live invite/recovery/MFA activation and Phase 1 closure | Approved procedure plus privately configured delivery; redacted successful and expired/reused/unauthorized recovery tests. No passwords/tokens in docs |
| OI02 — D09 | Abdo | Secure credential custody/access method, rotation/revocation responsibility, backup custodian/handover and loss-of-access procedure for VPS, Supabase and Auth mail | Before live environment deployment/privileged operations and Phase 1 closure | Access confirmation and redacted rotation/handover rehearsal; secret references only |
| OI03 — D04 | Abdo | Support request channel, who authorizes time-bounded explicit tenant membership, removal/expiry procedure and incident escalation contact | Before support access and Phase 1 closure | Approved runbook and audit-backed grant/revocation rehearsal; platform role alone never opens content |

These three are the remaining operational blockers from the source gate. Writing application code cannot resolve them. They do not require reopening approved role, hosting or route choices.

## Recorded owner decisions

2026-09-15 — The owner interview now records the named Adam team, department-scoped employee access and sharing, either-channel approvals, reusable approved posts/customer-message rules, one-week calendar and two-stage approval, connected-account usage display and a 90-percent capacity policy. See [Adam workflow decisions](ADAM_WORKFLOW_DECISIONS.md), which supersedes conflicting earlier Hermes recommendations. These settle parts of D13–D16, not all runtime/tool/destination or deployment prerequisites. Ziad's findings feed Hana and the human marketing team; humans create reels and Hana is intended to create graphic designs.

2026-09-14 — Abdo selected **two Hermes briefings per day: beginning and end of day**, plus responses when Hadeer or Abdo asks. This settles the cadence portion of D15 for Hermes; exact timing, operating days and delivery channel remain unspecified. No extra unsolicited Hermes updates or alert exceptions were selected. See [Hermes role proposal](HERMES_ROLE_PROPOSAL.md). This records product behavior, not an active automation or implementation. Earlier employee interaction scope remains to be reconciled with this narrower named audience.

2026-09-14 — Abdo selected the application UI and Telegram as the human communication channels, with Hermes as the single user-facing system-admin agent. Abdo, Hadeer and employees communicate with Hermes within their respective access and authority. This settles the intended support/request channels; it does not grant Hermes unrestricted privileges or settle recovery when Hermes, Telegram or the system is unavailable. Verified account binding, server-side authorization, audit and human critical-decision approval remain required. Live integration sequencing remains to be reconciled with D13/D16 and the restricted demo scope.

2026-09-14 — For the demo, Abdo permits engineering to use Supabase Auth emails or a service such as Resend. Engineering recommends the default sender only for eligible developer testing, and custom SMTP with a verified domain for delivery to business users. Provider eligibility and domain configuration remain unverified; this is not a new owner provider-selection question. See the updated operations runbook for delivery constraints.

2026-09-13 — Abdo confirmed in the Codex conversation: **primary custodian: Abdo; backup custodian: Hadeer** (OI02, worksheet 2.3). The subsequent clarification below settles emergency-only technical access. Per-secret access, recovery actions, escalation procedure and rehearsals remain unresolved. The storage-method decision is recorded below. No account, platform grant, tenant access or invitation is authorised by this designation. OI01–OI03 remain open.

2026-09-13 — Abdo selected **Bitwarden on the Free plan** for credential storage (OI02, worksheet 2.1). He reports that no system passwords have been created yet; this is an owner report, not an independently verified inventory of infrastructure credentials. No Premium upgrade, standing shared access, or Bitwarden Emergency Access arrangement is selected or approved. Storage setup, per-secret access, backup access and emergency handover remain unverified; this decision does not confirm operational readiness.

2026-09-13 — Abdo supplied a personal email address as contact information; the address is intentionally not stored here and this does **not** select OI01 identity-verification channel type. `istemer.org` is recorded as a candidate sender-domain root only. Abdo currently lacks access to that domain; the SMTP provider, sender identity, DNS control and delivery configuration remain unselected and unverified. No DNS or SMTP probing was performed.

2026-09-13 — Abdo clarified the separation of responsibilities: **Hadeer has business-owner access to the main application to approve critical and major decisions within the approved product scope. Abdo handles technical administration. Hadeer has emergency-only technical access if Abdo is unavailable.** Business-owner application authority is distinct from infrastructure credentials and platform administration. This supersedes the worksheet 2.7 standing-access proposal; it does not activate later-phase approval/execution capabilities, create an account or invitation, grant infrastructure access, or resolve D20. The technical emergency activation mechanism, identity verification, scope, duration, revocation and rehearsal remain open.

## Execution inputs and permissions, not new product decisions

| ID | Required input | Earliest use | Current status / acceptable evidence |
| --- | --- | --- | --- |
| OI04 | Explicit permission to create/use designated individual synthetic-test Auth identities and send controlled invitations; privately supplied controlled inboxes and role/tenant assignments | P1C real lifecycle tests, P1E/F authenticated read tests | **Not authorized by this request; no users/invitations exist.** No shared login, invented inbox or invitation to Hadeer by default. Record authorization separately before invoking Auth Admin |
| OI05 | Exact nonproduction origin, DNS/TLS, deployment account/access, approved callback/recovery origins and environment mapping on Contabo | P1B configuration design; P1G deployment and cross-origin tests | Hosting choice is approved; operational values still required. Do not infer a public domain or request credentials in a report |
| OI06 | Approved exact EN/AR text and any missing presentation specification for login, invitation, recovery, MFA and denial states not supplied by v3.2 | P1D visual/access-copy acceptance | Reuse supplied copy first; label remaining copy `OWNER INPUT REQUIRED`. No redesign or newly invented business promise |
| OI07 | Owner availability to witness/review the R17 evidence and accept the restricted synthetic slice | P1G closure | Acceptance must name evidence and remaining later-phase exclusions. D18 later pilot metrics are not a substitute for or prerequisite to these explicit R17 criteria |
| OI08 | Auth-abuse policy: rate-limit windows/thresholds for invitation issue/revoke/accept, login and recovery; lockout/retry behavior and approved localized copy | Before P1C live activation | Engineering supplies the durable fail-closed mechanism; owner supplies policy values/copy. Test known/unknown email responses and limiter failure without enumeration |
| OI09 | Re-invitation semantics for a user whose membership in the same tenant is already revoked: reject, reactivate the original row, or another explicitly approved outcome | Before P1C acceptance of that case; maps to D06/D20 role lifecycle | Until decided, acceptance must deny and audit the re-invitation; no silent revival or duplicate membership is allowed |
| OI10 | Confirm whether the Phase 1 operator read projection equals the owner's Today/package projection or enumerate the approved reduced fields | Before P1E protected-read acceptance; maps to D03 | Signed field/projection mapping and owner review; shared RLS access does not imply identical product visibility |

The three rows OI01–OI03 remain the operational readiness blockers from the source gate. OI08–OI10 are affected-scope inputs, not new product decisions or permission to invite users. The engineering team can inventory missing configuration/copy and prepare local work without those values. It cannot treat elapsed time, a drafted configuration, or a proposed list of test people as authorization.

## Later decisions — remain open until relevant capability

| ID | Owner deliverable | Activation gate |
| --- | --- | --- |
| D13 | Execution/provider/tool selection, bounded SOP and run semantics | Phase 2 affected design and Phase 4 runtime |
| D14 | Approved action/destination policy, confirmation/consent and expiry semantics | Phase 3 decision rules and Phase 4 effects |
| D15 | Business notification recipients, channels, timing and approved UI/copy | Phase 3; unrelated to OI01 transactional Auth mail |
| D16 | Named integrations, minimum scopes, sandbox accounts, evidence of effect and retry policy | Phase 4 |
| D17 | Knowledge sources, permission/ownership and ingestion lifecycle | Real knowledge ingestion |
| D18 | Pilot success metrics, evaluation period and sign-off criteria | Phase 2/pilot readiness |
| D19 | Allowed upload types/limits/scanning; audit protection; retention/backup expiry; RPO/RTO, workload/SLO, incident authority | Before each affected feature or production claim. No invented size limit or recovery guarantee; Phase 1 still tests safe private access and non-destructive failure recovery |
| D20 | Owner transfer, emergency authority and recovery procedure | Before transfer/general role tooling/external pilot |

## Engineering work that is not an owner question

The implementer owns exact dependency patch selection and compatibility, additive migration generation, non-bypass command roles, verified-session checks, MFA enforcement, composite integrity, receipt/audit atomicity, redaction, uncached reads, route implementation, and test/evidence construction. These are prescribed safeguards, not optional policy choices to send back for approval. Escalate only a concrete unresolved product/operational choice or a genuine conflict with approved behavior.

No owner response is required to finish these planning documents. No invitation, remote change, application implementation, deployment or new permission is implied by their completion.
