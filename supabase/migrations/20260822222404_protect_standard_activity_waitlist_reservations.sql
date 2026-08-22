create or replace function public.guard_standard_activity_participant_insert()
returns trigger
language plpgsql
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

create or replace function public.mark_waitlist_joined_after_participant_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.activity_waitlist
  set status = 'joined',
      reserved_until = null,
      updated_at = now()
  where activity_id = new.activity_id
    and user_id = new.user_id
    and status in ('waiting', 'notified');

  return new;
end;
$$;

drop trigger if exists guard_standard_activity_participant_insert_trg on public.activity_participants;
create trigger guard_standard_activity_participant_insert_trg
before insert on public.activity_participants
for each row
execute function public.guard_standard_activity_participant_insert();

drop trigger if exists mark_waitlist_joined_after_participant_insert_trg on public.activity_participants;
create trigger mark_waitlist_joined_after_participant_insert_trg
after insert on public.activity_participants
for each row
execute function public.mark_waitlist_joined_after_participant_insert();
