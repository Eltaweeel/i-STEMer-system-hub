# Staging deployment preflight

Historical pre-repair snapshot. For current local implementation and verification, see [Adam/Omar repair packet](ADAM_OMAR_REPAIR_PACKET.md). The simulated workflow caller described below has since been replaced by authenticated durable enqueue/retry/retrieval; real Hermes worker execution and live staging verification remain outstanding. Deployment remains BLOCKED. Access findings below have not been rechecked in the latest coding continuation.

Date: 2026-09-16
Verdict: BLOCKED for deployment. PASS for dedicated SSH access.
Scope: read-only deployment inspection and these two documents only. No upload, application edit, Supabase query/change, service creation, Nginx change, or external effect was performed.

## Verified access
SSH with BatchMode, IdentitiesOnly, StrictHostKeyChecking and the dedicated key succeeded as istemerdeploy (uid/gid 1002). Working directory: /srv/istemer-deploy. RELEASE_UPLOAD_OK confirmed.
An additional connection forced ED25519 and passed the existing known_hosts check.
Accepted ED25519 fingerprint: SHA256:QVaR85xLg99/GClo92lzYryiGbNrsuoQk4+5llifRIg
This confirms consistency with locally trusted known_hosts; independent owner fingerprint attestation was not supplied.
Directories: releases and shared are owned by istemerdeploy; current is root:www-data, drwxr-xr-x.
No TCP listener on 3240 was listed. node and npm were not found in the deployment account's noninteractive PATH. This does not establish their absence elsewhere on the host.
Hostname: i-stemer-system-hub.eltaweel.site. Intended listener: 127.0.0.1:3240.

## Repository state
System: D:/Abdo/Private/STEMer/Claude code/Building/business-agent-os
HEAD f9aa20a4c1b2ef6b144627e0aaaec4eaaddaee10; branch main.
Agents: D:/Abdo/Private/STEMer/Claude code/Building/i-STEMer-agents-hub
HEAD a88815f304b7417bf32ca0cd2cf2369b45c2d767; branch main.
Configured remotes use the owner spelling Eltaweeel (three e characters), not Eltaweel from the latest handoff:
- https://github.com/Eltaweeel/i-STEMer-system-hub.git
- https://github.com/Eltaweeel/i-STEMer-agents-hub.git
Both trees are dirty. Agents implementation, package manifest and lockfile are untracked; node_modules is also untracked. Do not package with an unrestricted directory copy. Exact source inventory is in MVP_RELEASE_MANIFEST.md.

## Requirement assessment
| Requirement | Assessment and source evidence |
| --- | --- |
| Authenticated staging login | PARTIAL: lib/auth/actions.ts uses password login and server identity verification; lib/auth/tenant.ts checks active membership, active tenant and owner MFA. Live credentials, callback configuration, memberships and login were not tested. |
| Adam -> Omar | BLOCKED: app/api/workflows/route.ts invokes @bagos/engine using fixtureClock(), not the separate agents service. packages/core/engine/src/index.ts explicitly returns no-live-fetch research placeholders. The HTTP transport adapter is not connected to this route. Agents package has no runtime start/build scripts or HTTP service entrypoint. |
| Artifact persistence | BLOCKED: lib/workflow/persistence.ts calls default-schema RPCs, but migrations define only private.* functions. No public RPC wrapper is present. 20260915225557 hashes item.data but never stores its body; revisions contain provenance and QA only. |
| Ziad/Nour lineage | BLOCKED: workflow route sends source_revision_ids: [] for every artifact, discarding lineage. In-memory artifact IDs are not durable revision links. The system engine emits only one calendar item per platform despite durationDays: 7. |
| Two revision-bound approvals | BLOCKED: route takes artifactIds[0], so strategy/calendar approval binds evidence only and loses calendar coverage. Engine hash strings are IDs prefixed with sha256, not SHA-256 digests. Both stages are created together without enforcing the first approval before finished-post generation. SQL does not verify current artifact revision, full destination/action binding or stage dependency. |
| Audit trail | PARTIAL: create/approve/fail/retry SQL inserts audit records; artifact persistence has no corresponding audit event. Engine trace is not persisted. No end-to-end audit evidence exists. |

## Security and correctness blockers
1. Approval SQL uses nullable comparisons: missing membership leaves member_role NULL, so IF member_role <> 'owner' does not reject. Missing aal or expected_digest similarly bypasses comparisons. The RPC must fail closed independently of the route.
2. Approval SQL does not require an active tenant. It drops the immutable approval trigger and mutates action_snapshot without recomputing action_digest or creating immutable decision evidence.
3. postgres-owned SECURITY DEFINER writers have broad authority; authenticated execute grants are not a server-only boundary. Do not expose private schema to make RPC calls work. Design a constrained command boundary and test direct unauthorized calls.
4. Workflow idempotency returns an existing receipt without comparing input digests. Digest excludes objective_text; concurrent submissions lack locking. Artifact retries create duplicate rows. SQL parameter/column name collisions (including idempotency_key) require execution tests.
5. Retry only changes state to queued; no worker consumes the queued run. The workflow does not persist running state, and failure-recording errors can hide the original error.
6. New API parsing accepts JSON null via a cast and subsequently dereferences it. Input bounds, error paths and mutation-origin protections need tests.
7. Agents lint fails: no eslint.config.js/mjs/cjs. Runtime packaging/start and real Hermes profiles remain unverified.
8. Node >=22 and npm >=10 are required by the system manifest, but unavailable in deployment SSH PATH.
9. Successful Claude review of these new implementation slices is missing. Prior attempts ending at max turns are not approval.

## Exact verification executed
System repository:
- npm test: PASS, 27 files / 160 tests.
- npm run lint: PASS including dependency, primitive-token and domain checks.
- npm run typecheck: PASS across workspaces.
Agents repository:
- npm test: PASS, 3 files / 6 tests.
- npm run typecheck: PASS.
- npm run lint: FAIL, ESLint 9.39.5 cannot find configuration.
Read-only SSH identity, directory permission, ED25519 host verification, runtime PATH and port-listener checks executed.
No production build run in this preflight: Next build can automatically load local environment files, which this task forbids reading. Earlier build output is historical evidence only.
No SQL migration tests, live Auth/PostgREST tests, browser rehearsal or remote build were run. Current Vitest include patterns do not execute supabase/tests/phase-1a.test.mjs, and green tests do not validate these new SQL commands.

## First Adam -> Omar packet readiness
READY TO BEGIN IMPLEMENTATION, NOT READY TO DEPLOY OR ACCEPT AS WORKING.
The dedicated account and target directories are sufficient for later upload. The first implementation packet must connect the system to a real controlled Adam/Omar runtime, persist/reload evidence and revision lineage, repair the RPC boundary and idempotency, and prove authorization plus replay/failure behavior in isolated database tests. Finish Claude review and establish Linux runtime packaging before release. Later packets must implement stage-bound approvals and Ziad/Nour behavior.
No implementation changes were made in this task. Earlier statements that only deployment remained or the local system was complete are superseded by this source-based assessment.
