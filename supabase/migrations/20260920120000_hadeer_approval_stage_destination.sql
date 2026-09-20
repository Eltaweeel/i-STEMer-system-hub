-- Approvals could not yet say which decision they were (strategy versus
-- finished post) or what they were bound to beyond a bare revision id, and
-- the status vocabulary had no terminal state for a decision the system
-- itself invalidates. No caller has ever produced a row here --
-- private.record_agent_artifacts inserts into this table but has zero
-- callers -- so there is no production data to migrate today. Columns still
-- land nullable and get backfilled before the NOT NULL/CHECK constraints are
-- added, so this migration stays safe if that ever stops being true.
begin;

alter table public.approvals add column stage text;
alter table public.approvals add column destination private.bounded_payload;
update public.approvals set
  stage = 'strategy',
  destination = jsonb_build_object('schema_version', 1, 'kind', 'unspecified_legacy_destination')
where stage is null;
alter table public.approvals alter column stage set not null;
alter table public.approvals alter column destination set not null;
alter table public.approvals add constraint approvals_stage_check check (stage in ('strategy', 'finished_post'));

alter table public.approvals drop constraint approvals_status_check;
alter table public.approvals add constraint approvals_status_check check (status in ('pending', 'approved', 'rejected', 'invalidated'));

-- A revision is judged once. Refusing a second approval row for the same
-- revision belongs in the schema, not in application code that a future
-- caller could forget to write.
create unique index approvals_one_per_revision on public.approvals(tenant_id, artifact_revision_id);

commit;
