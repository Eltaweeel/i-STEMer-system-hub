# OI01 to OI03 decision worksheet

Prepared 2026-09-13. Purpose: let the accountable owner settle the three operational inputs that block Phase 1B, without reopening any approved decision.

2026-09-14 update: UI and Telegram through Hermes settle the support/request channels. Engineering may choose Supabase Auth mail or Resend for the demo within verified delivery restrictions. These decisions supersede earlier open channel/provider-selection wording below. See [owner register](OWNER_INPUTS_REQUIRED.md) and [runbook](OI01-OI03_OPERATIONS_RUNBOOK.md). Offline emergency recovery remains unresolved; Hermes integration is intended, not yet implemented.

**Recommendations remain PROPOSALS unless explicitly recorded in the Decision column.** Agents record owner answers from the Codex conversation here and in [OWNER_INPUTS_REQUIRED.md](OWNER_INPUTS_REQUIRED.md). A recorded decision is not evidence of implementation or rehearsal.

**Contains no credentials, tokens, passwords, addresses or secret values, and must never contain them.** Record where a secret lives and who can reach it, never the secret.

What is already settled and must not be reopened: D04-A platform custodian is Abdo with no implicit tenant-content access; D05-A invite-only verified email and password with MFA for tenant owners and platform admins; D09-A Abdo holds infrastructure and Auth mail credentials while the tenant owns future integration credentials; D10-A synthetic only with irreversible reset and deletion disabled; D12-A localized access-denied state with safe sign-out and recovery. D20 owner transfer and emergency authority stays open and is **not** part of these three inputs.

---

## OI01, under D05. Recovery, email delivery and MFA loss

Accountable: Abdo, with Hadeer for owner recovery. Blocks: live invite, recovery and MFA activation, and Phase 1 closure.

| # | Question | Options | Proposal | Decision |
| --- | --- | --- | --- | --- |
| 1.1 | Who sends Auth mail? | Supabase built-in sender; a dedicated SMTP or API provider on a domain you control | Default sender for eligible developer tests; custom SMTP on a verified domain for business-user delivery | **2026-09-14 — Engineering may select Supabase Auth mail or Resend for the demo.** Domain access/configuration and delivery verification remain pending; no further owner provider choice is needed. |
| 1.2 | Which sender identity and domain? | Subdomain of an existing domain; a separate domain | **Subdomain**, with SPF, DKIM and DMARC configured before the first invitation | **Open.** Candidate domain is not a selection of sender identity or DNS control; keep the subdomain/separate-domain choice open. |
| 1.3 | Which mail events are in scope for Phase 1? | Invitation, recovery, email verification only; those plus later business mail | **Those three only.** D15 governs business notifications and is not in scope here | |
| 1.4 | What is the recovery link lifetime? | Provider default; an explicitly shortened value | **Explicit short lifetime**, recorded as a number, not left at default | |
| 1.5 | Who handles an owner lockout? | Abdo as custodian; a named alternate; both | **Abdo, with one named alternate**, so a single absence does not strand the tenant | 2026-09-13 — Settled by cross-reference to OI02 2.3: **Abdo primary; Hadeer emergency-only technical backup**. No second/distinct alternate is required. Activation mechanism remains open under OI02 2.7. |
| 1.6 | How is a person's identity verified before recovery assistance? | Out-of-band contact on a pre-agreed channel; a shared secret; manager confirmation | **Out-of-band contact on a channel agreed in advance and recorded here by channel type**, not by address | **Open.** A personal email was supplied as contact information only; it does not select the verification channel type, and the address is not stored. |
| 1.7 | What happens when an owner loses their MFA factor? | Custodian resets the factor after identity verification; tenant is suspended pending owner action; no reset path in Phase 1 | **Custodian-performed factor reset after 1.6 verification, with an audit entry.** Note that the Phase 1A baseline has no MFA enforcement yet; P1C must add it, and this procedure must exist before it does | |
| 1.8 | What happens when the platform custodian loses their own factor? | Supabase dashboard account recovery; a second platform admin; documented break-glass | ~~A second platform grant held by the named alternate from 1.5.~~ **2026-09-13 stale proposal.** Owner has settled Hadeer as *emergency-only* technical backup (see OI02 2.7); this row must **not** be read as demanding a standing second platform grant. Options are now (a) documented break-glass activation of Hadeer's emergency access, or (b) provider account recovery. Owner decision remains open under OI02 2.7 activation mechanism. | |
| 1.9 | Maximum acceptable time to restore access? | Same business day; next business day; no commitment | **State a number.** Do not leave blank. D19 governs formal targets, but a working expectation is needed for Phase 1 | |
| 1.10 | What evidence is retained for a recovery event? | Audit entry only; audit plus redacted correspondence record | **Audit entry plus a redacted record of the verification step**, never the link or token | |

