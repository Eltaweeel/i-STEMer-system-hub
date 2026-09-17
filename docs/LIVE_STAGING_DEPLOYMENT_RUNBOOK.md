# i-STEMer staging deployment gate

The local MVP implementation is complete through authenticated workflow execution,
artifact/revision persistence, two approval checkpoints, and retryable failures.
The following runbook is intentionally blocked until a project owner authorizes the
remote schema change and supplies the database access required by the Supabase CLI.

## Preflight

1. Confirm the linked project is `i-STEMer` and inspect migration history.
2. Confirm the working tree contains the six local migrations after Phase 1A.
3. Run `supabase db push --linked --dry-run`.
4. Run linked lint/advisors and resolve any error-level findings.

## Apply

Only after explicit authorization, run:

```text
supabase db push --linked --include-all
```

Never use a service-role key in the browser or agent repository. The RPCs are the
only client-facing mutation boundary; agent runtimes receive no database client.

## Rehearsal

With a real owner account in the staging tenant:

1. Sign in and complete MFA.
2. Submit an Instagram/Facebook brief with a stable task idempotency key.
3. Verify one campaign, objective, run, receipt, audit event, five artifacts,
   five revisions, and two pending approvals.
4. Re-submit the same task and verify no duplicate run is created.
5. Approve the strategy/calendar package with the exact stored digest.
6. Approve the finished-post package with the exact stored digest.
7. Verify publication remains disabled and no Meta API call occurs.
8. Force an artifact persistence failure, verify `failed`, then retry and verify
   the run returns to `queued`.
9. Repeat the tenant request from an unauthorized account and verify denial.

The staging demo is not production-ready until these checks are recorded with
live evidence; green local tests do not substitute for this rehearsal.
