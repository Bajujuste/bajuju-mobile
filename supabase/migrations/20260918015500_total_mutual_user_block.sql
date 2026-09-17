-- Blocco reciproco totale tra utenti.
-- Se due utenti sono bloccati in una delle due direzioni:
-- - non vedono i rispettivi profili;
-- - non vedono gli eventi dell'altro e, se non sono già dentro, nemmeno gli eventi
--   a cui l'altro partecipa;
-- - non possono entrare nello stesso evento dopo il blocco;
-- - se erano già nello stesso evento, l'evento resta accessibile ma utenti,
--   messaggi e foto reciproci vengono nascosti.

create schema if not exists private;

create or replace function private.bajuju_users_block_each_other(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when p_user_a is null or p_user_b is null or p_user_a = p_user_b then false
    else exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
         or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
    )
  end;
$$;

revoke all on function private.bajuju_users_block_each_other(uuid, uuid) from public, anon, authenticated;

create or replace function public.bajuju_current_user_block_conflict(
  p_other_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when auth.uid() is null then false
    when public.is_current_user_admin() then false
    else private.bajuju_users_block_each_other(auth.uid(), p_other_user_id)
  end;
$$;

revoke all on function public.bajuju_current_user_block_conflict(uuid) from public, anon;
grant execute on function public.bajuju_current_user_block_conflict(uuid) to authenticated;

create or replace function public.bajuju_get_current_blocked_user_ids()
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select distinct x.user_id
  from (
    select b.blocked_id as user_id
    from public.user_blocks b
    where b.blocker_id = auth.uid()

    union all

    select b.blocker_id as user_id
    from public.user_blocks b
    where b.blocked_id = auth.uid()
  ) x
  where auth.uid() is not null
    and not public.is_current_user_admin()
    and x.user_id is not null
    and x.user_id <> auth.uid();
$$;

revoke all on function public.bajuju_get_current_blocked_user_ids() from public, anon;
grant execute on function public.bajuju_get_current_blocked_user_ids() to authenticated;

create or replace function private.bajuju_activity_has_block_conflict(
  p_activity_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when p_activity_id is null or p_user_id is null then false
    else
      exists (
        select 1
        from public.activities a
        where a.id = p_activity_id
          and a.creator_id is not null
          and a.creator_id <> p_user_id
          and private.bajuju_users_block_each_other(p_user_id, a.creator_id)
      )
      or exists (
        select 1
        from public.activity_participants ap
        where ap.activity_id = p_activity_id
          and ap.user_id is not null
          and ap.user_id <> p_user_id
          and coalesce(ap.status::text, '') not in (
            'annullato', 'annullata', 'cancelled', 'canceled',
            'rejected', 'rifiutato', 'declined', 'deleted', 'removed'
          )
          and private.bajuju_users_block_each_other(p_user_id, ap.user_id)
      )
  end;
$$;

revoke all on function private.bajuju_activity_has_block_conflict(uuid, uuid) from public, anon, authenticated;

create or replace function public.bajuju_activity_visible_to_current_user(
  p_activity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when auth.uid() is null then false
    when public.is_current_user_admin() then true
    when exists (
      select 1
      from public.activities a
      where a.id = p_activity_id
        and a.creator_id = auth.uid()
    ) then true
    when exists (
      select 1
      from public.activity_participants ap
      where ap.activity_id = p_activity_id
        and ap.user_id = auth.uid()
        and coalesce(ap.status::text, '') not in (
          'annullato', 'annullata', 'cancelled', 'canceled',
          'rejected', 'rifiutato', 'declined', 'deleted', 'removed'
        )
    ) then true
    else not private.bajuju_activity_has_block_conflict(p_activity_id, auth.uid())
  end;
$$;

revoke all on function public.bajuju_activity_visible_to_current_user(uuid) from public, anon;
grant execute on function public.bajuju_activity_visible_to_current_user(uuid) to authenticated;

-- Eventi: chi non è già dentro non vede un evento se tra organizzatore/partecipanti
-- c'è una persona bloccata in una delle due direzioni.
drop policy if exists "activities_select_authenticated_v85" on public.activities;
drop policy if exists "activities_select_block_aware_v86" on public.activities;

create policy "activities_select_block_aware_v86"
on public.activities
for select
to authenticated
using (
  public.is_current_user_admin()
  or public.bajuju_activity_visible_to_current_user(id)
);

-- Profili: invisibilità reciproca globale.
drop policy if exists "Profili visibili agli utenti autenticati" on public.profiles;
drop policy if exists "Profili visibili salvo blocco reciproco" on public.profiles;

create policy "Profili visibili salvo blocco reciproco"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_current_user_admin()
  or not public.bajuju_current_user_block_conflict(id)
);

-- Partecipanti: in un evento già condiviso i due utenti non si vedono nell'elenco.
drop policy if exists "Partecipanti visibili agli autenticati" on public.activity_participants;
drop policy if exists "Partecipanti visibili salvo blocco reciproco" on public.activity_participants;

create policy "Partecipanti visibili salvo blocco reciproco"
on public.activity_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_current_user_admin()
  or not public.bajuju_current_user_block_conflict(user_id)
);

-- Chat: se erano già nello stesso evento, i messaggi reciproci spariscono.
drop policy if exists "Messaggi visibili solo ai partecipanti" on public.activity_messages;
drop policy if exists "Messaggi visibili ai partecipanti salvo blocco reciproco" on public.activity_messages;

create policy "Messaggi visibili ai partecipanti salvo blocco reciproco"
on public.activity_messages
for select
to authenticated
using (
  (
    public.is_activity_participant(activity_id, auth.uid())
    or exists (
      select 1
      from public.activities a
      where a.id = activity_messages.activity_id
        and a.creator_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  )
  and (
    sender_id = auth.uid()
    or public.is_current_user_admin()
    or not public.bajuju_current_user_block_conflict(sender_id)
  )
);

-- Album: le foto caricate dall'utente bloccato non vengono mostrate.
drop policy if exists "event_album_photos_select_authenticated" on public.event_album_photos;
drop policy if exists "event_album_photos_select_block_aware" on public.event_album_photos;

create policy "event_album_photos_select_block_aware"
on public.event_album_photos
for select
to authenticated
using (
  coalesce(user_id, profile_id) = auth.uid()
  or public.is_current_user_admin()
  or not public.bajuju_current_user_block_conflict(coalesce(user_id, profile_id))
);

-- Impedisce qualunque nuova convivenza nello stesso evento dopo il blocco,
-- anche se qualcuno prova a inserire/riattivare la partecipazione senza passare dalla UI.
create or replace function public.guard_participant_block_conflict()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.user_id is null or new.activity_id is null then
    return new;
  end if;

  if coalesce(new.status::text, '') in (
    'annullato', 'annullata', 'cancelled', 'canceled',
    'rejected', 'rifiutato', 'declined', 'deleted', 'removed'
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.activity_id is not distinct from new.activity_id
     and old.user_id is not distinct from new.user_id then
    return new;
  end if;

  if private.bajuju_activity_has_block_conflict(new.activity_id, new.user_id) then
    raise exception using errcode = 'P0001', message = 'BAJUJU_BLOCKED';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_participant_block_conflict_trg on public.activity_participants;
create trigger guard_participant_block_conflict_trg
before insert or update of status, activity_id, user_id
on public.activity_participants
for each row
execute function public.guard_participant_block_conflict();

-- RPC standard: restituisce BLOCKED in modo pulito prima dell'insert/update.
create or replace function public.join_standard_activity(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  uid uuid := auth.uid();
  a public.activities%rowtype;
  active_count integer;
  active_reservations integer;
  my_reservation boolean;
  existing_participant_id uuid;
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
$$;

create or replace function public.join_activity_waitlist(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  uid uuid := auth.uid();
  a public.activities%rowtype;
  active_count integer;
  wait_id uuid;
  queue_position integer;
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
$$;


create or replace function public.bajuju_get_users_blocked_by_me()
returns table(
  user_id uuid,
  nickname text,
  avatar_url text,
  city text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    p.id as user_id,
    coalesce(nullif(trim(p.nickname), ''), 'Utente Bajuju')::text as nickname,
    nullif(trim(p.avatar_url), '')::text as avatar_url,
    nullif(trim(p.city), '')::text as city
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc nulls last, p.nickname asc;
$$;

revoke all on function public.bajuju_get_users_blocked_by_me() from public, anon;
grant execute on function public.bajuju_get_users_blocked_by_me() to authenticated;
