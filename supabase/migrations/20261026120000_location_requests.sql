-- Richiesta Location: chiunque compila la pagina del proprio locale dal Profilo
-- ("Diventa Location") e l'Admin la approva. Finché non è approvata la riga resta
-- visibile solo al proprietario e agli admin (la policy SELECT non cambia).

alter table public.bajuju_locations
  add column if not exists request_status text not null default 'approved',
  add column if not exists requested_at timestamptz,
  add column if not exists reviewed_at timestamptz;

alter table public.bajuju_locations
  drop constraint if exists bajuju_locations_request_status_check;
alter table public.bajuju_locations
  add constraint bajuju_locations_request_status_check
  check (request_status in ('pending', 'approved', 'rejected'));

create index if not exists bajuju_locations_pending_idx
  on public.bajuju_locations(requested_at)
  where request_status = 'pending';

-- Vero se il profilo può chiedere di diventare Location (non eliminato né sospeso).
create or replace function private.bajuju_location_owner_can_request(p_owner_id uuid)
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
      and coalesce(p.is_deleted, false) = false
      and p.deletion_requested_at is null
      and public.is_user_blocked(p.id) = false
  );
$$;

revoke all on function private.bajuju_location_owner_can_request(uuid) from public, anon;
grant execute on function private.bajuju_location_owner_can_request(uuid) to authenticated;

drop policy if exists "Location crea il proprio locale" on public.bajuju_locations;
create policy "Location crea il proprio locale"
on public.bajuju_locations for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private.bajuju_location_owner_can_request(owner_id)
);

drop policy if exists "Location modifica il proprio locale" on public.bajuju_locations;
create policy "Location modifica il proprio locale"
on public.bajuju_locations for update to authenticated
using (owner_id = (select auth.uid()) or public.is_current_user_admin())
with check (
  (owner_id = (select auth.uid()) and private.bajuju_location_owner_can_request(owner_id))
  or public.is_current_user_admin()
);

-- Lo stato della richiesta lo decide il server: il proprietario non può approvarsi da solo.
create or replace function private.bajuju_location_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_current_user_admin() and new.owner_id is distinct from auth.uid() then
    return new;
  end if;

  if private.bajuju_location_owner_active(new.owner_id) then
    new.request_status := 'approved';
  else
    new.request_status := 'pending';
    if tg_op = 'INSERT' or old.request_status is distinct from 'pending' then
      new.requested_at := now();
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

revoke all on function private.bajuju_location_request_guard() from public, anon, authenticated;

drop trigger if exists bajuju_location_request_guard_trg on public.bajuju_locations;
create trigger bajuju_location_request_guard_trg
before insert or update on public.bajuju_locations
for each row execute function private.bajuju_location_request_guard();

-- Nuova richiesta: avvisa gli admin nella campanella.
create or replace function private.bajuju_notify_location_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.request_status is distinct from 'pending'
    or (tg_op = 'UPDATE' and old.request_status is not distinct from 'pending') then
    return new;
  end if;

  begin
    insert into public.push_notification_logs (
      user_id, notification_type, type, title, body, data, status, success, is_read
    )
    select
      p.id,
      'location_request',
      'location_request',
      'Nuova richiesta Location',
      '"' || left(new.name, 60) || '" (' || left(new.city, 40) || ') chiede di diventare Location.',
      jsonb_build_object('type', 'location_request', 'screen', 'admin-locations', 'ownerId', new.owner_id::text),
      'in_app',
      null,
      false
    from public.profiles p
    where p.is_admin = true
      and coalesce(p.is_deleted, false) = false;
  exception when others then
    raise warning 'Bajuju: notifica richiesta Location non registrata (SQLSTATE %)', SQLSTATE;
  end;

  return new;
end;
$$;

revoke all on function private.bajuju_notify_location_request() from public, anon, authenticated;

drop trigger if exists bajuju_notify_location_request_trg on public.bajuju_locations;
create trigger bajuju_notify_location_request_trg
after insert or update on public.bajuju_locations
for each row execute function private.bajuju_notify_location_request();

-- Attivazione Location (dal tasto Approva o dal tasto Location nella scheda utente):
-- la pagina già compilata diventa approvata e l'utente riceve l'avviso giusto.
create or replace function private.bajuju_notify_location_activated()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location_name text;
begin
  if new.is_location_organizer is distinct from true
    or old.is_location_organizer is not distinct from true then
    return new;
  end if;

  update public.bajuju_locations
  set request_status = 'approved',
      reviewed_at = now()
  where owner_id = new.id
  returning name into v_location_name;

  begin
    insert into public.push_notification_logs (
      user_id, notification_type, type, title, body, data, status, success, is_read
    )
    values (
      new.id,
      'location_activated',
      'location_activated',
      case when v_location_name is null then 'Sei stato attivato come Location' else 'Il tuo locale è su Bajuju' end,
      case
        when v_location_name is null
          then 'Completa la pagina del tuo locale: nome, indirizzo e foto. Poi comparirai sulla mappa di Bajuju.'
        else 'Richiesta approvata: "' || left(v_location_name, 60) || '" ora è sulla mappa e puoi creare eventi ufficiali.'
      end,
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

-- Approva o rifiuta una richiesta Location (solo admin).
create or replace function public.admin_review_location(
  p_owner_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_action text := lower(trim(coalesce(p_action, '')));
  v_location_name text;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'Operazione riservata agli amministratori.';
  end if;

  select l.name into v_location_name
  from public.bajuju_locations l
  where l.owner_id = p_owner_id
    and l.request_status = 'pending';

  if v_location_name is null then
    raise exception 'Richiesta non trovata o già controllata.';
  end if;

  if clean_action = 'approve' then
    -- Il trigger bajuju_notify_location_activated segna la richiesta approvata e avvisa l'utente.
    update public.profiles
    set is_location_organizer = true
    where id = p_owner_id;

    update public.bajuju_locations
    set request_status = 'approved',
        reviewed_at = now()
    where owner_id = p_owner_id;

    return 'approved';
  elsif clean_action = 'reject' then
    update public.bajuju_locations
    set request_status = 'rejected',
        reviewed_at = now()
    where owner_id = p_owner_id;

    begin
      insert into public.push_notification_logs (
        user_id, notification_type, type, title, body, data, status, success, is_read
      )
      values (
        p_owner_id,
        'location_rejected',
        'location_rejected',
        'Richiesta Location non approvata',
        'Controlla la pagina di "' || left(v_location_name, 60) || '" e reinviala, oppure scrivici da Chiedi a Bajuju.',
        jsonb_build_object('type', 'location_rejected', 'screen', 'my-location'),
        'in_app',
        null,
        false
      );
    exception when others then
      raise warning 'Bajuju: notifica rifiuto Location non registrata (SQLSTATE %)', SQLSTATE;
    end;

    return 'rejected';
  end if;

  raise exception 'Azione non valida.';
end;
$$;

revoke all on function public.admin_review_location(uuid, text) from public, anon;
grant execute on function public.admin_review_location(uuid, text) to authenticated;
