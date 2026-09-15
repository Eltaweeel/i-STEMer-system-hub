# Business Agent OS — Design handoff

**Artifact:** `Business Agent OS v2 (final).dc.html`
**Previous version preserved:** `Business Agent OS v1 (previous).dc.html`
**Runtime:** single-file Design Component. Requires `support.js` beside it. One remote dependency: IBM Plex Sans + Plex Mono from Google Fonts (self-host on implementation).
**Sample data:** every business fact is fixture data labelled `SAMPLE SCENARIO — NO LIVE EXTERNAL ACTIONS` in the persistent top bar.

---

## 1. Screen and route inventory

Two modes on one shell. Mode switch is in the top chrome and in the mobile More sheet.

### Owner view (default — Hadeer)

| Route key | Screen | Purpose |
|---|---|---|
| `today` | Today / Owner Overview | Morning briefing, the one decision that comes first, done / underway / blockers / recommendations, current objective |
| `approvals` | Needs Your Approval | Package list; detail view with exact action, exact revision, evidence, rehearsal, decision paths |
| `campaign` | Campaigns | Seven-stage sample campaign: objective → brief → plan → creative → decision → next → live |
| `studio` | Designer Studio | Brief, brand kit, references, channels, three directions, QA, provenance, feedback, version comparison, export package |
| `team` | AI Team | Four members, plain-language status, current assignment, recent output, hard limits |
| `results` | Results and Recommendations | Sample / expected / real columns kept apart; real never shown as zero |
| `ask` | Ask the Team | Free-text entry, routing explanation, "make this a formal objective" step |

### Operator / Admin view

| Route key | Screen |
|---|---|
| `org` | Org topology — graph + role/authority table |
| `manifests` | Agent manifests and permissions; capabilities deliberately absent |
| `sops` | SOP revisions + step table for SOP-CAMP-002 rev 4 |
| `runs` | Workflow run states |
| `artifacts` | Evidence and artifact records incl. provenance and licensing |
| `rules` | Approval rules + rule-layer invariants |
| `connectors` | Connector health |
| `memory` | Shared knowledge / operational memory status |
| `cost` | Model usage and cost visibility |
| `audit` | Audit trail (append-only, includes decisions taken in session) |
| `diagnostics` | Fixture and schema diagnostics |
| `system` | System health and blocked states |

## 2. Navigation maps

- **Owner desktop:** left rail (labelled list) → 7 routes; team roster below nav; context aside on the right ≥1440px.
- **Operator desktop:** same rail, 12 routes.
- **Tablet 1024–1279:** rail collapses to a 64px glyph rail with `title` + `aria-label` tooltips.
- **≤1023px:** rail hidden. Fixed bottom bar with 4 primary destinations + **More**, which opens a real sheet dialog listing every route of the current mode plus mode and theme switches. Team appears as a horizontal status strip at the top of main.
- Owner bottom bar: Today · Approve · Campaign · Studio · More. Operator: Org · Agents · Runs · Audit · More.

## 3. Design tokens

All tokens are CSS custom properties on `:root`, with a dark override under `[data-theme="dark"]` and `prefers-color-scheme`.

