-- Admin: rende premium (promozionale) un evento aggiungendolo a app_settings.promoted_event_ids.
-- Applicata in produzione il 2026-11-21.
create or replace function public.admin_set_event_promoted(target_activity_id uuid, promoted boolean default true)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_ids text[];
  next_ids text[];
begin
  if not public.is_current_user_admin() then
    raise exception 'Operazione consentita solo agli admin.';
  end if;
  if not exists (select 1 from public.activities where id = target_activity_id) then
    raise exception 'Evento non trovato.';
  end if;

  select coalesce(array_remove(regexp_split_to_array(coalesce(setting_value, ''), '[\s,]+'), ''), '{}')
    into current_ids
    from public.app_settings
    where setting_key = 'promoted_event_ids'
    for update;

  current_ids := coalesce(current_ids, '{}');
  next_ids := array_remove(current_ids, target_activity_id::text);
  if promoted then
    next_ids := next_ids || target_activity_id::text;
  end if;

  insert into public.app_settings (setting_key, setting_value, updated_at)
  values ('promoted_event_ids', array_to_string(next_ids, ','), now())
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value, updated_at = now();

  return array_to_string(next_ids, ',');
end;
$function$;

revoke all on function public.admin_set_event_promoted(uuid, boolean) from public, anon;
grant execute on function public.admin_set_event_promoted(uuid, boolean) to authenticated;
