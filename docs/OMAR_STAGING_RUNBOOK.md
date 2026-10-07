# Omar staging vertical slice -- VPS runbook

Status: **code-ready, not deployed, not run live.** Nothing in this document has been executed against the
VPS, Supabase, or a model provider. Treat every "expected" line below as a prediction to confirm, not a result.

Scope: one Omar competitor-research task, one staging tenant, `liveEffects: false`. No publishing,
customer messaging or spend.

## What runs where

```
Browser -> Next.js app (istemer-staging.service, existing)
             POST /api/workflows  -> submit_research_brief (RPC)   [creates the queued run + task; the worker's claim creates the attempt]
Research worker (NEW unit, istemer-research-worker.service)         [this repo, apps/istemer-demo/dist/research-worker.cjs]
   claim -> observe sources (SSRF-guarded fetch, genuine receipt) -> sign (HMAC) -> POST 127.0.0.1:<port>
Omar listener (NEW unit, istemer-omar-agent.service)                [i-STEMer-agents-hub, dist/research/main.js]
   verify signature + nonce + attempt-once guard -> spawn `hermes -p istemer-omar chat ...` (no tools)
   -> strict research.v1 validation -> JSON response
Research worker: validate again against its OWN receipts -> complete_research_attempt (idempotent)
Browser: GET /api/workflows/<runId> -> artifact shown in OmarEvidenceView
```

The worker and the listener are separate processes with separate secrets. The listener holds no database
credentials; the Hermes child receives only an allow-listed environment (no database URL, no signing key).

### What the code-review round established (read before deploying)

The pushed branches carry code only. Both repos were reviewed by independent Claude and Codex reviewers; each point below is
either fixed in code or is **open and needs a decision**. Nothing here has been run live.

Open, needs a decision (not fixed in code):

- **Evidence text is not bound to the page text.** A hostile source page can steer Omar into a wrong `observation` that still
  cites a real receipt. Structure, receipts and scope are enforced; meaning is not. Treat observations as model output.
- **`cli: []` is not a tool lockdown by itself.** Hermes still adds enabled MCP servers and plugin toolsets, and
  `scripts/verify-profiles.mjs` in agents-hub cannot see them. After provisioning, `hermes tools list` must show no enabled
  MCP server and no enabled plugin toolset; never provision the profile with `--clone`.
- **One attempt can cost more than one provider request** (Hermes API retries, automatic session titling). Recommended in the
  `istemer-omar` profile config: `auxiliary.title_generation.enabled: false` and a low `agent.api_max_retries`.
  `--run-budget` is advisory in Hermes 0.21.1; the hard stop is the worker's dispatch timeout or the client disconnect.
- **A completed Omar task also queues a Ziad task** in the same transaction (migration `20260918070000_adam_ziad_auto_enqueue`).
  No deployed process runs it, so those rows stay queued. Expect them after the first run (see cleanup below).
- **The VPS clock must be NTP-synchronised.** The observer compares the VPS clock with the database clock. A VPS clock behind
  the database clock now fails the attempt as `uninspected_source` (it used to hang until the lease timed out).

Closed by the security follow-up: the listener's answers are now HMAC-signed and the worker rejects anything unsigned,
mismatched or stale before parsing it (protocol `research-http-response.v1`, specified in `i-STEMer-agents-hub/docs/RESEARCH_RUNTIME.md`),
and the request signature is verified before the listener's single-flight lock is taken. Operational consequences: both
services must hold the same key file contents (already required) and a rotated key must be rotated on both before the next
run; a worker/listener pair with different keys fails every dispatch as `provider_failure` with no artifact; a listener that
was deployed from the first push (unsigned answers) cannot be paired with this worker, so deploy both from the same follow-up
commits. A response is also rejected if the VPS clock jumps more than 30 s between sending and verifying.

Fixed in code on these branches: an unexpected observer error is recorded instead of left running; a completion the database
can never accept (SQLSTATE 22023, 22P05, 42501, 55000) is recorded as `invalid_contract` instead of being retried and later
shown as a retryable timeout; artifact-level gaps (sources not inspected) are shown in the UI; the worker refuses a database URL
without `sslmode`; the listener requires `HERMES_HOME`, runs Hermes in that directory, caps its run budget at 180 s and logs one
reason-code line per failed inference; the profile name can be overridden with `ISTEMER_OMAR_PROFILE`.

The task brief spelled the profile `istemar-omar`. Every repo file and the Hermes profile list on the development machine say
`istemer-omar`, so that is the default. If the VPS profile really has another name, set `ISTEMER_OMAR_PROFILE`.

