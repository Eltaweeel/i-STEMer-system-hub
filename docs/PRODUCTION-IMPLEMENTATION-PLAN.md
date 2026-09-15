# Hadeer's Business Agent OS: discovery and implementation plan

Recorded 2026-08-31. Repository baseline: `5c425e3` (Batch 3c second-tenant conformance proof).

## Scope and authority

This is a staged implementation plan, not a production-readiness declaration. The user explicitly asked to begin with available material and pause when the revised design is needed.

- Actual application: `business-agent-os`, not the adjacent `deputy` checkout or extracted historical plans.
- Available design: `../docs/Multi-route approval workflow.zip`, containing `Business Agent OS.dc.html`, `support.js`, `.thumbnail`, and one PNG. The archive was inspected in place; no artifact code was imported or executed.
- Missing at discovery: the final revised artifact and a separately identifiable design-handoff document. The archive contains neither a handoff document nor a second HTML artifact. No matching handoff/Hadeer filename was found elsewhere in the workspace.
- The user's current requirements supersede the old fixture-only batch's product scope. Existing repository boundaries remain valuable; historical design documents are prior art, not approval for new UI.
- Approved UI geometry, copy, navigation details, fonts, assets, theme values, and the exact sample campaign must be reconciled with the revised artifact and handoff before UI implementation. Do not infer them from the old prototype.
- No deployment, commit, push, PR, live service connection, credentials, or real customer data is authorized.

## 1. Repository discovery

Paths below are relative to this repository. A path marked **planned** does not exist at baseline.

| Area | Observed implementation / evidence | Consequence |
| --- | --- | --- |
| Workspace | Root `package.json`, npm workspace packages under `packages/core/*`, two apps under `apps/*` | Extend the existing app; retain a reusable tenant-neutral core and second-tenant check |
| Package manager | npm, lockfile v3 in `package-lock.json`; engines Node >=20/npm >=10 | Use `npm ci`; no new package manager |
| Framework | Both app manifests pin Next 14.2.15 and React/React DOM 18.3.1 | App Router and React components, not artifact HTML |
| Tool versions | Lockfile: TypeScript 5.9.3, Vitest 2.1.9, ESLint 9.39.5, Zod 3.25.76 | Keep existing tooling first; dependency upgrades need their own compatibility gate |
| Build/deployment | Both `next.config.mjs` files use `output: 'export'`, `trailingSlash: true`, unoptimized images, bounded worker threads | No running application server, dynamic authenticated backend, or persistent command handling in the static output |
| Routes | `apps/istemer-demo/app`: root command center; organization; agents/list/detail; workflows/list/detail; approvals/list/detail; coordination-cycle; workspaces/detail; system-health | Most Operator concepts have a read-only starting point; no distinct Owner area |
| Composition | Root `app/layout.tsx` supplies `AppShell`, navigation, tenant names and fixture metadata | Split mode layouts without putting domain data fetching in presentational components |
| Styles | `packages/core/ui/src/tokens.css`; each app has `app/globals.css`; many components use inline token-based styles | Preserve the token architecture; centralize repeated component rules during UI work |
| Tokens | Primitive -> semantic -> component tiers; eight neutral domain slots; separate status/autonomy/provenance axes | Do not copy prototype domain-specific colors into core |
| UI | `AppShell`, `CommandPalette`, organization graph/tree, agent detail, workflow diagram, approval inbox/detail, rehearsal panel, design concepts, calendar, coordination, health | Reuse behaviors/contracts selectively; current shell is not the revised Owner/Operator shell |
| Queries | `packages/core/contracts/src/ports.ts`; asynchronous organization/agent/workflow/approval/coordination query interfaces | Keep reads separate from commands and event delivery |
| Fixtures | `apps/istemer-demo/fixtures/*`, agent details/activity also embedded in `adapters/fixture-adapter.ts`; frozen clock in core fixtures | Consolidate campaign narrative and references; route composition calls adapters |
| Agents | `agent.ts`, `graph.ts`, `records.ts`, manifest schema and tenant data; 37 manifest roles, three specialist detail fixtures | Roles are not live processes. Preserve registry/scale evidence separately from the pilot |
| Workflow | `workflow.ts`: typed steps, human decision steps, concept variants, workflow detail | Not yet a persisted campaign/task/run model |
| Approval | `approval.ts`: package status is literally `pending`; revision/evidence mostly free-form strings | Must introduce explicit revision-bound contracts; never enable current disabled controls as a shortcut |
| Rehearsal | `RehearsalFlowPanel.tsx`: local navigation state only; ends with no decision recorded | Can inform sample walkthrough, cannot become authoritative approval state |
| Auth and authorization | None found; health page explicitly marks identity planned | Mode selection cannot grant permissions; no real decision writing in this milestone |
| Database, migrations, seeds | No DB client, schema, migration tree, or DB seed mechanism found | Typed fixtures are not a database; no migration to apply |
| API / server actions | No API route handlers, server-action modules, service implementation, or live connector calls found | Keep sample adapter read-only; defer persistence and broker integration |
| Artifacts/evidence/audit | Concepts and textual references exist; no first-class revision store, evidence store, audit log, execution request or verification record | New linked contracts and sample projections required |
| Environment | No app-owned environment-variable reads/example env file found; `next-env.d.ts` is generated typing, not env documentation | Do not invent working backend env vars or add secrets |
| Deployment config | Static Next configuration only; no checked-in deployment pipeline/container/host config found | Local verification only; `next start` in app scripts is unsuitable for the static export |
| Tests | Vitest, static-markup route/component assertions, a DOM command-palette test, schema/contrast/boundary tests, second tenant | No existing committed browser E2E or API/database integration suite |
| Guards | ESLint, dependency-cruiser, primitive-token and domain-hardcode scans, leakage tests, strict TS | Preserve all gates and do not weaken them to absorb new work |