Evidence to attach at closure: approved written procedure; privately configured delivery, confirmed working; redacted traces of one successful recovery and of an expired, a reused and an unauthorized attempt. No password or token in any document.

---

## OI02, under D09. Secret custody, rotation and handover

Accountable: Abdo. Blocks: live deployment, privileged operations, and Phase 1 closure.

| # | Question | Options | Proposal | Decision |
| --- | --- | --- | --- | --- |
| 2.1 | Where do secrets live? | A password manager; a cloud secret manager; host environment files only | **A password manager as system of record, with runtime injection on the host.** Host files alone give no rotation history or access trail | **2026-09-13 — Owner decision (Abdo): Bitwarden on the Free plan.** Owner reports no system passwords created yet; this is not a verified inventory of infrastructure credentials. No Premium upgrade, standing shared access, or Bitwarden Emergency Access arrangement is selected or approved. Setup, runtime injection and emergency handover remain undecided. |
| 2.2 | Which secrets are in scope? | Enumerate | **Supabase service role key, Supabase database password, Supabase access token, Auth mail provider credential, VPS access credential, TLS material.** List by name only, never by value | |
| 2.3 | Who holds each one? | Single custodian; custodian plus alternate | **Custodian plus the same named alternate as OI01 1.5**, so custody and recovery do not share a single point of failure | **2026-09-13 — Owner decision (Abdo): primary custodian Abdo; backup custodian Hadeer.** Abdo handles technical administration; Hadeer has emergency-only technical access if Abdo is unavailable. Hadeer separately has business-owner application access for critical and major decisions within approved product scope. Per-secret access and the emergency activation mechanism remain unresolved. |
| 2.4 | Rotation trigger? | Fixed schedule; on suspicion only; both | **Both.** A schedule plus immediate rotation on suspected exposure | |
| 2.5 | Rotation interval for Phase 1? | Per item; a single interval for all | **One interval for all Phase 1 secrets**, stated as a number. Keep it simple while the surface is small | |
| 2.6 | What is the rotation order of operations? | Ad hoc; a written sequence per secret | **A written sequence per secret**, since rotating the database password and the service role key have different blast radii and different restart requirements | |
| 2.7 | How is handover performed if the custodian is unavailable? | Alternate already holds access; sealed escrow; provider account recovery | **Earlier standing-access proposal superseded by the owner decision.** Define and rehearse an emergency-only handover mechanism. | **2026-09-13 — Owner decision (Abdo): Hadeer receives emergency-only technical access when Abdo is unavailable.** Activation, verification, access duration, revocation and rehearsal remain to be specified; no access is provisioned by this record. |
| 2.8 | How is a rotation or handover evidenced? | Manager audit log; a written record; both | **Both**, with the written record naming the secret and the date, never the value | |
| 2.9 | What is the response to suspected exposure? | Rotate then investigate; investigate then rotate | **Rotate first, then investigate**, and revoke sessions as part of the same action | |
| 2.10 | Are preview or CI environments allowed to hold any of these? | Yes; no | **No.** Matches the approved rule that preview environments never inherit production or nonproduction secrets | |

Evidence to attach at closure: access confirmation for custodian and alternate; one redacted rotation rehearsal; one redacted handover rehearsal. Secret references only.

