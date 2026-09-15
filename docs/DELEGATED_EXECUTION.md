# Delegated execution — plan record

2026-09-13. Records the current delegation plan. **Owner instructions always outrank this document.** Read with [MASTER_IMPLEMENTATION_PLAN.md](MASTER_IMPLEMENTATION_PLAN.md), [IMPLEMENTATION_PHASES.md](IMPLEMENTATION_PHASES.md), [TRACEABILITY_MATRIX.md](TRACEABILITY_MATRIX.md), [OWNER_INPUTS_REQUIRED.md](OWNER_INPUTS_REQUIRED.md), [OI01-OI03_DECISION_WORKSHEET.md](OI01-OI03_DECISION_WORKSHEET.md), and the [OI01-OI03 operations runbook](OI01-OI03_OPERATIONS_RUNBOOK.md).

## Roles (this relay profile)

- **Owner (Abdo; Hadeer for owner recovery within recorded scope).** Supplies decisions in the review conversation. Never asked to edit files or relay text between agents.
- **Claude (Opus, high) — lead planner, orchestrator, reviewer.** Owns plan, briefs and review of every delta. May perform authorised read-only checks and edit planning docs to keep them coherent.
- **Codex — delegated implementer.** Executes one scoped brief at a time via the desktop coordinator relay. No recursive sub-delegation.

Role reassignment recorded 2026-09-13 in [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md); owner instructions supersede any earlier wording in this file.

## Standing constraints

- Owner answers reach the repo only by agents transcribing what the owner recorded in Codex conversation. Nothing here invents identities, custodians, alternates, providers, addresses, secrets, roles, approvals or intervals.
- No stage, commit, push. Preserve existing dirty and untracked work.
- Credentials, tokens and recipient addresses are never printed or stored in-repo; references only.
- No identity creation or invitation before OI04, and no dependent tests until OI04 authorises them. Other Auth Admin activity is scoped per brief, not pre-blocked here.
- No unapproved deployment, migration application, or destructive database/Storage effect.
- Existing guards (RLS, grants, PGlite baseline, dependency/boundary lint) are not weakened to pass a check.
- Historical or stubbed evidence stays historical; PGlite is not real-service proof; advisor inference is not direct evidence.

## Brief shape (practical, not ceremony)

Claude briefs Codex to implement one scoped packet at a time, stating scope, entry prerequisites drawn from `IMPLEMENTATION_PHASES.md`, allowed files, checks to run, and expected outcomes. Prior authorisations carry forward; each brief adds only what its new scope needs. If a phase dependency, rehearsal requirement, or evidence claim is ambiguous, Codex flags it for Claude to reconcile against source rather than inventing a bypass.

**Three-tier gate — Settled → Configured → Rehearsed.** P1B code start requires OI01–OI03 **Settled** (owner decisions recorded and procedures written), satisfying frozen source [FULL_PROJECT_MASTER_PLAN.md §17](product-architecture/FULL_PROJECT_MASTER_PLAN.md). **Configured** delivery is required at each earliest live operation per [OWNER_INPUTS_REQUIRED.md](OWNER_INPUTS_REQUIRED.md) and is not deferred to P1G. Each rehearsal is an explicitly authorised isolated packet; its redacted evidence becomes the **Rehearsed-tier gate** for the operation it certifies. A rehearsal is not itself gated by that operation; rehearsals needing live identities remain blocked on OI04. Full reconciliation is in [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md).

## Current gate state

