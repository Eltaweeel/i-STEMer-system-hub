-- Phase 1A only. R04/R06/R09; no users, invitations, commands or business seed.
-- Transactional, fail-on-collision baseline: NEVER infer emptiness from history.
begin;

create schema private;
revoke all on schema private from public, anon, authenticated, service_role;
create role bagos_membership_reader nologin noinherit nobypassrls;
create role bagos_platform_reader nologin noinherit nobypassrls;
-- Ownership transfer requires membership/CREATE on managed Postgres. Both are
-- temporary; no application role can SET ROLE to either helper owner.
grant bagos_membership_reader, bagos_platform_reader to postgres;
grant usage, create on schema private to bagos_membership_reader, bagos_platform_reader;
grant usage on schema public, auth to bagos_membership_reader;
grant usage on schema auth to bagos_platform_reader;
grant execute on function auth.uid() to bagos_membership_reader, bagos_platform_reader;

create domain private.sha256 as text check (value ~ '^[0-9a-f]{64}$');
create domain private.bounded_payload as jsonb
  check (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 16384
    and value @> '{"schema_version":1}'::jsonb);
grant usage on schema private to authenticated;
grant usage on type private.sha256, private.bounded_payload to authenticated;

-- G02-G04: no exposed payloads or client table grants.
create table private.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  active boolean not null default false,
  granted_by uuid not null, revoked_by uuid, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((revoked_at is null) = (revoked_by is null)),
  check (not active or revoked_at is null)
);
create table private.platform_audit (
  id uuid primary key default gen_random_uuid(),
  actor_reference uuid not null, event_type text not null check (length(event_type) between 1 and 128),
  operation_id uuid not null, evidence private.bounded_payload not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.provisioning_operations (
  id uuid primary key default gen_random_uuid(), intended_tenant_id uuid not null,
  intended_email text not null check (intended_email = lower(btrim(intended_email)) and length(intended_email) between 3 and 320),
  intended_role text not null check (intended_role in ('owner','operator')),
  actor_reference uuid not null, payload_digest private.sha256 not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  auth_user_id uuid references auth.users(id), auth_delivery_reference text,
  state text not null default 'pending' check (state in ('pending','auth_issued','activation_ready','completed','reconciliation_required')),
  attempt_count integer not null default 0 check (attempt_count >= 0), next_retry_at timestamptz,
  last_failure private.bounded_payload,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (actor_reference, idempotency_key),
  check (state not in ('auth_issued','activation_ready','completed') or auth_user_id is not null)
);

-- T01-T04/T22. Pending is the non-readable provisioning state required by R05.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  is_demo boolean not null default true check (is_demo),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','operator')),
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,user_id)
);
create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  normalized_email text not null check (normalized_email = lower(btrim(normalized_email)) and length(normalized_email) between 3 and 320),
  intended_role text not null check (intended_role in ('owner','operator')),
  issuer_reference uuid not null references auth.users(id),
  expires_at timestamptz not null, auth_delivery_reference text, token_hash private.sha256,
  state text not null default 'pending' check (state in ('pending','issued','accepted','revoked','expired')),
  accepted_by uuid references auth.users(id), accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), check (expires_at > created_at),
  check ((state = 'accepted') = (accepted_by is not null and accepted_at is not null)),
  check ((accepted_by is null) = (accepted_at is null)),
  check (accepted_at is null or (accepted_at >= created_at and accepted_at < expires_at)),
  check ((state = 'revoked') = (revoked_at is not null))
);
create unique index invitations_one_open_email on public.tenant_invitations(tenant_id,normalized_email)
  where state in ('pending','issued');
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  actor_kind text not null check (actor_kind in ('human','system','agent')),
  actor_reference uuid not null, event_type text not null check (length(event_type) between 1 and 128),
  target_reference uuid, target_revision integer check (target_revision > 0),
  command_id uuid not null, evidence private.bounded_payload not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id)
);
create table public.command_receipts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  actor_reference uuid not null, command_kind text not null check (length(command_kind) between 1 and 128),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  input_digest private.sha256 not null, result_reference private.bounded_payload not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,actor_reference,command_kind,idempotency_key)
);
-- T05/T06/T09: minimal synthetic read model; no manifests, SOPs or execution.
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  title text not null check (length(title) between 1 and 300), owner_membership_id uuid not null,
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,owner_membership_id) references public.memberships(tenant_id,id)
);
create table public.objectives (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  campaign_id uuid not null, content text not null check (length(content) between 1 and 8000),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id)
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  objective_id uuid not null, requester_membership_id uuid not null,
  mode text not null default 'synthetic' check (mode = 'synthetic'),
  state text not null check (state in ('requested','queued','running','awaiting_approval','succeeded','failed','cancelled')),
  input_snapshot private.bounded_payload not null, authorization_version integer not null check (authorization_version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,objective_id) references public.objectives(tenant_id,id),
  foreign key (tenant_id,requester_membership_id) references public.memberships(tenant_id,id)
);
-- T17/T10/T11/T12. Digests are real lowercase SHA-256, never DTO placeholders.
create table public.file_objects (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  bucket text not null default 'phase-one-artifacts' check (bucket = 'phase-one-artifacts'),
  object_key text not null,
  content_digest private.sha256 not null, content_type text not null check (length(content_type) between 1 and 200),
  size_bytes bigint not null check (size_bytes >= 0),
  classification text not null default 'synthetic' check (classification = 'synthetic'),
  state text not null default 'published' check (state in ('quarantined','published','unavailable')),
  provenance private.bounded_payload not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), unique (bucket,object_key),
  check (object_key ~ ('^' || tenant_id::text || '/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
);
create table public.artifacts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  campaign_id uuid, run_id uuid, type text not null check (length(type) between 1 and 100),
  current_revision_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), check (campaign_id is not null or run_id is not null),
  foreign key (tenant_id,campaign_id) references public.campaigns(tenant_id,id),
  foreign key (tenant_id,run_id) references public.agent_runs(tenant_id,id)
);
create table public.artifact_revisions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  artifact_id uuid not null, revision integer not null check (revision > 0),
  content_digest private.sha256 not null, producer_reference text not null check (length(producer_reference) between 1 and 200),
  provenance private.bounded_payload not null, qa private.bounded_payload not null, file_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), unique (tenant_id,artifact_id,revision), unique (tenant_id,artifact_id,id),
  foreign key (tenant_id,artifact_id) references public.artifacts(tenant_id,id),
  foreign key (tenant_id,file_id) references public.file_objects(tenant_id,id)
);
alter table public.artifacts add constraint artifacts_current_revision_fk
  foreign key (tenant_id,id,current_revision_id) references public.artifact_revisions(tenant_id,artifact_id,id);
