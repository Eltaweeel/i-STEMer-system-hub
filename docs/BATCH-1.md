# Batch 1 — Boundary and walking slice

This is the binding spec for the first implementation batch of the Business Agent OS core and its
first tenant deployment, the i-STEMer demo. It supersedes any earlier plan document on the points
it covers.

## What this product is

A **fixtures-only, read-only visual operating system** for managing AI agents. It must feel like a
real product while remaining honest about what is simulated. There is no backend, no database, no
authentication, no live agent runtime, no connectors, and no external actions of any kind in this
phase — and the interface must say so, permanently and visibly.

The human principal is **Hadeer**. The organization is:

```
Hadeer  (human authority)
  |
Hermes Conductor
  |-- Marketing Agent
  |-- Social Media Agent
  '-- Designer Agent
```

## Architecture: the boundary that governs everything

```
packages/core/*        reusable product IP — knows nothing about i-STEMer
      ^
      | imported by
      |
apps/istemer-demo/     the deployable i-STEMer application
```

**Core defines the contract. The tenant conforms to it. Never the reverse.**

`packages/core/**` must never import from `apps/**`, and must never contain a tenant-specific
string. The tenant supplies brand, copy, navigation labels, domain names, and fixture narratives
through configuration and data.

---

## 1. Repository scaffold

Create an **npm workspaces** monorepo. `pnpm` is deliberately not used; it is not installed.

```
business-agent-os/
  package.json                       workspaces root, all gate scripts
  tsconfig.base.json
  .eslintrc.cjs  (or eslint.config.js)
  .dependency-cruiser.cjs
  packages/core/
    contracts/                       @bagos/contracts
    ui/                              @bagos/ui
    organization/                    @bagos/organization
    fixtures/                        @bagos/fixtures
  apps/istemer-demo/                 Next.js App Router application
    data/agents/agent-manifests.json ALREADY PRESENT — do not modify
  test-fixtures/scale/
  docs/
    BATCH-1.md                       this file
    reference/                       prior-art inputs, read-only
```

Stack, non-negotiable:

- **Next.js App Router**, configured for **static export** (`output: 'export'`). The demo must be
  openable from a static build with no server.
