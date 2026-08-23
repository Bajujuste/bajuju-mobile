create or replace function public.master_get_analytics_summary(days_back integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_days integer := greatest(1, least(coalesce(days_back, 30), 365));
  since_time timestamptz := now() - make_interval(days => greatest(1, least(coalesce(days_back, 30), 365)));
  result jsonb;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  ) then
    raise exception 'Solo gli admin possono vedere le statistiche.';
  end if;

  with future_activities as (
    select a.*
    from public.activities a
    where coalesce(a.is_flash, false) = false
      and a.deleted_at is null
      and coalesce(a.status::text, 'attiva') not in ('annullata', 'eliminata', 'bloccata', 'archiviata', 'deleted', 'removed')
      and ((a.activity_date + a.activity_time) at time zone 'Europe/Rome') >= now()
  ), active_participant_counts as (
    select
      ap.activity_id,
      count(distinct ap.user_id) filter (
        where coalesce(ap.status::text, '') not in ('annullato', 'annullata', 'rejected', 'rifiutato', 'declined', 'deleted', 'removed')
      )::integer as participant_count
    from public.activity_participants ap
    group by ap.activity_id
  ), fill_stats as (
    select
      fa.id,
      case
        when coalesce(fa.max_participants, 0) > 0 then
          least(
            100.0,
            ((1 + coalesce(apc.participant_count, 0))::numeric * 100.0) / fa.max_participants::numeric
          )
        else null
      end as fill_pct
    from future_activities fa
    left join active_participant_counts apc on apc.activity_id = fa.id
  ), user_locations as (
    select
      lower(trim(coalesce(p.city, ''))) as city_key,
      lower(trim(coalesce(p.province, ''))) as province_key,
      coalesce(nullif(trim(p.city), ''), nullif(trim(p.province), ''), 'Non indicata') as location,
      count(*)::integer as users
    from public.profiles p
    where coalesce(p.is_deleted, false) = false
    group by 1, 2, 3
  )
  select jsonb_build_object(
    'days', safe_days,
    'since', since_time,
    'events_total', (select count(*) from public.app_analytics_events e where e.created_at >= since_time),
    'active_users', (select count(distinct e.user_id) from public.app_analytics_events e where e.created_at >= since_time),
    'home_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'home_open'),
    'find_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'find_open'),
    'notification_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'notification_open'),
    'experiences_created', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'experience_created'),
    'experiences_joined', (
      select count(*)
      from public.activity_participants ap
      where ap.created_at >= since_time
        and coalesce(ap.status::text, '') not in ('annullato', 'annullata', 'rejected', 'rifiutato', 'declined', 'deleted', 'removed')
    ),
    'tracked_experiences_joined', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'experience_joined'),
    'waitlist_joins', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'waitlist_joined'),
    'next_experience_opens', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'next_experience_open'),
    'network_errors', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'network_error'),
    'app_errors', (select count(*) from public.app_analytics_events e where e.created_at >= since_time and e.event_name = 'app_error'),
    'future_experiences', (select count(*) from future_activities),
    'future_experiences_without_participants', (
      select count(*)
      from future_activities fa
      left join active_participant_counts apc on apc.activity_id = fa.id
      where coalesce(apc.participant_count, 0) = 0
    ),
    'average_fill_rate', (
      select coalesce(round(avg(fs.fill_pct), 1), 0)
      from fill_stats fs
      where fs.fill_pct is not null
    ),
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
    ), '[]'::jsonb),
    'future_events_by_location', coalesce((
      select jsonb_agg(jsonb_build_object('location', x.location, 'count', x.total) order by x.total desc, x.location)
      from (
        select coalesce(nullif(trim(fa.city), ''), nullif(trim(fa.province), ''), 'Non indicata') as location,
               count(*)::integer as total
        from future_activities fa
        group by 1
        order by total desc, location
        limit 10
      ) x
    ), '[]'::jsonb),
    'users_by_location', coalesce((
      select jsonb_agg(jsonb_build_object('location', x.location, 'count', x.users) order by x.users desc, x.location)
      from (
        select ul.location, ul.users
        from user_locations ul
        order by ul.users desc, ul.location
        limit 10
      ) x
    ), '[]'::jsonb),
    'demand_without_events', coalesce((
      select jsonb_agg(jsonb_build_object('location', x.location, 'count', x.users) order by x.users desc, x.location)
      from (
        select ul.location, ul.users
        from user_locations ul
        where ul.location <> 'Non indicata'
          and not exists (
            select 1
            from future_activities fa
            where (
              ul.city_key <> ''
              and lower(trim(coalesce(fa.city, ''))) = ul.city_key
            ) or (
              ul.city_key = ''
              and ul.province_key <> ''
              and lower(trim(coalesce(fa.province, ''))) = ul.province_key
            )
          )
        order by ul.users desc, ul.location
        limit 10
      ) x
    ), '[]'::jsonb),
    'top_error_endpoints', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', x.endpoint, 'count', x.total) order by x.total desc, x.endpoint)
      from (
        select coalesce(nullif(trim(e.properties->>'endpoint'), ''), 'Sconosciuto') as endpoint,
               count(*)::integer as total
        from public.app_analytics_events e
        where e.created_at >= since_time
          and e.event_name = 'network_error'
        group by 1
        order by total desc, endpoint
        limit 10
      ) x
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.master_get_analytics_summary(integer) from public, anon;
grant execute on function public.master_get_analytics_summary(integer) to authenticated, service_role;
