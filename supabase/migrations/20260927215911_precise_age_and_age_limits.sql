-- Precise user age and optional age limits for groups and standard experiences.
-- Existing members/participants are intentionally not removed when organizers change age limits.

alter table public.profiles
  add column if not exists age integer;

update public.profiles
set age = age_range::integer
where age is null
  and age_range ~ '^[0-9]{1,2}$'
  and age_range::integer between 18 and 80;

alter table public.profiles
  drop constraint if exists profiles_age_check;

alter table public.profiles
  add constraint profiles_age_check
  check (age is null or age between 18 and 80);

alter table public.groups
  add column if not exists min_age integer,
  add column if not exists max_age integer;

alter table public.groups
  drop constraint if exists groups_age_range_check;

alter table public.groups
  add constraint groups_age_range_check
  check (
    (min_age is null and max_age is null)
    or (
      min_age between 18 and 80
      and max_age between 18 and 80
      and min_age <= max_age
    )
  );

alter table public.activities
  add column if not exists min_age integer,
  add column if not exists max_age integer;

alter table public.activities
  drop constraint if exists activities_age_range_check;

alter table public.activities
  add constraint activities_age_range_check
  check (
    (min_age is null and max_age is null)
    or (
      min_age between 18 and 80
      and max_age between 18 and 80
      and min_age <= max_age
    )
  );

drop policy if exists "Utente può iscriversi a gruppo" on public.group_members;
create policy "Utente può iscriversi a gruppo"
on public.group_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and is_user_blocked((select auth.uid())) = false
  and exists (
    select 1
    from public.groups g
    join public.profiles p on p.id = (select auth.uid())
    where g.id = group_id
      and g.status = 'active'
      and coalesce(g.join_approval_required, false) = false
      and p.age between 18 and 80
      and (g.min_age is null or p.age >= g.min_age)
      and (g.max_age is null or p.age <= g.max_age)
  )
);