### Existing versus missing design capabilities

| Requested surface | Reuse | Missing / change required |
| --- | --- | --- |
| Today / Owner Overview | Workflow/approval/agent query data | Owner-specific prioritization, plain-language summaries, simplified shell |
| Needs Your Approval | Approval inbox/detail sections, notification preview | Exact revision/action identity, history, staging/live distinction, sample confirmation |
| Campaigns and details | Workflow steps, three concept cards | Campaign/objective entities, seven-day plan, actual linked output previews, revision comparison |
| AI Team | Agent cards/details, human/conductor projection | Owner-level purpose/output summary without implying live agents |
| Results / recommendations | Provenance patterns | No measured outcomes; awaiting-first-run or clearly sourced sample observations |
| Ask the Team | Command-palette interaction conventions | New entry surface; submission unavailable without a service, no fabricated reply |
| Operator command/organization/agents/workflows/approvals/cycle/health | Existing route-level views | Mode-specific layout, stronger states, new domain projections |
| Operator artifacts/evidence/shared knowledge/audit | Reference strings only | First-class read-only pages and linked sample records |

### Concrete risks discovered

1. **Dependency release gate:** clean install warns about Next 14.2.15; `npm audit --omit=dev --json` returns one critical package (`next`) and one high package (`postcss`). This is a dependency finding, not proof that every advisory is exploitable in this static app. No automated force-upgrade during discovery. Select and pin a supported patched version, inspect breaking changes and repeat both-app gates before any production release. Registry's suggested major upgrade is not an approved migration plan.
2. **No identity boundary:** all exported pages are public files. Do not put sensitive tenant records or real approval authority into this build. Client-side route/mode checks cannot secure exported data.
3. **Conflicting sample story:** workflow steps all say `not_started`, while approval narrative says concepts were reviewed and final assets produced. A single scenario snapshot graph must replace these inconsistent views.
4. **Approval ambiguity:** existing `artifactRef` bundles run IDs, filenames and version text; there is no immutable binding. Read-only status is safe but not a complete domain.
5. **Accessibility gaps:** skip link has inline offscreen positioning without a focus reveal rule; navigation/rehearsal controls do not consistently enforce 44px touch targets. Forced-colors rules are narrower than old documentation claims. Existing contrast test calculates most ratios from duplicated hex literals rather than resolving the actual token graph, so it is not sufficient proof for a new theme.
6. **Time mismatch:** `FIXTURE_NOW` encodes `09:15 +02:00`; local `Intl` renders it as **10:15 Africa/Cairo** on that date, contradicting the source comment. Correct the fixture's intended civil time explicitly and test DST/offset behavior; do not silently change old screenshots during discovery.
7. **Prototype mismatch:** artifact uses `x-dc`, `sc-if`, `sc-for`, template expressions, runtime `support.js`, Google Fonts requests, and state-based navigation. None belongs in production components. The artifact includes a `live` demo-state option that must not become a live-capability claim.
8. **Security hygiene:** `.gitignore` does not yet exclude local `.env` files. Add that before future credential setup. No credentials are needed for current work.

