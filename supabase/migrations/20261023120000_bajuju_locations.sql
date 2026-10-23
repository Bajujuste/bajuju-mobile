-- Profilo Location: un utente attivato dall'Admin (profiles.is_location_organizer)
-- compila la pagina del suo locale. La riga esiste solo quando i campi obbligatori
-- sono completi (vincoli NOT NULL), quindi "riga presente + Location ON" = locale pubblico.

create table if not exists public.bajuju_locations (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  street text not null,
  street_number text not null,
  city text not null,
  province text,
  formatted_address text not null,
  latitude double precision not null,
  longitude double precision not null,
  photos text[] not null default '{}',
  instagram_url text,
  facebook_url text,
  website_url text,
  phone text,
  whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bajuju_locations_name_check check (char_length(btrim(name)) between 2 and 60),
  constraint bajuju_locations_category_check check (char_length(btrim(category)) between 2 and 40),
  constraint bajuju_locations_description_check check (description is null or char_length(description) <= 200),
  constraint bajuju_locations_address_check check (
    char_length(btrim(street)) > 0
    and char_length(btrim(street_number)) > 0
    and char_length(btrim(city)) > 0
    and char_length(formatted_address) <= 200
  ),
  constraint bajuju_locations_coordinates_check check (
    latitude between -90 and 90 and longitude between -180 and 180
  ),
  constraint bajuju_locations_photos_check check (cardinality(photos) between 1 and 5),
  constraint bajuju_locations_links_check check (
    (instagram_url is null or (char_length(instagram_url) <= 300 and instagram_url ~* '^https://'))
    and (facebook_url is null or (char_length(facebook_url) <= 300 and facebook_url ~* '^https://'))
    and (website_url is null or (char_length(website_url) <= 300 and website_url ~* '^https?://'))
    and (phone is null or phone ~ '^\+?[0-9 ]{6,20}$')
    and (whatsapp is null or whatsapp ~ '^\+?[0-9 ]{6,20}$')
  )
);

drop trigger if exists set_bajuju_locations_updated_at on public.bajuju_locations;
create trigger set_bajuju_locations_updated_at
before update on public.bajuju_locations
for each row execute function public.set_updated_at();

-- Vero se il proprietario è attivo come Location e il profilo non è eliminato o sospeso.
create or replace function private.bajuju_location_owner_active(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_owner_id
      and p.is_location_organizer = true
      and coalesce(p.is_deleted, false) = false
      and p.deletion_requested_at is null
      and public.is_user_blocked(p.id) = false
  );
$$;

revoke all on function private.bajuju_location_owner_active(uuid) from public, anon;
grant execute on function private.bajuju_location_owner_active(uuid) to authenticated;

alter table public.bajuju_locations enable row level security;

revoke all on table public.bajuju_locations from anon, authenticated;
grant select, insert, update, delete on table public.bajuju_locations to authenticated;

drop policy if exists "Locali pubblici visibili" on public.bajuju_locations;
create policy "Locali pubblici visibili"
on public.bajuju_locations for select to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_current_user_admin()
  or (
    private.bajuju_location_owner_active(owner_id)
    and not private.bajuju_users_block_each_other((select auth.uid()), owner_id)
  )
);

drop policy if exists "Location crea il proprio locale" on public.bajuju_locations;
create policy "Location crea il proprio locale"
on public.bajuju_locations for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private.bajuju_location_owner_active(owner_id)
);

drop policy if exists "Location modifica il proprio locale" on public.bajuju_locations;
create policy "Location modifica il proprio locale"
on public.bajuju_locations for update to authenticated
using (owner_id = (select auth.uid()) or public.is_current_user_admin())
with check (
  (owner_id = (select auth.uid()) and private.bajuju_location_owner_active(owner_id))
  or public.is_current_user_admin()
);

drop policy if exists "Location o admin elimina il locale" on public.bajuju_locations;
create policy "Location o admin elimina il locale"
on public.bajuju_locations for delete to authenticated
using (owner_id = (select auth.uid()) or public.is_current_user_admin());

-- Evento che si svolge in un locale Bajuju.
alter table public.activities
  add column if not exists location_owner_id uuid
  references public.bajuju_locations(owner_id) on delete set null;

create index if not exists activities_location_owner_id_idx
  on public.activities(location_owner_id)
  where location_owner_id is not null;

-- Si può scegliere solo un locale attivo; avvisa il locale del nuovo evento.
create or replace function private.bajuju_activity_location_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location_name text;
begin
  if new.location_owner_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.location_owner_id is not distinct from new.location_owner_id then
    return new;
  end if;

  if not private.bajuju_location_owner_active(new.location_owner_id) then
    raise exception 'BAJUJU_LOCATION_NOT_AVAILABLE';
  end if;

  if new.creator_id is distinct from new.location_owner_id then
    select l.name into v_location_name
    from public.bajuju_locations l
    where l.owner_id = new.location_owner_id;

    begin
      insert into public.push_notification_logs (
        user_id, notification_type, type, title, body, data, status, success, is_read
      )
      values (
        new.location_owner_id,
        'location_new_event',
        'location_new_event',
        'Nuovo evento nel tuo locale',
        '"' || left(coalesce(new.title, 'Un evento'), 60) || '" si svolgerà da ' || left(coalesce(v_location_name, 'te'), 60) || '.',
        jsonb_build_object('type', 'location_new_event', 'screen', 'experience', 'activityId', new.id::text),
        'in_app',
        null,
        false
      );
    exception when others then
      raise warning 'Bajuju: notifica nuovo evento nel locale non registrata (SQLSTATE %)', SQLSTATE;
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.bajuju_activity_location_guard() from public, anon, authenticated;

drop trigger if exists bajuju_activity_location_guard_trg on public.activities;
create trigger bajuju_activity_location_guard_trg
after insert or update of location_owner_id on public.activities
for each row execute function private.bajuju_activity_location_guard();

-- Quando l'Admin attiva Location, l'utente riceve l'invito a completare la pagina del locale.
create or replace function private.bajuju_notify_location_activated()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_location_organizer is distinct from true
    or old.is_location_organizer is not distinct from true then
    return new;
  end if;

  begin
    insert into public.push_notification_logs (
      user_id, notification_type, type, title, body, data, status, success, is_read
    )
    values (
      new.id,
      'location_activated',
      'location_activated',
      'Sei stato attivato come Location',
      'Completa la pagina del tuo locale: nome, indirizzo e foto. Poi comparirai sulla mappa di Bajuju.',
      jsonb_build_object('type', 'location_activated', 'screen', 'my-location'),
      'in_app',
      null,
      false
    );
  exception when others then
    raise warning 'Bajuju: notifica attivazione Location non registrata (SQLSTATE %)', SQLSTATE;
  end;

  return new;
end;
$$;

revoke all on function private.bajuju_notify_location_activated() from public, anon, authenticated;

drop trigger if exists bajuju_notify_location_activated_trg on public.profiles;
create trigger bajuju_notify_location_activated_trg
after update of is_location_organizer on public.profiles
for each row execute function private.bajuju_notify_location_activated();
