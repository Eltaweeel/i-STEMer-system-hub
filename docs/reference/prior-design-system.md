# Deputy — Design System v2.0 · "Atlas skin"

**Status:** production candidate · **Token source of truth:** `apps/web/styles/agent-os-tokens.css`
**Design evidence:** `reference/reel-DbcPo0dMQ3d/` (structure) and `reference/reel-DbodbyQD5ls/` (skin)
**Consumes:** `specs/006-agent-os-interface/interface-contract.md`

> **v2 changes the skin, not the architecture.** The three token tiers, the four orthogonal colour
> axes, the component inventory, and the entire accessibility contract are unchanged. What changed:
> the ground is a clamped teal gradient rather than flat black; panels are frosted rather than
> hairlined; radii are softer; label tracking is wider; the organization graph is a **top-down
> hierarchy flowing into a gold memory hub** rather than a radial burst; and bloom is permitted on
> graph objects. Rationale and the frame-by-frame reading are in
> `reference/reel-DbodbyQD5ls/ANALYSIS.md`.

---

## 1. Design thesis

**An operating model rendered as an interactive technical diagram — not a dashboard, and not sci-fi theater.**

Three sentences govern every decision in this system:

1. **The graph explains relationships. The table explains facts. The drawer explains one thing completely.** Every screen is one of those three, or a composition of them in that order of precedence.
2. **Nothing on screen may claim more than the database knows.** A pulse means a persisted run row with a timestamp. "Live" means a captured-at inside the freshness window. Idle is the honest default and is styled as a first-class state, not an absence.
3. **Authority is visible.** A human node never looks like an agent node. An owner-only action never looks like a routine one. A prohibited action is shown as a restriction and is never rendered as an affordance.

If a visual choice cannot be traced to one of those three, it is decoration and gets cut.

### What we deliberately do *not* inherit from the reference material

| Reference posture | Our decision |
|---|---|
| Unreadable 8–9px blurred mono density | 11px floor, mono reserved for system-asserted values |
| Continuous ambient particle/pulse motion | Motion requires a persisted state change |
| "Fully autonomous" as a badge | Autonomy is a five-level property of an **SOP revision**, rendered as a ladder, never as a status pill |
| Agent-persona-centric model | SOP-revision-centric model; the agent is a bounded contract |
| Brand names, exact copy, proportions, logos | Original naming, copy, tokens, composition |

---

## 2. Token architecture

Three tiers, enforced by lint. **Components may only read tier 2 and tier 3.**

```
tier 1  --p-*      primitive   #3aaeff              no meaning, never used directly
tier 2  --*        semantic    --dept-sales-core    the role a value plays
tier 3  --c-*      component   --c-badge-h          per-component dimension
```

### 2.1 The four orthogonal colour axes

This is the single most important rule in the system. Four independent meanings share one screen, and they must never collide:

| Axis | Question it answers | Token family | Encoding |
|---|---|---|---|
| **Department** | Which domain does this belong to? | `--dept-*` | hue |
| **Status** | What is it doing right now? | `--status-*` | glyph + text + tint |
| **Autonomy** | How much may it decide alone? | `--autonomy-*` | ladder position + label |
| **Provenance** | Where did this number come from, how fresh? | `--data-*` | badge + timestamp |

A marketing agent that is blocked is **amber-domain + red-status**. Those are two different marks in two different places — the department accent lives on the node stroke and the left rule; the status lives in a badge with a dot and the word `BLOCKED`. They never merge into one colour.

Each department exposes four slots so nobody invents opacities:

```
--dept-{domain}-core   stroke, icon, chip text        >= 6:1 on all surfaces
--dept-{domain}-tint   10%  chip / node fill
--dept-{domain}-edge   30%  graph edge, section rule
--dept-{domain}-wash    4%  full-lane background band
```

Scope a subtree with `data-department="marketing"` and read `--dept-active-core`. Never hardcode a domain colour in a shared component.

### 2.2 The contrast contract

A gradient ground normally makes contrast variable, which makes AA unprovable. **We solve it by clamping.** `--surface-glow-peak` (`#14313d`) is the lightest pixel any ground may ever reach, and every text token is measured against *that*, not against the dark base. Change the glow and the contrast test fails — deliberately.

