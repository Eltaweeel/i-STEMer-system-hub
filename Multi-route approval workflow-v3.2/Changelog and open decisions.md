# Changelog and open decisions — Business Agent OS

## What changed from v1

**Structure**
- v1 was a single operator command centre with eight routes. v2 has **two modes** on the same shell: Owner view (7 screens, default) and Operator view (12 screens). Density, copy register and disclosure differ; tokens and components do not.
- Added the screens the product was missing: Today/Owner Overview, Campaigns, **Designer Studio**, AI Team, Results and Recommendations, Ask the Team, plus operator screens for evidence/artifacts, approval rules, connector health, shared knowledge, model usage and cost, and fixture/schema diagnostics.

**From read-only demo to working prototype**
- v1 disabled every consequential control and labelled it `DISABLED · READ-ONLY DEMO`. v2 makes the primary path genuinely clickable: overview → sample campaign → market brief → seven-day plan → three creative directions → select → request changes → revision v2 with comparison → approval package → typed confirmation → approved for staging → audit record.
- Approve / Request changes / Reject are real dialogs with real consequences in session state. The only locked control is live publication, and its lock reason is printed next to it.
- The rehearsal is now the "What will happen / What will not happen" pair on the package itself, replacing v1's four-step traversal animation. The graph no longer animates at all.

**Sample scenario**
- Replaced the empty Q3 fixture with one labelled end-to-end campaign: the autumn Saturday cohort. Believable for i-STEMer, with no invented performance data, no real customer information and no claim that a live integration exists. Persistent top-bar label: `SAMPLE SCENARIO — NO LIVE EXTERNAL ACTIONS`.
- Market Intelligence output separates observation, assumption and confidence, and cites its own fixture sources rather than inventing external ones.
- Designer Agent output is three structurally different compositions with real artwork, brand kit, dimensions, contrast ratios, safe-area and Reels-crop checks, brand-compliance status, provenance and licensing, and version history.

**Copy and hierarchy**
- "9 of 9 steps not started" → "0 of 9 steps started". "unknown" → "Awaiting first run" / "To be measured" / "Not visible — no meter", per what the value actually means.
- "Publish Q3 campaign landing copy" → "Approve creative direction for staging review", because the action only touches staging.
- Hashes, run ids, SOP revisions and source predicates moved behind **View technical references** and **View evidence** in Owner view; shown by default in Operator view. Nothing technical was removed.
- The owner's primary decision now sits directly under the briefing at the top of Today.

**Accessibility and responsive**
- Body copy raised to 15px; mono 12px floor is now reserved for uppercase labels only. Light-mode `--muted` and `--faint` darkened for AA. `--brand-text` split from `--brand` so lime never carries small text.
- Skip link, landmarks, `aria-current`, `aria-pressed`, `aria-expanded`, `aria-live`, 3px focus ring, 44px minimum targets, Escape-closable dialogs, reduced-motion support.
- Mobile chrome simplified: 4 destinations + a real **More** sheet instead of the whole desktop nav; team collapses to a horizontal status strip; 96px bottom inset so no action hides under the bar.

**Technical quality**
- Repeated inline values replaced with attribute-hook components (`data-card`, `data-btn`, `data-table`…) and spacing/radius/motion tokens, so visual values are centralised.
- One generic operator table renderer replaces twelve bespoke tables.
- Valid document title set. No unresolved template holes, no broken SVG attributes, no console errors.
- v1 preserved unchanged as `Business Agent OS v1 (previous).dc.html`.

**What was deliberately kept**
Lime / deep-green / ivory / magenta / violet palette; IBM Plex pairing; the command-centre character; the organisation graph with its authority and convergence edges; honest state semantics; the autonomy and approval-tier model; the refusal to show missing data as zero.

---

## Verification results

| Check | Result |
|---|---|
| Browser console | No errors, no warnings |
| Main interaction path | Verified: overview → decision → studio → feedback → revision v2 → approval → typed confirm → approved for staging → audit row with exact revision and hash |
| Mode switch, both navs, More sheet, theme, state selector | All functional |
| Desktop 1440×900 | 3-column shell, context aside present, no horizontal scroll |
| Tablet 1024×768 | 64px glyph rail + main, tables scroll inside their containers, no document scroll |
| Mobile 390×844 | Single column, bottom bar + More sheet, team status strip, 44px+ targets, no document scroll |
| Keyboard | Skip link, full nav traversal, disclosures, all three dialogs, Escape closes |
| Contrast | AA verified for body, labels and controls in both themes; two creative-preview colour pairs are flagged inside the Brand QA table by design, since flagging them is the feature |
| Reduced motion | All transitions suppressed |

---

## Open product decisions (yours, not mine)

1. **Does the Operator view need a real second persona?** It is currently "unassigned". If a technical operator will exist, they need their own identity, session and audit actor — and a rule about what they may see in the owner's evidence.
2. **Where does verification evidence come from?** The "completed and externally verified" state is unreachable until you decide what counts as proof of a published post — a platform API read, a screenshot, or Hadeer's own confirmation.
3. **Does live publication ever get a review window?** Rung 4 (act after a declared delay unless held) exists in the model but is not offered anywhere in this prototype. It may be the right answer for recurring weekly posts.
4. **Who supplies imagery, and when?** The system deliberately holds no stock licence. If Hadeer will not reliably supply photographs, the plan needs a channel mix that does not depend on them.
5. **Should approvals expire?** A package has a deadline but nothing happens when it passes. Silent expiry, escalation, or nothing at all — all three are defensible.
6. **Durable audit.** Decisions currently live in the browser session. Persistence, retention period and export format are unresolved.
7. **Cost visibility threshold.** If a usage meter is connected, does Hadeer see per-campaign cost, monthly cost, or only an alert when a threshold is crossed?
8. **Does "Ask the Team" become a channel or stay a doorway?** Today it routes and stops. A real conversation thread is a different product surface with its own consent risk.
