# Planning debate — 2026-09-13

Records the Round 2 rulings that (a) settle role assignment under owner instruction and (b) reconcile the OI01–OI03 gate against frozen source without recreating a circular dependency. Owner instructions in the review conversation supersede prior plan-record wording. This document changes no application code and grants no owner permission.

## Roles under owner instruction

- **Owner (Abdo; Hadeer for owner recovery within recorded scope).** Supplies decisions in the review conversation. Not asked to relay text between agents or paste tool output.
- **Claude (Opus, high) — lead planner, orchestrator, reviewer.** Owns plan, briefs and review of every Codex delta; may perform authorised read-only checks and edit planning docs to keep them coherent.
- **Codex — delegated implementer.** Executes one scoped brief at a time via the desktop coordinator relay. No recursive sub-delegation.

Prior wording at `docs/DELEGATED_EXECUTION.md` §Roles is superseded by this row and by the current edit to that file. Its opening line already subordinates itself to owner instructions.

## Setup-input gate — three-tier reconciliation

Frozen source `docs/product-architecture/FULL_PROJECT_MASTER_PLAN.md` §17 R17 acceptance (line 264) and §18 (line 277) block Phase 1 implementation on the four setup inputs: project (D07/D08 — already resolved), recovery (D05 = OI01), secrets (D09 = OI02), support (D04 = OI03). The plan-record's earlier "closure = decisions + rehearsals" phrasing was ambiguous and produced the appearance of a circular P1B→P1C→rehearsal→OI-closure loop. Three tiers replace that single label, each with its own gate.

| Tier | Meaning | Earliest gate it governs |
| --- | --- | --- |
| **Settled** | Owner decisions recorded in `docs/OI01-OI03_DECISION_WORKSHEET.md` Decision columns; procedures written and reviewed sufficient to satisfy the frozen "resolve before Phase 1 begins" wording | P1B code start |
| **Configured** | Delivery/host configuration in place (e.g. DNS/DKIM/SMTP for OI01; password-manager runtime injection for OI02; support channel-of-record for OI03) | Each earliest live operation per `docs/OWNER_INPUTS_REQUIRED.md` — OI01 before live invite/recovery/MFA; OI02 before live deploy/privileged ops; OI03 before support access |
| **Rehearsed** | Redacted evidence of the rehearsals named in each worksheet's "Evidence to attach at closure" line | The specific operation each rehearsal attests to; some rehearsals additionally require OI04 identities and therefore cannot run before P1C real-service work |

No tier is deferred to P1G if `OWNER_INPUTS_REQUIRED.md` sets an earlier gate. No new tier or gate is invented; the frozen source's "resolve before Phase 1 begins" is honoured by the Settled tier.

## Dispositions on Codex Round-2 critique

1. **Circular gate — ACCEPTED.** The three-tier split resolves the loop without silently reinterpreting frozen source. Prior Round-1 phrasing "P1B entry = decisions recorded" was too weak against `FULL_PROJECT_MASTER_PLAN.md:264, 277`; corrected.
2. **Delegation authority — ACCEPTED.** Role table patched. The custody + storage-method subset already recorded on 2026-09-13 (see `docs/DELEGATED_EXECUTION.md` §"Next owner intake" and `docs/OWNER_INPUTS_REQUIRED.md` §"Recorded owner decisions") is marked complete without another approval round.
3. **Preservation — ACCEPTED.** Q3 is a current, source-only inventory (`git ls-files -z --cached --others --exclude-standard`), no hardcoded file count, enforced exclusion set. Corrected brief supersedes the Round-1 draft.
4. **Hadeer's two authorities — ACCEPTED.** Emergency-only technical backup and business-owner application authority are settled and are not re-litigated. Emergency-only does not preclude Hadeer assisting recovery within that scope. Activation mechanism, per-secret scope and revocation remain open under OI02 without demanding a second, distinct alternate. D20 stays OPEN without touching Hadeer's recorded role.
5. **O1/O2 — ACCEPTED.** Neither blocks P1B per `docs/evidence/phase-1/baseline.md`. O2 is a hardening decision, not an unexecuted remediation; delegation gate row is corrected accordingly. Q5 (Management API re-read) is deferred: no network calls under the current review.
6. **Engineering vs owner choices — ACCEPTED.** Compact decision batch below separates genuine owner inputs from planner proposals; planner proposals will not be self-approved.