Measured worst case across canvas, panel, raised, hover, **and the glow peak**:

| Token | Worst case | Verdict |
|---|---:|---|
| `--text-primary` | 12.4:1 | AAA |
| `--text-secondary` | 7.3:1 | AAA |
| `--text-muted` | 5.2:1 | AA — smallest permitted body text |
| `--text-faint` | 3.6:1 | **decorative / disabled only** |
| `--focus-ring` | 9.3:1 | AAA |
| knowledge (gold) | 9.3:1 | AAA |
| finance · clients | 8.8 · 7.3:1 | AAA |
| communications · marketing | 6.2 · 6.5:1 | AA |
| technology | 5.0:1 | AA |
| sales | 4.7:1 | AA — the floor of the set |
| `--status-blocked-core` | 5.0:1 | AA |
| `--status-unknown-core` | 4.6:1 | AA |

Two structural rules keep those numbers true:

1. **Frost is fenced.** A frosted surface may sit only over `--surface-canvas`, `--surface-panel`, or the clamped glow — never over an image, a chart, or an unbounded gradient. It degrades to the solid ramp where `backdrop-filter` is unavailable, so contrast never depends on a feature that may not be there.
2. **Bloom never sits behind text.** Glow is permitted on graph objects and the memory hub only. A halo under a glyph destroys every ratio above.

### 2.3 Colour is never load-bearing

Three enforced proofs:

1. Every status badge is `dot + UPPERCASE_TEXT`. Removing the dot loses nothing.
2. Every graph node carries a **shape** and a **glyph** unique to its kind, plus a text label at or above the label-visibility zoom threshold.
3. `@media (forced-colors: active)` strips hue, glow, frost, and gradient together. The interface must remain fully operable in that mode — that block in the token file is the acceptance test, not a courtesy. In v2 it is also the proof that the Atlas skin never became load-bearing.

**One deliberate near-collision.** Knowledge gold (45°) sits 17° from marketing orange (28°) — the same collision the reference has. It is safe here only because the memory hub is differentiated by **scale** (96px, the largest object on the canvas), **bloom** (the only element permitted a large one), and **label**. If any of those three go, the hue must change.

---

## 3. Typography

| Role | Size | Family | Weight | Tracking | Used for |
|---|---:|---|---:|---:|---|
| **Metric** | 44px | Mono | 600 | −0.03em | The one number on a stat card. Tabular. **New in v2** |
| Display | 32px | Mono | 600 | −0.02em | Page title only |
| Title | 22px | Sans | 600 | 0 | Section title |
| Heading | 16px | Sans | 600 | 0 | Card / drawer section |
| Body | 14px | Sans | 400 | 0 | Prose, table cells |
| Label | 12px | Mono | 500 | **+0.10em** | Field labels, buttons, nav — UPPERCASE |
| Micro | 11px | Mono | 500 | **+0.14em** | Timestamps, IDs, counts — UPPERCASE, **floor** |

**The mono rule:** sans is for language a human wrote; mono is for a value the system asserts. IDs, versions, hashes, statuses, counts, timestamps, token budgets, correlation IDs — all mono. A purpose statement, a remediation hint, an error explanation — all sans. This is a legibility contract, not a style preference: mono signals "you can copy this and it will match the database".

**v2 widens label tracking** from +0.04em to +0.10em and pushes labels to uppercase. Wide-tracked terminal caps are the reference's most recognisable typographic move, and they cost nothing at 12px — but they are *only* for labels. Never track sans. Never track running prose. Line length caps at 72ch. Never justify.

### 3.1 The stat card — adopted wholesale

The single best idea in the reference: **a metric card prints its own query.**

```
HOURS GIVEN BACK              ← label, 12px mono, +0.10em, uppercase, muted
128h                          ← metric, 44px mono, --data-metric-core
fleet automation vs by hand   ← definition, 14px sans, secondary
SOURCE: TASKS.STATUS='COMPLETED'   ← predicate, 11px mono, --data-source-core
CAPTURED 2026-08-09 07:41 UTC      ← freshness, 11px mono, --text-muted
```

