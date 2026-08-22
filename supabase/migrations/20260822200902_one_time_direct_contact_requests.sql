create or replace function public.enforce_one_time_direct_contact_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid;
  already_sent boolean;
begin
  actor_id := coalesce(new.requester_id, new.sender_id);

  if actor_id is null or new.receiver_id is null then
    return new;
  end if;

  if new.contact_type in ('telefono', 'telegram') then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'bajuju:direct-contact:' || actor_id::text || ':' || new.receiver_id::text,
        0
      )
    );

    select exists (
      select 1
      from public.direct_contact_requests dcr
      where coalesce(dcr.requester_id, dcr.sender_id) = actor_id
        and dcr.receiver_id = new.receiver_id
        and dcr.contact_type in ('telefono', 'telegram')
    )
    into already_sent;

    if already_sent then
      raise exception using
        errcode = '23505',
        message = 'Hai già inviato un contatto diretto a questa persona. Puoi farlo una sola volta.';
    end if;
  elsif new.contact_type = 'experience_invite' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'bajuju:experience-invite:' || actor_id::text || ':' || new.receiver_id::text,
        0
      )
    );

    select exists (
      select 1
      from public.direct_contact_requests dcr
      where coalesce(dcr.requester_id, dcr.sender_id) = actor_id
        and dcr.receiver_id = new.receiver_id
        and dcr.contact_type = 'experience_invite'
    )
    into already_sent;

    if already_sent then
      raise exception using
        errcode = '23505',
        message = 'Hai già invitato questa persona a uscire. L''invito può essere inviato una sola volta.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_one_time_direct_contact_request_insert on public.direct_contact_requests;
create trigger enforce_one_time_direct_contact_request_insert
before insert on public.direct_contact_requests
for each row
execute function public.enforce_one_time_direct_contact_request();
