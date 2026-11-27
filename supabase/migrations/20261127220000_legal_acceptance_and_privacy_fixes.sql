-- Privacy e termini versione 2026-11-27.
-- 1) Registro server-side delle accettazioni (Termini + presa visione informativa) con data e versione.
-- 2) L'eliminazione account falliva per chi aveva scritto a «Chiedi a Bajuju» (FK RESTRICT).
-- 3) Galleria evento visibile solo a organizzatore e partecipanti, come dichiarato nei Termini.
-- 4) Disponibilità Flash non più leggibili senza login.
-- 5) Pulizia notturna delle posizioni «Vediamoci in cammino» più vecchie di un giorno.
-- 6) Elenco dei file storage di un account, usato da delete-bajuju-account (solo service_role).

-- 1) Versione corrente dei testi legali -------------------------------------------------------
insert into public.app_settings (setting_key, setting_value, updated_at)
values ('legal_version', '2026-11-27', now())
on conflict (setting_key) do update set setting_value = excluded.setting_value, updated_at = now();

create or replace function public.bajuju_current_legal_version()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select setting_value from public.app_settings where setting_key = 'legal_version'), '2026-11-27');
$$;

create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  legal_version text not null,
  terms_accepted boolean not null default true,
  privacy_acknowledged boolean not null default true,
  source text not null check (source in ('registration', 'reacceptance')),
  platform text,
  app_version text,
  accepted_at timestamptz not null default now()
);

create index if not exists legal_acceptances_user_idx on public.legal_acceptances (user_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;

drop policy if exists "Accettazioni leggibili dal titolare o dagli admin" on public.legal_acceptances;
create policy "Accettazioni leggibili dal titolare o dagli admin"
  on public.legal_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or public.is_current_user_admin());

-- Stato dell'utente corrente rispetto alla versione in vigore.
create or replace function public.bajuju_legal_status()
returns json
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_version text := public.bajuju_current_legal_version();
  v_last record;
begin
  if v_uid is null then
    return json_build_object('authenticated', false, 'current_version', v_version, 'accepted', false);
  end if;

  select legal_version, accepted_at into v_last
    from public.legal_acceptances
   where user_id = v_uid
   order by accepted_at desc
   limit 1;

  return json_build_object(
    'authenticated', true,
    'current_version', v_version,
    'accepted', coalesce(v_last.legal_version = v_version, false),
    'accepted_version', v_last.legal_version,
    'accepted_at', v_last.accepted_at
  );
end;
$$;