## 2. Architectural decisions and assumptions

- Keep npm workspaces, strict TypeScript, Next App Router, plain CSS, Zod at trust boundaries, and the core-to-tenant dependency direction.
- Continue in `apps/istemer-demo`; do not create another application merely to rename it. Put branding/campaign copy in tenant configuration/fixtures. Preserve `apps/northwind-demo` as a conformance consumer.
- The first UI milestone remains an explicitly labeled static sample. It is production-structured UI, **not** an authenticated production SaaS.
- Preserve the existing `ApprovalPackage` and disabled-control contract until consumers are deliberately migrated. Add revision-aware contracts without changing pending-only screens during preparatory work.
- Query adapters own reads; pure presenters receive resolved props. URL state carries selection/view identity, never authoritative workflow state. Future events invalidate/refetch, not mutate authority locally.
- Sample flow is navigation through pre-authored immutable scenario snapshots. Typing confirmation advances a labeled rehearsal projection, not a persisted decision. Reload/reset restores sample input; no localStorage, fake server response, synthetic durable audit, or claim that Hadeer actually approved.
- No backend framework, auth provider, database vendor or broker is selected without evidence/approval. This does not block a sample UI.

## 3. Proposed routes and layouts (planned, pending handoff reconciliation)

```text
app/layout.tsx                       minimal shared document / global styles
app/(owner)/layout.tsx               OwnerShell + permanent sample notice
app/(owner)/page.tsx                 / Today, default entry
app/(owner)/approvals/page.tsx       /approvals Needs Your Approval
app/(owner)/approvals/[id]/page.tsx  /approvals/:id exact package and rehearsal
app/(owner)/campaigns/page.tsx       /campaigns
app/(owner)/campaigns/[id]/page.tsx  /campaigns/:id
app/(owner)/campaigns/[id]/outputs/[artifactId]/page.tsx
app/(owner)/campaigns/[id]/compare/page.tsx
app/(owner)/team/page.tsx            /team AI Team
app/(owner)/results/page.tsx         /results Results and Recommendations
app/(owner)/ask/page.tsx             /ask Ask the Team
app/operator/layout.tsx             OperatorShell, same provenance, denser navigation
app/operator/page.tsx               /operator Command Center
app/operator/organization/page.tsx
app/operator/agents/page.tsx
app/operator/agents/[id]/page.tsx
app/operator/workflows/page.tsx
app/operator/workflows/[id]/page.tsx
app/operator/approvals/page.tsx
app/operator/approvals/[id]/page.tsx
app/operator/artifacts/page.tsx
app/operator/artifacts/[id]/page.tsx
app/operator/evidence/page.tsx
app/operator/evidence/[id]/page.tsx
app/operator/coordination-cycle/page.tsx
app/operator/knowledge/page.tsx
app/operator/audit/page.tsx
app/operator/system-health/page.tsx
```

Move existing routes under the new composition paths in one tested migration; do not leave duplicate `/approvals` route definitions. Keep legacy organization/agents/workflows/coordination-cycle/system-health/workspaces URLs as static compatibility pages with canonical destination links where useful. Static export cannot rely on server redirects. Centralize route builders/slug registries in planned `apps/istemer-demo/routing/routes.ts`; include all fixture IDs in `generateStaticParams`, with unknown entities handled honestly.

Owner navigation: Today, Approvals, Campaigns, AI Team, Results, Ask. Operator navigation exposes technical areas. Both layouts reuse shared chrome primitives, but Owner is not simply the same dense menu with a different title. Mode switching links between views; it is not login or elevation. Sample-only access notice remains visible in both.

## 4. Component, tokens, responsive and accessibility plan

**Existing files to evolve:** `AppShell.tsx`, `DemoIndicator.tsx`, `ApprovalInboxView.tsx`, `ApprovalDetailView.tsx`, `RehearsalFlowPanel.tsx`, `CommandPalette.tsx`, and `tokens.css` under `packages/core/ui/src`; tenant root layout/globals and route compositions.

**Planned component files** under `packages/core/ui/src/components/`:

- `OwnerShell.tsx`, `OperatorShell.tsx`, `ModeSwitch.tsx`, `MobileNavigation.tsx`: generic nav data, no tenant literals or adapter imports.
- `Button.tsx`, `Dialog.tsx`, `PageState.tsx`: only primitives actually needed by the approved design; semantic native controls first, tested focus management.
- `OwnerOverviewView.tsx`, `CampaignListView.tsx`, `CampaignDetailView.tsx`, `ArtifactPreview.tsx`, `RevisionComparison.tsx`, `ApprovalPackageView.tsx`, `ApprovalHistory.tsx`, `AuditTimeline.tsx`.
- Owner AI Team/Results/Ask and Operator knowledge/evidence compositions use the same primitives. Do not invent a chart library for unavailable results.

