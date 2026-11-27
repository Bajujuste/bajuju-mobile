-- Admin che scrive in una chat (evento, Flash, gruppo) dove non partecipa:
-- il messaggio viene salvato con l'account ufficiale "Bajuju" (bajuju_main_admin_id).
-- Già applicata in produzione il 2026-11-27.
create or replace function public.bajuju_admin_send_as_bajuju(p_chat text, p_scope_id uuid, p_message text, p_image_url text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_bajuju uuid;
  v_msg text := btrim(coalesce(p_message, ''));
  v_img text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_id uuid;
begin
  if not public.is_current_user_admin() then
    raise exception 'Solo gli admin possono scrivere come Bajuju';
  end if;
  if char_length(v_msg) < 1 or char_length(v_msg) > 1000 then
    raise exception 'Messaggio non valido';
  end if;
  if v_img is not null and v_img not like 'https://xwcbmsfsirggozpcskcz.supabase.co/storage/v1/object/public/chat-photos/' || auth.uid()::text || '/%' then
    raise exception 'Foto non valida';
  end if;
  v_bajuju := public.bajuju_main_admin_id();
  if v_bajuju is null then
    raise exception 'Account Bajuju non trovato';
  end if;

  if p_chat = 'activity' then
    if not exists (select 1 from public.activities a where a.id = p_scope_id) then
      raise exception 'Evento non trovato';
    end if;
    insert into public.activity_messages (activity_id, sender_id, message, image_url)
    values (p_scope_id, v_bajuju, v_msg, v_img)
    returning id into v_id;
  elsif p_chat = 'group' then
    if not exists (select 1 from public.groups g where g.id = p_scope_id and g.status = 'active') then
      raise exception 'Gruppo non trovato';
    end if;
    insert into public.group_messages (group_id, user_id, message, image_url)
    values (p_scope_id, v_bajuju, v_msg, v_img)
    returning id into v_id;
  else
    raise exception 'Chat non valida';
  end if;

  return v_id;
end;
$$;
revoke all on function public.bajuju_admin_send_as_bajuju(text, uuid, text, text) from public, anon;
grant execute on function public.bajuju_admin_send_as_bajuju(text, uuid, text, text) to authenticated;
