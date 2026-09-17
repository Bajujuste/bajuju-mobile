-- Gruppi aperti a tutti con approvazione Admin + chat Bajuju avviabile dall'utente.

-- 1) Moderazione gruppi -------------------------------------------------------

alter table public.groups
  drop constraint if exists groups_status_check;

alter table public.groups
  add constraint groups_status_check
  check (status in ('pending', 'active', 'rejected', 'suspended', 'archived'));

alter table public.groups
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.groups
  drop constraint if exists groups_review_note_length_chk;

alter table public.groups
  add constraint groups_review_note_length_chk
  check (review_note is null or char_length(review_note) <= 500);

create or replace function public.bajuju_groups_validate_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.owner_id
      and coalesce(p.is_deleted, false) = false
  ) then
    raise exception 'Il proprietario del gruppo deve essere un utente Bajuju attivo.';
  end if;

  return new;
end;
$$;

create or replace function private.bajuju_transfer_owned_groups_to_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  admin_id uuid;
  should_transfer boolean := false;
begin
  if tg_op = 'DELETE' then
    should_transfer := true;
  else
    should_transfer := (
      (coalesce(old.is_deleted, false) = false and coalesce(new.is_deleted, false) = true)
      or (old.deletion_requested_at is null and new.deletion_requested_at is not null)
    );
  end if;

  if not should_transfer then
    return coalesce(new, old);
  end if;

  admin_id := public.bajuju_main_admin_id();
  if admin_id is null then
    raise exception 'Admin principale Bajuju non trovato: impossibile trasferire i gruppi.';
  end if;

  if admin_id <> old.id then
    update public.groups
    set owner_id = admin_id,
        transferred_to_bajuju_at = now(),
        updated_at = now()
    where owner_id = old.id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists profiles_transfer_groups_update_trg on public.profiles;
create trigger profiles_transfer_groups_update_trg
after update of is_deleted, deletion_requested_at on public.profiles
for each row execute function private.bajuju_transfer_owned_groups_to_admin();

drop policy if exists "Premium e admin possono creare gruppi" on public.groups;
drop policy if exists "Utenti autenticati propongono gruppi" on public.groups;

create policy "Utenti autenticati propongono gruppi"
on public.groups
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and created_by = (select auth.uid())
  and status = 'pending'
  and public.is_user_blocked((select auth.uid())) = false
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_deleted, false) = false
  )
);

create or replace function public.bajuju_groups_guard_owner_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  -- Operazioni interne del backend non hanno un utente auth.
  if viewer_id is null then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  if old.owner_id = viewer_id then
    -- Stato e campi di moderazione restano sempre sotto controllo Admin.
    if new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.status is distinct from old.status
      or new.transferred_to_bajuju_at is distinct from old.transferred_to_bajuju_at
      or new.review_note is distinct from old.review_note
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Lo stato del gruppo può essere modificato solo da Bajuju.';
    end if;

    -- Prima dell'approvazione (o dopo un rifiuto) il creatore può correggere
    -- tutti i dati descrittivi. Dopo l'approvazione conserva le regole attuali:
    -- copertina e descrizione modificabili, gli altri dati richiedono Admin.
    if old.status not in ('pending', 'rejected') then
      if new.name is distinct from old.name
        or new.normalized_name is distinct from old.normalized_name
        or new.city is distinct from old.city
        or new.province is distinct from old.province
        or new.category is distinct from old.category
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
      then
        raise exception 'Dopo l’approvazione puoi modificare copertina e descrizione. Per gli altri dati contatta Bajuju.';
      end if;
    end if;

    return new;
  end if;

  raise exception 'Non puoi modificare questo gruppo.';
end;
$$;

create or replace function public.admin_review_group(
  p_group_id uuid,
  p_action text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  clean_action text := lower(trim(coalesce(p_action, '')));
  clean_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  new_status text;
begin
  if caller is null or not public.is_current_user_admin() then
    raise exception 'Operazione riservata agli amministratori.';
  end if;

  if clean_action = 'approve' then
    new_status := 'active';
  elsif clean_action = 'reject' then
    new_status := 'rejected';
  else
    raise exception 'Azione di moderazione non valida.';
  end if;

  update public.groups
  set status = new_status,
      review_note = clean_note,
      reviewed_at = now(),
      reviewed_by = caller,
      updated_at = now()
  where id = p_group_id
    and status in ('pending', 'rejected');

  if not found then
    raise exception 'Gruppo non trovato o già moderato.';
  end if;

  return new_status;
end;
$$;

revoke all on function public.admin_review_group(uuid, text, text) from public, anon;
grant execute on function public.admin_review_group(uuid, text, text) to authenticated;

create or replace function public.resubmit_group_for_approval(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Utente non autenticato.';
  end if;

  update public.groups
  set status = 'pending',
      review_note = null,
      reviewed_at = null,
      reviewed_by = null,
      updated_at = now()
  where id = p_group_id
    and owner_id = caller
    and status = 'rejected';

  if not found then
    raise exception 'Gruppo non trovato o non reinviabile.';
  end if;

  return true;
end;
$$;

revoke all on function public.resubmit_group_for_approval(uuid) from public, anon;
grant execute on function public.resubmit_group_for_approval(uuid) to authenticated;

-- 2) Chat Bajuju avviabile anche dall'utente ---------------------------------

create or replace function public.bajuju_get_or_create_support_thread()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  admin_id uuid;
  existing_id uuid;
begin
  if caller is null then
    raise exception 'Utente non autenticato.';
  end if;

  select t.id into existing_id
  from public.admin_private_threads t
  where t.user_id = caller
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  admin_id := public.bajuju_main_admin_id();
  if admin_id is null then
    raise exception 'Amministratore Bajuju non disponibile.';
  end if;

  if caller = admin_id then
    raise exception 'L’amministratore principale non necessita di un thread di assistenza personale.';
  end if;

  insert into public.admin_private_threads(user_id, created_by_admin)
  values (caller, admin_id)
  on conflict (user_id) do nothing;

  select t.id into existing_id
  from public.admin_private_threads t
  where t.user_id = caller
  limit 1;

  if existing_id is null then
    raise exception 'Conversazione Bajuju non creata.';
  end if;

  return existing_id;
end;
$$;

revoke all on function public.bajuju_get_or_create_support_thread() from public, anon;
grant execute on function public.bajuju_get_or_create_support_thread() to authenticated;
