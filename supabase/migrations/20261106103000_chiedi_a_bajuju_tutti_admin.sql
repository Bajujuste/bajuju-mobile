-- "Chiedi a Bajuju": tutti gli admin attivi (non solo l'admin principale)
-- possono leggere, rispondere e segnare come letti i messaggi degli utenti.

create or replace function public.bajuju_is_active_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.is_admin = true
      and coalesce(p.is_deleted, false) = false
  );
$$;

revoke all on function public.bajuju_is_active_admin(uuid) from public, anon;
grant execute on function public.bajuju_is_active_admin(uuid) to authenticated;

drop policy if exists "Chat Bajuju leggibile da utente o admin principale" on public.admin_private_threads;
create policy "Chat Bajuju leggibile da utente o admin principale"
on public.admin_private_threads
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.bajuju_is_active_admin((select auth.uid()))
);

drop policy if exists "Solo admin principale Bajuju crea thread" on public.admin_private_threads;
create policy "Solo admin principale Bajuju crea thread"
on public.admin_private_threads
for insert
to authenticated
with check (
  created_by_admin = (select auth.uid())
  and public.bajuju_is_active_admin((select auth.uid()))
  and exists (
    select 1 from public.profiles target
    where target.id = user_id
      and coalesce(target.is_deleted, false) = false
  )
);

drop policy if exists "Messaggi Bajuju leggibili dai partecipanti" on public.admin_private_messages;
create policy "Messaggi Bajuju leggibili dai partecipanti"
on public.admin_private_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_private_threads t
    where t.id = thread_id
      and (
        t.user_id = (select auth.uid())
        or public.bajuju_is_active_admin((select auth.uid()))
      )
  )
);

drop policy if exists "Utente o admin principale inviano messaggi Bajuju" on public.admin_private_messages;
create policy "Utente o admin principale inviano messaggi Bajuju"
on public.admin_private_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.admin_private_threads t
    where t.id = thread_id
      and (
        t.user_id = (select auth.uid())
        or public.bajuju_is_active_admin((select auth.uid()))
      )
  )
);

create or replace function public.mark_admin_private_thread_read(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_is_admin boolean := public.bajuju_is_active_admin(auth.uid());
  updated_count integer := 0;
begin
  if caller is null then
    raise exception 'Utente non autenticato.';
  end if;

  if not exists (
    select 1 from public.admin_private_threads t
    where t.id = p_thread_id
      and (t.user_id = caller or caller_is_admin)
  ) then
    raise exception 'Thread non autorizzato.';
  end if;

  -- L'utente segna letti i messaggi degli admin; un admin segna letti i messaggi dell'utente.
  update public.admin_private_messages m
  set read_at = now()
  where m.thread_id = p_thread_id
    and m.sender_id <> caller
    and m.read_at is null
    and (
      not caller_is_admin
      or m.sender_id = (select t.user_id from public.admin_private_threads t where t.id = p_thread_id)
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_admin_private_thread_read(uuid) from public, anon;
grant execute on function public.mark_admin_private_thread_read(uuid) to authenticated;
