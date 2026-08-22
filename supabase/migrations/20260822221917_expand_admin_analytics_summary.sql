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
    'days', greatest(1, least(coalesce(days_back, 30), 365)),
    'since', since_time,
    'events_total', (select count(*) from public.app_analytics_events e where e.created_at >= since_time),
    'active_users', (select count(distinct e.user_id) from public.app_analytics_events e where e.created_at >= since_time),
    'home_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'home_open'),
    'find_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'find_open'),
    'notification_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'notification_open'),
    'experiences_created', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'experience_created'),
    'experiences_joined', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'experience_joined'),
    'waitlist_joins', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'waitlist_joined'),
    'next_experience_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'next_experience_open'),
    'daily_active_users', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'users', d.users) order by d.day)
      from (
        select (e.created_at at time zone 'Europe/Rome')::date as day,
               count(distinct e.user_id)::integer as users
        from public.app_analytics_events e
        where e.created_at >= since_time
        group by 1
      ) d
    ), '[]'::jsonb),
    'top_events', coalesce((
      select jsonb_agg(jsonb_build_object('event', x.event_name, 'count', x.total) order by x.total desc, x.event_name)
      from (
        select e.event_name, count(*)::integer as total
        from public.app_analytics_events e
        where e.created_at >= since_time
        group by e.event_name
        order by total desc, e.event_name
        limit 10
      ) x
    ), '[]'::jsonb),
    'top_creation_locations', coalesce((
      select jsonb_agg(jsonb_build_object('location', x.location, 'count', x.total) order by x.total desc, x.location)
      from (
        select coalesce(nullif(trim(e.properties->>'city'), ''), nullif(trim(e.properties->>'province'), ''), 'Non indicata') as location,
               count(*)::integer as total
        from public.app_analytics_events e
        where e.created_at >= since_time
          and e.event_name = 'experience_created'
        group by 1
        order by total desc, location
        limit 8
      ) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.master_get_analytics_summary(integer) from public, anon;
grant execute on function public.master_get_analytics_summary(integer) to authenticated, service_role;
