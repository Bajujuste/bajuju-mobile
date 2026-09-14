-- L'elenco degli iscritti a un gruppo (nickname, fascia d'età, provenienza) era visibile a qualsiasi
-- utente autenticato per ogni gruppo attivo. Ora lo vedono solo gli iscritti al gruppo, il proprietario
-- e gli admin, coerentemente con la policy "Iscrizioni gruppo visibili in modo limitato" su group_members.
-- Il numero di iscritti mostrato nella ricerca gruppi (get_bajuju_groups) non cambia.
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
    and (
      g.owner_id = p_viewer_id
      or public.is_current_user_admin()
      or exists (
        select 1
        from public.group_members viewer_membership
        where viewer_membership.group_id = p_group_id
          and viewer_membership.user_id = p_viewer_id
      )
    )
    and coalesce(p.is_deleted, false) = false
    and not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = p_viewer_id and ub.blocked_id = p.id)
         or (ub.blocker_id = p.id and ub.blocked_id = p_viewer_id)
    )
  order by lower(p.nickname);
$$;

-- Numero di iscritti di un gruppo attivo, visibile a tutti gli utenti autenticati:
-- serve al dettaglio gruppo, che prima lo calcolava dall'elenco ora riservato ai membri.
create or replace function public.get_group_member_count(p_group_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(gm.user_id)::bigint
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and g.status = 'active'
    and (select auth.uid()) is not null
    and coalesce(p.is_deleted, false) = false;
$$;

revoke all on function public.get_group_member_count(uuid) from public, anon;
grant execute on function public.get_group_member_count(uuid) to authenticated, service_role;