create table public.approvals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  artifact_revision_id uuid not null, action_snapshot private.bounded_payload not null,
  action_digest private.sha256 not null, action_revision integer not null check (action_revision > 0),
  tier smallint not null check (tier between 0 and 2),
  confirmation_required boolean not null, status text not null default 'pending' check (status = 'pending'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id,id), foreign key (tenant_id,artifact_revision_id) references public.artifact_revisions(tenant_id,id),
  check (tier <> 2 or confirmation_required)
);

-- Index referencing columns, including nullable back pointers and Auth FKs.
create index memberships_user_idx on public.memberships(user_id,tenant_id) where status = 'active';
create index invitations_issuer_idx on public.tenant_invitations(issuer_reference);
create index invitations_accepted_idx on public.tenant_invitations(accepted_by);
create index campaign_owner_idx on public.campaigns(tenant_id,owner_membership_id);
create index objectives_campaign_idx on public.objectives(tenant_id,campaign_id);
create index runs_objective_idx on public.agent_runs(tenant_id,objective_id);
create index runs_requester_idx on public.agent_runs(tenant_id,requester_membership_id);
create index artifacts_campaign_idx on public.artifacts(tenant_id,campaign_id);
create index artifacts_run_idx on public.artifacts(tenant_id,run_id);
create index artifacts_current_idx on public.artifacts(tenant_id,id,current_revision_id);
create index revisions_file_idx on public.artifact_revisions(tenant_id,file_id);
create index approvals_revision_idx on public.approvals(tenant_id,artifact_revision_id);
create index provisioning_auth_user_idx on private.provisioning_operations(auth_user_id);

-- Apply protection to exactly this migration's tables, never unrelated objects.
do $$
declare relation text;
begin
  foreach relation in array array['public.tenants','public.memberships','public.tenant_invitations',
    'public.audit_log','public.command_receipts','public.campaigns','public.objectives','public.agent_runs',
    'public.file_objects','public.artifacts','public.artifact_revisions','public.approvals',
    'private.platform_admins','private.platform_audit','private.provisioning_operations'] loop
    execute format('alter table %s enable row level security', relation);
    execute format('alter table %s force row level security', relation);
    execute format('revoke all on table %s from public, anon, authenticated, service_role', relation);
  end loop;
