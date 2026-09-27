-- Enforce current precise-age rules for users who are waiting but not yet participants.

CREATE OR REPLACE FUNCTION public.process_activity_waitlist(p_activity_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select * into a
  from public.activities
  where id = p_activity_id
  for update;

  if not found
     or coalesce(a.is_flash, false) = true
     or a.deleted_at is not null
     or a.status in ('annullata','eliminata','bloccata','archiviata')
     or ((a.activity_date + a.activity_time) at time zone 'Europe/Rome') <= now()
     or coalesce(a.max_participants, 0) <= 0 then
    return 0;
  end if;

  update public.activity_waitlist
  set status = 'expired', updated_at = now()
  where activity_id = p_activity_id
    and status = 'notified'
    and reserved_until <= now();

  -- La lista d'attesa non equivale a essere già partecipante:
  -- se l'età manca o non rientra più nella fascia corrente, la prenotazione decade.
  update public.activity_waitlist w
  set status = 'cancelled',
      reserved_until = null,
      updated_at = now()
  where w.activity_id = p_activity_id
    and w.status in ('waiting','notified')
    and exists (
      select 1
      from public.profiles p
      where p.id = w.user_id
        and (
          p.age is null
          or p.age < 18
          or p.age > 80
          or (a.min_age is not null and p.age < a.min_age)
          or (a.max_age is not null and p.age > a.max_age)
        )
    );

  select
    (case when a.creator_id is not null then 1 else 0 end)
    + count(*)::integer
  into active_count
  from public.activity_participants ap
  where ap.activity_id = p_activity_id
    and ap.status is distinct from 'annullato'
    and ap.user_id is distinct from a.creator_id;

  available_slots := greatest(coalesce(a.max_participants, 0) - active_count, 0);

  select count(*)::integer
  into active_reservations
  from public.activity_waitlist w
  where w.activity_id = p_activity_id
    and w.status = 'notified'
    and w.reserved_until > now();

  slots_to_notify := greatest(available_slots - active_reservations, 0);
  if slots_to_notify <= 0 then
    return 0;
  end if;

  for candidate in
    select w.id, w.user_id
    from public.activity_waitlist w
    join public.profiles p on p.id = w.user_id
    where w.activity_id = p_activity_id
      and w.status = 'waiting'
      and p.age between 18 and 80
      and (a.min_age is null or p.age >= a.min_age)
      and (a.max_age is null or p.age <= a.max_age)
    order by w.created_at asc, w.id asc
    limit slots_to_notify
    for update of w skip locked
  loop
    update public.activity_waitlist
    set status = 'notified',
        notified_at = now(),
        reserved_until = now() + interval '30 minutes',
        updated_at = now()
    where id = candidate.id;

    reminder_title := 'Si è liberato un posto';
    reminder_body := coalesce(a.title, 'Esperienza Bajuju') || ': hai 30 minuti di priorità per partecipare.';

    insert into public.push_notification_logs (
      user_id, notification_type, type, title, body, data,
      status, success, is_read, sent_at
    ) values (
      candidate.user_id,
      'waitlist_spot_available',
      'waitlist_spot_available',
      reminder_title,
      reminder_body,
      jsonb_build_object(
        'screen','experience',
        'activityId',p_activity_id::text,
        'waitlistId',candidate.id::text
      ),
      'queued', null, false, now()
    );

    if exists (
      select 1 from public.notification_preferences np
      where np.user_id = candidate.user_id and np.enabled = true
    ) then
      for token_row in
        select pt.expo_push_token
        from public.push_tokens pt
        where pt.user_id = candidate.user_id
          and pt.is_active = true
          and (pt.expo_push_token like 'ExponentPushToken[%'
            or pt.expo_push_token like 'ExpoPushToken[%')
      loop
        perform net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object(
            'to', token_row.expo_push_token,
            'sound','default',
            'title',reminder_title,
            'body',reminder_body,
            'channelId','bajuju-important',
            'priority','high',
            'data',jsonb_build_object(
              'type','waitlist_spot_available',
              'screen','experience',
              'activityId',p_activity_id::text
            )
          ),
          params := '{}'::jsonb,
          headers := jsonb_build_object('Accept','application/json','Content-Type','application/json'),
          timeout_milliseconds := 5000
        );
      end loop;
    end if;

    promoted_count := promoted_count + 1;
  end loop;

  return promoted_count;
end;
$function$;

revoke all on function public.process_activity_waitlist(uuid) from public, anon;
grant execute on function public.process_activity_waitlist(uuid) to authenticated, service_role;