Token strategy: retain `--p-*` primitives hidden from components, semantic surfaces/text/status/provenance, component dimensions. Reconcile exact approved palette/type values at design gate. Theme overrides are scoped so the second tenant is not accidentally restyled. Keep domain slot mapping tenant-owned. Local assets/fonts only with known licensing; no CDN runtime imports. Add contrast tests resolving CSS variable aliases and checking actual surface/text/control pairs, not copied test constants.

Responsive targets: **1440x900** full navigation with useful contextual panels; **1024x768** compact navigation and single contextual drawer; **390x844** single-column Owner cards, accessible menu/sheet, stacked diff, graph-to-tree default. Exact panel/bottom-nav arrangement awaits revised design. No page-level horizontal overflow; long hashes wrap; tables get labeled overflow containers; every mobile interactive target is at least 44x44px. Also verify 200% zoom and 320px reflow.

Accessibility: landmarks and one primary heading; visible skip-link focus; focus ring in normal/forced colors; `aria-current` on nav; labeled controls/errors; keyboard Enter/Space activation; Escape and focus return for modal surfaces; semantic diff additions/deletions with a textual summary; status text not just color; reduced motion; meaningful preview alt text. Sample notice is static chrome, not a repeating live announcement. Essential normal text >=4.5:1 and essential control boundaries >=3:1. Automated checks supplement, not replace, keyboard and rendered review.

## 5. Domain contracts and provenance

All records carry tenant scope and stable IDs; view/query results carry provenance. Planned modules under `packages/core/contracts/src` (only the small preparatory approval slice is scheduled before the missing-design gate):

| Module | Required domain | Minimum contract |
| --- | --- | --- |
| `campaign.ts` | Objective, Campaign | Objective ID/owner/text/success definition; campaign ID/objective/roles/linked artifact IDs/current snapshot; no unsupported outcome metrics |
| existing `agent.ts` / `records.ts` | Agent role, conductor, human | Existing role capabilities/policy retained; assignment separate from runtime; no heartbeat for human |
| `work.ts` | Task, Run | Task purpose/assignment/dependencies; run ID/task/state/clock timestamps/output revision refs; no fabricated activity |
| `artifact.ts` | Artifact, ArtifactRevision | Logical artifact ID; immutable revision ID/number/parent, author role, content, preview metadata, digest contract, creation time |
| `evidence.ts` | Evidence | ID/source kind/source reference/captured time/revision binding/limitations/sample provenance |
| `revision-approval.ts` | Exact action binding, approval package, human decision | Tenant + action ID/revision + destination/environment + artifact ID/revision + content and action digest; requester/reason/preview/evidence/risks/cost/deadline/required human role/history |
| `execution.ts` | ExecutionRequest, ExternalVerification | Decision/package binding, idempotency key, broker destination, attempt state; separate provider evidence/receipt/observed time for verification |
| `audit.ts` | AuditEvent | Append-only ID/tenant/actor/event/entity/revision/correlation/time/provenance; sample timeline explicitly not a durable audit |
| existing `ports.ts` / planned campaign queries | Reads only | Async list/get/campaign/output/history/evidence/audit methods, no mutation on query interfaces |

Approval display lifecycle must include: `draft`, `awaiting_review`, `changes_requested`, `rejected`, `awaiting_approval`, `approved_for_staging`, `awaiting_live_approval`, `approved_for_execution`, `execution_requested`, `executing`, `externally_verified`, `execution_failed`, `approval_invalidated_by_revision`. A presentation union does not make one giant mutable status authoritative: review/decision, execution attempt and external verification remain separate records.

### Safety rules and future transition ownership