end $$;

-- Nonrecursive own-caller lookup. Helper owners are NOT table owners.
grant select (id,status) on public.tenants to bagos_membership_reader;
grant select (tenant_id,user_id,role,status) on public.memberships to bagos_membership_reader;
create policy helper_active_tenants on public.tenants for select to bagos_membership_reader using (status = 'active');
create policy helper_own_membership on public.memberships for select to bagos_membership_reader
  using (user_id = (select auth.uid()) and status = 'active');
create function private.is_member(wanted_tenant uuid, allowed_roles text[] default array['owner','operator'])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.user_id = auth.uid() and m.tenant_id = wanted_tenant
      and m.status = 'active' and t.status = 'active'
      and m.role in ('owner','operator') and m.role = any(allowed_roles)
  );
$$;
alter function private.is_member(uuid,text[]) owner to bagos_membership_reader;
revoke all on function private.is_member(uuid,text[]) from public, anon, authenticated, service_role;
grant execute on function private.is_member(uuid,text[]) to authenticated;

grant select (user_id,active) on private.platform_admins to bagos_platform_reader;
create policy helper_own_platform_grant on private.platform_admins for select to bagos_platform_reader
  using (user_id = (select auth.uid()) and active);
create function private.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from private.platform_admins where user_id = auth.uid() and active
  );
$$;
alter function private.is_platform_admin() owner to bagos_platform_reader;
revoke all on function private.is_platform_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_platform_admin() to authenticated;
revoke create on schema private from bagos_membership_reader, bagos_platform_reader;
revoke bagos_membership_reader, bagos_platform_reader from postgres;

grant select on public.tenants, public.memberships, public.campaigns, public.objectives,
  public.agent_runs, public.artifacts, public.artifact_revisions, public.approvals, public.file_objects to authenticated;
-- Tokens, delivery references, and evidence blobs are intentionally not granted.
grant select (id,tenant_id,normalized_email,intended_role,issuer_reference,expires_at,state,created_at,updated_at)
  on public.tenant_invitations to authenticated;
grant select (id,tenant_id,actor_kind,actor_reference,event_type,target_reference,target_revision,command_id,created_at)
  on public.audit_log to authenticated;
create policy tenant_read on public.tenants for select to authenticated using (private.is_member(id));
create policy membership_read on public.memberships for select to authenticated using (
  private.is_member(tenant_id) and ((user_id = (select auth.uid()) and status = 'active')
    or private.is_member(tenant_id,array['owner']))
);
create policy invitation_read on public.tenant_invitations for select to authenticated using (
  private.is_member(tenant_id,array['owner']) and issuer_reference = (select auth.uid())
);
do $$
declare relation text;
begin
  foreach relation in array array['audit_log','campaigns','objectives','agent_runs','artifacts','artifact_revisions','approvals'] loop
    execute format('create policy member_read on public.%I for select to authenticated using (private.is_member(tenant_id))', relation);
  end loop;
end $$;
create policy linked_file_read on public.file_objects for select to authenticated using (
  state = 'published' and private.is_member(tenant_id) and exists (
    select 1 from public.artifact_revisions r where r.tenant_id = file_objects.tenant_id and r.file_id = file_objects.id
  )
);

-- Invoker triggers: no privileged command surface. Future commands must acquire
-- the same tenant lock and be granted their own constrained DML/RLS separately.
create function private.protect_identity() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or (to_jsonb(new)->'tenant_id') is distinct from (to_jsonb(old)->'tenant_id') then
    raise exception 'immutable record identity' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create function private.reject_mutation() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable evidence or deletion disabled in Phase 1A' using errcode = '23514';
end $$;
create function private.lock_membership_tenant() returns trigger language plpgsql set search_path = '' as $$
begin
  -- A write (not merely SELECT FOR UPDATE) also makes stale RR writers abort.
  update public.tenants set updated_at = clock_timestamp() where id = new.tenant_id;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'immutable membership identity' using errcode = '23514';
  end if;
  return new;
end $$;
create function private.require_active_owner() returns trigger language plpgsql set search_path = '' as $$
declare target uuid;
begin
  if tg_table_name = 'tenants' then target := new.id; else target := new.tenant_id; end if;
  if exists (select 1 from public.tenants where id = target and status in ('active','suspended'))
     and not exists (select 1 from public.memberships where tenant_id = target and role = 'owner' and status = 'active') then
    raise exception 'tenant requires an active owner' using errcode = '23514';
  end if;
  return null;