**Colour — chrome and surface:** `--deep --canvas --nav --panel --raised --hover --panel-fill --panel-border --hair --surface-glow --grid`
**Colour — text:** `--text --text2 --muted --faint` (light-mode `--muted` #415B66 and `--faint` #546E79 both clear AA on white)
**Colour — brand:** `--brand` #B3D100 (chrome and selection only), `--brand-text` (AA-safe text lime), `--on-brand`
**Colour — domain hues:** `--exec` (Hermes), `--marketing` (Market Intelligence), `--social` (Social Media), `--creative` (Designer)
**Colour — status:** `--ok --amber --error --status`
**Type:** `--sans` IBM Plex Sans, `--mono` IBM Plex Mono. Scale: body 15px/1.6, small 14px, lead 17px, h3 17px, h2 20px, h1 28px (24px ≤1023), mono labels 12px, table cells 13–14px. **12px is the absolute floor and is used only for uppercase mono labels, never for reading copy.**
**Spacing:** `--s1` 6 · `--s2` 10 · `--s3` 14 · `--s4` 18 · `--s5` 24 · `--s6` 32
**Radii:** `--r-sm` 6 · `--r-md` 8 · `--r-lg` 14 · `--r-xl` 16
**Borders:** 1px `--panel-border` default; 2px for a decision surface; 4px left border for domain attribution; 3px top border for category.
**Elevation:** flat by default. Dark mode uses `--blur` (14px) on `--panel-fill`; light mode uses solid panels and `--hub-shadow`. Dialogs use a `rgba(5,12,9,.62)` scrim.
**Motion:** `--motion` 180ms cubic-bezier(0.2,0,0,1), used only on button background. No entrance animation, no fake activity. All motion disabled under `prefers-reduced-motion`.

## 4. Component inventory

| Component | Attribute hook | Variants |
|---|---|---|
| Card | `data-card` | default, `raised`, `flat` |
| Label / eyebrow | `data-label` | inherits colour override |
| Body copy | `data-body` | default, `lead`, `small` |
| Headings | `data-h1` `data-h2` `data-h3` | — |
| Meta line | `data-meta` | — |
| Button | `data-btn` | default, `primary`, `ghost`, `danger`, `small`; `:disabled` at .55 opacity |
| Chip | `data-chip` | optional `data-dot` status dot |
| Grid | `data-grid` | `2` (min 300px), `3` (min 240px) |
| Table | `data-scroll` + `data-table` | one generic operator table renderer driven by `{caption, cols, mono[], rows[][]}` |
| List | `data-list` | em-dash marker |
| Input | `data-input` | text, textarea, select |
| Dialog | inline `role="dialog"` | approve (typed confirm), request changes (checklist), reject (reason select), More sheet |
| Creative preview | bespoke | three structures: A ivory/rule, B green+lime panel, C dark overlap type. Text comes from data so a revision re-renders the same structure. |

## 5. Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥1440 | 248px rail · fluid main · 300px context aside |
| 1280–1439 | rail + main; context aside hidden |
| 1024–1279 | 64px glyph rail + main |
| ≤1023 | single column, bottom bar + More sheet, team status strip, `h1` 24px, main padding 16px with 96px bottom inset so nothing hides under the bar |

`html, body { overflow-x: hidden }`; every grid child is `min-width: 0`; every table sits in a `data-scroll` container. No document-level horizontal scroll at 1440×900, 1024×768 or 390×844.

## 6. Interaction and state transitions

Functional in the prototype: mode switch · route nav (rail, glyph rail, bottom bar, More sheet) · theme toggle (persisted in `localStorage` key `baos-theme`) · design-state selector · campaign stage stepper · direction selection · structured feedback → revision v2 · before/after version toggle · evidence disclosure · technical-reference disclosure (open by default in Operator mode) · approve with typed confirmation · request changes · reject with reason · reset sample decision · ask-the-team send → routing → draft objective · audit append.

No control is rendered active unless it does something. The locked live-publication package is `disabled` with the reason printed beside it.

## 7. Approval-state model

States: `awaiting` → (`staged` | `changes` | `rejected`); `locked` for live publication. `invalidated` is a flag, not a state.

Invariants, all enforced in the logic layer and surfaced in Operator › Approval rules:

1. An approval binds to one action **and** one artifact revision (`CRE-DIR-B · v2 · hash …`).
2. A material change produces a new revision, sets `invalidated`, and returns the package to the owner.
3. No actor may approve its own work; conductor and specialists hold zero approval rights.
4. External actions run only on the restricted publication path.
5. Staging approval and live-publication approval are separate decisions with separate confirmation phrases.
6. A chat reply can never move an approval state.
7. `approved` ≠ `executed` ≠ `executed and externally verified`. The third state is unreachable in this build because no verification service exists, and the design state selector says so.
8. Owner authority and technical-operator authority are distinct and neither can perform the other's decisions.

Design states covered by the `STATE` selector: default, loading, empty, awaiting first run, blocked by approval, dependency unavailable, permission denied, error, changes requested, rejected, approved for staging, awaiting live approval, completed and verified.

## 8. Sample fixture / data contracts

Constants at the top of the logic class, ready to swap for API responses:

- `TEAM[]` — `{id, name, short, role, hue, status, tone, plain, assignment, outputs[], limits[], work}`
- `DIRECTIONS[]` — `{key, slot, name, label, hue, rationale, v1{…}, v2{…}}` where a version is `{kicker, head, head2?, sub, foot, numeral?}`
- `QA{dir: [{check, result, detail}]}` — result string starts with `PASS` / `ATTENTION`; colour is derived, not stored
- `PLAN[]` — `{day, channel, format, hook, caption, time}`
- `PACKAGES[]` — `{id, title, tier, requester, deadline, cost, word, hasPreview, locked?, lockReason?, summary, facts[], will[], wont[], evidence[], risk, reversal, decisionNote, next[]}`
- `FEEDBACK[]`, `REJECT_REASONS[]`, `STATES[]`, `OWNER_ROUTES[]`, `OP_ROUTES[]`, `NODES{}`, `EDGES[]`
- `OP{route: {tables:[{caption, cols, mono[], rows[][]}], notes:[{label, body}]}}`
- `state.audit[]` — `{t, actor, what, ref}`; append-only, newest first

Fixture identity: `BATCH-2026-08-30`, schema v4, frozen at `2026-08-30 08:40 Africa/Cairo`.

## 9. Accessibility requirements

- Skip link to `#main`, visible on focus.
- Landmarks: `main`, `aside[aria-label]`, `nav[aria-label]`, `section[aria-labelledby]` on the primary decision.
- 3px `:focus-visible` outline with 2px offset, on every interactive element.
- Buttons 44px minimum height (`min-height: 44px`; bottom-bar items 56px); `@media (pointer: coarse)` enforces 44px on all controls.
- Dialogs: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape to close, overlay click to close, `autoFocus` on the confirmation field, `aria-describedby` on the hint.
- `aria-current="page"` on the active route, `aria-current="step"` on the active campaign stage, `aria-pressed` on the mode and version toggles, `aria-expanded` on disclosures.
- `aria-busy` + `aria-live="polite"` on the loading skeleton; `aria-live="polite"` on routing and objective results.
- Body copy 15px; 12px reserved for uppercase mono labels. No information carried by colour alone — every status dot is accompanied by a word.
- Decorative SVG texture is `aria-hidden`; the org graph carries a full sentence `aria-label` and is backed by the role/authority table.
- `prefers-reduced-motion` disables all transitions.

## 10. Asset list and provenance

- **Type:** IBM Plex Sans, IBM Plex Mono — open licence. Self-host for production.
- **Imagery:** none. Every creative preview is typography, colour and shape from the brand kit. The system holds no stock licence and no agent may buy one.
- **`PHOTO-SLOT-01`:** recorded as an unfilled image requirement, not filled with a stand-in. Friday's reel cannot run until Hadeer supplies a photo or clip. This is deliberate and is surfaced in three places (plan, provenance, blockers).
- **No icon set.** Glyphs are two-letter mono abbreviations.

## 11. Copy and content inventory

Owner-facing copy is business language; technical truth is relocated, never deleted.

| Old (v1) | New (v2) | Where the technical form now lives |
|---|---|---|
| "9 of 9 steps not started" | "0 of 9 steps started" | Operator › Workflow runs |
| "unknown" | "Awaiting first run" / "To be measured" / "Not visible — no meter" | Operator › Diagnostics, Cost |
| "Publish Q3 campaign landing copy" | "Approve creative direction for staging review" | package `facts` + Operator › Approval rules |
| `artifact://drafts/…`, hashes, run ids inline | behind **View technical references** | open by default in Operator mode |
| "SOURCE: RUNS WHERE …" under every stat | plain sentence + **View evidence** | Operator tables keep the predicate form |
| "DISABLED · READ-ONLY DEMO" on live controls | real, working controls; only the live-publication package is locked, with its reason stated | — |

## 12. Intentionally sample-only

- The whole autumn-cohort campaign, its brief, plan, three directions and revision.
- Fixture counts (486 enquiry notes, 214 cohort records, 543 public pages, 1,284 indexed items).
- Model call-count estimates on the Cost screen — labelled `(SAMPLE)`, never a currency figure.
- `SAMPLE-RUN-0001`, the only run row that exists.
- Decisions taken in the prototype live in the browser session; a reload restores the starting state.

## 13. Screens that must not imply real backend capability

- **Live publication (`APR-2103`)** — must stay unrequestable until a verified staging run exists.
- **Cost** — must never print a currency figure without a usage meter.
- **Results › Real results** — must never render a missing value as `0`.
- **Connectors** — four connectors are absent by design; do not stub them to green.
- **System health › Verification service** — the "completed and externally verified" state must remain unreachable without external evidence.
- **Ask the Team** — conversational replies must never move an approval state.

## 14. Acceptance checklist for production implementation

- [ ] Approval writes are rejected server-side unless actor = owner, tier matches the rule, and the artifact hash matches the one displayed.
- [ ] A new artifact revision invalidates every approval bound to the previous hash, server-side.
- [ ] Conductor and specialist identities cannot call the approval endpoint at all.
- [ ] Publication endpoint requires: verified staging evidence row + live-tier approval + typed phrase. All three, checked server-side.
- [ ] Missing measurements return `null` and render as "Awaiting first run"; the client never coerces `null` to `0`.
- [ ] Audit rows are append-only and immutable; every row carries actor, action, artifact revision, hash, timestamp and tier.
- [ ] Hashes, run ids and SOP revisions appear in the owner surface only behind progressive disclosure.
- [ ] No progress indicator renders for work with no started steps.
- [ ] Cost surfaces render "not visible" unless a usage meter is connected.
- [ ] Keyboard: full traversal of nav, campaign stepper, disclosures and all three dialogs; Escape closes dialogs; focus returns to the invoking control.
- [ ] AA contrast verified in both themes after any palette change.
- [ ] No horizontal document scroll at 1440×900, 1024×768, 390×844.
- [ ] Fonts self-hosted; no third-party runtime dependency.
