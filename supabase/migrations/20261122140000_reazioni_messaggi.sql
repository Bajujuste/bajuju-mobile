-- Reazioni emoji ai messaggi delle chat (evento/Flash, gruppi, Chiedi a Bajuju).
-- Una reazione per persona per messaggio (come WhatsApp: scegliere un'altra emoji la sostituisce).
-- Le reazioni restano anche se chi le ha messe esce dall'evento o dal gruppo.
create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  chat text not null check (chat in ('activity', 'group', 'support')),
  scope_id uuid not null, -- activity_id, group_id oppure thread_id di Chiedi a Bajuju
  message_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chat, message_id, user_id)
);

create index if not exists chat_message_reactions_scope_idx
  on public.chat_message_reactions (chat, scope_id);
create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions (message_id);

alter table public.chat_message_reactions enable row level security;

-- Il messaggio deve essere visibile a chi legge/scrive (le subquery rispettano la RLS delle chat).
create or replace function public.bajuju_reaction_message_visible(p_chat text, p_scope uuid, p_message uuid, p_require_live boolean)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case p_chat
    when 'activity' then exists (
      select 1 from public.activity_messages m
      where m.id = p_message and m.activity_id = p_scope
        and (not p_require_live or m.deleted_at is null))
    when 'group' then exists (
      select 1 from public.group_messages m
      where m.id = p_message and m.group_id = p_scope
        and (not p_require_live or m.deleted_at is null))
    when 'support' then exists (
      select 1 from public.admin_private_messages m
      where m.id = p_message and m.thread_id = p_scope)
    else false
  end;
$$;

drop policy if exists "Reazioni visibili a chi vede il messaggio" on public.chat_message_reactions;
create policy "Reazioni visibili a chi vede il messaggio"
  on public.chat_message_reactions for select to authenticated
  using (public.bajuju_reaction_message_visible(chat, scope_id, message_id, false));

drop policy if exists "Utente mette la propria reazione" on public.chat_message_reactions;
create policy "Utente mette la propria reazione"
  on public.chat_message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and coalesce(p.is_blocked, false))
    and public.bajuju_reaction_message_visible(chat, scope_id, message_id, true)
  );

drop policy if exists "Utente cambia la propria reazione" on public.chat_message_reactions;
create policy "Utente cambia la propria reazione"
  on public.chat_message_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.bajuju_reaction_message_visible(chat, scope_id, message_id, true)
  );

drop policy if exists "Utente toglie la propria reazione" on public.chat_message_reactions;
create policy "Utente toglie la propria reazione"
  on public.chat_message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.chat_message_reactions to authenticated;

-- Aggiornamento live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_message_reactions'
  ) then
    alter publication supabase_realtime add table public.chat_message_reactions;
  end if;
end $$;
