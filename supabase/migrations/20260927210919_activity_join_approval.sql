alter table public.activities
  add column if not exists join_approval_required boolean not null default false;

create table if not exists public.activity_join_requests (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  primary key (activity_id, user_id)
);

create index if not exists activity_join_requests_pending_idx
  on public.activity_join_requests (activity_id, requested_at)
  where status = 'pending';

alter table public.activity_join_requests enable row level security;
revoke all on table public.activity_join_requests from public, anon, authenticated;

create or replace function public.request_activity_join(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_activity public.activities%rowtype;
  v_existing_status public.participation_status;
begin
  if v_user_id is null then
    raise exception 'BAJUJU_AUTH_REQUIRED';
  end if;

  if public.is_user_blocked(v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'BLOCKED');
  end if;

  select *
    into v_activity
  from public.activities
  where id = p_activity_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  if coalesce(v_activity.is_flash, false) then
    return jsonb_build_object('ok', false, 'reason', 'UNAVAILABLE');
  end if;

  if v_activity.creator_id = v_user_id then
    return jsonb_build_object('ok', false, 'reason', 'ORGANIZER');
  end if;

  if v_activity.deleted_at is not null
     or v_activity.status in ('annullata','eliminata','bloccata','archiviata') then
    return jsonb_build_object('ok', false, 'reason', 'UNAVAILABLE');
  end if;

  if ((v_activity.activity_date + v_activity.activity_time) at time zone 'Europe/Rome') <= now() then
    return jsonb_build_object('ok', false, 'reason', 'PAST');
  end if;

  if private.bajuju_activity_has_block_conflict(p_activity_id, v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'BLOCKED');
  end if;

  select ap.status
    into v_existing_status
  from public.activity_participants ap
  where ap.activity_id = p_activity_id
    and ap.user_id = v_user_id
  limit 1;

  if found and v_existing_status is distinct from 'annullato' then
    delete from public.activity_join_requests
    where activity_id = p_activity_id and user_id = v_user_id;
    return jsonb_build_object('ok', true, 'status', 'already_joined');
  end if;

  if coalesce(v_activity.join_approval_required, false) = false then
    delete from public.activity_join_requests
    where activity_id = p_activity_id and user_id = v_user_id;
    return public.join_standard_activity(p_activity_id);
  end if;

  insert into public.activity_join_requests (
    activity_id,
    user_id,
    status,
    requested_at,
    responded_at,
    responded_by
  )
  values (
    p_activity_id,
    v_user_id,
    'pending',
    now(),
    null,
    null
  )
  on conflict (activity_id, user_id) do update
    set status = 'pending',
        requested_at = case
          when public.activity_join_requests.status = 'pending'
            then public.activity_join_requests.requested_at
          else now()
        end,
        responded_at = null,
        responded_by = null;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

create or replace function public.cancel_activity_join_request(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'BAJUJU_AUTH_REQUIRED';
  end if;

  delete from public.activity_join_requests
  where activity_id = p_activity_id
    and user_id = v_user_id
    and status in ('pending','rejected');
end;
$$;

create or replace function public.get_activity_join_state(p_activity_id uuid)
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

  select a.creator_id
    into v_owner_id
  from public.activities a
  where a.id = p_activity_id;

  if not found then return 'none'; end if;
  if v_owner_id = v_user_id then return 'owner'; end if;

  if exists (
    select 1
    from public.activity_participants ap
    where ap.activity_id = p_activity_id
      and ap.user_id = v_user_id
      and ap.status is distinct from 'annullato'
  ) then
    return 'joined';
  end if;

  select r.status
    into v_request_status
  from public.activity_join_requests r
  where r.activity_id = p_activity_id
    and r.user_id = v_user_id;

  return coalesce(v_request_status, 'none');
end;
$$;

create or replace function public.get_activity_join_requests(p_activity_id uuid)
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
  if v_user_id is null then
    raise exception 'BAJUJU_AUTH_REQUIRED';
  end if;

  if not (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.activities a
      where a.id = p_activity_id
        and a.creator_id = v_user_id
    )
  ) then
    raise exception 'BAJUJU_ACTIVITY_MANAGE_FORBIDDEN';
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
  from public.activity_join_requests r
  join public.profiles p on p.id = r.user_id
  where r.activity_id = p_activity_id
    and r.status = 'pending'
    and coalesce(p.is_deleted, false) = false
  order by r.requested_at asc;
end;
$$;

create or replace function public.review_activity_join_request(
  p_activity_id uuid,
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
  v_activity public.activities%rowtype;
  v_participant_id uuid;
begin
  if v_manager_id is null then
    raise exception 'BAJUJU_AUTH_REQUIRED';
  end if;

  if not (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.activities a
      where a.id = p_activity_id
        and a.creator_id = v_manager_id
    )
  ) then
    raise exception 'BAJUJU_ACTIVITY_MANAGE_FORBIDDEN';
  end if;

  select *
    into v_activity
  from public.activities
  where id = p_activity_id
  for update;

  if not found then
    raise exception 'BAJUJU_ACTIVITY_NOT_FOUND';
  end if;

  if coalesce(v_activity.is_flash, false)
     or v_activity.deleted_at is not null
     or v_activity.status in ('annullata','eliminata','bloccata','archiviata') then
    raise exception 'BAJUJU_ACTIVITY_NOT_ACTIVE';
  end if;

  if ((v_activity.activity_date + v_activity.activity_time) at time zone 'Europe/Rome') <= now() then
    raise exception 'BAJUJU_ACTIVITY_NOT_ACTIVE';
  end if;

  if not exists (
    select 1
    from public.activity_join_requests r
    where r.activity_id = p_activity_id
      and r.user_id = p_user_id
      and r.status = 'pending'
  ) then
    raise exception 'BAJUJU_JOIN_REQUEST_NOT_PENDING';
  end if;

  if not p_accept then
    update public.activity_join_requests
      set status = 'rejected',
          responded_at = now(),
          responded_by = v_manager_id
    where activity_id = p_activity_id
      and user_id = p_user_id;

    return 'rejected';
  end if;

  select ap.id
    into v_participant_id
  from public.activity_participants ap
  where ap.activity_id = p_activity_id
    and ap.user_id = p_user_id
  limit 1;

  if v_participant_id is not null then
    update public.activity_participants
      set status = 'partecipo'
    where id = v_participant_id;
  else
    insert into public.activity_participants(activity_id, user_id, status)
    values (p_activity_id, p_user_id, 'partecipo');
  end if;

  update public.activity_waitlist
    set status = 'joined',
        reserved_until = null,
        updated_at = now()
  where activity_id = p_activity_id
    and user_id = p_user_id
    and status in ('waiting','notified');

  update public.activity_join_requests
    set status = 'approved',
        responded_at = now(),
        responded_by = v_manager_id
  where activity_id = p_activity_id
    and user_id = p_user_id;

  return 'approved';
end;
$$;

create or replace function public.guard_standard_activity_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.activities%rowtype;
  active_count integer;
  active_reservations integer;
  my_reservation boolean;
begin
  select * into a
  from public.activities
  where id = new.activity_id
  for update;

  if not found or coalesce(a.is_flash, false) then
    return new;
  end if;

  if a.creator_id = new.user_id then
    return new;
  end if;

  if coalesce(a.join_approval_required, false)
     and (select auth.uid()) = new.user_id then
    raise exception using errcode = 'P0001', message = 'BAJUJU_APPROVAL_REQUIRED';
  end if;

  select
    (case when a.creator_id is not null then 1 else 0 end) + count(*)::integer
  into active_count
  from public.activity_participants ap
  where ap.activity_id = new.activity_id
    and ap.status is distinct from 'annullato'
    and ap.user_id is distinct from a.creator_id;

  if coalesce(a.max_participants, 0) > 0 and active_count >= a.max_participants then
    raise exception using errcode = 'P0001', message = 'BAJUJU_EVENT_FULL';
  end if;

  select exists(
    select 1
    from public.activity_waitlist w
    where w.activity_id = new.activity_id
      and w.user_id = new.user_id
      and w.status = 'notified'
      and w.reserved_until > now()
  ) into my_reservation;

  select count(*)::integer
  into active_reservations
  from public.activity_waitlist w
  where w.activity_id = new.activity_id
    and w.status = 'notified'
    and w.reserved_until > now();

  if not my_reservation
     and coalesce(a.max_participants, 0) > 0
     and active_reservations >= greatest(a.max_participants - active_count, 0) then
    raise exception using errcode = 'P0001', message = 'BAJUJU_SPOT_RESERVED';
  end if;

  return new;
end;
$$;

revoke all on function public.request_activity_join(uuid) from public, anon;
grant execute on function public.request_activity_join(uuid) to authenticated;

revoke all on function public.cancel_activity_join_request(uuid) from public, anon;
grant execute on function public.cancel_activity_join_request(uuid) to authenticated;

revoke all on function public.get_activity_join_state(uuid) from public, anon;
grant execute on function public.get_activity_join_state(uuid) to authenticated;

revoke all on function public.get_activity_join_requests(uuid) from public, anon;
grant execute on function public.get_activity_join_requests(uuid) to authenticated;

revoke all on function public.review_activity_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.review_activity_join_request(uuid, uuid, boolean) to authenticated;
