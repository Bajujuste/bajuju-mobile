-- Regole dei Bajuju Flash verificate lato database.
-- Prima il trigger guard_standard_activity_participant_insert usciva subito per i Flash e le regole
-- "Flash attivo", "posti disponibili", "nessun blocco" e "un solo Flash/disponibilità attiva" erano
-- controllate solo dall'app: chiamando direttamente l'API si potevano aggirare.
-- Le operazioni senza utente autenticato (service role, job) non sono limitate.

-- 1) Iscrizione a un Flash: attivo, non pieno, nessun blocco tra creatore e partecipante.
-- SECURITY DEFINER perché con RLS l'utente non vede i blocchi creati da altri.
create or replace function public.guard_flash_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.activities%rowtype;
  active_count integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  select * into a
  from public.activities
  where id = new.activity_id
  for update;

  if not found or not coalesce(a.is_flash, false) or a.creator_id = new.user_id then
    return new;
  end if;

  if a.deleted_at is not null
     or a.status in ('annullata', 'eliminata', 'bloccata', 'archiviata')
     or a.expires_at is null
     or a.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'BAJUJU_FLASH_EXPIRED';
  end if;

  if exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = a.creator_id and b.blocked_id = new.user_id)
       or (b.blocker_id = new.user_id and b.blocked_id = a.creator_id)
  ) then
    raise exception using errcode = 'P0001', message = 'BAJUJU_BLOCKED';
  end if;

  if exists (
    select 1
    from public.activity_participants ap
    where ap.activity_id = new.activity_id
      and ap.user_id = new.user_id
      and ap.status is distinct from 'annullato'
  ) then
    raise exception using errcode = '23505', message = 'BAJUJU_ALREADY_JOINED';
  end if;

  select
    (case when a.creator_id is not null then 1 else 0 end) + count(*)::integer
  into active_count
  from public.activity_participants ap
  where ap.activity_id = new.activity_id
    and ap.status is distinct from 'annullato'
    and ap.user_id is distinct from a.creator_id;

  if coalesce(a.max_participants, 0) > 0 and active_count >= a.max_participants then
    raise exception using errcode = 'P0001', message = 'BAJUJU_EVENT_FULL';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_flash_participant_insert() from public, anon, authenticated;

drop trigger if exists guard_flash_participant_insert_trg on public.activity_participants;
create trigger guard_flash_participant_insert_trg
before insert on public.activity_participants
for each row
execute function public.guard_flash_participant_insert();

-- 2) Un solo Flash attivo per creatore (stessa regola dell'app: is_flash ed expires_at nel futuro).
create or replace function public.guard_single_active_flash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not coalesce(new.is_flash, false) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bajuju:active-flash:' || new.creator_id::text, 0)
  );

  if exists (
    select 1
    from public.activities a
    where a.creator_id = new.creator_id
      and coalesce(a.is_flash, false)
      and a.deleted_at is null
      and a.expires_at > now()
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Hai già un Flash attivo. Annulla quello prima di crearne un altro.';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_single_active_flash() from public, anon, authenticated;

drop trigger if exists guard_single_active_flash_trg on public.activities;
create trigger guard_single_active_flash_trg
before insert on public.activities
for each row
execute function public.guard_single_active_flash();

-- 3) Una sola disponibilità attiva per utente.
create or replace function public.guard_single_active_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bajuju:active-availability:' || new.user_id::text, 0)
  );

  if exists (
    select 1
    from public.user_availability ua
    where ua.user_id = new.user_id
      and ua.expires_at > now()
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Sei già disponibile. Annulla la disponibilità prima di crearne una nuova.';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_single_active_availability() from public, anon, authenticated;

drop trigger if exists guard_single_active_availability_trg on public.user_availability;
create trigger guard_single_active_availability_trg
before insert on public.user_availability
for each row
execute function public.guard_single_active_availability();
