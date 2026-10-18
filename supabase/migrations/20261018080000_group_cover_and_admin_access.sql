-- Copertina obbligatoria in fase di approvazione, annullamento sicuro
-- di una creazione incompleta e accesso Admin alla chat di ogni gruppo.
create or replace function public.cancel_incomplete_group_creation(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'BAJUJU_AUTH_REQUIRED';
  end if;

  -- Il creatore può annullare SOLO il proprio nuovo gruppo in attesa,
  -- se il caricamento della copertina non è stato completato.
  delete from public.groups
  where id = p_group_id
    and owner_id = caller
    and status = 'pending'
    and nullif(btrim(cover_url), '') is null;

  if not found then
    raise exception 'BAJUJU_INCOMPLETE_GROUP_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.cancel_incomplete_group_creation(uuid) from public, anon;
grant execute on function public.cancel_incomplete_group_creation(uuid) to authenticated;

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
    if not exists (
      select 1 from public.groups g
      where g.id = p_group_id
        and nullif(btrim(g.cover_url), '') is not null
    ) then
      raise exception 'BAJUJU_GROUP_COVER_REQUIRED: carica una copertina prima di approvare il gruppo.';
    end if;
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

-- Gli amministratori leggono già tutte le chat tramite la policy SELECT.
-- Permetti anche il messaggio di moderazione senza essere iscritti al gruppo.
drop policy if exists "Membri scrivono chat gruppo" on public.group_messages;
create policy "Membri scrivono chat gruppo"
on public.group_messages
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and char_length(btrim(message)) between 1 and 1000
  and not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_blocked, false) = true
  )
  and exists (
    select 1 from public.groups g
    where g.id = group_id
      and g.status = 'active'
      and (
        public.is_current_user_admin()
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = g.id
            and gm.user_id = (select auth.uid())
        )
      )
  )
);