| Gate | State | Source |
| --- | --- | --- |
| P1A catalog-baseline closure | PASS (catalog only, not live runtime) | [baseline evidence](evidence/phase-1/baseline.md) |
| O1 API exposed-schema live read | UNVERIFIED; required before P1C deployment and P1G sign-off | baseline §"Exposed schemas" |
| O2 `rls_auto_enable` hardening decision | OPEN hardening decision; remediation proposed in evidence, not executed; may be planned with P1C | baseline §D2 |
| OI01–OI03 operational inputs | Settled tier PARTIAL — custody + password-manager storage-method + emergency-only technical backup recorded 2026-09-13 (see §"Next owner intake" below and [OWNER_INPUTS_REQUIRED.md](OWNER_INPUTS_REQUIRED.md)). Remaining Settled-tier decisions consolidated in the compact batch in [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md). Configured/Rehearsed tiers gated per each earliest live operation | [worksheet](OI01-OI03_DECISION_WORKSHEET.md) |
| Baseline preservation manifest/archive reference | PASS — source-only snapshot independently verified (149 copied, 0 skipped, 0 tracked deletions); durable copy retained under `Building\_preservation\business-agent-os\20260913T170057Z-5c425e3ab1c4`; no environment/DB/Auth/Storage backup claim | [baseline evidence](evidence/phase-1/baseline.md) and out-of-repo archive |
| OI04 identity/invitation authorisation | NOT AUTHORISED; gates identity creation, invitations, and dependent tests only | [owner inputs](OWNER_INPUTS_REQUIRED.md) |
| OI05 nonproduction origin/DNS/TLS | Not supplied; may remain placeholders through P1B, required by P1G | [phases §P1B / §P1G](IMPLEMENTATION_PHASES.md) |
| OI06 / OI07 / OI08 / OI09 / OI10 | Not supplied; each gates its named phase or test only | [owner inputs](OWNER_INPUTS_REQUIRED.md) |
| D13–D20 | Open; gate P2–P4 capabilities as they arise | [decision register](DECISION_REGISTER.md) |

## Queue

| # | Packet | Prereqs (per source) | State |
| --- | --- | --- | --- |
| Q0 | Documentation reconciliation (this task) | — | DONE |
| Q1 | Compact owner decision batch per [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md) (custody + storage-method + emergency-only backup subset already recorded 2026-09-13) | Owner replies in review conversation | NEXT |
| Q2 | Transcribe recorded owner answers into worksheet and `OWNER_INPUTS_REQUIRED.md` | Q1 answers recorded | DONE for the 2026-09-13 facts; remaining Q1 choices are still pending |
| Q3 | Source-only preservation snapshot (see [PLANNING_DEBATE_2026-09-13.md](PLANNING_DEBATE_2026-09-13.md)); Codex brief dispatched 2026-09-13 | Master plan §2 preservation requirement; safe local source-only work; inventory observed at execution | DONE — 149 copied, 0 skipped, 0 tracked deletions; temp and durable archives independently verified. Codex Luna Reserve Max CLI was rejected at startup by the exhausted primary limit; coordinator completed the narrowly scoped source-only fallback. No reserve credit was redeemed |
| Q4 | P1B runtime/contracts/test foundations | Per [phases §P1B](IMPLEMENTATION_PHASES.md): P1A plus OI01–OI03 **Settled tier** per three-tier gate; OI05 may be placeholders; O1/O2 are not P1B prerequisites | pending Q2 and Q3 |
| Q5 | O1 live read (Management API GET, read-only) | Already-scoped read-only authorisation; **deferred: no network calls under the current review** | must precede P1C deployment and P1G sign-off |
| Q6 | P1C → P1D → P1E → P1F → P1G briefs | Each phase's dependencies in `IMPLEMENTATION_PHASES.md`, incl. OI04 for identity/invitation activation and dependent tests; O2 planned with P1C per baseline §D2 | later |

## Next owner intake (Q1)

The remaining OI01–OI03 choices are presented as one compact owner batch in the planning debate. The custody, emergency-only backup and Bitwarden Free storage choices below are already recorded and are not re-asked:

1. **Recorded 2026-09-13:** primary technical custodian Abdo; backup Hadeer with emergency-only technical access if Abdo is unavailable. Hadeer separately has business-owner application access for critical/major approvals within approved product scope. Emergency activation and per-secret access remain unresolved.
2. **Recorded 2026-09-13:** use **Bitwarden on the Free plan**; no Premium upgrade, standing shared access, or emergency-access arrangement is approved. Setup is unverified. Owner reports no system passwords created yet; no credential inventory was performed.
3. **Recorded 2026-09-13:** `istemer.org` is a candidate sender-domain root only; the owner currently lacks access. SMTP provider, sender identity, DNS control and delivery configuration remain open. The supplied personal email is contact information only; its address is not stored and it does not settle identity verification.

These initial answers are recorded. Codex consolidates the remaining OI01–OI03 rows into a single reviewed decision batch for the owner. Agents then transcribe the recorded answers into the worksheet and `OWNER_INPUTS_REQUIRED.md`. Rehearsals remain separately scheduled and are not implied by recorded decisions.
