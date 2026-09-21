-- Seconda passata: elimina falsi positivi noti prodotti da vecchi fallback Admin.
-- Le chiamate che li generavano sono state rimosse dal client.

create or replace function public.filter_expected_analytics_noise()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  endpoint text := coalesce(new.properties ->> 'endpoint', '');
  method text := coalesce(new.properties ->> 'method', '');
  status text := coalesce(new.properties ->> 'status', '');
  error_code text := coalesce(new.properties ->> 'error_code', '');
  error_message text := coalesce(new.properties ->> 'error_message', '');
begin
  if new.event_name = 'network_error' and (
    endpoint = any (array[
      'table/contact_requests',
      'table/user_contact_requests',
      'table/activity_invitations',
      'table/activity_invites',
      'table/event_invites',
      'table/invitations',
      'table/event_participants',
      'table/participants',
      'rpc/master_is_admin',
      'rpc/is_admin'
    ])
    or (
      endpoint = 'function/address-autocomplete'
      and error_message = 'INCOMPLETE_STREET_ADDRESS'
    )
    or (
      endpoint = 'table/activity_messages'
      and method = 'HEAD'
      and status = '400'
    )
    or (
      endpoint = 'rpc/master_get_users_overview'
      and error_code = 'P0001'
      and error_message = 'Solo gli admin possono usare Area Master.'
    )
    or (
      endpoint = 'table/activity_reports'
      and error_code = 'PGRST205'
    )
    or (
      endpoint = any (array['table/reports', 'table/user_reports'])
      and error_code = 'PGRST204'
    )
  ) then
    return null;
  end if;

  return new;
end;
$$;

delete from public.app_analytics_events
where event_name = 'network_error'
  and (
    properties ->> 'endpoint' = any (array[
      'table/contact_requests',
      'table/user_contact_requests',
      'table/activity_invitations',
      'table/activity_invites',
      'table/event_invites',
      'table/invitations',
      'table/event_participants',
      'table/participants',
      'rpc/master_is_admin',
      'rpc/is_admin'
    ])
    or (
      properties ->> 'endpoint' = 'function/address-autocomplete'
      and properties ->> 'error_message' = 'INCOMPLETE_STREET_ADDRESS'
    )
    or (
      properties ->> 'endpoint' = 'table/activity_messages'
      and properties ->> 'method' = 'HEAD'
      and properties ->> 'status' = '400'
    )
    or (
      properties ->> 'endpoint' = 'rpc/master_get_users_overview'
      and properties ->> 'error_code' = 'P0001'
      and properties ->> 'error_message' = 'Solo gli admin possono usare Area Master.'
    )
    or (
      properties ->> 'endpoint' = 'table/activity_reports'
      and properties ->> 'error_code' = 'PGRST205'
    )
    or (
      properties ->> 'endpoint' = any (array['table/reports', 'table/user_reports'])
      and properties ->> 'error_code' = 'PGRST204'
    )
  );
