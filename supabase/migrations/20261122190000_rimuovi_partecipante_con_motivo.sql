-- Organizzatore (o admin) rimuove un partecipante dal proprio evento con un motivo obbligatorio.
-- La persona esce (status annullato), in chat evento compare "L'organizzatore ha rimosso Nome"
-- e alla persona arriva una notifica (push + in app) con il motivo.
create or replace function public.bajuju_remove_participant_with_reason(p_activity_id uuid, p_user_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_caller uuid := auth.uid();
  v_reason text := left(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), 150);
  a record;
  v_is_admin boolean;
  v_name text;
  v_rows int;
begin
  if v_caller is null then raise exception 'Accesso richiesto.'; end if;
  if v_reason = '' then raise exception 'Scrivi il motivo della rimozione.'; end if;

  select id, creator_id, title into a from public.activities where id = p_activity_id;
  if a.id is null then raise exception 'Evento non trovato.'; end if;

  v_is_admin := coalesce(public.is_admin(v_caller), false);
  if a.creator_id is distinct from v_caller and not v_is_admin then
    raise exception 'Solo l’organizzatore o un admin possono rimuovere un partecipante.';
  end if;
  if p_user_id = a.creator_id then raise exception 'Non puoi rimuovere l’organizzatore.'; end if;
  if p_user_id = v_caller then raise exception 'Non puoi rimuovere te stesso.'; end if;

  update public.activity_participants
     set status = 'annullato'
   where activity_id = p_activity_id and user_id = p_user_id
     and status::text in ('partecipo', 'accepted', 'interessato');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Questa persona non partecipa all’evento.'; end if;

  select coalesce(nullif(btrim(p.nickname), ''), 'Un partecipante') into v_name
  from public.profiles p where p.id = p_user_id;
  v_name := left(coalesce(v_name, 'Un partecipante'), 60);

  -- Messaggio in chat evento, senza motivo (il motivo arriva solo alla persona rimossa).
  insert into public.activity_messages (activity_id, sender_id, message)
  values (
    p_activity_id, v_caller,
    case when a.creator_id = v_caller then 'L’organizzatore ha rimosso ' || v_name || ' dall’evento.'
         else 'Bajuju ha rimosso ' || v_name || ' dall’evento.' end
  );

  begin
    perform private.bajuju_send_notification(
      p_user_id,
      'participant_removed',
      'Sei stato rimosso da un evento',
      left('“' || left(coalesce(a.title, 'Evento'), 60) || '”. Motivo: ' || v_reason, 180),
      jsonb_build_object('screen', 'experience', 'activityId', a.id::text)
    );
  exception when others then
    raise warning 'Bajuju: notifica rimozione non inviata (SQLSTATE %)', SQLSTATE;
  end;

  return json_build_object('ok', true);
end;
$function$;

revoke all on function public.bajuju_remove_participant_with_reason(uuid, uuid, text) from public, anon;
grant execute on function public.bajuju_remove_participant_with_reason(uuid, uuid, text) to authenticated;
