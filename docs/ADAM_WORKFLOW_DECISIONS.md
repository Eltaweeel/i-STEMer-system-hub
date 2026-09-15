# Adam workflow decisions and next build

2026-09-15. Owner interview record and proposed engineering sequence. This supersedes conflicting recommendations in HERMES_ROLE_PROPOSAL.md; it does not claim implementation, provider compatibility or deployment readiness. Frozen architecture remains historical input; the phase plan needs a reviewed amendment for agent execution.

## Confirmed roster

Runtime clarified by the owner: **Nous Research Hermes Agent**. Engineering must pin and verify its selected release; the software choice is settled, installation/version and adapter details are not.

Use Name (Role) in both interfaces: Adam (Main Orchestrator), Nour (Content Creator), Omar (Competitor Analyst), Ziad (Reel Analyst), Mariam (Social Media Coordinator), Hana (Graphic Designer), Seif (Media Buyer), Nada (Talent Acquisition), Mazen (Business Developer).

Initial specialist team: Nour, Omar and Ziad under Adam. Latest direction adds Hana as the recipient of Ziad's creative findings and intended producer of graphic designs. Her activation in the initial release versus the next increment is not explicitly settled. Human marketing staff create the reels; Ziad analyzes them rather than producing finished videos.

## Confirmed workflow

Adam coordinates and assembles the result. Omar researches competitors and sends evidence to both Ziad and Nour. Ziad builds on Omar's findings to analyze competitor videos/reels, hooks, creative choices and observable performance so the business can learn from successful approaches. His findings go to Hana and Hadeer's human marketing team, and inform Nour's calendar. Nour owns a one-week content calendar. Hadeer approves the calendar/strategy first, then finished posts before publication. Marketing employees may publish already-approved posts within their approval without asking again.

Engineering interpretation: distinguish observed metrics from inferred reasons for performance; record source, observation date and unavailable data. Learn patterns and create original work rather than representing copied competitor material as original. Do not claim conversion or causal performance evidence from public engagement alone.

## Confirmed authority and communication

- Abdo, Hadeer and employees can speak to Adam. Department scope limits employees; Abdo and Hadeer control explicitly shared items.
- Research within permitted information, planning, drafting and delegation may proceed without repeated confirmation. Ask when essential details are missing.
- Hadeer approves publishing, customer messages, spending, price changes and business commitments. Approved posts and approved customer-message templates/rules can be used by employees without fresh approval inside that scope; exceptions require approval.
- Inspect permitted system health and diagnose automatically; deployments, configuration changes and access changes need Abdo's technical authorization under the applicable business permissions.
- Out-of-authority requests are explained and may become a request to the correct approver; they are not executed.
- Approval through either Telegram or web is sufficient. Both must write the same authoritative decision with verified identity, current permissions and exact proposal binding. The previous web-only approval recommendation is rejected. Engineering must establish equivalent assurance rather than silently forcing all decisions onto web.
- Safe limited retries stay within original authorization; stop for uncertain outcomes, scope changes or cost changes.
- Two scheduled briefings only: start and end of day. On-demand responses remain available; no additional unsolicited notification exception is approved. Times, operating days, timezone and delivery selection remain open.
- Abdo remains primary technical custodian; Hadeer remains emergency-only technical backup, separate from her business-owner authority. Independent recovery is still required.

## Confirmed capacity direction

Show actual connected-account remaining limits/reset information where available and clearly labeled estimates of whether usage will last until reset. Abdo and Hadeer see overall capacity and can set/change employee allowances; employees see their own allowances. At 90 percent consumed, queue nonurgent work and switch eligible work to an approved cheaper model. Never assume a model switch creates quota. Exact measured window, fallback list, exhausted/unknown-state behavior and forecast method need engineering specification.

Use Abdo's account for the demo and a separate business account later. The feature must follow the connected account, not a hardcoded account. Provider limits, internal employee allowances and forecasts are distinct. Codex is the intended harness; compatibility with the intended Hermes software/profile mechanism and supported account authentication requires verification before promising runtime support. No credentials belong in agent profiles or these documents.

## Proposed next engineering sequence

### First workflow contracts to specify

| Profile | Inputs | Required output | Handoff |
| --- | --- | --- | --- |
| Adam (Main Orchestrator) | Authorized requester, business brief, deadline and budget | Bounded task plan, task status, combined review package | Assign Omar, Ziad and Nour; route approvals to Hadeer |
| Omar (Competitor Analyst) | Approved competitor/source set and research question | Source-linked competitor findings with timestamps, observed metrics and gaps | Same versioned evidence package to Ziad and Nour |
| Ziad (Reel Analyst) | Omar evidence plus accessible video/audio/transcript material | Creative analysis: hook, structure, pacing, visual treatment, CTA, performance evidence and reusable hypotheses | Creative brief for Hana and human marketing; analysis for Nour |
| Nour (Content Creator) | Business objectives, Omar findings, Ziad findings, production constraints | One-week calendar with purpose, channel, format, concept, evidence and asset requirements | Calendar/strategy approval by Hadeer, then production brief |
| Hana (Graphic Designer) | Approved strategy, brand assets and Ziad creative brief | Proposed original graphics with versions and source/asset references | Finished-post review by Hadeer; production team receives approved assets |

