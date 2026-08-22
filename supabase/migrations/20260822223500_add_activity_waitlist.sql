create table if not exists public.activity_waitlist (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','notified','joined','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  reserved_until timestamptz
);

create unique index if not exists activity_waitlist_one_active_per_user_idx
  on public.activity_waitlist(activity_id, user_id)
  where status in ('waiting','notified');

create index if not exists activity_waitlist_queue_idx
  on public.activity_waitlist(activity_id, status, created_at);

alter table public.activity_waitlist enable row level security;
revoke all on table public.activity_waitlist from anon;
revoke insert, update, delete on table public.activity_waitlist from authenticated;
grant select on table public.activity_waitlist to authenticated;
grant all on table public.activity_waitlist to service_role;

drop policy if exists activity_waitlist_select_own on public.activity_waitlist;
create policy activity_waitlist_select_own on public.activity_waitlist
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.process_activity_waitlist(p_activity_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  a public.activities%rowtype;
  active_count integer;
  available_slots integer;
  active_reservations integer;
  slots_to_notify integer;
  candidate record;
  token_row record;
  reminder_title text;
  reminder_body text;
  promoted_count integer := 0;
begin
  select * into a from public.activities where id = p_activity_id for update;
  if not found or coalesce(a.is_flash,false)=true or a.deleted_at is not null
     or a.status in ('annullata','eliminata','bloccata','archiviata')
     or ((a.activity_date+a.activity_time) at time zone 'Europe/Rome') <= now()
     or coalesce(a.max_participants,0)<=0 then return 0; end if;

  update public.activity_waitlist set status='expired', updated_at=now()
  where activity_id=p_activity_id and status='notified' and reserved_until<=now();

  select (case when a.creator_id is not null then 1 else 0 end)+count(*)::integer
  into active_count
  from public.activity_participants ap
  where ap.activity_id=p_activity_id
    and ap.status is distinct from 'annullato'
    and ap.user_id is distinct from a.creator_id;

  available_slots := greatest(coalesce(a.max_participants,0)-active_count,0);

  select count(*)::integer into active_reservations
  from public.activity_waitlist w
  where w.activity_id=p_activity_id and w.status='notified' and w.reserved_until>now();

  slots_to_notify := greatest(available_slots-active_reservations,0);
  if slots_to_notify<=0 then return 0; end if;

  for candidate in
    select w.id,w.user_id from public.activity_waitlist w
    where w.activity_id=p_activity_id and w.status='waiting'
    order by w.created_at asc,w.id asc
    limit slots_to_notify for update skip locked
  loop
    update public.activity_waitlist
    set status='notified',notified_at=now(),reserved_until=now()+interval '30 minutes',updated_at=now()
    where id=candidate.id;

    reminder_title := 'Si è liberato un posto';
    reminder_body := coalesce(a.title,'Esperienza Bajuju') || ': hai 30 minuti di priorità per partecipare.';

    insert into public.push_notification_logs(user_id,notification_type,type,title,body,data,status,success,is_read,sent_at)
    values(candidate.user_id,'waitlist_spot_available','waitlist_spot_available',reminder_title,reminder_body,
      jsonb_build_object('screen','experience','activityId',p_activity_id::text,'waitlistId',candidate.id::text),
      'queued',null,false,now());

    if exists(select 1 from public.notification_preferences np where np.user_id=candidate.user_id and np.enabled=true) then
      for token_row in select pt.expo_push_token from public.push_tokens pt
        where pt.user_id=candidate.user_id and pt.is_active=true
          and (pt.expo_push_token like 'ExponentPushToken[%' or pt.expo_push_token like 'ExpoPushToken[%')
      loop
        perform net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object('to',token_row.expo_push_token,'sound','default','title',reminder_title,'body',reminder_body,
            'channelId','bajuju-important','priority','high',
            'data',jsonb_build_object('type','waitlist_spot_available','screen','experience','activityId',p_activity_id::text)),
          params := '{}'::jsonb,
          headers := jsonb_build_object('Accept','application/json','Content-Type','application/json'),
          timeout_milliseconds := 5000
        );
      end loop;
    end if;
    promoted_count := promoted_count+1;
  end loop;
  return promoted_count;
end;
$$;
revoke execute on function public.process_activity_waitlist(uuid) from public,anon,authenticated;
grant execute on function public.process_activity_waitlist(uuid) to service_role;

create or replace function public.join_activity_waitlist(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); a public.activities%rowtype; active_count integer; wait_id uuid; queue_position integer;
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
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

create or replace function public.leave_activity_waitlist(p_activity_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
  update public.activity_waitlist set status='cancelled',reserved_until=null,updated_at=now()
  where activity_id=p_activity_id and user_id=uid and status in ('waiting','notified');
  return found;
end;
$$;
revoke execute on function public.leave_activity_waitlist(uuid) from public,anon;
grant execute on function public.leave_activity_waitlist(uuid) to authenticated,service_role;

create or replace function public.get_my_activity_waitlist(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); w public.activity_waitlist%rowtype; queue_position integer;
begin
  if uid is null then return null; end if;
  select * into w from public.activity_waitlist where activity_id=p_activity_id and user_id=uid and status in ('waiting','notified') order by created_at desc limit 1;
  if not found then return null; end if;
  if w.status='notified' and w.reserved_until<=now() then update public.activity_waitlist set status='expired',updated_at=now() where id=w.id; return null; end if;
  select count(*)::integer+1 into queue_position from public.activity_waitlist q
  where q.activity_id=p_activity_id and q.status in ('waiting','notified') and q.created_at<w.created_at;
  return jsonb_build_object('id',w.id,'status',w.status,'position',queue_position,'reservedUntil',w.reserved_until);
end;
$$;
revoke execute on function public.get_my_activity_waitlist(uuid) from public,anon;
grant execute on function public.get_my_activity_waitlist(uuid) to authenticated,service_role;

create or replace function public.join_standard_activity(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); a public.activities%rowtype; active_count integer; active_reservations integer; my_reservation boolean; existing_participant_id uuid;
begin
  if uid is null then raise exception 'Utente non autenticato.'; end if;
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

create or replace function public.activity_waitlist_participant_change_trigger()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op='DELETE' then perform public.process_activity_waitlist(old.activity_id); return old; end if;
  if tg_op='UPDATE' and old.status is distinct from 'annullato' and new.status='annullato' then perform public.process_activity_waitlist(new.activity_id); end if;
  return new;
end;
$$;
revoke execute on function public.activity_waitlist_participant_change_trigger() from public,anon,authenticated;
drop trigger if exists activity_waitlist_on_participant_change on public.activity_participants;
create trigger activity_waitlist_on_participant_change after delete or update of status on public.activity_participants
for each row execute function public.activity_waitlist_participant_change_trigger();

create or replace function public.process_all_activity_waitlists()
returns integer language plpgsql security definer set search_path=public
as $$
declare r record; total integer:=0;
begin
  for r in select distinct activity_id from public.activity_waitlist where status in ('waiting','notified') loop
    total:=total+public.process_activity_waitlist(r.activity_id);
  end loop;
  return total;
end;
$$;
revoke execute on function public.process_all_activity_waitlists() from public,anon,authenticated;
grant execute on function public.process_all_activity_waitlists() to service_role;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname='bajuju-activity-waitlists' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('bajuju-activity-waitlists','*/5 * * * *','select public.process_all_activity_waitlists();');
end
$$;
