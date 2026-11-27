-- "Vediamoci in cammino": durante una camminata/trekking/gita/sport chi partecipa preme "Sono qui"
-- e vede a che distanza sono gli altri (GPS, solo con app aperta).
-- Solo per gli eventi dove l'organizzatore lo accende, solo il giorno dell'evento (ora italiana).
-- Si spegne con "Fine gita" (organizzatore/admin) o da solo a mezzanotte; ognuno può spegnere il suo.
-- Le posizioni si leggono/scrivono SOLO tramite le funzioni qui sotto (RLS senza policy = niente accesso diretto).

-- Nuova categoria evento.
alter type public.activity_category add value if not exists 'trekking';

create table if not exists public.bajuju_walk_settings (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  enabled boolean not null default true,
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bajuju_walk_positions (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy real,
  updated_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

alter table public.bajuju_walk_settings enable row level security;
alter table public.bajuju_walk_positions enable row level security;
revoke all on public.bajuju_walk_settings from anon, authenticated;
revoke all on public.bajuju_walk_positions from anon, authenticated;

-- Stato per la pagina evento.
create or replace function public.bajuju_walk_state(p_activity_id uuid)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  a record;
  s record;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_can_manage boolean;
  v_can_join boolean;
  v_sharing boolean;
  v_allowed boolean;
  v_active boolean;
  v_count int := 0;
begin
  if v_caller is null then raise exception 'Accesso richiesto.'; end if;
  select id, creator_id, category::text as category, activity_date into a
  from public.activities where id = p_activity_id and deleted_at is null;
  if a.id is null then return json_build_object('allowed', false); end if;

  v_allowed := a.category in ('passeggiata', 'trekking', 'gita', 'vacanza', 'sport');
  select * into s from public.bajuju_walk_settings where activity_id = p_activity_id;
  v_can_manage := a.creator_id = v_caller or coalesce(public.is_admin(v_caller), false);
  v_can_join := a.creator_id = v_caller or exists (
    select 1 from public.activity_participants
    where activity_id = p_activity_id and user_id = v_caller and status::text = 'partecipo'
  );
  v_active := v_allowed and coalesce(s.enabled, false) and s.ended_at is null and a.activity_date = v_today;
  v_sharing := v_active and exists (
    select 1 from public.bajuju_walk_positions
    where activity_id = p_activity_id and user_id = v_caller
      and (updated_at at time zone 'Europe/Rome')::date = v_today
  );
  if v_active and (v_can_join or v_can_manage) then
    select count(*) into v_count from public.bajuju_walk_positions
    where activity_id = p_activity_id and updated_at > now() - interval '30 minutes';
  end if;

  return json_build_object(
    'allowed', v_allowed,
    'enabled', coalesce(s.enabled, false),
    'ended', s.ended_at is not null,
    'is_today', a.activity_date = v_today,
    'active', v_active,
    'can_manage', v_can_manage,
    'can_join', v_can_join,
    'sharing', v_sharing,
    'active_count', v_count
  );
end;
$function$;

-- Organizzatore/admin accende o spegne l'opzione per l'evento.
create or replace function public.bajuju_walk_set_enabled(p_activity_id uuid, p_enabled boolean)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  a record;
begin
  if v_caller is null then raise exception 'Accesso richiesto.'; end if;
  select id, creator_id, category::text as category into a from public.activities where id = p_activity_id;
  if a.id is null then raise exception 'Evento non trovato.'; end if;
  if a.creator_id is distinct from v_caller and not coalesce(public.is_admin(v_caller), false) then
    raise exception 'Solo l’organizzatore può cambiare questa opzione.';
  end if;
  if coalesce(p_enabled, false) and a.category not in ('passeggiata', 'trekking', 'gita', 'vacanza', 'sport') then
    raise exception 'Vediamoci in cammino vale solo per Camminata, Trekking, Gita e Sport.';
  end if;

  insert into public.bajuju_walk_settings (activity_id, enabled, ended_at, updated_at)
  values (p_activity_id, coalesce(p_enabled, false), null, now())
  on conflict (activity_id) do update
    set enabled = excluded.enabled, ended_at = null, updated_at = now();

  if not coalesce(p_enabled, false) then
    delete from public.bajuju_walk_positions where activity_id = p_activity_id;
  end if;
  return json_build_object('ok', true);
end;
$function$;

-- "Sono qui": salva/aggiorna la mia posizione.
create or replace function public.bajuju_walk_share(p_activity_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy real)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  v_state json;
begin
  if v_caller is null then raise exception 'Accesso richiesto.'; end if;
  if p_latitude is null or p_longitude is null or abs(p_latitude) > 90 or abs(p_longitude) > 180
     or (abs(p_latitude) < 0.01 and abs(p_longitude) < 0.01) then
    raise exception 'Posizione non valida.';
  end if;
  v_state := public.bajuju_walk_state(p_activity_id);
  if not coalesce((v_state->>'active')::boolean, false) then
    raise exception 'Vediamoci in cammino non è attivo per questo evento.';
  end if;
  if not coalesce((v_state->>'can_join')::boolean, false) then
    raise exception 'Solo chi partecipa all’evento può usarlo.';
  end if;

  -- Pulizia: posizioni di giorni passati non servono più.
  delete from public.bajuju_walk_positions where updated_at < now() - interval '1 day';

  insert into public.bajuju_walk_positions (activity_id, user_id, latitude, longitude, accuracy, updated_at)
  values (p_activity_id, v_caller, p_latitude, p_longitude, p_accuracy, now())
  on conflict (activity_id, user_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude,
        accuracy = excluded.accuracy, updated_at = now();
  return json_build_object('ok', true);
end;
$function$;

-- Spengo il mio.
create or replace function public.bajuju_walk_stop(p_activity_id uuid)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then raise exception 'Accesso richiesto.'; end if;
  delete from public.bajuju_walk_positions where activity_id = p_activity_id and user_id = auth.uid();
  return json_build_object('ok', true);
end;
$function$;

-- "Fine gita": organizzatore/admin spegne per tutti e cancella le posizioni.
create or replace function public.bajuju_walk_end(p_activity_id uuid)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  a record;
begin
  if v_caller is null then raise exception 'Accesso richiesto.'; end if;
  select id, creator_id into a from public.activities where id = p_activity_id;
  if a.id is null then raise exception 'Evento non trovato.'; end if;
  if a.creator_id is distinct from v_caller and not coalesce(public.is_admin(v_caller), false) then
    raise exception 'Solo l’organizzatore può chiudere la gita.';
  end if;
  update public.bajuju_walk_settings set ended_at = now(), updated_at = now() where activity_id = p_activity_id;
  delete from public.bajuju_walk_positions where activity_id = p_activity_id;
  return json_build_object('ok', true);
end;
$function$;

-- Posizioni degli altri: solo se la gita è attiva oggi e io sto condividendo la mia.
create or replace function public.bajuju_walk_list(p_activity_id uuid)
returns table (user_id uuid, latitude double precision, longitude double precision, accuracy real, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_state json;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto.'; end if;
  v_state := public.bajuju_walk_state(p_activity_id);
  if not coalesce((v_state->>'sharing')::boolean, false) or not coalesce((v_state->>'can_join')::boolean, false) then
    return;
  end if;
  return query
    select p.user_id, p.latitude, p.longitude, p.accuracy, p.updated_at
    from public.bajuju_walk_positions p
    where p.activity_id = p_activity_id
      and p.user_id <> auth.uid()
      and p.updated_at > now() - interval '30 minutes'
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
      )
    order by p.updated_at desc;
end;
$function$;

revoke all on function public.bajuju_walk_state(uuid) from public, anon;
revoke all on function public.bajuju_walk_set_enabled(uuid, boolean) from public, anon;
revoke all on function public.bajuju_walk_share(uuid, double precision, double precision, real) from public, anon;
revoke all on function public.bajuju_walk_stop(uuid) from public, anon;
revoke all on function public.bajuju_walk_end(uuid) from public, anon;
revoke all on function public.bajuju_walk_list(uuid) from public, anon;
grant execute on function public.bajuju_walk_state(uuid) to authenticated;
grant execute on function public.bajuju_walk_set_enabled(uuid, boolean) to authenticated;
grant execute on function public.bajuju_walk_share(uuid, double precision, double precision, real) to authenticated;
grant execute on function public.bajuju_walk_stop(uuid) to authenticated;
grant execute on function public.bajuju_walk_end(uuid) to authenticated;
grant execute on function public.bajuju_walk_list(uuid) to authenticated;