## Owner decisions and actions required before any live run

None of these were done by Claude Code or Codex; each is a hard gate.

1. **Migration state.** Confirm which migrations the staging project actually has. The research path needs
   `20260916055804_adam_omar_durable_tasks`, `20260916060831_adam_omar_attempt_leases`,
   `20260916061530_adam_omar_research_completion`, and, for metering, `20260920100000_hadeer_usage_allowances`
   and `20260920100100_hadeer_usage_enforcement`. The recorded ledger state (26 of 32 applied, one push of
   unknown outcome) is not resolved by this work.
2. **N7.** The known defect lives in `20260921090000_hadeer_finished_post_package.sql`. By static reading it
   creates the finished-post-package command and does not alter the research claim/complete functions or their
   grants, so it does not appear to block this slice. It is later in order than the research migrations. Do not
   assume this is verified: it has not been applied or exercised, and the fix is still awaiting your approval.
3. **Worker database login.** `bagos_research_executor` is `NOLOGIN NOINHERIT`. Create a dedicated LOGIN role
   for the worker and make it able to use the executor's privileges. Two options, neither verified against a
   live database: grant membership `WITH INHERIT TRUE`, or grant membership with SET and put
   `options=-c role=bagos_research_executor` in the connection string. The login should be able to execute
   only the executor's functions. Also confirm `private.research_brand_binding` names the staging tenant.
4. **Metering authority (review finding, unresolved).** `private.record_agent_usage` is granted to three
   executor roles and takes the agent category as an argument, so a research worker could record usage against
   another pipeline's terminal attempt. Consider revoking it from executors and exposing an agent-bound wrapper.
   The worker currently calls it with the fixed category `competitor_analyst`.
5. **Usage is unmeasured.** The Omar listener returns only `{ artifact }`, so the worker records
   `usage_reported = false`. Allowance enforcement sums reported tokens only, so allowances cannot be relied
   on for this slice. Decide whether to accept that for staging or to plumb Hermes usage through.
6. **Provider spend.** The first real run makes a paid inference call through the `istemer-omar` profile.
   The profile currently lists `anthropic/claude-opus-4.6`; confirm this is the intended model and budget.

## Provision (owner, on the VPS)

Users and directories (names are suggestions):

```sh
useradd --system --home /var/lib/istemer-omar --shell /usr/sbin/nologin istemer-omar
useradd --system --home /nonexistent --shell /usr/sbin/nologin istemer-research-worker
install -d -o istemer-omar -g istemer-omar -m 0700 /var/lib/istemer-omar      # replay store + Hermes state
# One private directory per service: neither service user can traverse the other's, and each only reads its own files.
install -d -o istemer-omar -g istemer-omar -m 0700 /etc/istemer-omar
install -d -o istemer-research-worker -g istemer-research-worker -m 0700 /etc/istemer-research-worker
```

Run every Hermes provisioning and verification command as the `istemer-omar` user with the Hermes home the service will use, not as root (root would create and check `/root/.hermes`, and every task would then fail with `Profile ... does not exist`):

```sh
sudo -u istemer-omar -H env HERMES_HOME=/var/lib/istemer-omar/.hermes hermes profile create istemer-omar --no-skills   # no --clone
sudo -u istemer-omar -H env HERMES_HOME=/var/lib/istemer-omar/.hermes hermes -p istemer-omar tools list
```

The Hermes profile `istemer-omar` must exist for the `istemer-omar` user (see
`i-STEMer-agents-hub/docs/HERMES_PROFILE_OPERATING_MODEL.md` and `scripts/provision-profiles.mjs`) with all
toolsets disabled and no MCP servers. Verify with the `tools list` command above that every toolset, plugin toolset and MCP server is
disabled before the first run.

Secrets (never in Git, never in the environment files themselves):

| File | Used by | Contents | Mode |
|---|---|---|---|
| `/etc/istemer-omar/signing.key` | listener | 32+ raw random bytes | `0400`, owner `istemer-omar` |
| `/etc/istemer-research-worker/signing.key` | worker | the same bytes | `0400`, owner `istemer-research-worker` |
| `/etc/istemer-research-worker/database.url` | worker | PostgreSQL connection string for the worker login. **Must carry `sslmode=verify-full`** (the worker refuses to start otherwise), plus `&sslrootcert=/etc/istemer-research-worker/supabase-ca.crt` pointing at the provider CA (file `0400`, owner `istemer-research-worker`). Confirm one connection works with that exact URL before the first run. | `0400`, owner `istemer-research-worker` |

