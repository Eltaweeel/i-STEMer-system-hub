# Adam -> Omar repair packet checkpoint

Status: INCOMPLETE; not approved for deployment.

## Latest local checkpoint

### 2026-09-17: Nour content-calendar contract groundwork (exact Ziad revision and requested platforms)

Status: contract-only Day 3 groundwork for a seven-day draft calendar intended for review/approval.
No execution, HTTP/transport, route, SQL, provider, profile, persistence, approval or deployment work.
This does not complete the Day 3 fan-out exit gate. No agents-hub files were modified;
`reel-analysis.ts`, `research-packet.ts` and existing build/archive machinery are unchanged.

New files: `packages/core/contracts/src/content-calendar.ts` and
`packages/core/contracts/__tests__/content-calendar.test.ts`. Added one export line to
`packages/core/contracts/src/index.ts`. This checkpoint entry is the sole additional documentation edit
requested by the output contract, despite the task's earlier three-file limit. The working tree was
already dirty; existing changes were preserved, not staged or committed.

`NourTaskSchema`, `NourHandoffSchema`, `NourArtifactSchema` and `NourErrorSchema` use the literal
`content-calendar.v1`, strict objects, UUID tenant/task/run/attempt bindings and `liveEffects: false`.
The same shared binding fields are required on the strict nested `NourBriefSchema` and
`CalendarEntrySchema`; `sameBinding` checks nested and task/artifact identities. Task scope is exactly
`['content-calendar:write']`, agent/producer is `content_creator`, and handoff direction is
`orchestrator` -> `content_creator`. Drafting is not publishing. Task timestamps require a positive
window. Handoff `inputRevisionIds` follows the unique UUID array pattern (1–12). One task synthesizes
from one exact Ziad `sourceRevisionId` UUID; the brief, artifact, every entry and error packet carry it.

`PlatformSchema` accepts only `instagram` and `facebook`; brief `requestedPlatforms` is nonempty,
unique and bounded at two. `CalendarFormatSchema` accepts only `post`, `reel`, `story` and `carousel`.
Each entry requires an integer `dayIndex` from 0–6, a platform, format and nonblank trimmed
`conceptTitle` bounded at 8,000 characters. The artifact requires exactly seven entries with seven
distinct day indices, so no missing or duplicate day is valid; entry order is unrestricted. Artifact
schema validation rejects mismatched nested identities and source revisions.
`validateNourArtifact(input, taskInput)` parses both unknown inputs, binds the artifact to the task
and exact upstream revision, and rejects even one entry targeting an unrequested platform with
`unrequested_platform`. Error packets retain the template's error vocabulary with that agent-specific
code replacing `uninspected_modality`, plus a boolean `retryable` and bounded nonblank message.

These are consistency checks, not proof of authorization, current lease ownership, persisted Ziad
revision existence, or its transitive Omar lineage. Future execution must supply trusted task/revision
state. No handoff-to-task validator or durable runtime was added. The full Day 3 section was read from
this repository's `docs/FUNCTIONAL_DEMO_ROADMAP.md`; the older agents-hub `src/contracts.ts` and
`src/agents/nour.ts` were read for vocabulary only, with no cross-repo import or dependency.

Commands and exact results (all four gates passed on the first run):

System repo root —
- `npm run lint`: PASS, exit 0. `✔ no dependency violations found (152 modules, 308 dependencies cruised)`;
  `primitive-token check: ok`; `domain-hardcode check: ok`. ESLint completed with the existing
  `[MODULE_TYPELESS_PACKAGE_JSON]` configuration warning.
- `npm run typecheck`: PASS, exit 0, `tsc --noEmit -p tsconfig.json` for all eight workspaces
  (`@bagos/contracts`, `@bagos/engine`, `@bagos/fixtures`, `@bagos/organization`, `@bagos/research-worker`,
  `@bagos/ui`, `@istemer/demo`, `@northwind/demo`).
- `npm test`: PASS, exit 0. `Test Files  37 passed (37)`; `Tests  302 passed (302)`;
  `packages/core/contracts/__tests__/content-calendar.test.ts (13 tests)`. Existing Vite CJS deprecation
  warning remains. No test was skipped, weakened or suppressed.
- `npm run build`: PASS, exit 0, both production builds. `@istemer/demo`: `✓ Compiled successfully in 978ms`,
  `Finished TypeScript in 2.4s`; `@northwind/demo`: `✓ Compiled successfully in 402ms`,
  `Finished TypeScript in 1685ms`.
- `git diff --check`: PASS, exit 0, existing LF-to-CRLF warnings only.
- `git status --short`: still includes the pre-existing modified/untracked work. A SHA-256 comparison
  against the pre-edit tracked/untracked file baseline confirms this increment changes only the two
  new contract/test files, the single index export addition, and this checkpoint entry. It would be
  inaccurate to claim the entire working tree contains only this increment.

No lint suppression or `any` cast was added. No implementation decision remains open for this slice;
execution, persistence and review/approval wiring remain future work.

### 2026-09-17: Ziad reel-analysis contract groundwork (exact Omar revision and modality honesty)

Status: contract-only Day 3 groundwork. No execution, HTTP/transport, route, SQL, provider, profile,
persistence or deployment work. This does not complete the Day 3 fan-out exit gate. No agents-hub files
were modified; `research-packet.ts` and its special subpath/build/archive machinery are unchanged.

