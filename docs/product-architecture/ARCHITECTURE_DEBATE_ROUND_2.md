# Architecture debate — Round 2

Status: final integrator response; no third review. Codex remained lead architect. Claude's Round 1 findings C01–C15 are preserved in ARCHITECTURE_DEBATE_ROUND_1.md. All dispositions below are final for this planning pass.

## Point-by-point response

| Finding | Disposition | Integrator ruling and evidence |
|---|---|---|
| C01 | ACCEPTED | Add a dedicated NOLOGIN/NOBYPASSRLS, non-table-owner helper role and fixed-search-path SECURITY DEFINER boolean helper. It evaluates only auth.uid() against the selected active tenant. Membership-row policies use own-user equality and do not call the helper, avoiding recursion. Direct helper/RLS escalation tests are added to X03. |
| C02 | ACCEPTED | Add private provisioning_operations state with operation UUID, intended tenant/email/role, payload digest, idempotency key, Auth reference, retry state and sanitized failure. The Auth/DB saga reuses an existing Auth identity and never activates membership from delivery alone. Failure injection and retry are X04/X05 evidence. |
| C03 | REJECTED, with the underlying gap accepted | A database membership query on every navigation is not required. Every page DAL and every action/handler independently checks session and current membership; RLS is authoritative for DB and Storage. Revocation returns a typed denial. D12-Q2 decides localized denial/recovery versus approved sign-in redirect. |
| C04 | ACCEPTED | Membership and audit writes share one transaction. An injected audit INSERT failure must roll back membership. The review's claim that all deferrable constraints must be banned is rejected; transaction rollback and failure tests are the control. |
| C05 | ACCEPTED | Use server-generated private keys tenant_id/file_object_id/opaque_object_id, a unique bucket/key constraint, and a narrow authorization join to the linked artifact/knowledge revision and current membership. Phase 1 uses authenticated streaming; forged path, signed URL, direct Storage and cross-tenant tests are required. |
| C06 | ACCEPTED | Default mutations to Server Actions with same-origin defenses plus application authorization. Route-handler POSTs validate origin/CSRF; the Auth callback uses verified PKCE and allowlisted redirects. Bearer Edge calls and future signed webhooks use token/signature and replay checks. |
| C07 | ACCEPTED as a technical default | Later signed-URL helpers have a centrally enforced five-minute maximum; Phase 1 uses streaming. D19 may require stricter handling. This does not decide business retention or channel policy. |
| C08 | REJECTED as a mechanical lint prescription, invariant accepted | Layouts, route groups and navigation are never authorization boundaries. Every page DAL and command checks session, tenant and role; unauthenticated child routes and direct actions are denial-tested. |
| C09 | REJECTED | Composite tenant-qualified keys remain required even with UUIDs. They enforce same-tenant parent/child invariants and tenant_id consistency at the database layer; global UUID uniqueness is not a tenancy boundary. |
| C10 | ACCEPTED with correction | Private platform-grant/provisioning tables have RLS and no client grants/policies; narrow helpers are tested. The suggested test that treats service_role as tenant-scoped is rejected because service_role inherently bypasses RLS. It is restricted to Auth administration/provisioning and never ordinary tenant reads. Explicit tenant membership still determines tenant privileges. |
| C11 | ACCEPTED by existing design | T22 command_receipts is the Phase 1 idempotency record with tenant/actor/command/key, payload digest, state, result reference and replay constraint. T21 remains run attempts. Invitation replay is added to X04. |
| C12 | DEFERRED TO OWNER | This is D12-Q2, part of D12 and not a new decision: choose localized access-denied/recovery or approved sign-in redirect, with copy and destination in the access brief. Both use the same DAL/RLS denial and neither requires a per-navigation DB query. |
| C13 | ACCEPTED with corrected boundary tests | Tenant JWTs cannot read private platform grants. A platform administrator with explicit tenant membership has exactly that membership's permissions. Provisioning credentials have no tenant-data call path; this is tested without pretending service_role obeys RLS. |
| C14 | ACCEPTED | X03 uses an unexpired JWT after DB membership revocation for direct PostgREST/RPC and Storage negative tests; responses contain no tenant data. |
| C15 | ACCEPTED and merged into C02 | Auth issuance failure leaves pending/reconciliation state. Retry is idempotent and records failure plus success without duplicate Auth, invitation, membership or audit success. |

## Finding totals

Accepted: 11. Rejected: 3 (C03, C08, C09, where C03/C08 retain their valid security concerns). Deferred to owner: 1 (C12 → D12-Q2). Claude's final review found no blocking contradictions.

## Claude final review

Claude Code 2.1.119, claude-sonnet-4-6, same resumed read-only session 0b4a2cbc-00f3-40b6-ae6f-f910e624d31d, returned:

> No blocking contradictions remain.

It specifically confirmed coherence among C01 helper recursion, C02/C15 provisioning state, C03/C12 revocation handling, C05/C07 Storage delivery, C09 composite keys, C10 service-role restriction, and C11 command receipts. No third round was run.

