-- Notifiche push server-side per le chat di Esperienze e Flash.
-- La push parte dal database dopo l'inserimento del messaggio, quindi non dipende
-- dalla versione dell'app del mittente.

update public.notification_preferences
set notify_chat_messages = true,
    updated_at = now()
where enabled = true
  and notify_chat_messages is distinct from true;

create or replace function public.send_bajuju_chat_push_after_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity_title text;
  v_creator_id uuid;
  v_is_flash boolean;
  v_sender_name text := 'Un partecipante';
  v_title text;
  v_body text;
  v_screen text;
  v_recipient_ids uuid[];
  v_token_user_ids uuid[];
  v_messages jsonb;
begin
  select a.title, a.creator_id, a.is_flash
    into v_activity_title, v_creator_id, v_is_flash
  from public.activities a
  where a.id = new.activity_id
    and a.deleted_at is null;

  if not found then
    return new;
  end if;

  -- Invia solo per messaggi scritti da organizzatore o partecipante attivo.
  if new.sender_id <> v_creator_id
     and not exists (
       select 1
       from public.activity_participants ap
       where ap.activity_id = new.activity_id
         and ap.user_id = new.sender_id
         and ap.status::text <> 'annullato'
     ) then
    return new;
  end if;

  select coalesce(nullif(trim(p.nickname), ''), 'Un partecipante')
    into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  v_sender_name := coalesce(v_sender_name, 'Un partecipante');
  v_title := case when v_is_flash then 'Nuovo messaggio Flash' else 'Nuovo messaggio Bajuju' end;
  v_body := v_sender_name || ' ha scritto nella chat di “' || left(coalesce(v_activity_title, 'Bajuju'), 80) || '”.';
  v_screen := case when v_is_flash then 'flash-detail' else 'experience' end;

  with recipients as (
    select v_creator_id as user_id
    union
    select ap.user_id
    from public.activity_participants ap
    where ap.activity_id = new.activity_id
      and ap.status::text <> 'annullato'
  )
  select array_agg(distinct r.user_id)
    into v_recipient_ids
  from recipients r
  join public.notification_preferences np
    on np.user_id = r.user_id
   and np.enabled is true
   and np.notify_chat_messages is true
  where r.user_id is not null
    and r.user_id <> new.sender_id
    and not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = new.sender_id and ub.blocked_id = r.user_id)
         or (ub.blocker_id = r.user_id and ub.blocked_id = new.sender_id)
    );

  if coalesce(array_length(v_recipient_ids, 1), 0) = 0 then
    return new;
  end if;

  select
    array_agg(distinct pt.user_id),
    jsonb_agg(
      jsonb_build_object(
        'to', pt.expo_push_token,
        'sound', 'default',
        'title', v_title,
        'body', v_body,
        'channelId', 'bajuju-important',
        'priority', 'high',
        'data', jsonb_build_object(
          'type', 'chat_message',
          'screen', v_screen,
          'activityId', new.activity_id::text
        )
      )
    )
    into v_token_user_ids, v_messages
  from public.push_tokens pt
  where pt.user_id = any(v_recipient_ids)
    and pt.is_active is true
    and (
      pt.expo_push_token like 'ExponentPushToken[%]'
      or pt.expo_push_token like 'ExpoPushToken[%]'
    );

  if v_messages is null or jsonb_array_length(v_messages) = 0 then
    return new;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Accept":"application/json","Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  insert into public.push_notification_logs (
    user_id,
    notification_type,
    type,
    title,
    body,
    data,
    status,
    success,
    error
  )
  select
    u.user_id,
    'chat_message',
    'chat_message',
    v_title,
    v_body,
    jsonb_build_object(
      'type', 'chat_message',
      'screen', v_screen,
      'activityId', new.activity_id::text
    ),
    'queued',
    null,
    null
  from unnest(v_token_user_ids) as u(user_id);

  return new;
end;
$$;

revoke all on function public.send_bajuju_chat_push_after_message() from public;
revoke all on function public.send_bajuju_chat_push_after_message() from anon;
revoke all on function public.send_bajuju_chat_push_after_message() from authenticated;

drop trigger if exists send_bajuju_chat_push_after_message_trigger on public.activity_messages;

create trigger send_bajuju_chat_push_after_message_trigger
after insert on public.activity_messages
for each row
execute function public.send_bajuju_chat_push_after_message();