CREATE OR REPLACE FUNCTION public.get_activity_join_requests(p_activity_id uuid)
 RETURNS TABLE(user_id uuid, nickname text, avatar_url text, age_range text, gender text, origin text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    coalesce(p.age::text, p.age_range),
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
$function$;

CREATE OR REPLACE FUNCTION public.get_group_join_requests(p_group_id uuid)
 RETURNS TABLE(user_id uuid, nickname text, avatar_url text, age_range text, gender text, origin text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    coalesce(p.age::text, p.age_range),
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
$function$;

CREATE OR REPLACE FUNCTION public.guard_standard_activity_participant_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a public.activities%rowtype;
  active_count integer;
  active_reservations integer;
  my_reservation boolean;
  v_age integer;
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

  select p.age into v_age
  from public.profiles p
  where p.id = new.user_id;

  if v_age is null or v_age < 18 or v_age > 80 then
    raise exception using errcode = 'P0001', message = 'BAJUJU_PROFILE_AGE_REQUIRED';
  end if;

  if (a.min_age is not null and v_age < a.min_age)
     or (a.max_age is not null and v_age > a.max_age) then
    raise exception using errcode = 'P0001', message = 'BAJUJU_AGE_RESTRICTED';
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
$function$;

CREATE OR REPLACE FUNCTION public.join_activity_waitlist(p_activity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  a public.activities%rowtype;
  active_count integer;
  wait_id uuid;
  queue_position integer;
  v_age integer;
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
  if public.is_user_blocked(uid) then return jsonb_build_object('ok',false,'reason','BLOCKED'); end if;

  select * into a
  from public.activities
  where id=p_activity_id
  for update;

  if not found then raise exception 'Esperienza non trovata.'; end if;
  if coalesce(a.is_flash,false) then raise exception 'Lista d’attesa non disponibile per Flash.'; end if;
  if a.creator_id=uid then raise exception 'L’organizzatore non può entrare in lista d’attesa.'; end if;
  if a.deleted_at is not null or a.status in ('annullata','eliminata','bloccata','archiviata') then
    raise exception 'Esperienza non disponibile.';
  end if;

  if private.bajuju_activity_has_block_conflict(p_activity_id, uid) then
    return jsonb_build_object('ok',false,'reason','BLOCKED');
  end if;

  if exists(
    select 1
    from public.activity_participants ap
    where ap.activity_id=p_activity_id
      and ap.user_id=uid
      and ap.status is distinct from 'annullato'
  ) then
    return jsonb_build_object('ok',false,'reason','ALREADY_JOINED');
  end if;

  select p.age into v_age from public.profiles p where p.id = uid;
  if v_age is null or v_age < 18 or v_age > 80 then
    return jsonb_build_object('ok',false,'reason','PROFILE_AGE_REQUIRED');
  end if;
  if (a.min_age is not null and v_age < a.min_age)
     or (a.max_age is not null and v_age > a.max_age) then
    return jsonb_build_object('ok',false,'reason','AGE_RESTRICTED');
  end if;

  select (case when a.creator_id is not null then 1 else 0 end)+count(*)::integer
  into active_count
  from public.activity_participants ap
  where ap.activity_id=p_activity_id
    and ap.status is distinct from 'annullato'
    and ap.user_id is distinct from a.creator_id;

  if coalesce(a.max_participants,0)<=0 or active_count<a.max_participants then
    return jsonb_build_object('ok',false,'reason','EVENT_NOT_FULL');
  end if;

  select w.id into wait_id
  from public.activity_waitlist w
  where w.activity_id=p_activity_id
    and w.user_id=uid
    and w.status in ('waiting','notified')
  order by w.created_at desc
  limit 1;

  if wait_id is null then
    insert into public.activity_waitlist(activity_id,user_id,status)
    values(p_activity_id,uid,'waiting')
    returning id into wait_id;
  end if;

  select count(*)::integer+1
  into queue_position
  from public.activity_waitlist w
  where w.activity_id=p_activity_id
    and w.status in ('waiting','notified')
    and w.created_at<(select created_at from public.activity_waitlist where id=wait_id);

  return jsonb_build_object('ok',true,'status','waiting','position',queue_position);
end;
$function$;

CREATE OR REPLACE FUNCTION public.join_standard_activity(p_activity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  a public.activities%rowtype;
  active_count integer;
  active_reservations integer;
  my_reservation boolean;
  existing_participant_id uuid;
  v_age integer;
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
  if public.is_user_blocked(uid) then return jsonb_build_object('ok',false,'reason','BLOCKED'); end if;

  select * into a
  from public.activities
  where id = p_activity_id
  for update;

  if not found then raise exception 'Esperienza non trovata.'; end if;
  if coalesce(a.is_flash,false) then raise exception 'Funzione non valida per Flash.'; end if;
  if a.creator_id = uid then return jsonb_build_object('ok',false,'reason','ORGANIZER'); end if;
  if a.deleted_at is not null or a.status in ('annullata','eliminata','bloccata','archiviata') then
    return jsonb_build_object('ok',false,'reason','UNAVAILABLE');
  end if;
  if ((a.activity_date+a.activity_time) at time zone 'Europe/Rome') <= now() then
    return jsonb_build_object('ok',false,'reason','PAST');
  end if;

  if private.bajuju_activity_has_block_conflict(p_activity_id, uid) then
    return jsonb_build_object('ok',false,'reason','BLOCKED');
  end if;

  select ap.id into existing_participant_id
  from public.activity_participants ap
  where ap.activity_id = p_activity_id
    and ap.user_id = uid
  limit 1;

  if existing_participant_id is not null
     and exists (
       select 1
       from public.activity_participants ap
       where ap.id = existing_participant_id
         and ap.status is distinct from 'annullato'
     ) then
    return jsonb_build_object('ok',true,'status','already_joined');
  end if;

  select p.age into v_age from public.profiles p where p.id = uid;
  if v_age is null or v_age < 18 or v_age > 80 then
    return jsonb_build_object('ok',false,'reason','PROFILE_AGE_REQUIRED');
  end if;
  if (a.min_age is not null and v_age < a.min_age)
     or (a.max_age is not null and v_age > a.max_age) then
    return jsonb_build_object('ok',false,'reason','AGE_RESTRICTED');
  end if;

  perform public.process_activity_waitlist(p_activity_id);

  select (case when a.creator_id is not null then 1 else 0 end) + count(*)::integer
  into active_count
  from public.activity_participants ap
  where ap.activity_id = p_activity_id
    and ap.status is distinct from 'annullato'
    and ap.user_id is distinct from a.creator_id;

  if coalesce(a.max_participants,0) > 0 and active_count >= a.max_participants then
    return jsonb_build_object('ok',false,'reason','FULL');
  end if;

  select exists(
    select 1
    from public.activity_waitlist w
    where w.activity_id = p_activity_id
      and w.user_id = uid
      and w.status = 'notified'
      and w.reserved_until > now()
  ) into my_reservation;

  select count(*)::integer
  into active_reservations
  from public.activity_waitlist w
  where w.activity_id = p_activity_id
    and w.status = 'notified'
    and w.reserved_until > now();

  if not my_reservation
     and coalesce(a.max_participants,0) > 0
     and active_reservations >= greatest(a.max_participants-active_count,0) then
    return jsonb_build_object('ok',false,'reason','RESERVED');
  end if;

  if existing_participant_id is not null then
    update public.activity_participants
    set status='partecipo'
    where id=existing_participant_id;
  else
    insert into public.activity_participants(activity_id,user_id,status)
    values(p_activity_id,uid,'partecipo');
  end if;

  update public.activity_waitlist
  set status='joined',reserved_until=null,updated_at=now()
  where activity_id=p_activity_id
    and user_id=uid
    and status in ('waiting','notified');

  return jsonb_build_object('ok',true,'status','joined');
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_activity_join(p_activity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_activity public.activities%rowtype;
  v_existing_status public.participation_status;
  v_age integer;
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

  select p.age into v_age
  from public.profiles p
  where p.id = v_user_id;

  if v_age is null or v_age < 18 or v_age > 80 then
    return jsonb_build_object('ok', false, 'reason', 'PROFILE_AGE_REQUIRED');
  end if;

  if (v_activity.min_age is not null and v_age < v_activity.min_age)
     or (v_activity.max_age is not null and v_age > v_activity.max_age) then
    return jsonb_build_object('ok', false, 'reason', 'AGE_RESTRICTED');
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
$function$;

CREATE OR REPLACE FUNCTION public.request_group_join(p_group_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_owner_id uuid;
  v_status text;
  v_requires_approval boolean;
  v_min_age integer;
  v_max_age integer;
  v_age integer;
begin
  if v_user_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if public.is_user_blocked(v_user_id) then raise exception 'BAJUJU_USER_BLOCKED'; end if;

  select g.owner_id, g.status, coalesce(g.join_approval_required, false), g.min_age, g.max_age
    into v_owner_id, v_status, v_requires_approval, v_min_age, v_max_age
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

  select p.age into v_age
  from public.profiles p
  where p.id = v_user_id;

  if v_age is null or v_age < 18 or v_age > 80 then
    return 'age_required';
  end if;

  if (v_min_age is not null and v_age < v_min_age)
     or (v_max_age is not null and v_age > v_max_age) then
    return 'age_restricted';
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
$function$;

CREATE OR REPLACE FUNCTION public.review_activity_join_request(p_activity_id uuid, p_user_id uuid, p_accept boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_manager_id uuid := (select auth.uid());
  v_activity public.activities%rowtype;
  v_participant_id uuid;
  v_age integer;
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

  select p.age into v_age
  from public.profiles p
  where p.id = p_user_id;

  if v_age is null or v_age < 18 or v_age > 80 then
    raise exception 'BAJUJU_PROFILE_AGE_REQUIRED';
  end if;

  if (v_activity.min_age is not null and v_age < v_activity.min_age)
     or (v_activity.max_age is not null and v_age > v_activity.max_age) then
    raise exception 'BAJUJU_AGE_RESTRICTED';
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
$function$;

CREATE OR REPLACE FUNCTION public.review_group_join_request(p_group_id uuid, p_user_id uuid, p_accept boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_manager_id uuid := (select auth.uid());
  v_group_status text;
  v_min_age integer;
  v_max_age integer;
  v_age integer;
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

  select g.status, g.min_age, g.max_age
    into v_group_status, v_min_age, v_max_age
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
    select p.age into v_age
    from public.profiles p
    where p.id = p_user_id;

    if v_age is null or v_age < 18 or v_age > 80 then
      raise exception 'BAJUJU_PROFILE_AGE_REQUIRED';
    end if;

    if (v_min_age is not null and v_age < v_min_age)
       or (v_max_age is not null and v_age > v_max_age) then
      raise exception 'BAJUJU_AGE_RESTRICTED';
    end if;

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
$function$;

revoke all on function public.request_group_join(uuid) from public, anon;
grant execute on function public.request_group_join(uuid) to authenticated;

revoke all on function public.get_group_join_requests(uuid) from public, anon;
grant execute on function public.get_group_join_requests(uuid) to authenticated;

revoke all on function public.review_group_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.review_group_join_request(uuid, uuid, boolean) to authenticated;

revoke all on function public.join_standard_activity(uuid) from public, anon;
grant execute on function public.join_standard_activity(uuid) to authenticated, service_role;

revoke all on function public.join_activity_waitlist(uuid) from public, anon;
grant execute on function public.join_activity_waitlist(uuid) to authenticated, service_role;

revoke all on function public.request_activity_join(uuid) from public, anon;
grant execute on function public.request_activity_join(uuid) to authenticated;

revoke all on function public.get_activity_join_requests(uuid) from public, anon;
grant execute on function public.get_activity_join_requests(uuid) to authenticated;

revoke all on function public.review_activity_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.review_activity_join_request(uuid, uuid, boolean) to authenticated;