This is `U-R11` — *every displayed metric states its source and freshness* — rendered literally. A metric whose defining predicate is printed beside it cannot quietly drift from what it claims to measure. Every stat tile, chart, and KPI in the product carries both the `SOURCE:` and the `CAPTURED` line. No exceptions, including on `/command`.

---

## 4. Layout

### 4.1 Desktop shell (≥1280px)

```
┌────────────┬──────────────────────────────────────────────────┐
│ sidebar    │ topbar 52px  breadcrumb · search · attention · env│
│ 232px      ├──────────────────────────────────────────────────┤
│            │ toolbar 46px  filters · view switch · freshness   │
│ grouped    ├──────────────────────────────────────────────────┤
│ nav        │                                                  │
│            │  primary surface                                 │
│            │  graph | table | editor | dashboard              │
│            │                              ┌───────────────────┤
│ ────────── │                              │ drawer 480px      │
│ system     │                              │ overlays, does not│
│ strip      │                              │ unmount the page  │
└────────────┴──────────────────────────────┴───────────────────┘
```

- Sidebar collapses to a **56px rail** at 1024–1279px and on user toggle. Rail keeps glyph + tooltip + active indicator.
- Content max width 1600px, centred. Graph canvas ignores the cap and fills.
- The **system strip** is permanent and non-negotiable: `systems live n/m · env · db · runtime · data freshness`. It is the product's honesty indicator.

### 4.2 Breakpoints

| Name | Width | Shell | Graph default |
|---|---|---|---|
| `mobile` | 390 | bottom nav 5 + More sheet | **tree/list primary**, graph is an explicit full-screen action |
| `tablet` | 768 | rail sidebar | list primary, graph in a 60vh pane |
| `laptop` | 1280 | full sidebar | graph primary, drawer overlays |
| `desktop` | 1440+ | full sidebar | graph primary, drawer can dock beside |

**We do not miniaturise the graph.** At 390px a 37-node force layout is unusable, so the tree is the primary representation and carries identical relationship content — which is also exactly what the accessibility requirement asks for. One solution, two problems.

### 4.3 Mobile destinations

Bottom bar, five slots, 44px minimum: `Command · Tasks · Approvals · Team · More`.
`More` opens a full grouped sheet containing every remaining destination. Emergency pause and approval actions must be reachable in ≤2 taps from any screen.

### 4.4 Navigation groups

```
OPERATE      Command · Communications · Funnel · Workflows · Content · Social · Finances
AGENTS       Team · Tasks · Skills · Organization
INTELLIGENCE Knowledge · Doctor
SYSTEM       Connections · Analytics · Reference Model · Roadmap
VARIANTS     Personas
```

Group labels are 11px mono uppercase `--text-muted`. Items are permission-filtered client-side **and** server-authorized; a hidden item is never a security control.

---

## 5. Graph language

The graph is a typed projection of `GraphProjection` from the interface contract. Layout is deterministic (ELK/Dagre) and cached. **Coordinates are never business truth.**

### 5.0 Layout: a top-down hierarchy into the memory hub  *(changed in v2)*

v1 specified a radial burst. v2 specifies a **layered hierarchy that drains into one luminous hub**:

```
                      ◉  human — photo avatar, gold ring, HUMAN label
                      │
                   ◇ conductor
     ┌────────────────┼────────────────┐
   ▣ ▣ ▣            ▣ ▣ ▣            ▣ ▣ ▣     department columns,
   agents           agents           agents     one hue per column
     └────────────────┼────────────────┘
                      ●  MEMORY — gold, 96px, bloom
```

Ranks, top to bottom: **human authority → conductor → department → agent → SOP → tool**, with knowledge as the terminal hub. Use ELK `layered` with `direction: DOWN`, `--graph-rank-gap` between ranks and `--graph-column-gap` between department columns.

Why this beats the radial layout: it puts authority at the top where reading order expects it, it gives every department equal visual weight instead of privileging whichever landed at 12 o'clock, and it gives the eye one place to land. It also linearises cleanly — the tree view is now a literal transcription of the visual order rather than a separate mental model, which makes graph↔tree parity easier to hold and easier to test.