New files: `packages/core/contracts/src/reel-analysis.ts` and
`packages/core/contracts/__tests__/reel-analysis.test.ts`. Added one export line to
`packages/core/contracts/src/index.ts`. This checkpoint entry is the sole additional documentation edit
requested by the output contract, despite the task's earlier three-file limit. The working tree was
already dirty; existing changes were preserved, not staged or committed.

`ReelAnalysisTaskSchema`, `ReelAnalysisHandoffSchema`, `ReelAnalysisArtifactSchema` and
`ReelAnalysisErrorSchema` use the literal `reel-analysis.v1`, strict objects, UUID tenant/task/run/attempt
bindings and `liveEffects: false`. The same fields are required on the strict nested
`ReelAnalysisBriefSchema`, `ReelAnalysisFindingSchema` and `ReelAnalysisUnavailableModalitySchema`.
Task scope is exactly `['reel-analysis:read']`, agent/producer is `reel_analyst`, and handoff direction is
`orchestrator` -> `reel_analyst`. Task timestamps require a positive window. Handoff `inputRevisionIds`
uses the research contract's unique UUID array pattern (1–12). One task analyzes one exact Omar
`sourceRevisionId` UUID; the brief, artifact, each finding and each unavailable-modality reason carry it.

`ReelModalitySchema` accepts only `video_frames`, `audio`, `transcript`, `metadata_only` and
`text_only_source`. The brief explicitly declares nonempty requested modalities and supplied modalities;
both lists are unique and bounded at five, and supplied modalities must be requested. Artifact schema
validation rejects findings citing an uninspected modality, mismatched nested identities/revisions,
duplicate unavailable entries, and any overlap between inspected and unavailable modalities.
`validateReelAnalysisArtifact(input, taskInput)` parses both unknown inputs, binds the artifact to the
task and exact upstream revision, rejects claimed inspection of any unsupplied modality (even without
a finding), and requires exactly one nonblank reason for every requested modality not inspected.
Supplied but uninspected modalities also require reasons. Empty findings are permitted for honest
gap-only results; findings are capped at 100, gaps at 30, and text at 8,000 characters.

These are consistency checks, not proof of media inspection, authorization, current lease ownership,
or persisted upstream revision existence. Future execution must supply trusted task/inspection state.
No host observer, inspection receipt protocol, handoff-to-task validator or durable runtime was added.
The requested `i-STEMer-agents-hub/docs/FUNCTIONAL_DEMO_ROADMAP.md` does not exist in this checkout;
the complete Day 3 section was read from `docs/FUNCTIONAL_DEMO_ROADMAP.md` instead. The old agents-hub
`src/contracts.ts` and `src/agents/ziad.ts` were read for vocabulary only; there is no cross-repo import.

Commands and exact results (final, after fixing the reserved-token violation described below):

System repo root —
- `npm run lint`: PASS, exit 0. `✔ no dependency violations found (150 modules, 306 dependencies cruised)`;
  `primitive-token check: ok`; `domain-hardcode check: ok`. ESLint completed with the existing
  `[MODULE_TYPELESS_PACKAGE_JSON]` configuration warning.
- `npm run typecheck`: PASS, exit 0, `tsc --noEmit -p tsconfig.json` for all eight workspaces
  (`@bagos/contracts`, `@bagos/engine`, `@bagos/fixtures`, `@bagos/organization`, `@bagos/research-worker`,
  `@bagos/ui`, `@istemer/demo`, `@northwind/demo`).
- `npm test`: PASS, exit 0. `Test Files  36 passed (36)`; `Tests  289 passed (289)`;
  `packages/core/contracts/__tests__/reel-analysis.test.ts (13 tests)`. Existing Vite CJS deprecation
  warning remains. No test was skipped, weakened or suppressed.
- `npm run build`: PASS, exit 0, both production builds. `@istemer/demo`: `✓ Compiled successfully in 2.5s`,
  `Finished TypeScript in 2.4s`; `@northwind/demo`: `✓ Compiled successfully in 432ms`,
  `Finished TypeScript in 1736ms`.
- `git diff --check`: PASS, exit 0, existing LF-to-CRLF warnings only.
- `git status --short`: still includes the pre-existing modified/untracked work. A SHA-256 comparison
  against the pre-edit tracked/untracked file baseline confirms this increment changes only the two
  new contract/test files, the single index export addition, and this checkpoint entry. It would be
  inaccurate to claim the entire working tree contains only this increment.

The first `npm test` run reported `Test Files  1 failed | 35 passed (36)` and
`Tests  1 failed | 288 passed (289)`: the tenant-leakage guard rejected the helper parameter token
`parent`. Renamed the binding comparison parameters to `actual`/`expected`, leaving the guard intact;
all four gates then passed on the final source. No lint suppression or `any` cast was added.

### 2026-09-17: system-side worker orchestration (claim -> observe -> dispatch -> complete/fail)

Status: additive only, four new files, nothing existing modified. Not wired to any route, not wired to
a real database connection, no real HTTP dispatch to a live agents-hub listener, no Hermes/provider call
made. This continues from the source-observer work Codex completed just before this checkpoint (see
`docs/CLAUDE_OVERNIGHT_REVIEW_2026-09-16.md` for the review of that work); this session picked up
implementation after Codex hit its usage limit, per the user's explicit instruction.

