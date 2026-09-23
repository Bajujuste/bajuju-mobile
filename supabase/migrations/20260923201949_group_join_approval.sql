-- Optional approval flow for community memberships.

alter table public.groups
  add column if not exists join_approval_required boolean not null default false;

create table if not exists public.group_join_requests (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  primary key (group_id, user_id)
);

create index if not exists group_join_requests_pending_idx
  on public.group_join_requests (group_id, requested_at)
  where status = 'pending';

alter table public.group_join_requests enable row level security;
revoke all on table public.group_join_requests from public, anon, authenticated;

drop policy if exists "Utente può iscriversi a gruppo" on public.group_members;
create policy "Utente può iscriversi a gruppo"
on public.group_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and is_user_blocked((select auth.uid())) = false
  and exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.status = 'active'
      and coalesce(g.join_approval_required, false) = false
  )
);

create or replace function public.request_group_join(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_owner_id uuid;
  v_status text;
  v_requires_approval boolean;
begin
  if v_user_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if public.is_user_blocked(v_user_id) then raise exception 'BAJUJU_USER_BLOCKED'; end if;

  select g.owner_id, g.status, coalesce(g.join_approval_required, false)
    into v_owner_id, v_status, v_requires_approval
  from public.groups g
  where g.id = p_group_id;

  if not found then raise exception 'BAJUJU_GROUP_NOT_FOUND'; end if;
  if v_owner_id = v_user_id then return 'owner'; end if;
  if v_status <> 'active' then raise exception 'BAJUJU_GROUP_NOT_ACTIVE'; end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_user_id
  ) then
    return 'joined';
  end if;

  if v_requires_approval then
    insert into public.group_join_requests (
      group_id, user_id, status, requested_at, responded_at, responded_by
    )
    values (p_group_id, v_user_id, 'pending', now(), null, null)
    on conflict (group_id, user_id) do update
      set status = 'pending',
          requested_at = now(),
          responded_at = null,
          responded_by = null;
    return 'pending';
  end if;

  insert into public.group_members (group_id, user_id)
  values (p_group_id, v_user_id)
  on conflict (group_id, user_id) do nothing;

  delete from public.group_join_requests
  where group_id = p_group_id and user_id = v_user_id;

  return 'joined';
end;
$$;

create or replace function public.cancel_group_join_request(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  delete from public.group_join_requests
  where group_id = p_group_id
    and user_id = v_user_id
    and status in ('pending','rejected');
end;
$$;

create or replace function public.get_group_join_state(p_group_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_owner_id uuid;
  v_request_status text;
begin
  if v_user_id is null then return 'none'; end if;

  select g.owner_id into v_owner_id
  from public.groups g
  where g.id = p_group_id;

  if not found then return 'none'; end if;
  if v_owner_id = v_user_id then return 'owner'; end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_user_id
  ) then
    return 'joined';
  end if;

  select r.status into v_request_status
  from public.group_join_requests r
  where r.group_id = p_group_id and r.user_id = v_user_id;

  return coalesce(v_request_status, 'none');
end;
$$;

create or replace function public.get_group_join_requests(p_group_id uuid)
returns table(
  user_id uuid,
  nickname text,
  avatar_url text,
  age_range text,
  gender text,
  origin text,
  requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  if not (
    public.is_current_user_admin()
    or exists (
      select 1 from public.groups g
      where g.id = p_group_id and g.owner_id = v_user_id
    )
  ) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.nickname,
    p.avatar_url,
    p.age_range,
    p.gender,
    coalesce(
      nullif(trim(p.location_profile_text), ''),
      nullif(trim(p.city), ''),
      nullif(trim(p.province), ''),
      ''
    ) as origin,
    r.requested_at
  from public.group_join_requests r
  join public.profiles p on p.id = r.user_id
  where r.group_id = p_group_id
    and r.status = 'pending'
    and coalesce(p.is_deleted, false) = false
  order by r.requested_at asc;
end;
$$;

create or replace function public.review_group_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_manager_id uuid := (select auth.uid());
  v_group_status text;
begin
  if v_manager_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  if not (
    public.is_current_user_admin()
    or exists (
      select 1 from public.groups g
      where g.id = p_group_id and g.owner_id = v_manager_id
    )
  ) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;

  select g.status into v_group_status
  from public.groups g
  where g.id = p_group_id;

  if not found then raise exception 'BAJUJU_GROUP_NOT_FOUND'; end if;
  if v_group_status <> 'active' then raise exception 'BAJUJU_GROUP_NOT_ACTIVE'; end if;

  if not exists (
    select 1 from public.group_join_requests r
    where r.group_id = p_group_id
      and r.user_id = p_user_id
      and r.status = 'pending'
  ) then
    raise exception 'BAJUJU_JOIN_REQUEST_NOT_PENDING';
  end if;

  if p_accept then
    insert into public.group_members (group_id, user_id)
    values (p_group_id, p_user_id)
    on conflict (group_id, user_id) do nothing;

    update public.group_join_requests
      set status = 'approved', responded_at = now(), responded_by = v_manager_id
    where group_id = p_group_id and user_id = p_user_id;

    return 'approved';
  end if;

  update public.group_join_requests
    set status = 'rejected', responded_at = now(), responded_by = v_manager_id
  where group_id = p_group_id and user_id = p_user_id;

  return 'rejected';
end;
$$;

revoke all on function public.request_group_join(uuid) from public, anon;
grant execute on function public.request_group_join(uuid) to authenticated;
revoke all on function public.cancel_group_join_request(uuid) from public, anon;
grant execute on function public.cancel_group_join_request(uuid) to authenticated;
revoke all on function public.get_group_join_state(uuid) from public, anon;
grant execute on function public.get_group_join_state(uuid) to authenticated;
revoke all on function public.get_group_join_requests(uuid) from public, anon;
grant execute on function public.get_group_join_requests(uuid) to authenticated;
revoke all on function public.review_group_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.review_group_join_request(uuid, uuid, boolean) to authenticated;