**The memory hub** is the only element in the product permitted a large bloom (`--bloom-hub`). Every department's `--edge-color-memory` edges converge into it with the `--edge-dash-memory` pattern. It routes to `/knowledge`. It is gold, 96px, and labelled — never identified by colour alone.

### 5.1 Node kinds — shape carries meaning before colour does

| Kind | Size | Shape | Glyph | Distinguishing mark |
|---|---:|---|---|---|
| `knowledge hub` | 96px | orb | memory | gold, large bloom, terminal rank — **largest object on canvas** |
| `conductor` | 76px | diamond in orbit ring | hub | only one exists |
| `human` | 52px | circle | photo avatar or person glyph | **2px gold ring + `HUMAN` label — mandatory, always** |
| `department` | 48px | hexagon | group | department core stroke |
| `agent` | 40px | circle | agent glyph | department core stroke, 1.5px |
| `tool` / `connector` | 34px | rounded square | plug / wrench | coral stroke |
| `sop` | 22px | document tag | doc | short label always visible |
| `skill` | 22px | package | box | version suffix in label |
| `knowledge` | 10px | dot | — | clusters above the cap |
| `cluster` | 28px | dashed circle | +n | expandable, count in label |

The human ring is the single most important visual rule in the graph. **A human must never be mistakable for an agent at any zoom level**, including in forced-colors mode, which is why the distinguisher is a ring geometry plus a text label rather than a hue.

### 5.2 Edge kinds

| Data kind | Stroke | Meaning |
|---|---|---|
| `reports_to` | solid 1.5px | authority line |
| `assigned_to`, `executes` | solid 1px | direct assignment |
| `uses`, `reads`, `writes` | solid 1px, dim | resource access |
| `depends_on`, `builds_on` | solid 1px | prerequisite |
| `breaks_into` | dotted `3 4` | decomposition / aggregation into a hub |
| `replaces` | dotted, muted | historical supersession |
| `produces` | solid, arrowhead | artifact output |
| `approves` | solid amber | authority gate |
| *broken dependency* | dashed `5 3` red | missing skill / unavailable tool |
| *active run* | 2s single pulse | **requires a persisted run row + timestamp** |

Every edge carries `accessibleDescription` — a full sentence, e.g. *"Copywriter is assigned to Campaign Content Cycle revision 4."* The tree view renders exactly these sentences. That is how graph/tree parity is tested.

### 5.3 Graph interaction contract

| Input | Behaviour |
|---|---|
| click / `Enter` | open drawer, push `?selected=agent:id` |
| `Escape` | close drawer, **restore focus to the originating node or table row** |
| `/` or `Ctrl/Cmd+K` | search → highlight → centre |
| arrow keys | move between siblings; `Tab` moves between layers |
| double-click | full detail route |
| shift+click | compare two nodes side by side |
| `f` | fit to view · `0` reset · `+/−` zoom |

Viewport, filters, and selection all serialise to the URL. A refresh restores the exact view. A data-version change invalidates a restored viewport rather than showing stale positions.

### 5.4 Performance envelope

37 roles + representative edges must be **interactive within 2s**. Node cap `--graph-node-cap: 600`; beyond it, cluster and show a truncation warning with an explicit expand request. Memoise projection and layout on `dataVersion`.

---

## 6. Component inventory

Build order matters — later rows depend on earlier ones.

### Tier A — primitives (no data dependencies)

| Component | Anatomy | Notes |
|---|---|---|
| `StatusBadge` | dot + UPPERCASE mono label | 9 statuses; `idle` is the default, never blank |
| `AutonomyBadge` | ladder-position marker + label | 5 levels; `prohibited` uses a hatch fill, not red |
| `FreshnessBadge` | clock glyph + relative time + absolute on hover/focus | `fresh` / `stale` / `unknown`; never renders "now" without a timestamp |
| `SampleDataBadge` | violet `SAMPLE DATA` | **persistent in the shell** whenever `meta.source === "fixture"` |
| `RiskBadge` | 5 risk classes | drives confirmation strength |
| `DepartmentChip` | dot + name | reads `--dept-active-*` |
| `EntityRefLink` | glyph + label + kind | every reference in the product routes through this |
| `KeyValueRow` | mono key / value | policy tables |
| `CopyableId` | mono + copy affordance | IDs, hashes, correlation IDs |
| `Button` | 4 variants: quiet · default · primary · destructive | primary uses `--dept-active-core`, max one per panel |
| `ConfirmAction` | typed-confirmation dialog | required for owner-only + irreversible |

