-- PGlite-only Supabase interface stubs, NEVER a migration or remote seed.
-- auth.users stays EMPTY: JWT subject strings are test inputs, not Auth users.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
alter table storage.buckets enable row level security;
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null,
  unique (bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
-- Model the documented operation helper, not Storage HTTP/signature handling.
create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$
  select coalesce(replace(current_setting('storage.operation', true),'storage.','') = any(operations), false);
$$;
grant execute on function storage.allow_any_operation(text[]) to anon, authenticated, service_role;
-- Reproduce legacy defaults to prove the migration removes accidental grants.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
