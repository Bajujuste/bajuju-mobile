-- Admin event commands: idempotent admin-only creation of rows in public.activities.
-- Safe to re-run: every object is created with IF NOT EXISTS or CREATE OR REPLACE.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_event_commands (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  activity_id uuid null,
  response jsonb null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_user_id, idempotency_key)
);

alter table public.admin_event_commands enable row level security;

create or replace function public.admin_event_commands_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_event_commands_set_updated_at on public.admin_event_commands;
create trigger admin_event_commands_set_updated_at
before update on public.admin_event_commands
for each row
execute function public.admin_event_commands_set_updated_at();

create or replace function public.is_current_user_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  app_role text := coalesce(auth.jwt() #>> '{app_metadata,role}', '');
  app_is_admin text := coalesce(auth.jwt() #>> '{app_metadata,is_admin}', '');
  profile_is_admin boolean := false;
  profile_role text := '';
begin
  if current_user_id is null then
    return false;
  end if;

  if lower(app_role) in ('admin', 'master', 'superadmin') or lower(app_is_admin) in ('true', '1', 'yes') then
    return true;
  end if;

  if to_regclass('public.profiles') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin'
    ) then
      execute 'select coalesce(is_admin, false) from public.profiles where ' || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id') then 'user_id' else 'id' end || ' = $1 limit 1'
      into profile_is_admin
      using current_user_id;

      if coalesce(profile_is_admin, false) then
        return true;
      end if;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
    ) then
      execute 'select coalesce(role, '''') from public.profiles where ' || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id') then 'user_id' else 'id' end || ' = $1 limit 1'
      into profile_role
      using current_user_id;

      if lower(coalesce(profile_role, '')) in ('admin', 'master', 'superadmin') then
        return true;
      end if;
    end if;
  end if;

  return false;
end;
$$;

drop policy if exists "admin_event_commands_select_admin_own" on public.admin_event_commands;
create policy "admin_event_commands_select_admin_own"
on public.admin_event_commands
for select
to authenticated
using (admin_user_id = auth.uid() and public.is_current_user_admin());

drop policy if exists "admin_event_commands_insert_admin_own" on public.admin_event_commands;
create policy "admin_event_commands_insert_admin_own"
on public.admin_event_commands
for insert
to authenticated
with check (admin_user_id = auth.uid() and public.is_current_user_admin());

drop policy if exists "admin_event_commands_update_admin_own" on public.admin_event_commands;
create policy "admin_event_commands_update_admin_own"
on public.admin_event_commands
for update
to authenticated
using (admin_user_id = auth.uid() and public.is_current_user_admin())
with check (admin_user_id = auth.uid() and public.is_current_user_admin());

create index if not exists admin_event_commands_admin_created_idx
on public.admin_event_commands(admin_user_id, created_at desc);

create or replace function public.admin_create_experience_command(
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  clean_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  clean_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  payload_hash text := encode(extensions.digest(clean_payload::text, 'sha256'), 'hex');
  command_row public.admin_event_commands%rowtype;
  insert_columns text[] := array[]::text[];
  insert_values text[] := array[]::text[];
  col text;
  sql text;
  activity_row jsonb;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'AUTH_REQUIRED');
  end if;

  if not public.is_current_user_admin() then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'ADMIN_REQUIRED');
  end if;

  if clean_key is null or length(clean_key) > 120 then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'INVALID_IDEMPOTENCY_KEY');
  end if;

  if jsonb_typeof(clean_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'INVALID_PAYLOAD');
  end if;

  insert into public.admin_event_commands (idempotency_key, admin_user_id, request_hash)
  values (clean_key, current_user_id, payload_hash)
  on conflict (admin_user_id, idempotency_key) do nothing;

  select *
  into command_row
  from public.admin_event_commands
  where admin_user_id = current_user_id and idempotency_key = clean_key
  for update;

  if command_row.request_hash <> payload_hash then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'IDEMPOTENCY_KEY_REUSED');
  end if;

  if command_row.status = 'succeeded' and command_row.response is not null then
    return command_row.response || jsonb_build_object('idempotent', true);
  end if;

  if to_regclass('public.activities') is null then
    update public.admin_event_commands
    set status = 'failed', error_message = 'ACTIVITIES_TABLE_MISSING'
    where id = command_row.id;

    return jsonb_build_object('ok', false, 'status', 500, 'error', 'ACTIVITIES_TABLE_MISSING');
  end if;

  foreach col in array array[
    'title', 'activity_title', 'name', 'description', 'activity_description', 'activity_date', 'activity_time',
    'start_at', 'starts_at', 'city', 'citta', 'province', 'provincia', 'address', 'latitude', 'longitude',
    'max_participants', 'activity_type', 'type', 'status'
  ] loop
    if clean_payload ? col and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = col
    ) then
      insert_columns := insert_columns || quote_ident(col);
      insert_values := insert_values || quote_nullable(clean_payload ->> col);
    end if;
  end loop;

  foreach col in array array['creator_id', 'organizer_id', 'user_id', 'created_by'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = col
    ) and not (col = any(insert_columns)) then
      insert_columns := insert_columns || quote_ident(col);
      insert_values := insert_values || quote_nullable(current_user_id::text);
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'title'
  ) and not ('title' = any(insert_columns)) then
    insert_columns := insert_columns || 'title';
    insert_values := insert_values || quote_nullable(coalesce(clean_payload ->> 'title', clean_payload ->> 'name', 'Esperienza Bajuju'));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'status'
  ) and not ('status' = any(insert_columns)) then
    insert_columns := insert_columns || 'status';
    insert_values := insert_values || quote_nullable(coalesce(clean_payload ->> 'status', 'active'));
  end if;

  if array_length(insert_columns, 1) is null then
    update public.admin_event_commands
    set status = 'failed', error_message = 'NO_COMPATIBLE_ACTIVITY_COLUMNS'
    where id = command_row.id;

    return jsonb_build_object('ok', false, 'status', 400, 'error', 'NO_COMPATIBLE_ACTIVITY_COLUMNS');
  end if;

  sql := format(
    'insert into public.activities (%s) values (%s) returning to_jsonb(public.activities.*)',
    array_to_string(insert_columns, ', '),
    array_to_string(insert_values, ', ')
  );

  execute sql into activity_row;

  update public.admin_event_commands
  set status = 'succeeded',
      activity_id = case when (activity_row ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (activity_row ->> 'id')::uuid else null end,
      response = jsonb_build_object('ok', true, 'status', 201, 'activity', activity_row, 'idempotent', false),
      error_message = null
  where id = command_row.id;

  select *
  into command_row
  from public.admin_event_commands
  where id = command_row.id;

  return command_row.response;
exception
  when others then
    if command_row.id is not null then
      update public.admin_event_commands
      set status = 'failed', error_message = sqlerrm
      where id = command_row.id;
    end if;

    return jsonb_build_object('ok', false, 'status', 500, 'error', 'CREATE_EXPERIENCE_FAILED', 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_create_experience_command(text, jsonb) from public;
grant execute on function public.admin_create_experience_command(text, jsonb) to authenticated;