### Tier B — states (every surface must import these)

`LoadingState` · `EmptyState` · `SampleState` · `PartialState` · `StaleState` · `OfflineState` · `DeniedState` · `NotFoundState` · `BlockedState` · `DependencyUnhealthyState` · `ErrorState`

Each renders: an icon, a one-line **definition** of the state, what the user can do, and — where applicable — a correlation ID. `DeniedState` and `NotFoundState` render **identically** so a deep link cannot be used to probe for hidden entities.

### Tier C — shell

`AppShell` · `Sidebar` · `SidebarRail` · `MobileBottomNav` · `MoreSheet` · `TopBar` · `Breadcrumb` · `AttentionCounter` · `SystemStrip` · `CommandPalette` · `PageToolbar` · `ViewSwitch (graph|tree|table)` · `FilterBar` · `Drawer` · `FullScreenSheet`

### Tier D — domain

`OrganizationGraph` · `DepartmentGraph` · `KnowledgeGraph` · `GraphToolbar` · `GraphLegend` · `OrganizationTree` · `EntityTable` · `AgentCard` · `AgentTable` · `AgentDetail` · `PolicyPanel` · `ProhibitedActionsPanel` · `BudgetPanel` · `SopDetail` · `AutonomyLadder` · `SopStepList` · `DependencyHealthPanel` · `SkillDetail` · `PersonaPreview` · `PersonaDiff` · `DoctorSummary` · `CheckCard` · `RunTimeline` · `UsageMeter`

### 6.1 The four components that define the product

**`AutonomyLadder`** — five rungs, always all five shown, current rung marked, each rung stating: what the system does, what the human still does, required approval tier, and rollback. This is the component that makes the product *explainable*. It attaches to an SOP revision and to nothing else. There is no global autonomy switch anywhere in the UI.

**`ProhibitedActionsPanel`** — renders `prohibited_actions` from the manifest as read-only restrictions with a strike/lock glyph. **It must be structurally impossible for this panel to emit a command.** Prohibited actions are content, never controls.

**`SampleDataBadge`** — persistent, in the shell chrome, not per-widget. If the fixture adapter is live, the operator knows on every screen.

**`SystemStrip`** — `systems live n/m`, environment, database, runtime, freshness. The `n/m` denominator has a precise published definition and shows `unknown` rather than guessing.

---

## 7. Drawer specification

Desktop 480px (560px wide variant for SOPs), right-anchored, overlay with scrim. Mobile: full-screen sheet. Sticky header, sticky action footer when content exceeds the viewport.

Canonical section order — the same order for every entity kind, so operators build muscle memory:

1. Breadcrumb + close
2. Title + kind + department
3. Status · Autonomy · Risk (three separate marks)
4. Purpose (sans, plain language, no jargon)
5. Version / revision / hash / skill package
6. Inputs · Outputs · Tools
7. Breaks into · Builds on · Depends on · Replaces · Produces
8. Autonomy ladder
9. The human — who is accountable and what they still decide
10. Assigned agents and humans
11. Steps and completion tests
12. Current and recent runs, evidence, usage
13. Audit link + correlation IDs

Focus is trapped while open. On close, focus returns to the originating node or row — verified by E2E in 100% of cases, per SC-009.

---

## 8. State catalogue

Every route implements all eleven. This is enforced by a per-route test, not by discipline.

| State | Rule |
|---|---|
| loading | skeleton matching final layout; never a spinner over the whole page |
| empty | explains *why* it is empty and the next action |
| sample | violet badge + `meta.generatedAt` |
| partial | shows what is missing and what is trustworthy |
| stale | shows `capturedThrough` and how stale, in absolute time |
| offline | deterministic content stays; only model-dependent affordances disable |
| denied | generic, identical to not-found |
| not found | generic, identical to denied |
| blocked | states the **exact decision required** and who can make it |
| dependency unhealthy | names the missing skill/tool and links to it |
| error | plain-language cause, retry, correlation ID; no stack traces |

