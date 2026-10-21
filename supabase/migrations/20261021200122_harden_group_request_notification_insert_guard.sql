-- Evita di leggere OLD nei trigger INSERT: esegue la verifica solo sugli UPDATE.
CREATE OR REPLACE FUNCTION private.bajuju_notify_owner_on_group_join_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_owner_id uuid;
  v_group_name text;
  v_requester_name text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  -- L'utente che preme nuovamente "richiedi" mentre è già in attesa
  -- non deve generare notifiche duplicate.
  if tg_op = 'UPDATE' then
    if old.status = 'pending' then
      return new;
    end if;
  end if;

  select g.owner_id, g.name
    into v_owner_id, v_group_name
  from public.groups g
  where g.id = new.group_id
    and g.status = 'active'
    and g.join_approval_required = true;

  if v_owner_id is null or v_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(btrim(p.nickname), ''), 'Un utente Bajuju')
    into v_requester_name
  from public.profiles p
  where p.id = new.user_id;

  v_requester_name := coalesce(v_requester_name, 'Un utente Bajuju');

  -- Un errore nel sistema di notifica non deve impedire l'iscrizione.
  begin
    insert into public.push_notification_logs (
      user_id, notification_type, type, title, body, data, status, success, is_read
    )
    values (
      v_owner_id,
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

  return new;
end;
$function$
;