- Draft -> awaiting review: artifact submitted by assigned role; review is not approval.
- Changes requested/rejected: human feedback linked to exact reviewed revision. A new version never overwrites old content/history.
- Awaiting approval -> approved for staging: authorized human decision for the exact staging action snapshot, not a live grant.
- Staging readiness -> awaiting live approval: a distinct live-publication package. Stage approval is never reused even if content is identical.
- Awaiting live approval -> approved for execution: authorized owner decision for exact live action, destination, revision, content and action hashes.
- Approved for execution -> execution requested: SaaS command service persists request/outbox entry after checking fresh authorization, revision, expiry and idempotency.
- Executing/failed: broker-owned attempt outcomes. Completion of a request is not external verification.
- Externally verified: verified provider evidence matching the intended destination/content, not an agent assertion. Keep execution-completed/verification-pending distinguishable in the execution model.
- Material artifact/action/destination/cost/schedule changes create a new revision and invalidate the old grant for new work. Preserve the historical decision; never edit it into a decision for the replacement.
- Placeholder hashes permit sample rendering only. Equality is not integrity verification; production computes canonical hashes server-side over content and the full action envelope, and rejects placeholders.
- TypeScript `kind: 'human'` is not authentication. Agents must have no decision-writing capability. Server identity determines human actor; request-body actor/role fields are never trusted.

## 6. Owner/operator permissions and service boundaries

| Action | Owner | Operator | Conductor/specialist |
| --- | --- | --- | --- |
| Read business outputs | Tenant-scoped | Assigned tenant/scope | Minimum assigned context |
| Read operational queues/evidence/audit | Explicit permitted access | Assigned scope | Only necessary inputs; no secrets |
| Request changes / submit revised proposal | Yes | Assigned review scope | May submit a proposal, not human feedback |
| Approve staging | Owner in initial policy | Denied unless later explicitly delegated | Never |
| Approve live publication/spend/permissions | Owner only | Denied | Never |
| Execute externally | Only through approved broker request | No direct connector action | Never direct; request restricted broker |
| Alter historical approval/audit | Never | Never | Never |

For the **sample build**, none of these is a real authorization claim: all decision/external-action commands are unavailable. Operator/Admin naming in UI must not imply administrator credentials.

Future SaaS owns authoritative state, queues, approvals, authorization, audit and connector requests. Hermes owns coordination, specialist execution, structured artifact proposals and approval requests. Use separate authenticated read/query and command services; a backend later implements tenant-scoped membership checks, CSRF protection, validation, transactional revision compare-and-set, append-only decision + audit writes, unique idempotency keys, expiry/revocation, and durable broker outbox. Test with the actual selected database, not mocked transactions. No particular API endpoint or DB migration is claimed to exist today.

Broker boundary: allowlisted operation/destination/scopes; secrets only server-side; no arbitrary URL/shell/tool calls; bounded cost and deadline; duplicate-safe retries; revalidate grant immediately before execution. Treat artifacts/evidence as untrusted content, sanitize rich previews, disallow active HTML/scripts, and never follow embedded instructions as authority. Audit redacts sensitive payloads; errors use safe messages and correlation IDs. Future SSE/WebSocket events only trigger refetch from authoritative reads.

## 7. Centralized sample campaign

Planned tenant files: `fixtures/campaign/scenario.ts`, `fixtures/campaign/snapshots.ts`, `adapters/sample-campaign-adapter.ts`; conformance tests in `__tests__/sample-campaign.test.ts`.

One typed scenario owns objective, market-intelligence brief, seven-day social plan, three creative directions, authored requested changes, revised artifact, comparison, exact-revision staging package, sample staging decision, distinct live-publication package and sample audit events. Every ID reference resolves; all chronology uses the frozen clock. Counts derive from records, not arbitrary metrics. Content must come from the revised artifact/handoff or be clearly documented as approved sample authoring; do not silently designate the old Q3-budget fixture the approved campaign.

Every participating screen displays exactly **SAMPLE SCENARIO — NO LIVE EXTERNAL ACTIONS**, including output previews, comparison, approval dialog and audit. A fixed shell notice plus preview-local context prevents ambiguous screenshots. Every query result remains fixture-sourced. Sample decisions use explicitly fictional scenario actors, not claims of real user action.

The walkthrough advances snapshot selection only. Typed confirmation is tested as a UI safety/rehearsal exercise; no approval is persisted. A reset/reload must not masquerade as a recovered production decision. The sample audit record already belongs to the authored snapshot and must say so. Live publication stays separately gated and unavailable; zero external network actions.

## 8. Small testable milestones

