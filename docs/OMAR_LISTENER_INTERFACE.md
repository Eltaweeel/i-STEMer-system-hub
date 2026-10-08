# Omar listener: the interface the research worker requires

Status: **integration dependency, not verified against the VPS listener.** The Omar listener/adapter running on the VPS was
written separately and has not been pushed to any repository this branch can see. Everything below is derived from the
worker's own code on this branch (the client side). The listener on the pushed agents-hub branch `omar-staging-slice`
(`c9ca096`) passes this repository's local end-to-end test (`apps/istemer-demo/__tests__/research-slice-e2e.test.ts`), but
that is not evidence about the VPS copy. Before the first live run, someone must check the VPS listener against each
numbered item and record the result here.

Source of truth in this repository: `apps/istemer-demo/lib/workflow/research-signing.ts`,
`research-transport.ts`, `research-response-auth.ts`, `research-worker.ts`.

## 1. Where it listens

- Plain HTTP on `127.0.0.1:<ISTEMER_OMAR_PORT>` only. The worker refuses any other host, and does no TLS.
- `POST /v1/research/tasks`. No other path is used.

## 2. What the worker sends

- Headers: `Content-Type: application/json`, `Content-Length`, and `X-Istemer-Auth`: a JSON object
  `{ version: "research-http.v1", keyId, nonce, issuedAtMs, expiresAtMs, signature }`.
  - `keyId` matches `[A-Za-z0-9_-]{1,64}`; `nonce` is 64 lowercase hex characters, single use; `expiresAtMs - issuedAtMs` is
    30 000 (the verifier must refuse windows over 60 000).
  - `signature` = hex HMAC-SHA256 with the shared key (32+ bytes) over these lines joined by `\n`:
    `research-http.v1`, `POST`, `/v1/research/tasks`, keyId, nonce, issuedAtMs, expiresAtMs, hex SHA-256 of the body bytes.
- Body (at most 2 MiB): `{ task, handoff, snapshots }`.
  - `task` is a `research.v1` task (`ResearchTaskSchema`): tenant, requester, attempt, lease times, the brief, `liveEffects: false`.
  - `handoff` is a `research.v1` handoff with the same task/run/attempt/tenant ids.
  - `snapshots` is `[{ receipt, text }]`: the worker-issued inspection receipt and the page text it hashed. **The text is
    untrusted web content.** The listener must pass it to the model as data, never as instructions, and must not treat any
    instruction inside it as authoritative. Nothing in this interface makes the model immune to prompt injection.

The listener must verify the signature, the window and the nonce (replay store) **before** any work or lock, refuse a
tenant other than its configured one, and run at most one inference per attempt id.

## 3. What the worker accepts back

Every response, success or error, must carry `X-Istemer-Response-Auth`: a JSON object
`{ version: "research-http-response.v1", keyId, requestNonce, status, issuedAtMs, signature }` where `signature` is hex
HMAC-SHA256 with the same key over these lines joined by `\n`: `research-http-response.v1`, `RESPONSE`, `POST`,
`/v1/research/tasks`, request keyId, request nonce, request signature, HTTP status, issuedAtMs, hex SHA-256 of the exact
response body bytes. The worker rejects a response issued before the request, more than 30 s before it verifies it, or more
than 5 s in the future. **There is no unsigned mode:** anything missing, malformed or mismatched is a transport failure,
recorded as `provider_failure`, and the body is never parsed.

Body, at most 1 MiB, one of:

- HTTP 200 `{ "artifact": <research.v1 artifact>, "reportedTokens"?: <integer> }`. The worker re-validates the artifact
  against its own receipts and the handoff; evidence citing a receipt the worker did not issue is `invalid_contract`.
  `reportedTokens` is optional; when absent the usage row records `usage_reported = false`, never zero.
- `{ "error": { "code": <code> } }` with any status. Codes `provider_failure`, `timeout`, `invalid_contract`,
  `uninspected_source`, `unauthorized`, `persistence_failure` are recorded as given; `expired` and `stale_attempt` become
  `invalid_contract`; anything else becomes `provider_failure`.

## 4. Timing

The worker's dispatch deadline is `RESEARCH_WORKER_DISPATCH_TIMEOUT_MS` (default 200 s, total from connect to the last
byte), and never beyond the attempt lease minus a 45 s completion margin. The listener's own model budget must be shorter.
A dispatch that is cut off is recorded as `provider_failure` and is **not** retried automatically; only the requester's
explicit retry starts a new attempt, and that new attempt may repeat a paid inference.

## 5. What the listener must never receive

No database URL or credential, no Supabase key, no worker login. It holds only its copy of the signing key.
