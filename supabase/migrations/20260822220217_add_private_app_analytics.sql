create table if not exists public.app_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_name text not null check (char_length(event_name) between 1 and 80),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_analytics_events enable row level security;

revoke all on table public.app_analytics_events from anon;
revoke select, update, delete on table public.app_analytics_events from authenticated;
grant insert on table public.app_analytics_events to authenticated;
grant all on table public.app_analytics_events to service_role;

drop policy if exists app_analytics_insert_own on public.app_analytics_events;
create policy app_analytics_insert_own
on public.app_analytics_events
for insert
to authenticated
with check (user_id = auth.uid());

create index if not exists app_analytics_events_name_created_idx
  on public.app_analytics_events (event_name, created_at desc);
create index if not exists app_analytics_events_user_created_idx
  on public.app_analytics_events (user_id, created_at desc);

create or replace function public.master_get_analytics_summary(days_back integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  since_time timestamptz := now() - make_interval(days => greatest(1, least(coalesce(days_back, 30), 365)));
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_admin, false) = true
  ) then
    raise exception 'Solo gli admin possono vedere le statistiche.';
  end if;

  select jsonb_build_object(
    'since', since_time,
    'events_total', (select count(*) from public.app_analytics_events e where e.created_at >= since_time),
    'active_users', (select count(distinct e.user_id) from public.app_analytics_events e where e.created_at >= since_time),
    'home_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'home_open'),
    'find_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'find_open'),
    'notification_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'notification_open')
  ) into result;

  return result;
end;
$$;

revoke execute on function public.master_get_analytics_summary(integer) from public, anon;
grant execute on function public.master_get_analytics_summary(integer) to authenticated, service_role;
