create table if not exists public.admin_private_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  created_by_admin uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.admin_private_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.admin_private_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_private_threads_last_message_idx
  on public.admin_private_threads(last_message_at desc nulls last);
create index if not exists admin_private_messages_thread_created_idx
  on public.admin_private_messages(thread_id, created_at asc);
create index if not exists admin_private_messages_unread_idx
  on public.admin_private_messages(thread_id, read_at) where read_at is null;

alter table public.admin_private_threads enable row level security;
alter table public.admin_private_messages enable row level security;

grant select, insert on public.admin_private_threads to authenticated;
grant select, insert on public.admin_private_messages to authenticated;
revoke update, delete on public.admin_private_threads from anon, authenticated;
revoke update, delete on public.admin_private_messages from anon, authenticated;

create policy "Admin chat threads leggibili da utente o admin"
on public.admin_private_threads
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
      and coalesce(p.is_deleted, false) = false
  )
);

create policy "Solo admin crea thread privati"
on public.admin_private_threads
for insert
to authenticated
with check (
  created_by_admin = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
      and coalesce(p.is_deleted, false) = false
  )
  and exists (
    select 1 from public.profiles target
    where target.id = user_id
      and coalesce(target.is_deleted, false) = false
  )
);

create policy "Messaggi admin chat leggibili dai partecipanti"
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
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.is_admin = true
            and coalesce(p.is_deleted, false) = false
        )
      )
  )
);

create policy "Partecipanti possono inviare messaggi admin chat"
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
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.is_admin = true
            and coalesce(p.is_deleted, false) = false
        )
      )
  )
);

create or replace function private.bajuju_admin_private_message_touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.admin_private_threads
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

revoke all on function private.bajuju_admin_private_message_touch_thread() from public;

DROP TRIGGER IF EXISTS admin_private_message_touch_thread_trg ON public.admin_private_messages;
create trigger admin_private_message_touch_thread_trg
after insert on public.admin_private_messages
for each row execute function private.bajuju_admin_private_message_touch_thread();

create or replace function public.mark_admin_private_thread_read(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_is_admin boolean := false;
  updated_count integer := 0;
begin
  if caller is null then
    raise exception 'Utente non autenticato.';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = caller
      and p.is_admin = true
      and coalesce(p.is_deleted, false) = false
  ) into caller_is_admin;

  if not exists (
    select 1 from public.admin_private_threads t
    where t.id = p_thread_id
      and (t.user_id = caller or caller_is_admin)
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

DO $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'admin_private_messages'
     ) then
    alter publication supabase_realtime add table public.admin_private_messages;
  end if;
end
$$;
