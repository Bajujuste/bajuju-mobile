-- Evita che fallback legacy e validazioni attese gonfino gli "Errori tecnici".
-- Le chiamate legacy sono state rimosse dal client; questo filtro protegge anche
-- installazioni non ancora aggiornate via OTA.

create or replace function public.filter_expected_analytics_noise()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  endpoint text := coalesce(new.properties ->> 'endpoint', '');
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
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists filter_expected_analytics_noise_before_insert
on public.app_analytics_events;

create trigger filter_expected_analytics_noise_before_insert
before insert on public.app_analytics_events
for each row execute function public.filter_expected_analytics_noise();

-- Ripulisce soltanto il rumore tecnico già registrato; non tocca analytics utili,
-- contenuti utenti, eventi, partecipazioni o messaggi.
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
  );