New files: `apps/istemer-demo/lib/workflow/research-transport.ts` (HMAC request signing matching the
agents-hub verifier's algorithm, and a loopback-only HTTP dispatch client), `apps/istemer-demo/lib/workflow/research-worker.ts`
(the claim/observe/dispatch/complete orchestration cycle), and their tests
`apps/istemer-demo/__tests__/research-transport.test.ts`, `apps/istemer-demo/__tests__/research-worker.test.ts`.

`runResearchWorkerCycle` takes an injected `ResearchCommandPort` (claim/fail/complete), not a hardcoded
`pg` connection: `private.claim_research_task()` / `fail_research_attempt()` / `complete_research_attempt()`
are `private` schema, granted only to the NOLOGIN `bagos_research_executor` role, and no dedicated worker
login has been granted membership in that role on any real database. Provisioning that is a credential/
staging decision that needs the project owner present, not something to assume inside an orchestration
module. A single cycle: calls `port.claim()`; `null` means idle; a `{status:'failed'}` result means the
SQL already reclaimed or terminated a stale attempt this call and nothing further happens this cycle
(the worker never auto-retries, matching the existing rule in `i-STEMer-agents-hub/docs/RESEARCH_RUNTIME.md`);
a `{status:'claimed'}` result runs the injected source observer over every `task.brief.sources` entry,
requires at least one successfully inspected source (fails `uninspected_source` otherwise, without
dispatching), checks the task has not already expired, signs `{task, handoff, snapshots}`, dispatches it
to an injected `ResearchDispatcher`, validates the returned artifact against `ResearchArtifactSchema` and
`validateResearchArtifact` (the exact same binding checks the SQL completion function repeats server-side —
this is client-side defense in depth, not a replacement for it), and calls `port.complete` or `port.fail`
with a code mapped from the failure.

**Update, same checkpoint:** the parity gap below is closed. The pure signing math was split out of
`research-transport.ts` into a new `apps/istemer-demo/lib/workflow/research-signing.ts` (no `server-only`
guard — it has no I/O, so nothing stops it being imported directly, including across the repository
boundary). `i-STEMer-agents-hub/src/research/transport-parity.test.ts` now imports that file by absolute
path (a dynamic `import()`, since NodeNext relative-import extension rules don't apply to a path that's
never resolved through this repository's own module graph) and does a real HMAC round-trip: sign with
the system's `signResearchRequest`, verify with the agents-hub repository's own unmodified
`authenticateResearchRequest`. Both the accept case and a tampered-body rejection case pass. This is
proof, not assumption — if either side's `signingInput` construction ever drifts, this test fails.
`research-transport.ts` now just re-exports the signing module and keeps the `server-only`-guarded HTTP
dispatch client (`dispatchResearchTask`); `research-worker.ts` needed no changes since the public API it
imports from `./research-transport` is unchanged.

`research-transport.ts`'s `signingInput`/`signResearchRequest` intentionally duplicate the algorithm in
`i-STEMer-agents-hub/src/research/authenticated-request.ts` rather than importing across the repository
boundary (that file is separately reviewed/tested and this session did not touch it) — see the parity
test above for why that duplication is safe to trust.

**Update, same checkpoint — independent review found and fixed real bugs.** The self-review gap above was
closed for real, not just narrated: this session ran an 8-angle multi-agent review (`/code-review high`,
five agents completed; a sixth, efficiency/altitude, hit a transient model-availability timeout and did
not return) against all five new files across both repos. Unlike self-review, this found genuine defects.
Fixed, all reverified against the real gate suite in both repos:

- **The worker's own locally-detected-timeout `fail()` call was wrong and would have crashed against a
  real database.** `private.fail_research_attempt` (`supabase/migrations/20260916060831_adam_omar_attempt_leases.sql`,
  line 134) raises `stale_attempt` once `expires_at <= clock_timestamp()`, rather than returning cleanly.
  The worker was calling exactly that function with exactly that condition true, with no `try`/`catch`
  around it. `runResearchWorkerCycle` no longer calls `port.fail()` for a self-detected expiry at all; it
  returns a new `{outcome:'lease_expired'}` result instead, matching the SQL's actual design: only the
  *next* `claim_research_task()` call reclaims a stale running attempt, not the worker itself. This applies
  both before dispatch and after (dispatch's timeout is capped at the remaining lease budget, so a slow
  dispatch can land in the same stale-lease window on the way out too — both paths are now covered).
- **`expired`/`stale_attempt` error codes from the agents-hub listener were silently coerced to the
  retryable `provider_failure`.** Both indicate a client-side transport/signing defect (a lapsed window or
  a replayed nonce), not a transient provider outage, and retrying without fixing that wouldn't help. Both
  now map explicitly to the non-retryable `invalid_contract`.
- **Failure-code precedence was backwards**: an expired-and-also-uninspected task reported
  `uninspected_source`, hiding the real cause. Expiry is now checked first.
- **`dispatchResearchTask` had no handling for an abruptly closed connection** that doesn't reliably emit
  `'error'` on the response/request across Node versions — added `'close'` listeners on both as a safety
  net (idempotent with the existing `settled` guard, so this changes nothing on the normal success path).
- **`SourceObservation`'s gap-code field was typed as plain `string`** instead of the real 9-value literal
  union `packages/core/research-worker/src/public-source.ts` defines, losing a compile-time check against a
  typo'd or renamed code. Now an explicit literal union, with a comment on why it isn't a real type import
  yet (`@bagos/research-worker` has no `package.json` "exports" or vitest alias today — that's a separate,
  larger wiring change, not done here).
- Also simplified the artifact-validation failure mapping to match `i-STEMer-agents-hub/src/research/execution.ts`'s
  own established catch-all around the same `validateResearchArtifact` call (both `invalid_contract` and
  `uninspected_source` failures now map to `invalid_contract` uniformly, rather than a fragile
  message-string match that could silently break if the validator's wording ever changed) — this doubles
  as the fix for a reviewer-flagged fragility finding.

**Not fixed, deliberately, and worth knowing:**
- The agents-hub parity test (`i-STEMer-agents-hub/src/research/transport-parity.test.ts`) resolves its
  cross-repo import against `business-agent-os`'s **main checkout**, not this session's worktree branch —
  they're only in sync right now because every edit this session was manually copied to both. A future
  edit made only in the worktree (the normal place to work) won't reach the main-checkout copy until
  merge, and the parity test would keep silently passing against the stale copy in the meantime. This is a
  structural consequence of this session's sandbox situation, not something a code change fixes — flagging
  it for whoever picks this branch up next.
- A successfully-inspected source's own `gaps` (e.g. "partially paywalled") are still dropped when building
  snapshots — the signed envelope's schema has no field for them even if forwarded, so a real fix needs a
  contract change to `snapshotSchema` in `i-STEMer-agents-hub/src/research/execution.ts`, out of scope for
  an additive-only session.
- Two small test/readability nits (a dense 11-clause validation condition in `research-signing.ts`; a
  repeated sign-call in `research-transport.test.ts` that could be a one-line helper) were left as-is —
  real but low severity, not worth the risk of touching more than necessary this late in the session.

This is real evidence for why the "two-party review" discipline this project has followed all night
matters: self-review missed all of the above. An independent pass (ideally an actual second Codex/Claude
session, not another self-review) is still warranted before this is wired to a live route.

Commands and exact results (final, after the review-driven fixes above):

System repo root —
- `npm run typecheck`: PASS, all eight workspaces (`@bagos/contracts`, `@bagos/engine`, `@bagos/fixtures`, `@bagos/organization`, `@bagos/research-worker`, `@bagos/ui`, `@istemer/demo`, `@northwind/demo`).
- `npm run lint`: PASS — ESLint, dependency-cruiser (146 modules / 301 dependencies, no violations), primitive-token check, domain-hardcode check.
- `npm test`: PASS, 34 files / **271 tests** (up from 244 after the source-observer checkpoint; +27 from this increment, including 6 new tests added for the fixed bugs: `lease_expired` precedence and non-call of `fail()`, mid-loop abort on expiry, `expired`/`stale_attempt` mapping, `command_failed` when `port.fail`/`port.complete` itself rejects).
- `npm run build`: PASS, both `@istemer/demo` and `@northwind/demo` production builds.
- `git diff --check`: PASS, only the pre-existing CRLF conversion warnings already noted in earlier checkpoints.
- `git status --short`: confirms only five new untracked files were added by this checkpoint (`apps/istemer-demo/lib/workflow/research-transport.ts`, `research-signing.ts`, `research-worker.ts`, and their test files); nothing previously modified or untracked was touched.

Agents repo root (`i-STEMer-agents-hub`) —
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, 9 files / 35 tests (up from 33; +2 from `transport-parity.test.ts`).
- `npm run build`: PASS.

**Update, same checkpoint — the scheduler entrypoint (former next-step #2) is done.** New file
`apps/istemer-demo/lib/workflow/research-worker-service.ts`: `startResearchWorkerService(options)` runs
`runResearchWorkerCycle` on a fixed interval, guarantees no new cycle starts while one is still in flight
(matching the "one profile, no simultaneous writers" rule `i-STEMer-agents-hub/src/research/server.ts`'s
`busy` guard already enforces on the listener side), reports every cycle result via `onCycle`, and reports
an unexpected cycle *rejection* — a bug in the injected port/observer/dispatch, not a modeled
`WorkerCycleResult` — via `onCycleError` without ever throwing out of the interval or stopping the
schedule. `stop()` is idempotent. Five new tests using `vi.useFakeTimers()`, including one that
specifically proves the in-flight guard holds across several elapsed ticks while a `claim()` call is still
pending. This closes out the system-side half of the "Day 2: real Adam/Omar run" plumbing from
`FUNCTIONAL_DEMO_ROADMAP.md` end to end — contracts, SSRF-safe source observation, signing, HTTP dispatch,
claim/observe/dispatch/complete orchestration, and now scheduling are all written and tested. **What's left
in this phase is exactly the two things that were flagged as credential/staging-gated from the start and
still are**: a real `ResearchCommandPort` (needs the `bagos_research_executor` login role provisioned) and
a real Hermes provider behind the agents-hub listener (needs a provisioned, verified Omar profile). Neither
should be improvised without the project owner present.

Final commands after this addition — system repo: `npm run typecheck` PASS (all 8 workspaces), `npm run
lint` PASS (148 modules / 304 dependencies, no violations), `npm test` PASS 35 files / **276 tests**
(+5 from this addition), `npm run build` PASS both apps.

Exact next steps, in order: (1) implement a real `ResearchCommandPort` backed by a direct Postgres
connection, gated on the project owner provisioning a `bagos_research_executor`-granted login role — do
not improvise that credential; (2) provision and verify a real isolated Omar Hermes profile, per
`FUNCTIONAL_DEMO_ROADMAP.md` Day 2 — also gated on the project owner; (3) an independent Claude review pass
(a real second session, not self-review) of all six new files before any of this is wired to a live route
or a real Supabase project; (4) once this phase is credential-unblocked and reviewed, Day 3 of the same
roadmap (Ziad/Nour fan-out from the same Omar evidence version) is the next genuinely new phase — not yet
started. No Hermes/provider call, no live dispatch, no credential provisioning, and no deployment happened
in this checkpoint.

### Transport/execution continuation

System changes: `packages/core/contracts/package.json` adds the compiled `./research` subpath and `build:research`; new `packages/core/contracts/tsconfig.research.json` emits only the canonical research validator and declarations. Root source exports are unchanged. No application or SQL code changed in this continuation.

Agents changes: `package.json` / `package-lock.json` pin a locally generated contracts archive and Zod 3.25.76 and add a production build; new `tsconfig.build.json`, `contracts/bagos-contracts-0.0.0.tgz`, `contracts/research-package-provenance.json`, `src/research/contracts.test.ts`, `src/research/execution.ts`, `src/research/execution.test.ts`, `src/research/server.ts`, `src/research/server.test.ts`, `docs/RESEARCH_RUNTIME.md`. Generated `dist/` is build output, not a deployment. Review briefs outside repos: `claude-runtime-design-review.txt`, `claude-agent-execution-review.txt`, `claude-agent-execution-recheck.txt`.

The agents now consume the canonical compiled research contract without copied validators or a mutable sibling-directory dependency. Fingerprints and package-lock integrity bind the local archive; tests detect divergence from the current canonical source. This is not signed upstream attestation. The authenticated execution/HTTP layer validates scope, lineage, host snapshot hashes and times before inference; revalidates model artifacts; supplies explicit gaps for uninspected URLs; returns typed provider/timeout failures; rejects replay after SQLite/listener reopen; and admits only one active inference per listener. A cancellation-classification race was repaired and tested with immediate and delayed rejecting adapters.

Claude design review was debated, not blindly accepted. Retained durable nonce replay protection because completion idempotency does not prevent repeated paid inference. Code-review session `5a4d050d-d22c-4c25-9234-d46df68d4893` returned PASS on recheck after withdrawing two unsupported findings and verifying the timeout repair. Exact design and evidence boundaries are in the agents `docs/RESEARCH_RUNTIME.md`.

Commands: system `npm run build:research --workspace @bagos/contracts` PASS; archive `npm pack ./packages/core/contracts --pack-destination ../i-STEMer-agents-hub/contracts --ignore-scripts` PASS; agents `npm install ./contracts/bagos-contracts-0.0.0.tgz --save-exact --ignore-scripts` and `npm install zod@3.25.76 --save-exact --ignore-scripts` PASS. Agents `npm run typecheck`, `npm run lint`, `npm test` (33), `npm run build` PASS. System `npm run lint`, `npm run typecheck`, `npm test` (204), and `npm test --prefix supabase/tests` (49) PASS. Final system production build is checked again below.

This moves the packet forward but does not complete it: inference remains a test double, the listener has no service entrypoint, and no real Hermes/provider/source fetch or full worker restart was run. Next is the isolated Omar adapter and trusted system fetch/claim/complete worker. Installed Hermes source inspection found empty explicit tool lists differ from defaults, but startup also loads profile/project environment and customization state; adapter isolation must be verified rather than assumed. No secret contents were inspected. No deployment, upload, remote migration, model switch, commit or publishing occurred. The goal remains incomplete.

Final transport-continuation verification: system `npm run build` PASS for both applications; `git diff --check` PASS with existing CRLF warnings only.

### 2026-09-16: authenticated command and retrieval slice

This section supersedes the historical checkpoints below. Overall packet remains **BLOCKED for live staging readiness**, not complete. No deployment, VPS upload, remote migration, secret reads, commit or publishing occurred.

The workflow POST no longer calls the simulated four-agent engine. It verifies Auth and current membership, derives the configured brand tenant server-side, rejects browser authority fields, accepts same-origin bounded JSON only, and invokes the durable submission command. The two unapplied task/lease migrations now require `expected_tenant uuid` in their public/private submission and retry signatures; the database rejects a server/database binding mismatch before writes. This does not let callers select another tenant: the private singleton binding remains authoritative. Acceptance is HTTP 202, not execution success. Errors are versioned and redacted.

Completion migration `20260916061530_adam_omar_research_completion.sql` validates attempt identity, active requester, lease, lineage, evidence and host receipts; it atomically persists output/revision/body/outcome/audit and succeeded states. Digest-matched completion replay is idempotent. All nine migrations execute in the local SQL suite. Host receipt authenticity still depends on the future trusted observer; passing SQL checks does not make model-supplied receipts trustworthy.

GET `/api/workflows/[runId]` reauthorizes and filters by tenant, requester and resource ID. It reads persisted status, latest attempt and completed revision body, and fails closed when successful output is missing or identity/lineage/attempt mismatches. The form sends no authority fields, preserves the submission key after an ambiguous network failure while mounted, stores the accepted run locator in the page URL, reloads from the API on remount, displays failures and offers explicit eligible retry. The URL is only a locator, never authorization. No Ziad/Nour or approval buttons remain in this packet form; legacy approval source is unchanged.

Claude read-only reviews:

- Completion transaction: PASS, session `271afdb1-1884-483d-b906-76426fbb7b81`.
- Command routes and binding repair: PASS, session `706eddbe-78ef-4a6a-aa8e-697e6454ee7d`.
- Retrieval/form: PASS, session `ed317672-3f50-437c-a8a1-8c59256a762f`. Its requested authentication, successful retrieval and mismatched-lineage tests were added. An extra completed-attempt binding check was added after this review and tested locally.

Exact source files changed in this continuation (paths relative to system repo):

- `packages/core/contracts/src/index.ts`
- `packages/core/contracts/src/research-packet.ts`
- `apps/istemer-demo/lib/workflow/research-request.ts` (new)
- `apps/istemer-demo/lib/workflow/research-commands.ts` (new)
- `apps/istemer-demo/lib/workflow/research-read.ts` (new)
- `apps/istemer-demo/app/api/workflows/route.ts`
- `apps/istemer-demo/app/api/workflows/retry/route.ts`
- `apps/istemer-demo/app/api/workflows/[runId]/route.ts` (new)
- `apps/istemer-demo/app/[locale]/t/[tenantId]/WorkflowBriefForm.tsx`
- `apps/istemer-demo/app/[locale]/t/[tenantId]/page.tsx`
- `apps/istemer-demo/__tests__/research-workflow.test.ts` (new)
- `apps/istemer-demo/__tests__/research-brief-form.test.tsx` (new)
- `supabase/migrations/20260916055804_adam_omar_durable_tasks.sql`
- `supabase/migrations/20260916060831_adam_omar_attempt_leases.sql`
- `supabase/tests/research-packet.test.mjs`
- This document and historical-status notices in `STAGING_DEPLOYMENT_PREFLIGHT.md` / `MVP_RELEASE_MANIFEST.md`.

Agents tooling files: `eslint.config.mjs` (new), `package.json`, `package-lock.json`. Added pinned TypeScript ESLint parser/plugin 8.67.0 using install scripts disabled. No agents runtime source changed in this continuation. Review briefs outside both repos: `../claude-completion-review.txt`, `../claude-command-review.txt`, `../claude-retrieval-review.txt`.

Verification in system repo:

- `npm run lint`: PASS (ESLint, dependency boundaries, primitive tokens, brand hardcodes).
- `npm run typecheck`: PASS, all workspaces. Earlier one optional-chain error was repaired.
- `npm test`: PASS, 204 tests in 31 files.
- `npm test --prefix supabase/tests`: PASS, 49 tests (23 baseline, 26 research).
- `npx vitest run apps/istemer-demo/__tests__/research-workflow.test.ts`: initially 19 PASS, then 24 PASS; latest full run includes 26 PASS after retrieval coverage additions.
- `npx vitest run apps/istemer-demo/__tests__/research-brief-form.test.tsx`: PASS, 3 tests.
- `npm run build`: PASS, both demo production builds; final post-review build rerun recorded below.
- `git diff --check`: PASS; existing CRLF conversion warnings only.

Agents repo: `npm test` PASS 17; `npm run typecheck` PASS. Initial `npm run lint` failed due to absent flat config; repair and final verification recorded below. `npm audit --json` reported five dev-tool dependency advisories: three moderate, one high, one critical, in Vitest/Vite/esbuild/mocker/vite-node. No forced major-version audit fix was applied; no test UI server was started. This is unresolved security work before packaging development tooling.

Evidence limits and exact next step:

- HTTP and React tests double only Auth/PostgREST/fetch boundaries. Remount is tested, not a live browser login/refresh against staging.
- SQL tests execute real migrations in PGlite with synthetic Auth context. They are not live Supabase/PostgREST or multi-connection PostgreSQL proof.
- Real Omar execution, trusted source inspection with SSRF controls, shared cross-repo contracts, signed HTTP dispatch, worker polling and killed-worker/restart recovery remain unimplemented/unverified end-to-end. The route does not fall back to fixtures.
- Next: implement the system-owned worker and agents-owned authenticated Hermes runtime, sharing versioned contracts and never passing database credentials to agents; then run provider-failure, timeout and actual restart scenarios. Dedicated worker login, tenant binding and isolated Omar profile/provider must be provisioned only within later authorized staging work.
- Same request key is durable and SQL-idempotent; form key reuse currently covers same mounted form, not a reload before the acceptance response arrives.
- Both repositories remain dirty on their original main commits (system `f9aa20a4c1b2ef6b144627e0aaaec4eaaddaee10`; agents `a88815f304b7417bf32ca0cd2cf2369b45c2d767`). No unrelated tracked/untracked work was removed.

Final checkpoint reruns: system `npm run build` PASS for both applications after the completed-attempt binding check; agents `npm run lint` PASS after flat-config repair; agents `npm test` PASS 17 and `npm run typecheck` PASS after dependency installation; agents `git diff --check` PASS. Agents package still has no runtime build/start scripts, so no agents production build was claimed. Clean-code/test-guard checks retained real SQL tests and explicit boundary doubles; docs-guard marked prior release/preflight material historical rather than implying current deployment readiness. Saved goal status was reported by the app as paused during this continuation; no model override, reset credit redemption or reserve activation was performed.

## Historical checkpoints (not current runtime claims)

### Lease/failure/retry commands implemented locally

`supabase/migrations/20260916060831_adam_omar_attempt_leases.sql` was CLI-generated and adds `research_attempts`, the NOLOGIN/NOBYPASSRLS command-only `bagos_research_executor` role, private claim/failure commands, and an authenticated requester-only retry wrapper. The executor has no direct table access and cannot retry. Commands use the same tenant write lock, bind attempts to task/run/tenant, enforce a single running attempt, five-minute expiry, and a three-attempt cap. Claim returns versioned task/handoff envelopes with stored brief lineage and `liveEffects=false`. Revoked requesters fail before execution. Expired leases become visible timeout failures on the next claim; they are not automatically retried. Failure and retry transitions are idempotent and audited. Research run INSERTs now also require the constrained command owner.

Claude session `07f753f7-f7d1-4513-a370-94b12af120da` returned **PASS for this local lease/fail/retry component**. Exact commands: `node --test research-packet.test.mjs` in `supabase/tests`: 18 PASS; `npm test --prefix supabase/tests`: 41 PASS (23 baseline + 18 full-chain checks); `npm run lint`: PASS. The exact inventory now contains eight migrations. No remote deployment or migration occurred.

Coverage includes one claim, duplicate failures/retries, provider failure, terminal invalid evidence, attempt cap, expired lease recovery, revoked requester, wrong-requester retry and command-only grants. Expiry was seeded as an already-expired valid attempt under the privileged local test harness; this is not a real killed-worker/restart test. PGlite is not evidence of multi-connection PostgreSQL concurrency or live Supabase behavior.

Next implementation is **transactional research completion**: validate active unexpired attempt and current membership under the tenant lock; validate evidence/host receipts/lineage; persist artifact/revision/body/inspection receipts/outcome digest/audit atomically; make duplicate completion digest-aware and reject stale attempts. Then wire actual worker polling/transport and route/UI retrieval. Worker polling must discover expired leases after process restart. A dedicated worker login and brand binding still require later authorized staging provisioning, not agent credentials.

### Durable enqueue implemented locally

New migration `supabase/migrations/20260916055804_adam_omar_durable_tasks.sql` was generated by `supabase migration new adam_omar_durable_tasks`, then edited locally. It adds immutable tasks and revision bodies, a private singleton brand binding (empty), constrained non-login/non-bypass command ownership, and `public.submit_research_brief(jsonb)` as an invoker wrapper. The command derives requester from Auth and tenant from the database binding, enforces active membership/owner MFA, rejects browser authority fields, serializes against membership mutations with the tenant write lock, checks input digest for idempotency, and transactionally creates campaign/objective/queued research run/task/brief revision/body/audit. No output research artifact has been produced yet.

Legacy-command corruption identified by Claude session `bf419a02-fac2-4968-be84-e76a4805b9b6` was repaired with invoker table guards: legacy postgres-owned calls cannot mutate research runs or attach/reparent artifacts to them; research authority fields are immutable; research approvals are disabled for this packet. Synthetic paths remain untouched. Claude recheck `9ed6243a-0386-4257-895e-b225392bbda2` returned **PASS** for enqueue-only scope.

SQL coverage now runs via `npm test --prefix supabase/tests`: **33 PASS**, consisting of unchanged 23 baseline security assertions against the frozen baseline and 10 research checks against all seven exact migrations. `migration-inventory.mjs` is an explicit shared inventory; unknown additions still fail. The research fixture uses real PGlite pgcrypto and stubbed Auth/Storage, with no Auth users or remote effects. It tests creation, duplicates, changed-input conflict, wrong tenant, MFA, injected authority, malformed briefs, grants/role separation, legacy-call rejection, and complete rollback on late audit failure. It does not prove PostgreSQL multi-connection concurrency, persistent worker restart, live PostgREST, or real Auth.

`npm run lint` and `git diff --check` also passed (pre-existing warnings only). Exact additional changed files: new migration, `supabase/tests/research-packet.test.mjs`, `supabase/tests/migration-inventory.mjs`, `supabase/tests/phase-1a.test.mjs` (inventory setup only), and `supabase/tests/package.json` (runs both suites).

Next: restricted worker-executor role and transactional attempt leases/failure/retry/completion, persisted Omar output/receipts, then replace route and UI fixture flow. Command owner `bagos_research_command` stays NOLOGIN; worker invokes narrowly granted functions owned by it, never receives service-role credentials. Add direct approval-guard and failed-run retry-guard probes, research INSERT guard, and multi-connection concurrency evidence. The empty database brand binding needs a later explicit staging-provisioning step. No deploy/upload/remote migration was performed.

Superseding component review: Claude session `72a2265c-c2fd-4eb1-9125-94fe5456395d` completed with **PASS (with gaps, no defects)** for `research-packet.ts`, its tests, `lib/workflow/authorization.ts`, and its tests. This was a direct restricted Read/Glob/Grep CLI invocation in default permission mode, avoiding the relay's plan-mode dead end. No permission bypass or write tools were enabled. Earlier contract review `3d2c953f-638b-411e-863d-a6d89ce094c7` findings were addressed: receipt and lineage bounds, runtime expected-lineage validation, issuedAt lower bound, unique source URLs, and registry ownership of stale-attempt checks.

New authorization preflight derives the requester from verified Auth and tenant from server-only `ISTEMER_RESEARCH_TENANT_ID`. It accepts no browser/prompt parameters, requires active owner/operator membership, enforces owner AAL2, confirms active tenant, and grants only `competitor_analyst` / `research:read` with `liveEffects=false`. It is not yet called by the workflow route. Transactional authorization remains mandatory to prevent revocation races.

Latest commands and results:
- `npx vitest run packages/core/contracts/__tests__/research-packet.test.ts apps/istemer-demo/__tests__/research-authorization.test.ts`: PASS, 15 tests.
- `npm test`: PASS, 175 tests in 29 files (does not include the separate SQL suite).
- `npm run typecheck --workspace @bagos/contracts`: PASS.
- `npm run typecheck --workspace @istemer/demo`: PASS.
- `npm run lint`: PASS.
- `git diff --check`: PASS, existing CRLF warnings only.

Review gaps: add authorization infrastructure-error/null-client/operator-AAL1 cases; verify command-time membership and lease ownership in a real migrated database; persist inspection receipts with observed content hashes. Current tests use boundary doubles and do not prove live Auth/RLS behavior. Next implementation: transactional durable task/run/attempt schema and command functions, then route/worker integration. Do not spend further turns treating component hardening as end-to-end completion.

The inspection receipt contract now includes contract version and tenant/task/run/attempt IDs. Validation rejects cross-context receipts, duplicate receipt IDs, and inspection timestamps at or after task expiry. These checks do not establish receipt authenticity: the future host observer must supply receipts independently of model output.

Commands rerun after this change:
- `npx vitest run packages/core/contracts/__tests__/research-packet.test.ts`: PASS, 7 tests.
- `npm run typecheck --workspace @bagos/contracts`: PASS.
- `npm run lint`: PASS, including dependency, primitive-token and domain-hardcode checks.
- `git diff --check`: PASS with existing CRLF warnings.

Claude contract review was dispatched from this repository to avoid the previous sibling-path permission failure. Session `daac0d39-2111-47c6-8f5d-c661aec68879` reached its four-minute watchdog after attempting an unavailable plan-writing step. No final review was returned. This is NOT reviewer approval. Artifacts are in `../claude-research-contract-review-result/`. Resume or replace that review mechanism before accepting this component.

The route still executes `runInitialMarketingWorkflow` with `fixtureClock`; durable Adam/Omar execution is not wired. SQL/security, full build, real-provider and refresh/restart workflow verification remain outstanding. No deployment or remote mutation occurred.

Scope follows the user's explicit Adam/Omar packet, including durable worker restart recovery. Claude review completed in session 78ebb287-a8da-4f4e-873c-46d5ea50cba5. The full report is in the sibling directory claude-repair-review-result/final.txt. Its file-change detector observed concurrent Codex additions of research-packet.ts and its test; this was not an attribution of edits to Claude.

## Review rulings

Accept: private schema stays unexposed; null-safe authorization; persisted immutable bodies; database-derived digests; digest-aware transactional idempotency; actual authenticated transport; completed review required.

Reject: Claude's proposal to implement approval decisions in this packet (outside user scope), defer queue worker recovery (explicitly required), treat mock transport as proof of real research, and write an audit row then raise in the same transaction (the row would roll back). Claude's claim that its rulings are binding does not supersede the user's requirements.

## Existing path

apps/istemer-demo/app/api/workflows/route.ts calls runInitialMarketingWorkflow from packages/core/engine/src/index.ts with fixtureClock. It runs all four simulated agents. New Adam/Omar execution must replace that caller path while preserving unrelated source files.

Existing agent-transport.v1 contracts lack content and attempt-bound inspection evidence. New research.v1 validators have been added separately; no existing contract was replaced.

## Files added in this checkpoint

- packages/core/contracts/src/research-packet.ts
- packages/core/contracts/__tests__/research-packet.test.ts
- docs/ADAM_OMAR_REPAIR_PACKET.md

The new contract is not yet wired or exported. It rejects identity fields in browser briefs, validates bounded versioned task/handoff/artifact/error objects, binds results to task/run/attempt/tenant and requires independently supplied inspection receipts for evidence claims. Receipt authenticity must be established by the eventual worker, not by the model returning its own receipts.

## Exact next implementation file plan

System existing files to modify:
- packages/core/contracts/src/index.ts
- apps/istemer-demo/app/api/workflows/route.ts
- apps/istemer-demo/app/api/workflows/retry/route.ts
- apps/istemer-demo/lib/workflow/persistence.ts
- apps/istemer-demo/app/[locale]/t/[tenantId]/WorkflowBriefForm.tsx

System new files:
- apps/istemer-demo/app/api/workflows/[runId]/route.ts
- apps/istemer-demo/lib/workflow/authorization.ts
- apps/istemer-demo/lib/workflow/research-transport.ts
- apps/istemer-demo/lib/workflow/research-worker.ts
- apps/istemer-demo/__tests__/research-workflow.test.ts
- supabase/tests/research-packet.test.mjs
- One CLI-generated research task/attempt migration; exact timestamp path will be recorded before editing it.

Agents new files:
- src/research/worker.ts
- src/research/hermes-adapter.ts
- src/research/server.ts
- src/research/worker.test.ts
- eslint.config.mjs

Agents existing files planned:
- package.json
- package-lock.json (only if dependency changes require it)
- tsconfig.json

Contract-sharing/package setup will require a deliberate cross-repository dependency decision before editing agents imports. Do not silently copy mismatching contracts.

## Verification executed

- npx vitest run packages/core/contracts/__tests__/research-packet.test.ts: PASS, five tests.
- npm run typecheck --workspace @bagos/contracts: PASS.
- npm run lint (system): PASS.
- git diff --check: PASS with pre-existing CRLF normalization warnings.
- npm test --prefix supabase/tests: FAIL, all 23 tests blocked in setup by migration inventory assertion 6 !== 1. Assertion was not removed or weakened.
- hermes --help; hermes chat --help; hermes profile --help; hermes profile list: inspected local CLI. Only default profile exists and gateway is stopped. No provider execution attempted.

No claim of real runtime, persistence, refresh or restart recovery is established by these tests. Full unit/typecheck/build and scenario matrix remain outstanding. No deployment, upload, Nginx modification, Supabase change or credential inspection occurred.