---

## 9. Motion

| Event | Duration | Easing |
|---|---:|---|
| hover / press | 90ms | standard |
| drawer open | 200ms | standard |
| drawer close | 140ms | exit |
| node/edge transition | 200ms | standard |
| department switch | 260ms interpolate if layout is stable, else crossfade |
| pan / zoom | direct, no easing, no elastic |
| **active-run pulse** | one 2s subtle pulse | **requires persisted run + timestamp** |

Under `prefers-reduced-motion`, all durations collapse to 0 and the active-run pulse becomes a static ring. The `RUNNING` text badge carries the meaning in both modes — the animation is never the only signal.

There are no ambient animations. No drifting particles, no breathing nodes, no simulated thinking. An idle system looks idle.

**Bloom is static, and that is the point.** v2 permits glow on graph objects, which creates an obvious trap: a glowing node reads as an alive node. It is not. Bloom is a *depth* device tied to node kind and department, applied identically whether the role has run today or never. Activity is signalled only by the pulse, which requires a persisted run row plus a timestamp (`U-R3`). If you ever find yourself animating a bloom, you have re-invented the fake-activity theatre this product exists to avoid.

---

## 10. Accessibility contract

Target: **WCAG 2.2 AA**. Non-negotiables:

- Graph has a synchronized tree/table with identical entity and relationship content, tested by comparing accessible descriptions.
- Full keyboard operation of the graph: search-to-node, arrow traversal, Enter to open, Escape to close, focus restoration.
- Visible focus everywhere; the single `--focus-ring-shadow` treatment; never `outline: none` without a replacement.
- 44px minimum touch targets under `pointer: coarse`.
- 200% zoom and 320px reflow without loss of function.
- Screen-reader announcement of selected node, its kind, status, department, and relationship count.
- Live regions for status changes, throttled — never announce a heartbeat.
- Text alternatives for every glyph; icons never appear alone for unfamiliar actions.
- `forced-colors` mode fully operable.
- Layouts tolerate RTL and ~35% string expansion; no hardcoded left/right, use logical properties.

---

## 11. Iconography

One family (Lucide) for chrome; custom SVG glyphs for the nine graph entity kinds. 1.5px stroke, consistent caps, 16px in chrome, 20px on primary actions, scaled inside nodes. No emoji anywhere in the product.

---

## 12. Originality guardrails

Two reference products informed this system. Neither may appear in ours.

**Never ship:** `Bennett OS`, `Optimal Engine`, `G-Brain`, **`Atlas`**, either source logo, source demo copy, names, numbers, personas, agent names (`Chief`, `Mason`, `Daryl`, `Norma`), stat wording, exact proportions, or any reference frame.
**Reference frames** in `claude-handoff/reel-DbcPo0dMQ3d/reference-frames/` and `docs/design/agent-os/reference/reel-DbodbyQD5ls/` are private design evidence. A build check asserts no filename or hash from **either** folder appears in `apps/web/public`, in any source import, or in production output.

What we took from the second reference is a *posture* — atmospheric ground, frosted panels, a hierarchy draining into a memory hub, wide terminal caps, and printed source predicates. What we did not take is their composition, their palette values, their vocabulary, or their name.

**Do carry forward:** graph-first orientation, department colour domains, relationship-aware drawers, the autonomy ladder, persona bundles, conductor-centred hierarchy, dense-but-accessible technical posture.

---

## 13. Definition of done for the design system

- [ ] Token file present; every semantic name exists and no component references a `--p-*` primitive.
- [ ] Contrast table verified by an automated test, not by eye.
- [ ] All Tier A and Tier B components have tests including a colour-blind/forced-colors assertion.
- [ ] `AutonomyLadder` renders all five levels and cannot be attached to an agent.
- [ ] `ProhibitedActionsPanel` cannot emit an action — proven by a test.
- [ ] Fixture mode shows `SAMPLE DATA` in the shell on every route.
- [ ] Reduced-motion and forced-colors snapshots exist for the graph.
- [ ] Screenshots at 390 / 768 / 1280 / 1440 for shell, graph, tree, drawer.
- [ ] No serious axe violations on any tier-C or tier-D component.
