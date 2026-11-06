-- Blacklist personale: ogni utente si segna le persone che non vuole tra i piedi.
-- La vede solo chi la crea. Chi è in blacklist non viene bloccato: per entrare in un evento
-- o in un gruppo di chi l'ha messo in blacklist deve sempre chiedere il permesso
-- (anche se l'ingresso è libero), e il proprietario riceve "Un utente in blacklist ha chiesto...".

create table if not exists public.user_blacklist (
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  constraint user_blacklist_not_self check (owner_id <> target_id)
);

alter table public.user_blacklist enable row level security;

drop policy if exists user_blacklist_select_own on public.user_blacklist;
create policy user_blacklist_select_own on public.user_blacklist
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists user_blacklist_insert_own on public.user_blacklist;
create policy user_blacklist_insert_own on public.user_blacklist
  for insert to authenticated with check (owner_id = (select auth.uid()) and target_id <> (select auth.uid()));

drop policy if exists user_blacklist_delete_own on public.user_blacklist;
create policy user_blacklist_delete_own on public.user_blacklist
  for delete to authenticated using (owner_id = (select auth.uid()));

grant select, insert, delete on public.user_blacklist to authenticated;

create or replace function private.bajuju_is_blacklisted(p_owner_id uuid, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
  select p_owner_id is not null and p_target_id is not null and exists (
    select 1 from public.user_blacklist b
    where b.owner_id = p_owner_id and b.target_id = p_target_id
  );
$$;

revoke all on function private.bajuju_is_blacklisted(uuid, uuid) from public, anon, authenticated;

-- Notifica (interna + push) al proprietario della blacklist.
create or replace function private.bajuju_notify_blacklist_request(
  p_owner_id uuid, p_type text, p_body text, p_data jsonb
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_title constant text := 'Utente in blacklist';
  token_row record;
begin
  begin
    insert into public.push_notification_logs (
      user_id, notification_type, type, title, body, data, status, success, is_read, sent_at
    ) values (
      p_owner_id, p_type, p_type, v_title, p_body, p_data, 'in_app', null, false, now()
    );

    if exists (
      select 1 from public.notification_preferences np
      where np.user_id = p_owner_id and np.enabled = true
    ) then
      for token_row in
        select pt.expo_push_token
        from public.push_tokens pt
        where pt.user_id = p_owner_id
          and pt.is_active = true
          and (pt.expo_push_token like 'ExponentPushToken[%' or pt.expo_push_token like 'ExpoPushToken[%')
      loop
        perform net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          body := jsonb_build_object(
            'to', token_row.expo_push_token,
            'sound', 'default',
            'title', v_title,
            'body', p_body,
            'channelId', 'bajuju-important',
            'priority', 'high',
            'data', jsonb_build_object('type', p_type) || p_data
          ),
          params := '{}'::jsonb,
          headers := jsonb_build_object('Accept', 'application/json', 'Content-Type', 'application/json'),
          timeout_milliseconds := 5000
        );
      end loop;
    end if;
  exception when others then
    raise warning 'Bajuju: notifica blacklist non inviata (SQLSTATE %)', SQLSTATE;
  end;
end;
$$;

revoke all on function private.bajuju_notify_blacklist_request(uuid, text, text, jsonb) from public, anon, authenticated;

-- Chi è in blacklist dell'organizzatore: richiesta in attesa al posto dell'iscrizione diretta.
create or replace function private.bajuju_blacklist_activity_request(p_activity_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_creator_id uuid;
  v_title text;
  v_was_pending boolean;
  v_requested_at timestamptz;
begin
  select a.creator_id, coalesce(nullif(btrim(a.title), ''), 'questa esperienza')
    into v_creator_id, v_title
  from public.activities a
  where a.id = p_activity_id;

  select (r.status = 'pending') into v_was_pending
  from public.activity_join_requests r
  where r.activity_id = p_activity_id and r.user_id = p_user_id;

  insert into public.activity_join_requests (activity_id, user_id, status, requested_at, responded_at, responded_by)
  values (p_activity_id, p_user_id, 'pending', now(), null, null)
  on conflict (activity_id, user_id) do update
    set status = 'pending',
        requested_at = case
          when public.activity_join_requests.status = 'pending' then public.activity_join_requests.requested_at
          else now()
        end,
        responded_at = null,
        responded_by = null
  returning requested_at into v_requested_at;

  -- Il posto eventualmente riservato dalla lista d'attesa torna libero per gli altri.
  update public.activity_waitlist
    set status = 'cancelled', reserved_until = null, updated_at = now()
  where activity_id = p_activity_id and user_id = p_user_id and status in ('waiting', 'notified');

  if coalesce(v_was_pending, false) = false then
    -- Stessi dati della notifica normale: così la funzione send-bajuju-push non ne manda una doppia.
    perform private.bajuju_notify_blacklist_request(
      v_creator_id,
      'experience_join_request',
      'Un utente in blacklist ha chiesto di partecipare a “' || left(v_title, 60) || '”.',
      jsonb_build_object(
        'screen', 'experience',
        'activityId', p_activity_id::text,
        'section', 'requests',
        'requestUserId', p_user_id::text,
        'requestedAt', to_jsonb(v_requested_at) #>> '{}'
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'status', 'pending', 'notified', true);
end;
$$;

revoke all on function private.bajuju_blacklist_activity_request(uuid, uuid) from public, anon, authenticated;

-- Le funzioni di iscrizione esistenti vengono aggiornate inserendo il controllo blacklist
-- nel punto giusto (stesso codice di prima, più una riga). Se il testo atteso non c'è, si ferma tutto.
do $migration$
declare
  v_def text;
  v_new text;
begin
  -- Eventi: richiesta di partecipazione (anche con ingresso libero).
  v_def := pg_get_functiondef('public.request_activity_join(uuid)'::regprocedure);
  if position('bajuju_is_blacklisted' in v_def) = 0 then
    v_new := replace(v_def,
      E'  if coalesce(v_activity.join_approval_required, false) = false then',
      E'  if private.bajuju_is_blacklisted(v_activity.creator_id, v_user_id) then\n    return private.bajuju_blacklist_activity_request(p_activity_id, v_user_id);\n  end if;\n\n  if coalesce(v_activity.join_approval_required, false) = false then');
    if v_new = v_def then raise exception 'request_activity_join: punto di inserimento non trovato'; end if;
    execute v_new;
  end if;

  -- Eventi: iscrizione diretta (anche dalla lista d'attesa).
  v_def := pg_get_functiondef('public.join_standard_activity(uuid)'::regprocedure);
  if position('bajuju_is_blacklisted' in v_def) = 0 then
    v_new := replace(v_def,
      E'  perform public.process_activity_waitlist(p_activity_id);',
      E'  if private.bajuju_is_blacklisted(a.creator_id, uid) then\n    return private.bajuju_blacklist_activity_request(p_activity_id, uid);\n  end if;\n\n  perform public.process_activity_waitlist(p_activity_id);');
    if v_new = v_def then raise exception 'join_standard_activity: punto di inserimento non trovato'; end if;
    execute v_new;
  end if;

  -- Gruppi: chi è in blacklist del proprietario va sempre in richiesta.
  v_def := pg_get_functiondef('public.request_group_join(uuid)'::regprocedure);
  if position('bajuju_is_blacklisted' in v_def) = 0 then
    v_new := replace(v_def,
      E'  if v_requires_approval then',
      E'  if v_requires_approval or private.bajuju_is_blacklisted(v_owner_id, v_user_id) then');
    if v_new = v_def then raise exception 'request_group_join: punto di inserimento non trovato'; end if;
    execute v_new;
  end if;
end
$migration$;

-- Notifica richieste gruppo: per il proprietario che ha in blacklist chi chiede
-- arriva "Un utente in blacklist ha chiesto di iscriversi a ..." (anche con ingresso libero).
create or replace function private.bajuju_notify_owner_on_group_join_request()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_owner_id uuid;
  v_group_name text;
  v_requires_approval boolean;
  v_blacklisted boolean;
  v_requester_name text;
  v_recipient uuid;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'pending' then
      return new;
    end if;
  end if;

  select g.owner_id, g.name, coalesce(g.join_approval_required, false)
    into v_owner_id, v_group_name, v_requires_approval
  from public.groups g
  where g.id = new.group_id
    and g.status = 'active';

  if v_owner_id is null then
    return new;
  end if;

  v_blacklisted := private.bajuju_is_blacklisted(v_owner_id, new.user_id);

  if v_blacklisted then
    perform private.bajuju_notify_blacklist_request(
      v_owner_id,
      'group_join_request',
      'Un utente in blacklist ha chiesto di iscriversi a “' || left(v_group_name, 60) || '”.',
      jsonb_build_object(
        'type', 'group_join_request',
        'screen', 'group-detail',
        'groupId', new.group_id::text,
        'section', 'requests',
        'requestUserId', new.user_id::text
      )
    );
  end if;

  if not v_requires_approval and not v_blacklisted then
    return new;
  end if;

  select coalesce(nullif(btrim(p.nickname), ''), 'Un utente Bajuju')
    into v_requester_name
  from public.profiles p
  where p.id = new.user_id;

  v_requester_name := coalesce(v_requester_name, 'Un utente Bajuju');

  for v_recipient in
    select v_owner_id
    union
    select gm.user_id from public.group_members gm
     where gm.group_id = new.group_id and gm.role = 'admin'
  loop
    if v_recipient = new.user_id then
      continue;
    end if;

    -- Il proprietario ha già ricevuto l'avviso blacklist.
    if v_blacklisted and v_recipient = v_owner_id then
      continue;
    end if;

    begin
      insert into public.push_notification_logs (
        user_id, notification_type, type, title, body, data, status, success, is_read
      )
      values (
        v_recipient,
        'group_join_request',
        'group_join_request',
        'Nuova richiesta per il tuo gruppo',
        left(v_requester_name, 80) || ' vuole entrare in "' || left(v_group_name, 60) || '".',
        jsonb_build_object(
          'type', 'group_join_request',
          'screen', 'group-detail',
          'groupId', new.group_id::text,
          'section', 'requests',
          'requestUserId', new.user_id::text
        ),
        'in_app',
        null,
        false
      );
    exception when others then
      raise warning 'Bajuju: notifica nuova richiesta gruppo non registrata (SQLSTATE %)', SQLSTATE;
    end;
  end loop;

  return new;
end;
$function$;
