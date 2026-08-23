drop policy if exists "Admin chat threads leggibili da utente o admin" on public.admin_private_threads;
drop policy if exists "Solo admin crea thread privati" on public.admin_private_threads;
drop policy if exists "Messaggi admin chat leggibili dai partecipanti" on public.admin_private_messages;
drop policy if exists "Partecipanti possono inviare messaggi admin chat" on public.admin_private_messages;

create policy "Chat Bajuju leggibile da utente o admin principale"
on public.admin_private_threads
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select auth.uid()) = public.bajuju_main_admin_id()
);

create policy "Solo admin principale Bajuju crea thread"
on public.admin_private_threads
for insert
to authenticated
with check (
  created_by_admin = (select auth.uid())
  and (select auth.uid()) = public.bajuju_main_admin_id()
  and exists (
    select 1 from public.profiles target
    where target.id = user_id
      and coalesce(target.is_deleted, false) = false
  )
);

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
        or (select auth.uid()) = public.bajuju_main_admin_id()
      )
  )
);

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
        or (select auth.uid()) = public.bajuju_main_admin_id()
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
  updated_count integer := 0;
begin
  if caller is null then
    raise exception 'Utente non autenticato.';
  end if;

  if not exists (
    select 1 from public.admin_private_threads t
    where t.id = p_thread_id
      and (
        t.user_id = caller
        or caller = public.bajuju_main_admin_id()
      )
  ) then
    raise exception 'Thread non autorizzato.';
  end if;

  update public.admin_private_messages m
  set read_at = now()
  where m.thread_id = p_thread_id
    and m.sender_id <> caller
    and m.read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_admin_private_thread_read(uuid) from public, anon;
grant execute on function public.mark_admin_private_thread_read(uuid) to authenticated;