Generate the key once (`head -c 48 /dev/urandom > file`) and copy it to both paths with the modes above. The `*.env` files are read by systemd as root, so they can be `0600 root:root` inside the same directories. After provisioning, verify each service user can read exactly its own files, e.g. `sudo -u istemer-omar head -c1 /etc/istemer-omar/signing.key` succeeds and the same command against the worker's key is denied.

### Listener environment: `/etc/istemer-omar/agent.env` (names only)

| Name | Meaning |
|---|---|
| `ISTEMER_OMAR_TENANT_ID` | the one staging tenant UUID the listener will accept |
| `ISTEMER_OMAR_KEY_ID` | key id the worker signs with (must equal `RESEARCH_WORKER_KEY_ID`) |
| `ISTEMER_OMAR_KEY_FILE` | absolute path to the listener signing key |
| `ISTEMER_OMAR_REPLAY_DB` | absolute path, e.g. `/var/lib/istemer-omar/replay.sqlite` (persistent, not in a release dir) |
| `ISTEMER_OMAR_HERMES_BIN` | absolute path to the `hermes` executable |
| `ISTEMER_OMAR_PORT` | loopback port, 1024-65535 |
| `ISTEMER_OMAR_RUN_BUDGET_SECONDS` | optional, 10-180, default 180 (advisory to Hermes; keep it below `RESEARCH_WORKER_DISPATCH_TIMEOUT_MS`/1000) |
| `HERMES_HOME` | **required, absolute.** The Hermes home root (`/var/lib/istemer-omar/.hermes`, not a profile directory). Forwarded to the Hermes child, which also runs with this directory as its working directory so no project context file can be picked up. The only other forwarded names are `PATH`, `HOME`, `LANG`, `TZ`, plus `SystemRoot`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` on Windows hosts. Provider credentials stay in Hermes's own configuration, not here. |
| `ISTEMER_OMAR_PROFILE` | optional Hermes profile name, default `istemer-omar` (`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`) |

Node 22.13 or newer is required for the listener (the replay store uses `node:sqlite`, which needs `--experimental-sqlite` before 22.13; the unit does not pass that flag).

### Worker environment: `/etc/istemer-research-worker/worker.env` (names only)

| Name | Meaning |
|---|---|
| `RESEARCH_WORKER_DATABASE_URL_FILE` | absolute path to the file holding the connection string |
| `RESEARCH_WORKER_SIGNING_KEY_FILE` | absolute path to the worker signing key |
| `RESEARCH_WORKER_KEY_ID` | `[A-Za-z0-9_-]{1,64}`, must equal `ISTEMER_OMAR_KEY_ID` |
| `RESEARCH_WORKER_AGENT_PORT` | must equal `ISTEMER_OMAR_PORT` (the worker only dials `127.0.0.1`) |
| `RESEARCH_WORKER_INTERVAL_MS` | optional, 1000-300000, default 5000 |
| `RESEARCH_WORKER_DISPATCH_TIMEOUT_MS` | optional, 5000-240000, default 200000 |

Deadlines: lease 5 min; Hermes `--run-budget` 180 s (advisory: Hermes does not stop on it); worker dispatch timeout 200 s (a hard total deadline from connect to end of response, not just an idle timeout); each worker database query is capped at
10 s (connecting is capped separately at 10 s, and a long dispatch lets the pool drop its idle connection, so a call can
take up to ~20 s); the worker holds back 45 s of the lease for persisting the result (two cold calls of up to ~20 s each plus a backoff), retries
`complete` only while the lease is open, and will not start a paid dispatch if less than that remains. The worker
unit allows 400 s to stop so an in-flight cycle can finish (bound derivation is in the unit file).

### Web app environment (existing `istemer-staging.service`) -- a VPS change that needs Abdo's approval

| Name | Meaning |
|---|---|
| `ISTEMER_RESEARCH_TENANT_ID` | the staging tenant UUID the UI may submit research for. **Without it the submit form is never shown and the API answers 503.** It must equal `ISTEMER_OMAR_TENANT_ID` and the tenant in `private.research_brand_binding`; check that all three are identical before the first test. |

Existing staging sign-in must already work (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN` present in
that service's environment). Adding the variable requires restarting `istemer-staging.service`.

### Host preflight (before installing the units)

- `/usr/bin/node --version` reports 22.13 or newer and `/usr/bin/node -e "require('node:sqlite')"` succeeds (both units hardcode `/usr/bin/node`; the web app uses its own runtime).
- `timedatectl` shows `System clock synchronized: yes`.
- The Hermes profile checks above pass, and one connection to the database with the exact `database.url` succeeds.