| Milestone | File-specific work | Exit gate |
| --- | --- | --- |
| M0 Discovery | This plan + `docs/IMPLEMENTATION-CHECKPOINT.md` | Inventory, baseline commands/browser evidence, honest gaps recorded |
| M1 Pre-design approval contract | New `contracts/src/revision-approval.ts`, export from `index.ts`, focused contract behavior tests | Exact binding comparison detects action/revision/destination/tenant changes and unverified hashes; legacy approvals remain disabled; all repository gates |
| **Design gate** | Read final revised artifact + handoff; record mapping and reconciled sample content | Both inputs present and unambiguous. Pause here if absent; do not style from original artifact |
| M2 Dependency readiness + foundations | Both app manifests/lockfile after supported-version review; token CSS, primitives, layout/navigation, accessibility regressions | Supported pinned dependency decision, all baseline gates, shell/keyboard/mobile/browser-console checks, second tenant intact |
| M3 Campaign read model | Domain modules + tenant scenario/snapshots + async sample adapter + data parity/reference tests | Complete coherent sample graph, deterministic timestamps, no fake persistence, exact notices |
| M4 Owner journey | Planned Owner routes/components, previews/diff/package, rehearsal controller | Full specified click path and reset/reload behavior; staging/live remain distinct; no real commands |
| M5 Operator coverage | Migrate existing Operator views; new artifacts/evidence/knowledge/audit routes | Mode switching and deep links, all requested areas, capability-honest states, no tenant leakage |
| M6 Failure/accessibility verification | Planned `playwright.config.ts`, `tests/e2e/*.spec.ts`, npm browser test scripts if new tools justified | Viewports, key interactions, failures, keyboard, console and automated accessibility evidence; screenshots; both builds |
| M7 Backend readiness, deferred | Separate approved architecture milestone | Identity/storage/broker decisions and security acceptance before any real decision/connector implementation |

M1 deliberately does not create UI, approved campaign copy, persistent decisions, or a misleading state machine pretending to be the backend. It is the limited design-independent implementation authorized now. The complete requested application is **not finished** when M1 passes.

## 9. Verification commands and acceptance coverage

Run from repository root in PowerShell; these scripts exist at baseline:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev --json
```

Targeted M1 command after the test exists:

```powershell
npm.cmd test -- packages/core/contracts/__tests__/revision-approval.test.ts
```

Local development startup (existing `dev` script, localhost only):

```powershell
npm.cmd run dev --workspace apps/istemer-demo -- --hostname 127.0.0.1 --port 3100
```

For production-output browser verification, serve `apps/istemer-demo/out` with an available local static server, not `npm start`/`next start`. Record the exact chosen server command and tool version in the checkpoint. Verify direct loading of exported deep links as well as navigation.

**Planned commands, not presently runnable:** after M6 adds pinned browser-test dependencies/config/scripts, use `npm.cmd run test:e2e` and `npm.cmd run test:a11y`. Justify Playwright for reproducible real-browser interactions and axe integration for automated accessibility coverage; do not add them during discovery. Unit/integration tests continue under Vitest; backend transaction integration tests are deferred until a backend exists.

Acceptance suite: Owner Overview -> campaign -> market brief -> seven-day plan -> three directions -> request changes -> revised comparison -> package -> wrong/right typed confirmation -> sample staging approval -> sample audit. Independently verify live approval has not been granted. Cover Owner/Operator switch, mobile menu, deep links, empty/loading/awaiting-first-run/blocked/denied/unavailable/dependency-failure/error, changes requested, rejection, invalidation by revision, reduced motion and keyboard focus return. Capture screenshots at 1440x900, 1024x768, 390x844; inspect console/page errors and network requests; no runtime dependency fetches, placeholder templates, or `support.js` in output.

Before completion, use clean-code-guard, test-guard, docs-guard; inspect tracked/untracked diffs for secrets/customer data and verify no commits or remote actions occurred. Record failures as failures. A successful build is not browser or accessibility proof.

## 10. Deferred features and open decisions

- **Waiting on user input:** revised artifact and handoff location/content. They block final UI and approved campaign implementation, not M0/M1.
- **Safe assumption:** Owner is the default experience; Operator switch is a sample navigation mode; owner-only approvals until an explicit delegation policy exists.
- **Deferred product/security decisions:** identity provider, tenant membership model, staging approver delegation, exact publication destinations and cost limits, artifact storage/canonicalization, audit retention, external-verification evidence policy, deployment target and supported framework upgrade track.
- **Deferred capabilities:** real chat/agent execution, scheduling, persistence, authentication, live metrics, publication/spending, connector configuration, outbound notifications, cross-tenant operations, server event streams. Render unavailable/awaiting data rather than claim live operation.
- No migrations, secrets, services, cloud resources or deployment are part of M0/M1. A later backend milestone needs its own threat model and real authorization/transaction tests.
