create unique index if not exists push_notification_logs_experience_reminder_unique_idx
on public.push_notification_logs (
  user_id,
  notification_type,
  (data->>'activityId'),
  (data->>'reminderKind')
)
where notification_type = 'experience_reminder';

create or replace function public.process_experience_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  token_row record;
  inserted_id uuid;
  reminder_title text;
  reminder_body text;
  queued_count integer := 0;
begin
  for candidate in
    with upcoming as (
      select
        a.id,
        a.creator_id,
        a.title,
        a.city,
        a.activity_time,
        ((a.activity_date + a.activity_time) at time zone 'Europe/Rome') as starts_at,
        case
          when ((a.activity_date + a.activity_time) at time zone 'Europe/Rome')
               between now() + interval '23 hours 40 minutes' and now() + interval '24 hours 20 minutes'
            then '24h'
          when ((a.activity_date + a.activity_time) at time zone 'Europe/Rome')
               between now() + interval '1 hour 40 minutes' and now() + interval '2 hours 20 minutes'
            then '2h'
          else null
        end as reminder_kind
      from public.activities a
      where coalesce(a.is_flash, false) = false
        and a.deleted_at is null
        and a.status not in ('annullata', 'eliminata', 'bloccata', 'archiviata')
        and ((a.activity_date + a.activity_time) at time zone 'Europe/Rome') > now()
        and ((a.activity_date + a.activity_time) at time zone 'Europe/Rome') <= now() + interval '24 hours 20 minutes'
    ), recipients as (
      select u.id as activity_id, u.creator_id as user_id, u.title, u.city, u.activity_time, u.starts_at, u.reminder_kind
      from upcoming u
      where u.reminder_kind is not null
      union
      select u.id, ap.user_id, u.title, u.city, u.activity_time, u.starts_at, u.reminder_kind
      from upcoming u
      join public.activity_participants ap on ap.activity_id = u.id
      where u.reminder_kind is not null
        and ap.status <> 'annullato'
    )
    select distinct r.*
    from recipients r
    join public.notification_preferences np on np.user_id = r.user_id
    where np.enabled = true
      and np.notify_experience_reminder = true
  loop
    reminder_title := case candidate.reminder_kind
      when '24h' then 'Domani hai un’esperienza Bajuju'
      else 'Tra 2 ore inizia la tua esperienza'
    end;

    reminder_body := candidate.title
      || case when nullif(trim(candidate.city), '') is not null then ' · ' || trim(candidate.city) else '' end
      || ' · ' || to_char(candidate.starts_at at time zone 'Europe/Rome', 'HH24:MI');

    inserted_id := null;

    insert into public.push_notification_logs (
      user_id,
      notification_type,
      type,
      title,
      body,
      data,
      status,
      success,
      is_read,
      sent_at
    )
    values (
      candidate.user_id,
      'experience_reminder',
      'experience_reminder',
      reminder_title,
      reminder_body,
      jsonb_build_object(
        'screen', 'experience',
        'activityId', candidate.activity_id::text,
        'reminderKind', candidate.reminder_kind
      ),
      'queued',
      null,
      false,
      now()
    )
    on conflict do nothing
    returning id into inserted_id;

    if inserted_id is null then
      continue;
    end if;

    queued_count := queued_count + 1;

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
          'sound', 'default',
          'title', reminder_title,
          'body', reminder_body,
          'channelId', 'bajuju-important',
          'priority', 'high',
          'data', jsonb_build_object(
            'type', 'experience_reminder',
            'screen', 'experience',
            'activityId', candidate.activity_id::text,
            'reminderKind', candidate.reminder_kind
          )
        ),
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Accept', 'application/json',
          'Content-Type', 'application/json'
        ),
        timeout_milliseconds := 5000
      );
    end loop;
  end loop;

  return queued_count;
end;
$$;

revoke execute on function public.process_experience_reminders() from public, anon, authenticated;
grant execute on function public.process_experience_reminders() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'bajuju-experience-reminders'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'bajuju-experience-reminders',
    '*/15 * * * *',
    'select public.process_experience_reminders();'
  );
end
$$;