### Install and start

1. Build and install the listener from `i-STEMer-agents-hub`: `npm ci && npm run build`, copy `dist/` and
   `package.json`/`node_modules` to `/opt/istemer/agents-hub`, install `deploy/istemer-omar-agent.service`.
2. Build and install the worker from this repo: `npm ci && npm run build:research-worker --workspace @istemer/demo`,
   copy `apps/istemer-demo/dist/research-worker.cjs` to `/opt/istemer/research-worker/`, install
   `deploy/istemer-research-worker.service`.
3. `systemctl daemon-reload`, then start the listener first and the worker second (`systemctl start`; add `enable` only if you want them to survive a reboot, this runbook does not enable them). Do not run two listeners or two workers.

### Restart / redeploy

Restart through the listener unit (`systemctl restart istemer-omar-agent`): the worker unit is `PartOf` it, so the worker is stopped
first (it drains an in-flight cycle, up to 400 s) and started again afterwards. Restarting only the worker is also safe. Never kill
the listener while a run is in flight: that run is lost, a paid inference is wasted and one of the three attempts is used.

## Verification checklist (owner-authorized staging run)

Expected log lines are predictions. The worker logs one JSON line per non-idle cycle, identifiers only.

1. Worker log shows `{"event":"started",...}`; listener is listening on `127.0.0.1:<port>` only
   (`ss -ltn` shows no public bind).
2. Submit one research brief from the staging UI (one source URL on the permitted list).
3. Worker log shows `{"event":"cycle","outcome":"succeeded","runId":...,"attemptId":...}`.
4. `GET /api/workflows/<runId>` shows `status: succeeded`, and the UI shows the evidence with its inspection
   receipt id. The worker log carries `runId` and `attemptId` only: confirm they match the run id in the URL and
   `attempt.id` in the API response. The receipt id is visible in the UI and in the artifact JSON; the receipt's
   `contentHash` is stored in `research_outcomes.inspection_receipts` and is not rendered in the UI, so checking it
   against the captured page text is an owner query, not a UI step.
5. **Safe failure and recovery:** stop the listener, submit a second brief, expect
   `outcome":"failed","code":"provider_failure"` and a failed (retryable) attempt in the UI; start the listener
   and use the requester retry to confirm the next attempt succeeds.
   **Forged-response check (optional, owner-authorized):** with both units stopped, bind a throwaway local responder to the
   listener port that answers any POST with an unsigned `{"artifact": {...}}`, start only the worker, submit a brief, and expect
   `outcome":"failed","code":"provider_failure"` and no stored artifact. Remove the responder, then restart the real listener
   before any further test. This exercises the response-authentication rejection live; the unit tests already cover it.
6. **Cleanup.** The test leaves, per run: one research run/task/attempt set, one `research_outcomes` row with its receipts, a usage row
   with `usage_reported = false`, and (by the migration noted above) a queued Ziad campaign/run/task that nothing executes. They carry
   the run id from step 4. Keep them as evidence; do not delete staging rows without Abdo's approval. Stop both units if the test is
   finished and no further runs are wanted (rollback order below). Wait the 10 minutes stated under Rollback before removing the replay store.
7. Record the result in this file's "Live result" section. Until then the live state is
   `NOT RUN / UNVERIFIED`.

### Known unverified assumptions

- `hermes -p istemer-omar chat --query-file - -Q ...` prints exactly one JSON object to stdout (session id goes
  to stderr in the installed 0.21.1 source). Confirm with a real run; any extra stdout is treated as
  `provider_failure`.
- The `-p` profile flag selects the `istemer-omar` profile as the service user.
- The worker database login can execute the four private commands (see owner action 3).

## Rollback

Stop `istemer-research-worker.service` first, then `istemer-omar-agent.service`. No schema change is made by
this slice, so rollback is only stopping the units and removing the unit files; queued tasks stay queued and
an attempt in flight can no longer be completed once its 5-minute lease ends; it stays `running` in the database and UI until a worker next calls claim, which marks it failed (timeout). The replay store and Hermes state under `/var/lib/istemer-omar`
should be kept. Do not delete the replay store while any signed request or attempt lease could still be live: after
stopping both units, wait at least 10 minutes (60 s signing window plus the 5 minute lease, with margin) before
deleting it, otherwise a still-valid signed request could be admitted again and run a second paid inference.

## Live result

NOT RUN / UNVERIFIED.
