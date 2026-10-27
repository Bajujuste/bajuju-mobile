-- Eliminare un proprio messaggio nelle chat (eventi/Flash e gruppi).
-- Il messaggio resta al suo posto come "Messaggio eliminato": il testo viene cancellato
-- e deleted_at segna l'eliminazione. Solo chi ha scritto il messaggio può eliminarlo.

alter table public.activity_messages add column if not exists deleted_at timestamptz;
alter table public.group_messages add column if not exists deleted_at timestamptz;

create or replace function public.bajuju_delete_my_message(p_chat text, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_chat = 'activity' then
    update public.activity_messages
       set message = 'Messaggio eliminato', deleted_at = now()
     where id = p_message_id and sender_id = v_uid and deleted_at is null;
    get diagnostics v_count = row_count;
  elsif p_chat = 'group' then
    update public.group_messages
       set message = 'Messaggio eliminato', deleted_at = now()
     where id = p_message_id and user_id = v_uid and deleted_at is null;
    get diagnostics v_count = row_count;
  else
    raise exception 'invalid_chat';
  end if;

  if v_count = 0 then
    raise exception 'message_not_found';
  end if;
end;
$$;

revoke all on function public.bajuju_delete_my_message(text, uuid) from public, anon;
grant execute on function public.bajuju_delete_my_message(text, uuid) to authenticated;
