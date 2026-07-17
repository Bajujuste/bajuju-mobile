-- Admin event commands: idempotent admin-only creation of rows in public.activities.
-- Safe to re-run: every object is created with IF NOT EXISTS, DROP/CREATE policy or CREATE OR REPLACE.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_event_commands (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  activity_id text null,
  response jsonb null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_user_id, idempotency_key)
);

alter table public.admin_event_commands
  alter column activity_id type text using activity_id::text;

alter table public.admin_event_commands
  add column if not exists error_code text;

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
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(auth.jwt() #>> '{app_metadata,role}', '')) in ('admin', 'master', 'superadmin')
    or lower(coalesce(auth.jwt() #>> '{app_metadata,is_admin}', '')) in ('true', '1');
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

create or replace function public.admin_payload_text(p_payload jsonb, variadic p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  key text;
  value text;
begin
  foreach key in array p_keys loop
    value := nullif(btrim(coalesce(p_payload ->> key, '')), '');
    if value is not null then
      return value;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.admin_payload_valid_date(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  parsed date;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;

  parsed := p_value::date;
  return to_char(parsed, 'YYYY-MM-DD') = p_value;
exception
  when others then
    return false;
end;
$$;

create or replace function public.admin_payload_valid_time(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$';
$$;

create or replace function public.admin_payload_numeric(p_payload jsonb, p_key text)
returns numeric
language plpgsql
immutable
as $$
declare
  raw_value text := nullif(btrim(coalesce(p_payload ->> p_key, '')), '');
begin
  if raw_value is null then
    return null;
  end if;

  return raw_value::numeric;
exception
  when others then
    return 'NaN'::numeric;
end;
$$;

create or replace function public.admin_validate_experience_payload(p_payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  title text := public.admin_payload_text(p_payload, 'title', 'activity_title', 'name');
  description text := public.admin_payload_text(p_payload, 'description', 'activity_description');
  activity_date text := public.admin_payload_text(p_payload, 'activity_date', 'date');
  activity_time text := public.admin_payload_text(p_payload, 'activity_time', 'time');
  city text := public.admin_payload_text(p_payload, 'city', 'citta');
  province text := public.admin_payload_text(p_payload, 'province', 'provincia');
  latitude numeric := public.admin_payload_numeric(p_payload, 'latitude');
  longitude numeric := public.admin_payload_numeric(p_payload, 'longitude');
  max_participants numeric := public.admin_payload_numeric(p_payload, 'max_participants');
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'INVALID_PAYLOAD';
  end if;

  if title is null or length(title) > 500 then
    return 'INVALID_TITLE';
  end if;

  if description is not null and length(description) > 4000 then
    return 'INVALID_DESCRIPTION';
  end if;

  if not public.admin_payload_valid_date(activity_date) then
    return 'INVALID_ACTIVITY_DATE';
  end if;

  if not public.admin_payload_valid_time(activity_time) then
    return 'INVALID_ACTIVITY_TIME';
  end if;

  if city is null or length(city) > 500 then
    return 'INVALID_CITY';
  end if;

  if province is null or length(province) > 100 then
    return 'INVALID_PROVINCE';
  end if;

  if latitude = 'NaN'::numeric or (latitude is not null and (latitude < -90 or latitude > 90)) then
    return 'INVALID_LATITUDE';
  end if;

  if longitude = 'NaN'::numeric or (longitude is not null and (longitude < -180 or longitude > 180)) then
    return 'INVALID_LONGITUDE';
  end if;

  if max_participants = 'NaN'::numeric
    or (max_participants is not null and (max_participants <> trunc(max_participants) or max_participants < 1 or max_participants > 10000)) then
    return 'INVALID_MAX_PARTICIPANTS';
  end if;

  return null;
end;
$$;

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
  clean_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  clean_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  validation_error text;
  payload_hash text := encode(extensions.digest(clean_payload::text, 'sha256'), 'hex');
  command_row public.admin_event_commands%rowtype;
  insert_columns text[] := array[]::text[];
  insert_values text[] := array[]::text[];
  col text;
  raw_value text;
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

  validation_error := public.admin_validate_experience_payload(clean_payload);

  if validation_error is not null then
    return jsonb_build_object('ok', false, 'status', 400, 'error', validation_error);
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
    return command_row.response || jsonb_build_object('idempotent', true, 'status', 200);
  end if;

  if to_regclass('public.activities') is null then
    update public.admin_event_commands
    set status = 'failed', error_code = 'ACTIVITIES_TABLE_MISSING'
    where id = command_row.id;

    return jsonb_build_object('ok', false, 'status', 500, 'error', 'ACTIVITIES_TABLE_MISSING');
  end if;

  foreach col in array array[
    'title', 'activity_title', 'name', 'description', 'activity_description', 'activity_date', 'activity_time',
    'city', 'citta', 'province', 'provincia', 'address', 'latitude', 'longitude',
    'max_participants', 'activity_type', 'type', 'status'
  ] loop
    raw_value := public.admin_payload_text(clean_payload, col);

    if raw_value is not null and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = col
    ) then
      insert_columns := array_append(insert_columns, quote_ident(col));
      insert_values := array_append(insert_values, quote_nullable(raw_value));
    end if;
  end loop;


  foreach col in array array['start_at', 'starts_at'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = col
    ) and not (col = any(insert_columns)) then
      insert_columns := array_append(insert_columns, quote_ident(col));
      insert_values := array_append(insert_values, quote_nullable(
        public.admin_payload_text(clean_payload, 'activity_date', 'date') || 'T' || public.admin_payload_text(clean_payload, 'activity_time', 'time')
      ));
    end if;
  end loop;

  foreach col in array array['creator_id', 'organizer_id', 'user_id', 'created_by'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = col
    ) and not (col = any(insert_columns)) then
      insert_columns := array_append(insert_columns, quote_ident(col));
      insert_values := array_append(insert_values, quote_nullable(current_user_id::text));
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'title'
  ) and not ('title' = any(insert_columns)) then
    insert_columns := array_append(insert_columns, 'title');
    insert_values := array_append(insert_values, quote_nullable(public.admin_payload_text(clean_payload, 'title', 'activity_title', 'name')));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'status'
  ) and not ('status' = any(insert_columns)) then
    insert_columns := array_append(insert_columns, 'status');
    insert_values := array_append(insert_values, quote_nullable(coalesce(public.admin_payload_text(clean_payload, 'status'), 'attiva')));
  end if;

  if array_length(insert_columns, 1) is null then
    update public.admin_event_commands
    set status = 'failed', error_code = 'NO_COMPATIBLE_ACTIVITY_COLUMNS'
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
      activity_id = nullif(activity_row ->> 'id', '')::uuid,
      response = jsonb_build_object('ok', true, 'status', 201, 'activity', activity_row, 'idempotent', false),
      error_code = null
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
      set status = 'failed', error_code = 'CREATE_EXPERIENCE_FAILED'
      where id = command_row.id;
    end if;

    return jsonb_build_object('ok', false, 'status', 500, 'error', 'CREATE_EXPERIENCE_FAILED');
end;
$$;

revoke all on function public.admin_create_experience_command(text, jsonb) from public;
grant execute on function public.admin_create_experience_command(text, jsonb) to authenticated;