- **TypeScript strict** (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Zod** — at trust boundaries ONLY (see §5).
- **Vitest** for unit tests. Playwright is **not** required in Batch 1.
- Plain CSS with custom properties for tokens. Tailwind is optional; if used it must map onto the
  custom properties and must not introduce its own colour palette.
- **No external network at runtime.** Fonts must be vendored locally into the app, not linked from
  a CDN. There must be zero outbound requests from the built page.

Root `package.json` must expose exactly these gate scripts, and all four must pass:

```
npm run lint
npm run typecheck
npm run test
npm run build
```

### Reference inputs

`docs/reference/` contains prior art. **Read all three before writing tokens or contracts.**

- `prior-tokens.css` — an excellent, contrast-proven token system. You are adopting its
  architecture and most of its values. See §3.
- `prior-design-system.md` — the rationale. Sections 1, 2 and 3 are the important ones.
- `prior-interface-contract.md` — the prior graph/agent contract. It contains the bug described
  in §4.

These files carry a prior product's branding and department vocabulary. They are inputs, not
templates to copy wholesale. **Nothing from them may leak into `packages/core` as a literal
tenant or brand string.**

---

## 2. Boundary enforcement — must be active and proven

Add **dependency-cruiser** with a rule that FAILS on any import from `packages/core/**` into
`apps/**` or `test-fixtures/**`. Wire it into `npm run lint`.

Add a **tenant-leakage scan** as a Vitest test that fails if any file under `packages/core/**`
contains any of these strings, case-insensitively:

```
i-STEMer   STEMer   Deputy   PrismIQ   Atlas   Hadeer   Hermes
academy    student  parent   school
Marketing Agent     Social Agent      Designer Agent
```

Both guards must be **proven to work**, not merely present. Add a test file
`packages/core/__tests__/guards-prove-themselves.test.ts` that:

- asserts the leakage scanner returns a violation when handed a fixture string containing a
  banned token (test the scanner function directly against synthetic input — do NOT write a
  real violating file into core);
- asserts the scanner returns clean for the real `packages/core` tree.

For dependency-cruiser, document in the test file's header comment the exact command that
demonstrates the rule firing, and confirm you ran it.

---

## 3. Token reconciliation

Adopt from `prior-tokens.css`, unchanged:

- The **three tier architecture**: `--p-*` primitives (never used directly by components),
  semantic tokens, `--c-*` component tokens. Enforce with a lint rule that fails the build when a
  component file references `--p-*`.
- The **four orthogonal colour axes**: department / status / autonomy / provenance. These are four
  independent meanings and must never merge into one colour.
- The **clamped contrast contract**. `--surface-glow-peak: #14313d` is the lightest pixel any
  ground may reach, and every text and accent token is measured against *that*, not the dark base.
- The `@media (forced-colors: active)` block, which strips hue, glow, frost and gradient together.
- The rule that colour is never load-bearing: every status is `dot + UPPERCASE_TEXT`.

**Change exactly one thing.** The prior file hardcodes six named department families
(`--dept-sales-*`, `--dept-finance-*`, `--dept-clients-*`, `--dept-marketing-*`,
`--dept-technology-*`, `--dept-communications-*`). That is a tenant taxonomy sitting in core.

Replace with a **bounded, pre-tested neutral slot palette**:

```
--domain-1-core / -tint / -edge / -wash
--domain-2-...
   ... through ...
--domain-8-...
```

Take the eight hues from the prior file's existing, already-measured domain values plus its gold
and one additional separable hue. **Do not invent new colours and do not generate colours at
build time.** Tenant config maps a domain slug to a slot:

```ts
// apps/istemer-demo/tenant/tenant.config.ts
domains: [
  { slug: 'executive', label: 'Executive', slot: 1 },
  { slug: 'marketing', label: 'Marketing', slot: 2 },
  { slug: 'social',    label: 'Social',    slot: 3 },
  { slug: 'creative',  label: 'Creative',  slot: 4 },
]
```

Components read `--domain-active-core` after a subtree is scoped with `data-domain-slot="2"`.
**No component may hardcode a domain colour.**

### The contrast test is a build gate

Write `packages/core/ui/__tests__/contrast.test.ts` that computes WCAG contrast ratios in code
(sRGB relative luminance; do not hardcode expected ratios as magic numbers without deriving them)
and asserts, for every text and accent token, the ratio against the **worst-case ground** —
which includes `--surface-glow-peak`.

Thresholds: text tokens intended for body copy must be **>= 4.5**. Tokens explicitly marked
decorative/disabled-only may be >= 3.0 but must be named so their restriction is obvious.

**Two values from a competing palette were measured and must NOT be introduced:**

| Value | Worst-case ratio | Status |
|---|---|---|
| `#718a9a` as muted body text | 3.78 | rejected — fails AA even on its own panel (4.47) |
| `#657989` as an offline status colour | 3.03 | rejected — fails AA on every ground including the darkest |

The prior design system already found and fixed the second one. Do not reintroduce either.

---

## 4. Three contract fixes — do these before building any component

These go in `packages/core/contracts`.

### 4a. A human principal must not have a heartbeat

`prior-interface-contract.md` defines `GraphNodeKind` including `"human"`, but then states:
*"Every `GraphNode` requires `id`, `kind`, `label`, `status`, `freshness`, `entityHref`,
`accessibleDescription`, and domain/status tokens."*

That forces Hadeer to carry a runtime status and a staleness window. She does not run, does not
go offline, and does not go stale.

Model the graph as a **discriminated union on `kind`**:

- `HumanAuthorityNode` — carries `authorityScope` and `approvalTier`. **No `status`, no
  `freshness`, no `heartbeat`.**
- `ConductorNode`, `AgentNode` — carry runtime `status` and `freshness`.
- `DepartmentNode` — carries aggregate counts, not a runtime status.

Shared fields (`id`, `kind`, `label`, `entityHref`, `accessibleDescription`) live on a base type.
It must be a **type error** to read `.status` off a `HumanAuthorityNode`.

### 4b. Add the missing node records

`apps/istemer-demo/data/agents/agent-manifests.json` has 37 agents that all declare
`reports_to: "hermes-conductor"` — but there is **no conductor record**, and departments exist
only as a count map (`{"communications": 6, "sales": 6, ...}`).

Core contracts must define real `ConductorRecord` and `DepartmentRecord` types. The i-STEMer
tenant supplies its own instances as data. Do not edit `agent-manifests.json`.

### 4c. Add two agent fields

The agent detail page requires nine sections. Seven already exist in the manifest schema:
`purpose`, `allowed_inputs`, `allowed_outputs`, `allowed_tools`, `prohibited_actions`,
`approval_policy`, `sop_refs`. Add to the core contract:

- `responsibilities: string[]` — distinct from purpose
- `demoStatus` — the honest current state of this agent in the demo

### Prohibited actions are a type, not a control

Carry forward the strongest idea in the prior plan. Prohibited actions map to a `Restriction`
type that has **no handler, no href, and no action field**, so it is structurally impossible to
render a prohibited action as a clickable control. Enforce this in the type system, not by
convention.

---

## 5. Zod scope — trust boundaries only

Use Zod at exactly these places:

- parsing `agent-manifests.json` and any other imported JSON;
- parsing tenant configuration;
- parsing URL search params.

Everywhere else use strict TypeScript and `satisfies` on authored fixture modules. **Do not
build a release-versioned schema ecosystem.** Do not add Zod to internal view-model paths.

---

## 6. Query ports

Define four **async** interfaces in `packages/core/contracts`:

```ts
interface OrganizationQueries { getOrganization(q): Promise<OrganizationProjection> }
interface AgentQueries        { listAgents(q): Promise<AgentSummary[]>
                                getAgent(q): Promise<AgentDetail | null> }
interface WorkflowQueries     { listWorkflows(q): Promise<WorkflowSummary[]>
                                getWorkflow(q): Promise<WorkflowDetail | null> }
interface ApprovalQueries     { listApprovalPackages(q): Promise<ApprovalPackage[]> }
```

Rules:

- **Async from day one.** This is what prevents a rewrite when a real adapter arrives.
- **No command port and no event port in this batch.** No mutation method may appear in a query
  interface.
- Only route and composition code calls these. **Presentational components receive already
  resolved view models as props** and must never import a fixture module or call an adapter.
- Every result carries `ViewMeta`: `{ source, isSample, isPartial, stale, dataVersion,
  capturedAt, generatedAt }`.

`apps/istemer-demo` implements a `FixtureAdapter` satisfying all four.

---

## 7. Frozen determinism — hard requirement

Nothing in this system may read the wall clock.

- Export a single `FIXTURE_NOW` constant, a fixed ISO instant. Choose a weekday morning so the
  08:00 -> 20:00 operating cycle reads coherently.
- Every fixture timestamp is expressed as an **offset from `FIXTURE_NOW`**, never as a literal
  date typed by hand.
- Timezone is fixed at **`Africa/Cairo`** and displayed explicitly wherever a time is shown, so
  the operating cycle is never ambiguous.
- Locale, random seed, ID generation, sort order, and graph layout inputs are all seeded and
  deterministic. The same input must always produce byte-identical output.
- Relative-time rendering takes a clock as an **injected dependency**, never a module-level call.
- Add a lint rule banning `Date.now()` and argument-less `new Date()` in
  `packages/core/**` and `apps/istemer-demo/**` (excluding test setup that explicitly needs it).

Without this the demo silently breaks whenever it is opened at a different hour or on a
different day, and screenshot diffing becomes impossible.

---

## 8. The demo indicator — non-disableable

When `ViewMeta.source === 'fixture'`, the application shell displays, on **every route**:

```
DEMO ENVIRONMENT
Sample data — no live external actions
```

It lives in shell chrome, not per-widget, so it is present in any screenshot anyone takes. There
must be **no prop, no config flag, and no environment variable that hides it** while the source
is `fixture`. Write a test asserting it renders on every route.

Accessibility: it is static chrome. It must **not** be an ARIA live region — it would re-announce
on every navigation — and it must not overlap the skip link.

---

## 9. The walking slice

One route: the organization view. It must render:

- **Hadeer** as a human authority node, visually distinct, labelled as human, with authority
  scope. No status badge, no heartbeat, no freshness.
- **Hermes Conductor** as the conductor node.
- **Marketing Agent**, **Social Media Agent**, **Designer Agent** as agent nodes, each with an
  honest runtime status and a domain colour drawn from its tenant-configured slot.
- A **synchronized accessible tree** alongside the graph, walking the same projection and
  printing the same relationship sentences. The tree is not a parallel implementation — it is
  generated from the same nodes and edges.
- The demo indicator, visible.

Layout constraints:

- The projection is a **pure function** of typed relationships with stable ordering.
- Layout positions are **cached and disposable**; nothing in the domain reads a coordinate.
- Must render correctly at **390px and 1440px**. At 390px the graph may default to the tree.
- React Flow is **not required** for Batch 1. A deterministic SVG or CSS-grid rendering is
  acceptable and preferable — keep the initial JS payload small. Do not add a heavy graph
  library in this batch.

### Honesty rules that apply here

- An agent with no active run renders `IDLE`. **Never fabricate working, thinking, or heartbeat
  activity.**
- Any animation indicating activity requires a run reference **and** a timestamp in the view
  model. Absent either, no animation.
- Every metric states its source and freshness. `unknown` renders as `unknown` — never as zero
  and never as OK.

---

## 10. What "done" means

All four gates green:

```
npm run lint
npm run typecheck
npm run test
npm run build
```

Plus:

- The static export builds and the organization route renders Hadeer -> Hermes -> three
  specialists, correct at 390px and 1440px, with the demo indicator on screen.
- The boundary rule and the leakage scan are both active and proven.
- The contrast test passes and would fail if a token were darkened.
- No wall-clock read anywhere in core or app source.
- Zero outbound network requests from the built page.

## Constraints on you

- **Do not commit.** Leave all work in the working tree. The orchestrator reviews and commits.
- **Write only inside this repository.** Do not modify anything in `docs/reference/` or
  `apps/istemer-demo/data/agents/agent-manifests.json` — those are read-only inputs.
- **Do not install a global package manager.** Use npm.
- Do not add Playwright, React Flow, or a component library in this batch.
- If you cannot satisfy a requirement, **stop and report it** rather than weakening a test,
  skipping it, adding a lint suppression, or casting to `any`. A disabled guard is worse than a
  missing feature.

## Report contract

When you finish, report:

1. Every file you created or modified.
2. The verbatim output of all four gate commands.
3. Any requirement in this document you did **not** satisfy, and why.
4. Anything you found in the reference material that contradicts this spec.
