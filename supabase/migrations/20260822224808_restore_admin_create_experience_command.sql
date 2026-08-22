create table if not exists public.admin_experience_commands (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

alter table public.admin_experience_commands enable row level security;
revoke all on table public.admin_experience_commands from anon, authenticated;
grant all on table public.admin_experience_commands to service_role;

create or replace function public.admin_create_experience_command(
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  authorized boolean := false;
  clean_key text := btrim(coalesce(p_idempotency_key, ''));
  existing_activity_id uuid;
  new_activity_id uuid;
  title_text text;
  description_text text;
  date_text text;
  time_text text;
  city_text text;
  province_text text;
  meeting_text text;
  raw_category text;
  normalized_category public.activity_category;
  activity_date_value date;
  activity_time_value time;
  max_participants_value integer;
  latitude_value double precision;
  longitude_value double precision;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED', 'status', 401);
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = uid and coalesce(p.is_admin, false) = true
  )
  or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in ('admin','master','superadmin')
  or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'is_admin', 'false')) in ('true','1')
  into authorized;

  if not authorized then
    return jsonb_build_object('ok', false, 'error', 'ADMIN_REQUIRED', 'status', 403);
  end if;

  if clean_key = '' or length(clean_key) > 120 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_IDEMPOTENCY_KEY', 'status', 400);
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD', 'status', 400);
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text || ':' || clean_key));

  select c.activity_id
  into existing_activity_id
  from public.admin_experience_commands c
  where c.user_id = uid and c.idempotency_key = clean_key;

  if existing_activity_id is not null then
    return jsonb_build_object('ok', true, 'activity_id', existing_activity_id, 'reused', true, 'status', 200);
  end if;

  title_text := btrim(coalesce(p_payload ->> 'title', ''));
  description_text := btrim(coalesce(p_payload ->> 'description', ''));
  date_text := btrim(coalesce(p_payload ->> 'activity_date', ''));
  time_text := btrim(coalesce(p_payload ->> 'activity_time', ''));
  city_text := btrim(coalesce(p_payload ->> 'city', ''));
  province_text := btrim(coalesce(p_payload ->> 'province', ''));
  meeting_text := btrim(coalesce(p_payload ->> 'meeting_place', ''));
  raw_category := lower(btrim(coalesce(p_payload ->> 'category', '')));

  if title_text = '' or length(title_text) > 500 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_TITLE', 'status', 400);
  end if;
  if description_text = '' or length(description_text) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DESCRIPTION', 'status', 400);
  end if;
  if city_text = '' or length(city_text) > 500 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CITY', 'status', 400);
  end if;
  if province_text = '' or length(province_text) > 100 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PROVINCE', 'status', 400);
  end if;
  if meeting_text = '' or length(meeting_text) > 500 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_MEETING_PLACE', 'status', 400);
  end if;

  normalized_category := case raw_category
    when 'cena' then 'cena'::public.activity_category
    when 'aperitivo' then 'aperitivo'::public.activity_category
    when 'camminata' then 'passeggiata'::public.activity_category
    when 'passeggiata' then 'passeggiata'::public.activity_category
    when 'sport' then 'sport'::public.activity_category
    when 'cultura' then 'cultura'::public.activity_category
    when 'musica' then 'musica'::public.activity_category
    when 'cinema/teatro' then 'cinema'::public.activity_category
    when 'cinema' then 'cinema'::public.activity_category
    when 'teatro' then 'cinema'::public.activity_category
    when 'gita' then 'gita'::public.activity_category
    when 'giochi' then 'giochi'::public.activity_category
    when 'evento' then 'evento'::public.activity_category
    when 'vacanza' then 'vacanza'::public.activity_category
    when 'altro' then 'altro'::public.activity_category
    else null
  end;

  if normalized_category is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CATEGORY', 'status', 400);
  end if;

  begin
    activity_date_value := date_text::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACTIVITY_DATE', 'status', 400);
  end;

  begin
    activity_time_value := time_text::time;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACTIVITY_TIME', 'status', 400);
  end;

  begin
    max_participants_value := (p_payload ->> 'max_participants')::integer;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'INVALID_MAX_PARTICIPANTS', 'status', 400);
  end;

  if max_participants_value < 1 or max_participants_value > 99 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_MAX_PARTICIPANTS', 'status', 400);
  end if;

  begin
    latitude_value := (p_payload ->> 'latitude')::double precision;
    longitude_value := (p_payload ->> 'longitude')::double precision;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'INVALID_COORDINATES', 'status', 400);
  end;

  if latitude_value is null or longitude_value is null
     or latitude_value < -90 or latitude_value > 90
     or longitude_value < -180 or longitude_value > 180 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_COORDINATES', 'status', 400);
  end if;

  insert into public.activities (
    creator_id, title, category, description, city, province, meeting_place,
    activity_date, activity_time, min_participants, max_participants, is_flash,
    latitude, longitude
  ) values (
    uid, title_text, normalized_category, description_text, city_text, province_text,
    meeting_text, activity_date_value, activity_time_value, 1,
    max_participants_value, false, latitude_value, longitude_value
  ) returning id into new_activity_id;

  insert into public.admin_experience_commands(user_id, idempotency_key, activity_id)
  values(uid, clean_key, new_activity_id);

  return jsonb_build_object('ok', true, 'activity_id', new_activity_id, 'reused', false, 'status', 201);
end;
$$;

revoke execute on function public.admin_create_experience_command(text, jsonb) from public, anon;
grant execute on function public.admin_create_experience_command(text, jsonb) to authenticated, service_role;
