-- BAJUJU PUSH NOTIFICATIONS
-- Esegui questo file nel SQL Editor di Supabase.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_name text,
  app_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  notify_new_experience boolean not null default true,
  notify_new_flash boolean not null default true,
  notify_new_participant boolean not null default true,
  notify_contact_request boolean not null default true,
  notify_contact_accepted boolean not null default true,
  notify_experience_cancelled boolean not null default true,
  notify_experience_reminder boolean not null default true,

  -- IMPORTANTE:
  -- Chat disattivata di default e da non usare.
  notify_chat_messages boolean not null default false,

  preferred_province text,
  preferred_city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  success boolean,
  error_message text,
  is_read boolean not null default false
);

alter table public.push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_notification_logs enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
on public.push_tokens
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
on public.push_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
on public.push_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "push_notification_logs_select_own" on public.push_notification_logs;
create policy "push_notification_logs_select_own"
on public.push_notification_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "push_notification_logs_update_own" on public.push_notification_logs;
create policy "push_notification_logs_update_own"
on public.push_notification_logs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
create index if not exists push_tokens_token_idx on public.push_tokens(expo_push_token);
create index if not exists notification_preferences_enabled_idx on public.notification_preferences(enabled);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row
execute function public.set_updated_at();

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();
