-- join_standard_activity e join_activity_waitlist sono SECURITY DEFINER e quindi scavalcano la policy
-- "Utenti non bloccati possono partecipare": un utente bannato poteva iscriversi chiamando la RPC.
-- Le funzioni restano identiche a 20260822221058_add_activity_waitlist.sql, con in più il controllo
-- public.is_user_blocked(uid). Il motivo 'BLOCKED' è già gestito dall'app.

create or replace function public.join_activity_waitlist(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); a public.activities%rowtype; active_count integer; wait_id uuid; queue_position integer;
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
  if public.is_user_blocked(uid) then return jsonb_build_object('ok',false,'reason','BLOCKED'); end if;
  select * into a from public.activities where id=p_activity_id for update;
  if not found then raise exception 'Esperienza non trovata.'; end if;
  if coalesce(a.is_flash,false) then raise exception 'Lista d’attesa non disponibile per Flash.'; end if;
  if a.creator_id=uid then raise exception 'L’organizzatore non può entrare in lista d’attesa.'; end if;
  if a.deleted_at is not null or a.status in ('annullata','eliminata','bloccata','archiviata') then raise exception 'Esperienza non disponibile.'; end if;
  if exists(select 1 from public.activity_participants ap where ap.activity_id=p_activity_id and ap.user_id=uid and ap.status is distinct from 'annullato') then
    return jsonb_build_object('ok',false,'reason','ALREADY_JOINED'); end if;
  select (case when a.creator_id is not null then 1 else 0 end)+count(*)::integer into active_count
  from public.activity_participants ap where ap.activity_id=p_activity_id and ap.status is distinct from 'annullato' and ap.user_id is distinct from a.creator_id;
  if coalesce(a.max_participants,0)<=0 or active_count<a.max_participants then return jsonb_build_object('ok',false,'reason','EVENT_NOT_FULL'); end if;
  select w.id into wait_id from public.activity_waitlist w
  where w.activity_id=p_activity_id and w.user_id=uid and w.status in ('waiting','notified') order by w.created_at desc limit 1;
  if wait_id is null then insert into public.activity_waitlist(activity_id,user_id,status) values(p_activity_id,uid,'waiting') returning id into wait_id; end if;
  select count(*)::integer+1 into queue_position from public.activity_waitlist w
  where w.activity_id=p_activity_id and w.status in ('waiting','notified')
    and w.created_at<(select created_at from public.activity_waitlist where id=wait_id);
  return jsonb_build_object('ok',true,'status','waiting','position',queue_position);
end;
$$;
revoke execute on function public.join_activity_waitlist(uuid) from public,anon;
grant execute on function public.join_activity_waitlist(uuid) to authenticated,service_role;

create or replace function public.join_standard_activity(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); a public.activities%rowtype; active_count integer; active_reservations integer; my_reservation boolean; existing_participant_id uuid;
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
  if public.is_user_blocked(uid) then return jsonb_build_object('ok',false,'reason','BLOCKED'); end if;
  select * into a from public.activities where id=p_activity_id for update;
  if not found then raise exception 'Esperienza non trovata.'; end if;
  if coalesce(a.is_flash,false) then raise exception 'Funzione non valida per Flash.'; end if;
  if a.creator_id=uid then return jsonb_build_object('ok',false,'reason','ORGANIZER'); end if;
  if a.deleted_at is not null or a.status in ('annullata','eliminata','bloccata','archiviata') then return jsonb_build_object('ok',false,'reason','UNAVAILABLE'); end if;
  if ((a.activity_date+a.activity_time) at time zone 'Europe/Rome')<=now() then return jsonb_build_object('ok',false,'reason','PAST'); end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=a.creator_id and b.blocked_id=uid) or (b.blocker_id=uid and b.blocked_id=a.creator_id)) then
    return jsonb_build_object('ok',false,'reason','BLOCKED'); end if;
  select ap.id into existing_participant_id from public.activity_participants ap where ap.activity_id=p_activity_id and ap.user_id=uid limit 1;
  if existing_participant_id is not null and exists(select 1 from public.activity_participants ap where ap.id=existing_participant_id and ap.status is distinct from 'annullato') then
    return jsonb_build_object('ok',true,'status','already_joined'); end if;
  perform public.process_activity_waitlist(p_activity_id);
  select (case when a.creator_id is not null then 1 else 0 end)+count(*)::integer into active_count
  from public.activity_participants ap where ap.activity_id=p_activity_id and ap.status is distinct from 'annullato' and ap.user_id is distinct from a.creator_id;
  if coalesce(a.max_participants,0)>0 and active_count>=a.max_participants then return jsonb_build_object('ok',false,'reason','FULL'); end if;
  select exists(select 1 from public.activity_waitlist w where w.activity_id=p_activity_id and w.user_id=uid and w.status='notified' and w.reserved_until>now()) into my_reservation;
  select count(*)::integer into active_reservations from public.activity_waitlist w where w.activity_id=p_activity_id and w.status='notified' and w.reserved_until>now();
  if not my_reservation and coalesce(a.max_participants,0)>0 and active_reservations>=greatest(a.max_participants-active_count,0) then
    return jsonb_build_object('ok',false,'reason','RESERVED'); end if;
  if existing_participant_id is not null then update public.activity_participants set status='partecipo' where id=existing_participant_id;
  else insert into public.activity_participants(activity_id,user_id,status) values(p_activity_id,uid,'partecipo'); end if;
  update public.activity_waitlist set status='joined',reserved_until=null,updated_at=now() where activity_id=p_activity_id and user_id=uid and status in ('waiting','notified');
  return jsonb_build_object('ok',true,'status','joined');
end;
$$;
revoke execute on function public.join_standard_activity(uuid) from public,anon;
grant execute on function public.join_standard_activity(uuid) to authenticated,service_role;
