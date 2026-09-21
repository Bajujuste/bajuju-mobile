-- Tutti gli utenti autenticati possono vedere chi è iscritto a un gruppo attivo.
-- Restano esclusi i profili eliminati e gli utenti con blocco reciproco rispetto al viewer.
create or replace function private.bajuju_group_member_profiles(p_group_id uuid, p_viewer_id uuid)
returns table(user_id uuid, nickname text, age_range text, origin text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.nickname,
    p.age_range,
    coalesce(
      nullif(trim(p.location_profile_text), ''),
      nullif(trim(p.city), ''),
      nullif(trim(p.province), ''),
      ''
    ) as origin
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and g.status = 'active'
    and p_viewer_id = (select auth.uid())
    and p_viewer_id is not null
    and coalesce(p.is_deleted, false) = false
    and not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = p_viewer_id and ub.blocked_id = p.id)
         or (ub.blocker_id = p.id and ub.blocked_id = p_viewer_id)
    )
  order by lower(p.nickname);
$$;
