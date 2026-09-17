# i-STEMer functional demo roadmap

Status: active execution plan — 2026-09-15

## Milestone

Hadeer can authenticate in staging, submit a real request, observe Adam coordinating the real Hermes
profiles for Omar, Ziad, and Nour, review evidence-backed Instagram/Facebook outputs, approve the
strategy/calendar, review a second finished-post package, and see an audit trail. Nothing publishes
automatically.

This is a staging demo milestone, not production readiness. Meta publishing, customer messaging,
spending, price changes, business commitments, and deployment changes remain disabled.

## Repository ownership

- `i-STEMer-agents-hub`: Hermes profile specifications, SOUL instructions, specialist logic, runtime
  adapter, job execution, artifact envelopes, and agent health.
- `i-STEMer-system-hub`: authentication, tenant/membership authorization, task and artifact
  persistence, approval state, audit, UI, and the agents transport client.
- Shared boundary: versioned JSON contracts. Agents never receive direct database credentials and never
  write directly to system tables.

## Five-day execution plan

### Day 1 — contract and runtime proof

1. Freeze `AgentTask v1`, `AgentArtifact v1`, `AgentHandoff v1`, `ApprovalBinding v1`, and typed error
   envelopes.
2. Add a no-op transport adapter and contract fixtures in both repositories.
3. Verify the installed Hermes release, provider path, profile creation, toolset discovery, and one
   isolated profile. Do not import or print credentials.
4. Exit gate: a system task fixture serializes and round-trips through the agents adapter with tenant,
   requester, scope, and idempotency fields intact.

### Day 2 — real Adam/Omar run

1. Provision isolated Adam and Omar Hermes profiles from the source-controlled specifications.
2. Implement one staging-only job: authorized brief → Adam → Omar → versioned evidence artifact.
3. Persist task, run, artifact, and audit rows in Supabase using server-side authorization.
4. Exit gate: a real staging request produces one retrievable Omar artifact; duplicate idempotency key
   does not create a second run; unauthorized requester is denied.

### Day 3 — Ziad/Nour fan-out

1. Add Ziad and Nour profiles and bounded handoffs from the same Omar evidence version.
2. Supply a small approved competitor sample set and supplied reel media/transcript fixtures.
3. Persist modality-aware reel analysis and the seven-day calendar.
4. Exit gate: Ziad and Nour reference the exact Omar artifact revision; missing modalities are explicit;
   no finding claims uninspected media.

### Day 4 — Hadeer approval journey

1. Connect the existing web auth/session boundary to the real staging tenant.
2. Implement first approval for strategy/calendar and second approval for finished posts as separate
   revision-bound decisions.
3. Add audit entries, stale-revision rejection, duplicate-channel reconciliation, and denied employee
   approval tests.
4. Exit gate: Hadeer can approve both stages; changing the artifact revision invalidates the old
   approval; no agent can approve its own work.

### Day 5 — demo hardening and rehearsal

1. Add failure states for provider unavailable, timeout, duplicate delivery, missing media, and stale
   approval.
2. Verify browser flow, Arabic/English labels where in scope, audit visibility, no-live-effects banner,
   and redacted logs.
3. Package a repeatable staging start/stop/runbook and rehearse the stakeholder path twice.
4. Exit gate: clean staging run from login to second approval, with captured evidence and no external
   publication.

## Parallel lanes

- Runtime lane: Hermes pin, profiles, toolsets, health, restart behavior.
- Agent lane: Adam → Omar → Ziad/Nour prompts, schemas, bounded delegation, modality honesty.
- System lane: contracts, transport, Supabase persistence, authorization, approvals, audit.
- Demo lane: competitor/media fixtures, UI states, runbook, browser rehearsal.

## Cut to hit the milestone

Defer Hana, Mariam, Meta publishing, Telegram delivery, customer messaging, media buying, quota
fallback automation, VPS production deployment, broad uploads, and arbitrary MCP integrations. Keep
the provider/tool capability discovery, but implement only the four-agent marketing workflow.

## Hard blockers

- Hermes version/provider/profile creation cannot be verified on the staging host.
- No authorized Supabase/staging environment or test identity can be supplied.
- The approved competitor sources or sample media are unavailable.
- The system cannot enforce tenant membership and revision-bound approvals server-side.

If any blocker occurs, stop at that gate and report the exact evidence; do not substitute fixtures while
claiming a real run.