end $$;
create function private.guard_invitation_transition() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.normalized_email,new.intended_role,new.issuer_reference,new.expires_at,new.token_hash)
     is distinct from (old.normalized_email,old.intended_role,old.issuer_reference,old.expires_at,old.token_hash)
     or (old.state in ('accepted','revoked','expired') and new is distinct from old)
     or (new.state <> old.state and not (
       (old.state = 'pending' and new.state in ('issued','revoked','expired')) or
       (old.state = 'issued' and new.state in ('accepted','revoked','expired')))) then
    raise exception 'invalid invitation transition' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.protect_identity(), private.reject_mutation(), private.lock_membership_tenant(),
  private.require_active_owner(), private.guard_invitation_transition() from public, anon, authenticated, service_role;
do $$
declare relation text;
begin
  foreach relation in array array['public.tenants','public.memberships','public.tenant_invitations',
    'public.audit_log','public.command_receipts','public.campaigns','public.objectives','public.agent_runs',
    'public.file_objects','public.artifacts','public.artifact_revisions','public.approvals',
    'private.platform_admins','private.platform_audit','private.provisioning_operations'] loop
    execute format('create trigger identity_guard before update on %s for each row execute function private.protect_identity()', relation);
    execute format('create trigger no_delete before delete on %s for each row execute function private.reject_mutation()', relation);
  end loop;
  foreach relation in array array['public.audit_log','public.command_receipts','public.artifact_revisions',
    'public.approvals','public.file_objects','private.platform_audit'] loop
    execute format('create trigger evidence_immutable before update on %s for each row execute function private.reject_mutation()', relation);
  end loop;
end $$;
create trigger membership_tenant_lock before insert or update on public.memberships
  for each row execute function private.lock_membership_tenant();
create constraint trigger tenant_active_owner after insert or update on public.tenants
  deferrable initially deferred for each row execute function private.require_active_owner();
create constraint trigger membership_active_owner after insert or update on public.memberships
  deferrable initially deferred for each row execute function private.require_active_owner();
create trigger invitation_transition before update on public.tenant_invitations
  for each row execute function private.guard_invitation_transition();

-- Bucket collision or missing operation helper is an error, never silently adopt
-- an existing bucket. No object bytes/rows are seeded by the migration.
insert into storage.buckets(id,name,public) values ('phase-one-artifacts','phase-one-artifacts',false);
-- A pre-existing bucket-management policy must not allow a client to make this
-- bucket public, rename it or remove it. Supabase service administrators remain
-- trusted BYPASSRLS actors.
create policy phase_one_bucket_no_insert on storage.buckets as restrictive for insert to public
  with check (id <> 'phase-one-artifacts');
create policy phase_one_bucket_no_update on storage.buckets as restrictive for update to public
  using (id <> 'phase-one-artifacts') with check (id <> 'phase-one-artifacts');
create policy phase_one_bucket_no_delete on storage.buckets as restrictive for delete to public
  using (id <> 'phase-one-artifacts');
-- Supabase owns storage.objects: verify RLS rather than ALTER its managed table.
do $$ begin
  if exists (select 1 from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass) and not relrowsecurity) then
    raise exception 'Storage objects and buckets RLS must already be enabled';
  end if;
end $$;
grant select on storage.objects to authenticated;
create policy phase_one_artifact_read on storage.objects for select to authenticated using (
  bucket_id = 'phase-one-artifacts'
  and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
  and exists (select 1 from public.file_objects f where f.bucket = bucket_id and f.object_key = name)
);
-- Restrictive guards protect this bucket even if unrelated permissive policies
-- already exist. They impose no restrictions on other buckets.
create policy phase_one_artifact_read_guard on storage.objects as restrictive for select to public using (
  bucket_id <> 'phase-one-artifacts' or (
    (select auth.uid()) is not null
    and storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info'])
    and exists (select 1 from public.file_objects f where f.bucket = bucket_id and f.object_key = name)
  )
);
create policy phase_one_artifact_no_insert on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'phase-one-artifacts');
create policy phase_one_artifact_no_update on storage.objects as restrictive for update to public
  using (bucket_id <> 'phase-one-artifacts') with check (bucket_id <> 'phase-one-artifacts');
create policy phase_one_artifact_no_delete on storage.objects as restrictive for delete to public
  using (bucket_id <> 'phase-one-artifacts');
commit;