## Compact decision batch (owner inputs only)

Genuine owner decisions still needed to move OI01–OI03 to **Settled**. Planner-proposal defaults for numeric intervals, sequences and mechanics are engineering choices under `docs/OWNER_INPUTS_REQUIRED.md` §"Engineering work that is not an owner question"; they will be recorded as planner proposals in the worksheet, reviewed by Codex, and confirmed only where the owner has a preference.

**OI01 (D05) — owner inputs**
- Auth mail sender path: Supabase built-in vs. a controlled-domain SMTP/API provider (product name only when selected); istemer.org is a candidate domain root only and is currently inaccessible to the owner.
- Sender identity and DNS control remain open: subdomain vs. separate domain (only after a custom sender path is selected).
- Identity-verification channel *type* used before recovery assistance (channel type only; not an address). The supplied personal email is contact information, not this decision.

**OI02 (D09) — owner inputs**
- Password-manager product identity is settled 2026-09-13 as Bitwarden Free plan. No Premium upgrade, standing shared access, or emergency-access arrangement is approved.
- Emergency handover mechanism between password-manager storage and Hadeer's emergency-only technical access: sealed escrow, shared vault + break-glass audit, or an alternative the owner names.
- Secrets in scope for Phase 1 (confirm the enumerated list already drafted in worksheet 2.2).

**OI03 (D04) — owner inputs**
- Support request channel of record (name only).
- Who may authorize a support membership into a tenant (worksheet proposes: tenant owner authorizes, custodian executes — confirm or amend).
- Who may suspend a tenant, and on what criteria.

**Planner-proposed defaults (not owner questions).** Recovery-link lifetime number, rotation interval, per-secret rotation sequences, expiry mechanics, and the preview/CI secret-holding rule remain planner proposals labelled as such. Blank Decision cells are not self-approved.

## Next packet sequence

| # | Packet | Entry | Notes |
| --- | --- | --- | --- |
| Q0 | This debate + doc reconciliation | Owner authorised Round 2 | No fresh owner approval needed |
| Q3 | Source-only preservation snapshot | Codex brief dispatched to `C:\Users\Eltaweel\AppData\Local\Temp\business-agent-os-planning-debate-20260913\q3-codex-brief.txt` | Complete and independently verified; source-only; not an env/DB/secret backup. Codex Luna Reserve Max CLI was rejected at startup by the exhausted primary limit; coordinator completed the narrowly scoped source-only fallback. No reserve credit was redeemed |
| Q1 | Compact decision batch above | Owner replies in review conversation | Custody + storage-method subset already recorded 2026-09-13 |
| Q2 | Transcribe Q1 answers into worksheet and `docs/OWNER_INPUTS_REQUIRED.md` | Q1 recorded | No planner-invented content |
| Q4 | P1B code start | Q2 + Q3 complete; procedures written; Settled tier per frozen source satisfied | OI05 placeholders acceptable through P1B; O1/O2 are not P1B prerequisites |
| Q5 | O1 Management API re-read (read-only) | Deferred under this review (no network) | Must precede P1C deployment and P1G sign-off |
| Q6 | P1C → P1G | Per phase-file dependencies; OI04 for identity work | Later |

## Prohibited scope reminder

D13–D20 remain **OPEN** for their respective future scopes; they are not closed by this review. Phase 1 business and approval surfaces remain read-only per `docs/MASTER_IMPLEMENTATION_PLAN.md` §3; this does not preclude separately authorised technical Auth or administrative commands. Hadeer's business-owner application authority does not activate later-phase approval writes or routine technical access. No credential contents, no `.env*` reads, no network calls, no staging or commits under this review.
