-- "Crea location" dall'Admin: la pagina del locale appartiene a un profilo tecnico
-- (senza password, nessuno può accedervi) creato apposta, così l'account dell'Admin
-- resta un utente normale. L'Admin poi la modifica come se fosse sua.

alter table public.bajuju_locations
  add column if not exists managed_by_admin boolean not null default false;

-- Solo un admin può segnare un locale come gestito da Bajuju.
create or replace function private.bajuju_location_managed_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_user_admin() then
    new.managed_by_admin := case when tg_op = 'UPDATE' then old.managed_by_admin else false end;
  end if;
  return new;
end;
$$;

revoke all on function private.bajuju_location_managed_guard() from public, anon, authenticated;

drop trigger if exists bajuju_location_managed_guard_trg on public.bajuju_locations;
create trigger bajuju_location_managed_guard_trg
before insert or update on public.bajuju_locations
for each row execute function private.bajuju_location_managed_guard();

-- Il profilo tecnico non deve far arrivare "Nuovo iscritto su Bajuju" agli admin.
create or replace function private.bajuju_notify_admins_on_signup()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  adm record;
  v_name text := coalesce(nullif(btrim(new.nickname), ''), 'Nuovo utente');
  v_place text := nullif(btrim(concat_ws(', ', nullif(btrim(new.city),''), nullif(btrim(new.area),''))), '');
begin
  if exists (
    select 1 from auth.users u
    where u.id = new.id
      and coalesce(u.raw_app_meta_data->>'bajuju_managed_location', '') = 'true'
  ) then
    return null;
  end if;

  for adm in
    select p.id from public.profiles p
    where p.is_admin = true and p.id <> new.id
  loop
    begin
      perform private.bajuju_send_notification(
        adm.id,
        'admin_new_signup',
        'Nuovo iscritto su Bajuju',
        left(v_name, 80) || ' si è appena iscritto' || coalesce(' (' || left(v_place, 60) || ')', '') || '.',
        jsonb_build_object('newUserId', new.id::text)
      );
    exception when others then
      raise warning 'Bajuju: notifica nuovo iscritto non inviata (SQLSTATE %)', SQLSTATE;
    end;
  end loop;
  return null;
end;
$$;

-- Crea il profilo tecnico e la pagina del locale in un colpo solo (solo admin).
-- Restituisce l'id del locale (= id del profilo tecnico).
create or replace function public.admin_create_managed_location(p_location jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_location->>'name', ''));
  v_nickname text;
  v_photos text[];
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'Operazione riservata agli amministratori.';
  end if;

  if char_length(v_name) < 2 then
    raise exception 'Scrivi il nome del locale.';
  end if;

  -- Il nome profilo deve essere unico: se c'è già, aggiungo un pezzo dell'id.
  v_nickname := left(v_name, 40);
  if exists (select 1 from public.profiles p where lower(btrim(p.nickname)) = lower(v_nickname)) then
    v_nickname := left(v_name, 34) || ' ' || left(replace(v_id::text, '-', ''), 5);
  end if;

  select coalesce(array_agg(value), '{}') into v_photos
  from jsonb_array_elements_text(coalesce(p_location->'photos', '[]'::jsonb));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    'locale-' || replace(v_id::text, '-', '') || '@locali.bajuju.it',
    '',
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'bajuju_managed_location', true),
    jsonb_build_object('nickname', v_nickname, 'city', nullif(btrim(coalesce(p_location->>'city', '')), '')),
    now(),
    now(),
    '', '', '', ''
  );

  update public.profiles
  set is_location_organizer = true,
      is_adult_confirmed = true,
      province = nullif(btrim(coalesce(p_location->>'province', '')), '')
  where id = v_id;

  -- L'avviso "Sei stato attivato come Location" al profilo tecnico non serve.
  delete from public.push_notification_logs where user_id = v_id;

  insert into public.bajuju_locations (
    owner_id, name, category, description, street, street_number, city, province,
    formatted_address, latitude, longitude, photos,
    instagram_url, facebook_url, website_url, phone, whatsapp,
    request_status, reviewed_at, managed_by_admin
  )
  values (
    v_id,
    v_name,
    btrim(coalesce(p_location->>'category', '')),
    nullif(btrim(coalesce(p_location->>'description', '')), ''),
    btrim(coalesce(p_location->>'street', '')),
    btrim(coalesce(p_location->>'street_number', '')),
    btrim(coalesce(p_location->>'city', '')),
    nullif(btrim(coalesce(p_location->>'province', '')), ''),
    btrim(coalesce(p_location->>'formatted_address', '')),
    (p_location->>'latitude')::double precision,
    (p_location->>'longitude')::double precision,
    v_photos,
    nullif(p_location->>'instagram_url', ''),
    nullif(p_location->>'facebook_url', ''),
    nullif(p_location->>'website_url', ''),
    nullif(p_location->>'phone', ''),
    nullif(p_location->>'whatsapp', ''),
    'approved',
    now(),
    true
  );

  return v_id;
end;
$$;

revoke all on function public.admin_create_managed_location(jsonb) from public, anon;
grant execute on function public.admin_create_managed_location(jsonb) to authenticated;