-- Nuova accettazione dall'app (utenti già iscritti o registrazioni senza metadati).
create or replace function public.bajuju_accept_legal(p_version text, p_platform text default null, p_app_version text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_version text := public.bajuju_current_legal_version();
begin
  if v_uid is null then
    raise exception 'Accesso richiesto.';
  end if;
  if p_version is distinct from v_version then
    raise exception 'BAJUJU_LEGAL_VERSION_MISMATCH';
  end if;

  if not exists (select 1 from public.legal_acceptances where user_id = v_uid and legal_version = v_version) then
    insert into public.legal_acceptances (user_id, legal_version, source, platform, app_version)
    values (v_uid, v_version, 'reacceptance', left(p_platform, 20), left(p_app_version, 40));
  end if;

  update public.profiles
     set terms_accepted_at = now(),
         privacy_accepted_at = now(),
         community_accepted_at = now()
   where id = v_uid;

  return public.bajuju_legal_status();
end;
$$;

revoke all on function public.bajuju_legal_status() from public, anon;
revoke all on function public.bajuju_accept_legal(text, text, text) from public, anon;
grant execute on function public.bajuju_legal_status() to authenticated;
grant execute on function public.bajuju_accept_legal(text, text, text) to authenticated;
revoke all on function public.bajuju_current_legal_version() from public;
grant execute on function public.bajuju_current_legal_version() to authenticated, service_role;

-- Registrazione: l'app invia nei metadati legal_accepted=true e legal_version. Data e ora sono quelle del server.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nickname text;
  v_constraint text;
  v_legal_version text := public.bajuju_current_legal_version();
  v_accepted boolean := coalesce(new.raw_user_meta_data->>'legal_accepted', '') = 'true'
                        and coalesce(new.raw_user_meta_data->>'legal_version', '') = v_legal_version;
begin
  v_nickname := coalesce(new.raw_user_meta_data->>'nickname', 'Nuovo utente');

  if exists (
    select 1
    from public.profiles p
    where p.nickname is not null
      and trim(p.nickname) <> ''
      and lower(trim(p.nickname)) = lower(trim(v_nickname))
  ) then
    raise exception using
      errcode = '23505',
      message = 'Questo nome utente è già in uso. Scegline un altro.';
  end if;

  begin
    insert into public.profiles (
      id,
      nickname,
      city,
      area,
      age_range,
      interests,
      terms_accepted_at,
      privacy_accepted_at,
      community_accepted_at
    )
    values (
      new.id,
      v_nickname,
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'area',
      new.raw_user_meta_data->>'age_range',
      array[]::text[],
      case when v_accepted then now() end,
      case when v_accepted then now() end,
      case when v_accepted then now() end
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'profiles_nickname_unique_lower_idx' then
        raise exception using
          errcode = '23505',
          message = 'Questo nome utente è già in uso. Scegline un altro.';
      end if;
      raise;
  end;

  if v_accepted then
    insert into public.legal_acceptances (user_id, legal_version, source, platform, app_version)
    values (
      new.id,
      v_legal_version,
      'registration',
      left(new.raw_user_meta_data->>'legal_platform', 20),
      left(new.raw_user_meta_data->>'legal_app_version', 40)
    );
  end if;

  return new;
end;
$function$;

-- 2) Eliminazione account: i messaggi a «Chiedi a Bajuju» non devono più bloccarla ---------------
alter table public.admin_private_messages drop constraint if exists admin_private_messages_sender_id_fkey;
alter table public.admin_private_messages
  add constraint admin_private_messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;

-- 3) Galleria evento: solo autore della foto, organizzatore, partecipanti, admin ---------------
drop policy if exists event_album_photos_select_block_aware on public.event_album_photos;
create policy event_album_photos_select_participants
  on public.event_album_photos for select to authenticated
  using (
    coalesce(user_id, profile_id) = (select auth.uid())
    or public.is_current_user_admin()
    or (
      (
        exists (
          select 1 from public.activities a
           where a.id = coalesce(event_album_photos.activity_id, event_album_photos.event_id)
             and a.creator_id = (select auth.uid())
        )
        or public.is_activity_participant(coalesce(event_album_photos.activity_id, event_album_photos.event_id), (select auth.uid()))
      )
      and not private.bajuju_users_block_each_other((select auth.uid()), coalesce(user_id, profile_id))
    )
  );

-- 4) Disponibilità Flash: solo utenti registrati ----------------------------------------------
drop policy if exists "Availability readable when active" on public.user_availability;
create policy "Availability readable when active"
  on public.user_availability for select to authenticated
  using (expires_at > now());
revoke select on public.user_availability from anon;

-- 5) Pulizia notturna posizioni «Vediamoci in cammino» -----------------------------------------
create or replace function private.bajuju_purge_old_walk_positions()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_count integer;
begin
  delete from public.bajuju_walk_positions where updated_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.bajuju_purge_old_walk_positions() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'bajuju-purge-walk-positions';
select cron.schedule('bajuju-purge-walk-positions', '40 3 * * *', 'select private.bajuju_purge_old_walk_positions();');

-- 6) File storage di un account (per l'eliminazione definitiva) --------------------------------
-- Esclude copertine e loghi ancora usati da gruppi (che passano a Bajuju) e foto degli sconti.
create or replace function public.bajuju_account_storage_objects(p_user_id uuid)
returns table(bucket_id text, name text)
language sql
stable
security definer
set search_path to 'public', 'storage', 'pg_temp'
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id in ('avatars', 'chat-photos', 'event-photos')
     and (
       o.owner_id = p_user_id::text
       or (o.bucket_id in ('avatars', 'chat-photos') and split_part(o.name, '/', 1) = p_user_id::text)
     )
     and not exists (
       select 1 from public.groups g
        where g.cover_url like '%/' || o.bucket_id || '/' || o.name
           or g.logo_url like '%/' || o.bucket_id || '/' || o.name
     )
     and not exists (
       select 1 from public.bajuju_discounts d
        where d.photo_url like '%/' || o.bucket_id || '/' || o.name
     );
$$;
revoke all on function public.bajuju_account_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.bajuju_account_storage_objects(uuid) to service_role;

-- La versione serve solo agli utenti autenticati e al trigger di registrazione.
revoke execute on function public.bajuju_current_legal_version() from anon;