These are proposed data contracts, not verified runtime profile configuration. Ziad must state whether he actually inspected video frames/audio or only metadata/transcripts; unavailable modalities must not become invented visual observations. Findings may be prepared in parallel where independent, but Nour's final package must identify the exact upstream versions used.

### Build order

1. Verify which Hermes runtime/profile system the owner means and how it integrates with the chosen Codex harness. Inventory supported profile isolation, tool access, delegation, quota telemetry, restart and deployment mechanisms. Do not invent configuration keys or treat nine prompts as nine isolated agents.
2. Define a profile contract for each initial agent: stable ID/display name, responsibility, input/output schema, permitted data/tools, memory scope, budget, handoff and failure behavior. Adam delegates only bounded work; specialists cannot expand permissions or recursively spawn unbounded agents.
3. Amend the phase plan against current owner decisions. Preserve Auth, tenant/department authorization, audit and custody prerequisites; identify the first runnable slice and its acceptance checks. Do not bypass baseline safeguards to reach an impressive agent demo.
4. Implement a local controlled workflow: supplied competitor evidence -> Omar report -> Ziad creative analysis plus Nour draft -> one-week calendar -> first human approval -> final asset package -> second human approval. Use labeled fixtures before live sources, no actual publishing or customer delivery in the first slice.
5. Add Hana's design adapter and human production handoff in the appropriate agreed increment. A calendar approval never implicitly approves a later asset.
6. Connect web and Telegram to the same task/decision services; test denied scope, stale approval, duplicate channel approval, revocation and uncertain outcomes.
7. Implement connected-account capacity reporting and internal allowance enforcement only using verified interfaces; show unavailable/stale information instead of guessed quota. Test the 90-percent rule and fallback exhaustion.
8. Package a VPS staging deployment with separate runtime credentials, least privilege, durable jobs, restart recovery, logs, backup/restore and rollback. Deploy only after concrete target/runtime and operational prerequisites are verified; verify one end-to-end staging workflow before business use.

Claude leads planning and reviews; Codex implements bounded packages. Existing user model preferences apply. Neither a named profile nor a local fixture pass proves live execution or deployment readiness.

## Missing inputs that cannot be inferred

- Installed Hermes location/version, if already present, otherwise a verified pinned release for Nous Research Hermes Agent.
- First competitor sources/platforms and a small sample set to define the analysis inputs; supplied sample files can support early local work.
- VPS target and current deployment environment, to be inspected without printing secrets before deployment planning is finalized.

Remaining engineering choices should be resolved by the agents, not converted into another broad owner questionnaire.

## Official runtime findings — 2026-09-15

Hermes documents profiles as independent state homes for configuration, memory, sessions and skills. Profiles are not security sandboxes; OS/container and backend authorization boundaries are still needed. Do not run multiple writers against one profile home. See [official profiles documentation](https://hermes-agent.nousresearch.com/docs/user-guide/profiles).

Hermes documents an OpenAI Codex provider with subscription device-code authentication. This supports investigating the selected runtime/provider pairing, but does not prove our target account compatibility, quota telemetry, video-analysis capability or deployed integration. Hermes is the agent runtime in this architecture; distinguish its Codex provider from running Codex CLI as a nested execution harness. See [official providers documentation](https://hermes-agent.nousresearch.com/docs/integrations/providers). No login or token import was performed.

## Claude planning review and coordinator rulings

Claude Opus high completed a read-only review on 2026-09-15 (session 84276262-851a-441c-bfbb-cf9c3b5cff1f). Accepted: amend the existing phase lanes instead of bypassing Auth/approval gates; one shared decision service; profile/handoff contracts before a live workflow; Hana can follow the first analysis/calendar slice. The latter remains a sequencing recommendation, not an owner decision.

Corrections to the proposed first package: keep reusable core contracts tenant-neutral and put Adam/team names in i-STEMer configuration; preserve existing dirty exports rather than overwrite them; repository scripts are lint, typecheck, test and build (there is no test:unit script). Use focused tests and applicable existing gates. Do not impose a hard-coded delegation depth without matching the selected Hermes mechanism. Hermes runtime identity and two-stage approval are already answered, so neither is a new owner question. External capability investigation is engineering work; only unavailable account/host access requires owner assistance.

First implementation handoff after the runtime spike and phase amendment: neutral profile/task/result contracts, tenant roster and versioned evidence handoffs with fixtures. Acceptance must prove scoped delegation, correct Omar-to-Ziad/Nour dependencies, clearly labeled missing video evidence, two distinct approval stages in the fixture story, and no claim of live effects. No live runtime/deployment success is claimed by this planning review.
