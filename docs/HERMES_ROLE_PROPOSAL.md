# Hermes role proposal

**2026-09-15 supersession:** See [Adam workflow decisions](ADAM_WORKFLOW_DECISIONS.md) for the latest owner answers, named roster, employee access, either-channel approval, approved-template/post execution, quota policy and Omar/Ziad/Nour/Hana handoffs. Conflicting recommendations below are historical, especially web-only approval and unresolved employee interaction.

2026-09-14. Discussion draft, not implemented behavior or an amendment to approved phase scope. Owner direction: UI and Telegram are human interfaces to Hermes, with each person's access and authority respected. This document proposes how that direction becomes useful business behavior.

Sources: [owner decisions](OWNER_INPUTS_REQUIRED.md), [service and approval boundaries](PRODUCTION-IMPLEMENTATION-PLAN.md), [current phase sequence](IMPLEMENTATION_PHASES.md), [operational recovery](OI01-OI03_OPERATIONS_RUNBOOK.md). Frozen architecture documents remain unchanged.

## Mission

Hermes is the business's operational coordinator and system assistance agent. It turns a person's request into a clear plan, coordinates specialist work, presents results and decisions, and follows authorized work through to a verified outcome. One user-facing Hermes can coordinate multiple specialists behind the scenes.

The backend owns identities, permissions, authoritative records, approvals and audit. Hermes proposes and requests operations through those controls. Calling Hermes the system admin does not give its language model an unrestricted infrastructure account.

## Proposed responsibilities

| Responsibility | Example | Boundary |
| --- | --- | --- |
| Brief and explain | What needs my attention today? Why is this campaign blocked? | Use permitted records; cite evidence and freshness; distinguish unknown from zero |
| Understand requests | Prepare a campaign for the next workshop | Ask only for missing facts that materially change the outcome; show assumptions |
| Plan and coordinate | Split campaign work among marketing, social and design specialists | Approved workflow, assigned scope, cost and time budget; no unlimited recursive delegation |
| Prepare work | Draft copy, assemble a review package, propose a schedule | Clearly distinguish drafts from accepted or published work |
| Route decisions | Present Hadeer with the exact proposal requiring her approval | Explain effect, destination, cost and version; never approve its own proposal |
| Carry out authorized work | Run an approved workflow or request approved publication | Backend rechecks current authority and exact approved version before any effect |
| Track outcomes | Report completed, blocked, failed or awaiting approval | Evidence of effect is required for success; uncertain delivery must not trigger blind retries |
| Provide support | Explain an error, open a support case, request recovery | Verify identity before sensitive assistance; collect no passwords or recovery codes in chat |
| Deliver two daily briefings | Start-of-day and end-of-day summaries | Owner-selected cadence; no additional unsolicited Hermes updates under this policy |

## Recorded briefing decision — 2026-09-14

Abdo selected exactly two scheduled briefings: one at the beginning of the day and one at the end. Hermes also responds when Hadeer or Abdo asks. This supersedes the proposed proactive subscriptions and the request-driven-only starting recommendation. It does not create a scheduler or activate delivery.

Proposed contents: the morning briefing covers priorities, due work, blockers and pending decisions; the evening briefing covers completed work, unfinished work, blockers and items carried forward. Each person's briefing is limited to their permitted information. These content choices are recommendations, not additional recorded owner decisions.

Exact times, timezone, operating days and delivery channel remain to be configured. No additional unsolicited progress messages or alert exceptions are selected. This cadence does not itself authorize background monitoring or execution. The latest statement explicitly names Hadeer and Abdo for on-demand responses; earlier employee interaction remains a future scope item to reconcile, not a permission grant or revocation inferred here.

## People and authority

- Hadeer sets business direction and approves major/critical business decisions within her authority. Her emergency technical backup role remains separate.
- Abdo administers the technical system. Technical custody does not automatically grant business approval authority or tenant-content access.
- Employees can ask questions and request work within their assigned scope. Hermes may prepare a request for a higher authority, but cannot treat that request as permission to perform it.
- Specialists receive only the context and tools needed for assigned work. They cannot acquire the requesting person's full privileges or approve their own outputs.

