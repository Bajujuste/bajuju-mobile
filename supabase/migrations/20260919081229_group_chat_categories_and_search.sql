-- Fixed group categories, richer keyword search, and compact group chat backend.

-- 1) Normalize existing categories before enforcing the fixed list.
update public.groups
set category = case
  when lower(coalesce(category, '')) like '%cinema%' or lower(coalesce(category, '')) like '%teatro%' then 'Cinema & Teatro'
  when lower(coalesce(category, '')) like '%aperitiv%' or lower(coalesce(category, '')) like '%serat%' or lower(coalesce(category, '')) like '%discotec%' then 'Aperitivi & Serate'
  when lower(coalesce(category, '')) like '%cena%' or lower(coalesce(category, '')) like '%food%' or lower(coalesce(category, '')) like '%ristor%' then 'Cene & Food'
  when lower(coalesce(category, '')) like '%viagg%' or lower(coalesce(category, '')) like '%gita%' or lower(coalesce(category, '')) like '%vacanz%' then 'Viaggi & Gite'
  when lower(coalesce(category, '')) like '%trekking%' or lower(coalesce(category, '')) like '%natura%' or lower(coalesce(category, '')) like '%cammin%' or lower(coalesce(category, '')) like '%passegg%' then 'Trekking & Natura'
  when lower(coalesce(category, '')) like '%sport%' or lower(coalesce(category, '')) like '%calcetto%' or lower(coalesce(category, '')) like '%calcio%' or lower(coalesce(category, '')) like '%padel%' or lower(coalesce(category, '')) like '%tennis%' then 'Sport'
  when lower(coalesce(category, '')) like '%musica%' or lower(coalesce(category, '')) like '%concerto%' then 'Musica'
  when lower(coalesce(category, '')) like '%cultura%' or lower(coalesce(category, '')) like '%muse%' or lower(coalesce(category, '')) like '%arte%' then 'Cultura'
  when lower(coalesce(category, '')) like '%gioc%' or lower(coalesce(category, '')) like '%hobby%' then 'Giochi & Hobby'
  when lower(coalesce(category, '')) like '%single%' or lower(coalesce(category, '')) like '%amic%' or lower(coalesce(category, '')) like '%incontr%' or lower(coalesce(category, '')) like '%social%' then 'Amicizia & Incontri'
  else 'Altro'
end
where category is null
   or category not in (
     'Cinema & Teatro',
     'Aperitivi & Serate',
     'Cene & Food',
     'Viaggi & Gite',
     'Sport',
     'Trekking & Natura',
     'Musica',
     'Cultura',
     'Giochi & Hobby',
     'Amicizia & Incontri',
     'Altro'
   );

alter table public.groups
  alter column category set not null;

alter table public.groups
  drop constraint if exists groups_category_allowed_chk;

alter table public.groups
  add constraint groups_category_allowed_chk
  check (
    category in (
      'Cinema & Teatro',
      'Aperitivi & Serate',
      'Cene & Food',
      'Viaggi & Gite',
      'Sport',
      'Trekking & Natura',
      'Musica',
      'Cultura',
      'Giochi & Hobby',
      'Amicizia & Incontri',
      'Altro'
    )
  );

-- 2) One keyword searches name, category, description and location.
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
        or coalesce(g.category, '') ilike ('%' || btrim(p_search) || '%')
        or coalesce(g.description, '') ilike ('%' || btrim(p_search) || '%')
        or coalesce(g.city, '') ilike ('%' || btrim(p_search) || '%')
        or coalesce(g.province, '') ilike ('%' || btrim(p_search) || '%')
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

-- 3) Group chat. Only members (and admins for moderation) can read.
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  constraint group_messages_message_length_chk
    check (char_length(btrim(message)) between 1 and 1000)
);

create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at desc);

create index if not exists group_messages_user_id_idx
  on public.group_messages (user_id);

alter table public.group_messages enable row level security;

revoke all on table public.group_messages from anon, authenticated;
grant select, insert on table public.group_messages to authenticated;

drop policy if exists "Membri vedono chat gruppo" on public.group_messages;
create policy "Membri vedono chat gruppo"
on public.group_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.groups g
    where g.id = group_messages.group_id
      and g.status = 'active'
  )
  and (
    public.is_current_user_admin()
    or (
      exists (
        select 1
        from public.group_members gm
        where gm.group_id = group_messages.group_id
          and gm.user_id = (select auth.uid())
      )
      and (
        group_messages.user_id = (select auth.uid())
        or not private.bajuju_users_block_each_other((select auth.uid()), group_messages.user_id)
      )
    )
  )
);

drop policy if exists "Membri scrivono chat gruppo" on public.group_messages;
create policy "Membri scrivono chat gruppo"
on public.group_messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and char_length(btrim(message)) between 1 and 1000
  and not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_blocked, false) = true
  )
  and exists (
    select 1
    from public.groups g
    join public.group_members gm on gm.group_id = g.id
    where g.id = group_messages.group_id
      and g.status = 'active'
      and gm.user_id = (select auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.group_messages';
  end if;
end
$$;