---

## OI03, under D04. Support authorization and escalation

Accountable: Abdo. Blocks: support access and Phase 1 closure.

The binding constraint, already approved: a platform grant alone opens no tenant content. Support requires an explicit, time-bounded tenant membership, and every grant and revocation is audited.

| # | Question | Options | Proposal | Decision |
| --- | --- | --- | --- | --- |
| 3.1 | How does a support request arrive? | Application UI and Telegram | Both channels feed the same permission-checked request and audit process | **2026-09-14 — Settled: UI and Telegram through Hermes**, acting within each verified person's authority. Implementation remains pending. |
| 3.2 | Who may authorize a support membership into a tenant? | The tenant owner; the platform custodian; either; both together | **Tenant owner authorizes, custodian executes.** Preserves D04's rule that the custodian has no implicit content access | |
| 3.3 | What role does support receive? | Operator; owner | **Operator.** Never owner. Owner carries approval authority that support has no reason to hold | |
| 3.4 | How long does it last? | A fixed maximum; per request | **A fixed maximum stated as a number**, with anything longer requiring fresh authorization | |
| 3.5 | How is expiry enforced? | Manual revocation; scheduled job; membership expiry column | **Manual revocation by the custodian, tracked in the request record.** Phase 1 has no scheduler and the baseline has no expiry column, so do not assume automation that does not exist | |
| 3.6 | What is recorded when access is granted? | Requester, authorizer, tenant, role, reason, start, end | **All seven**, in the audit log and in the request record | |
| 3.7 | Who confirms the access was removed? | The custodian; the tenant owner; both | **Custodian removes, owner confirms.** Separation of duties on the way out as well as in | |
| 3.8 | What is the incident escalation path? | Custodian only; custodian then named alternate; a third tier | **Custodian, then the named alternate from OI01 1.5.** Reuse one alternate across all three inputs rather than inventing separate chains | 2026-09-13 — Settled by cross-reference to OI02 2.3: **Abdo, then Hadeer under her emergency-only technical access.** |
| 3.9 | What counts as an incident rather than a support request? | Define | **Suspected credential exposure, suspected cross-tenant access, audit gap, or any unexplained privileged action.** Anything on that list skips the normal queue | |
| 3.10 | Who may suspend a tenant, and on what basis? | Custodian at discretion; custodian on incident criteria only | **Custodian, on the 3.9 criteria only**, with an audit entry and owner notification. Suspension is already a Phase 1 capability, so this needs an answer before P1C | |

Evidence to attach at closure: approved runbook; one audit-backed grant and revocation rehearsal against a synthetic tenant, performed only after OI04 authorizes test identities.

---

## Dependencies and sequence

~~OI01 1.5 names an alternate that OI02 2.3 and OI03 3.8 both reuse. Settle it first.~~ **2026-09-13 — Superseded.** The alternate is recorded via OI02 2.3 (Abdo primary; Hadeer emergency-only technical backup); 1.5 and 3.8 are Settled by cross-reference. Remaining Settled-tier decisions are consolidated in the compact batch in [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md).

None of these three require D13 to D20, and none reopen D01 to D12. D13–D20 remain OPEN for their respective future scopes. OI04 remains a separate gate: no test identity may be created and no invitation sent until it is authorized, which means the OI01 recovery rehearsal and the OI03 grant rehearsal cannot run until OI04 is settled, even though the procedures themselves can be written and approved now. The three-tier reconciliation in [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md) states which tier gates which operation.

Order that unblocks the most work soonest: OI02 first, since it needs no identities and gates deployment; then OI03, written now and rehearsed after OI04; then OI01, whose delivery configuration can be prepared but whose tests need OI04.

## What this worksheet does not do

It records only explicit owner decisions; unselected proposals remain unapproved. It does not create an alternate to D20 owner transfer or emergency authority, which stays open. It records no secret. It grants no permission to create identities, send invitations, deploy, or begin P1B. P1B additionally requires all three of these inputs to be settled, not merely drafted.