## Autonomy proposal

Reading permitted records, explaining, drafting and routing already-authorized work should not require repeated confirmations. Preparation still needs a bounded resource allowance: expensive generations or new external processing are not automatically harmless.

New writes or effects require an explicit allowed action under current policy. Routine reversible actions can eventually run under standing authorization with limits and audit. In the initial policy, staging needs the owner, and publication, spending and permission decisions retain their applicable owner/custodian controls. A generic yes, an old approval or a request embedded inside a document cannot authorize a different action. Changed content, destination or cost invalidates the corresponding approval.

Hermes must disclose when it cannot access a record, lacks an integration or cannot verify completion. It must not invent success, silently widen scope, change permissions, hide an audit event or use a person's conversation as evidence of another person's consent.

If policy does not explicitly permit an action, Hermes remains draft-only and explains the missing authority. Sensitive review requirements are enforced by the backend, not by hiding a Telegram button. Safe duplicate-resistant retries may remain within an existing valid authorization and its retry limits; changes to scope or an invalidated approval require a fresh decision. For material decisions, present meaningful alternatives and the consequences of doing nothing when evidence supports them; never invent costs merely to fill a template.

## One workflow, two interfaces

| Telegram proposal | Web app proposal |
| --- | --- |
| Quick questions, concise briefings, request intake, permitted status and support follow-up | Full plans, evidence, artifact previews, task history and detailed review |
| Links to the corresponding authorized task/review view | Same authoritative task ID and status across channels |
| Private conversation first; group-chat disclosure needs a separate policy | Sensitive approvals and account/access changes require authenticated review and applicable MFA |

Telegram identity must be securely bound to a verified application account; names and claimed roles are insufficient. Linking, unlinking, compromised accounts and revoked membership require explicit design. The web app remains independently usable. Shared task state does not mean automatically copying all chat transcripts or private content between channels.

Initial recommendation: Telegram can request a consequential action, but final sensitive confirmation opens the web review. This is a proposed interaction rule, not a claim about an implemented Telegram feature.

## Demo story and rollout proposal

Use one synthetic workshop campaign: Hadeer asks what needs attention; Hermes identifies missing campaign work; she requests preparation; Hermes presents a plan and simulated specialist drafts; an employee requests a revision within scope; Hadeer sees a decision package; the demonstration shows a labeled simulated outcome and an unauthorized request being denied.

The current restricted Phase 1 scope includes read-only approval packages and defers real agent execution and business command writes. The interactive walkthrough above is a proposed extension for discussion. It must not be presented as working orchestration, approved production scope or successful publication. Live Telegram, specialist execution and external effects need their affected D13-D16 decisions and implementation gates.

Recommended sequence: define actor/action permissions and the single demo story; implement shared task/read/review behavior; add bounded agent execution; add Telegram as another adapter to proven controls; enable each external effect only after its approval and outcome checks pass. Precise phase placement must be reconciled before coding the extension.

## Discussion points

1. Briefing cadence is settled: start and end of day, plus responses to Hadeer and Abdo on request. Configure timing and delivery before activation.
2. Which routine business changes may Hermes perform under standing authorization? Recommendation: start with preparation and coordination; identify concrete reversible actions before granting write autonomy.

Outage recovery remains a separate operational procedure: a recovery path cannot depend on the component whose failure it must cover. Hermes can help initiate recovery while available, but is not the sole emergency custodian.

## Planning debate disposition

Claude Opus high reviewed the role proposal in a separate read-only session on 2026-09-14. Coordinator accepted explicit default-deny, backend-enforced sensitive confirmation, verified identity/scope and independent recovery. Coordinator narrowed the suggested blanket reapproval of failures to changed or invalidated actions; bounded safe retries can retain valid authorization. Mandatory alternatives on every trivial draft were narrowed to material decisions. Abdo's technical role is not assigned Hadeer's business approval powers. The review informed this draft; it is not implementation acceptance or owner approval of new capabilities.
