alter table public.groups
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.groups
  drop constraint if exists groups_latitude_valid,
  add constraint groups_latitude_valid check (latitude is null or latitude between -90 and 90),
  drop constraint if exists groups_longitude_valid,
  add constraint groups_longitude_valid check (longitude is null or longitude between -180 and 180);

drop function if exists public.get_bajuju_groups(integer, uuid);
drop function if exists private.bajuju_groups_discovery(uuid, integer, uuid);

create or replace function private.bajuju_groups_discovery(
  p_viewer_id uuid,
  p_limit integer default 60,
  p_owner_id uuid default null,
  p_search text default null
)
returns table(
  id uuid,
  name text,
  description text,
  city text,
  province text,
  category text,
  cover_url text,
  owner_id uuid,
  member_count bigint,
  joined_by_me boolean,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  with viewer as (
    select np.latitude, np.longitude
    from public.notification_preferences np
    where np.user_id = p_viewer_id
    limit 1
  ), ranked as (
    select
      g.id,
      g.name,
      g.description,
      g.city,
      g.province,
      g.category,
      g.cover_url,
      g.owner_id,
      count(gm.user_id)::bigint as member_count,
      coalesce(bool_or(gm.user_id = p_viewer_id), false) as joined_by_me,
      g.latitude,
      g.longitude,
      case
        when v.latitude is not null and v.longitude is not null
          and g.latitude is not null and g.longitude is not null
        then 6371.0 * 2.0 * asin(
          least(1.0, sqrt(
            power(sin(radians(g.latitude - v.latitude) / 2.0), 2)
            + cos(radians(v.latitude)) * cos(radians(g.latitude))
            * power(sin(radians(g.longitude - v.longitude) / 2.0), 2)
          ))
        )
        else null
      end as distance_km,
      g.created_at
    from public.groups g
    left join public.group_members gm on gm.group_id = g.id
    left join viewer v on true
    where p_viewer_id = (select auth.uid())
      and g.status = 'active'
      and (p_owner_id is null or g.owner_id = p_owner_id)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or g.name ilike ('%' || btrim(p_search) || '%')
        or coalesce(g.city, '') ilike ('%' || btrim(p_search) || '%')
      )
    group by g.id, v.latitude, v.longitude
  )
  select
    r.id, r.name, r.description, r.city, r.province, r.category, r.cover_url,
    r.owner_id, r.member_count, r.joined_by_me, r.latitude, r.longitude,
    r.distance_km, r.created_at
  from ranked r
  order by r.distance_km asc nulls last, r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100));
$$;

revoke all on function private.bajuju_groups_discovery(uuid, integer, uuid, text) from public, anon, authenticated;

drop function if exists public.get_bajuju_groups(integer, uuid, text);
create function public.get_bajuju_groups(
  p_limit integer default 60,
  p_owner_id uuid default null,
  p_search text default null
)
returns table(
  id uuid,
  name text,
  description text,
  city text,
  province text,
  category text,
  cover_url text,
  owner_id uuid,
  member_count bigint,
  joined_by_me boolean,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'public', 'private', 'pg_temp'
as $$
  select *
  from private.bajuju_groups_discovery((select auth.uid()), p_limit, p_owner_id, p_search);
$$;

revoke all on function public.get_bajuju_groups(integer, uuid, text) from public, anon;
grant execute on function public.get_bajuju_groups(integer, uuid, text) to authenticated;
