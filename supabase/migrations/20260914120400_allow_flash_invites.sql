-- "Invita al mio Flash" falliva sempre: la policy restrictive direct_contact_requests_insert_strict
-- (20260823094545) accettava solo telefono/telegram/experience_invite e richiedeva un'esperienza
-- già iniziata condivisa da mittente e destinatario, condizioni impossibili per un invito Flash.
-- La policy viene ricreata identica per i tipi esistenti, con in più un ramo dedicato a flash_invite.

drop policy if exists "direct_contact_requests_insert_strict" on public.direct_contact_requests;
create policy "direct_contact_requests_insert_strict"
on public.direct_contact_requests
as restrictive
for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and sender_id = (select auth.uid())
  and receiver_id <> (select auth.uid())
  and contact_type in ('telefono','telegram','experience_invite','flash_invite')
  and activity_id is not null
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = direct_contact_requests.receiver_id)
       or (b.blocker_id = direct_contact_requests.receiver_id and b.blocked_id = (select auth.uid()))
  )
  and (
    (
      contact_type in ('telefono','telegram','experience_invite')
      and exists (
        select 1
        from public.activities a
        where a.id = direct_contact_requests.activity_id
          and a.deleted_at is null
          and ((a.activity_date + a.activity_time) at time zone 'Europe/Rome') <= now()
          and (
            a.creator_id = (select auth.uid())
            or exists (
              select 1 from public.activity_participants ap
              where ap.activity_id = a.id
                and ap.user_id = (select auth.uid())
                and ap.status = 'partecipo'
            )
          )
          and (
            a.creator_id = direct_contact_requests.receiver_id
            or exists (
              select 1 from public.activity_participants ap
              where ap.activity_id = a.id
                and ap.user_id = direct_contact_requests.receiver_id
                and ap.status = 'partecipo'
            )
          )
      )
    )
    or (
      -- Invito Flash: il mittente invita al proprio Flash attivo una persona attualmente disponibile.
      contact_type = 'flash_invite'
      and exists (
        select 1
        from public.activities a
        where a.id = direct_contact_requests.activity_id
          and a.creator_id = (select auth.uid())
          and coalesce(a.is_flash, false) = true
          and a.deleted_at is null
          and a.expires_at > now()
      )
      and exists (
        select 1
        from public.user_availability ua
        where ua.user_id = direct_contact_requests.receiver_id
          and ua.expires_at > now()
      )
      and exists (
        select 1
        from public.profiles rp
        where rp.id = direct_contact_requests.receiver_id
          and coalesce(rp.is_blocked, false) = false
          and coalesce(rp.is_deleted, false) = false
      )
    )
  )
  and (
    contact_type in ('experience_invite','flash_invite')
    or exists (
      select 1
      from public.profiles rp
      where rp.id = direct_contact_requests.receiver_id
        and coalesce(rp.allow_direct_contacts, rp.wants_receive_direct_contacts, true) = true
        and coalesce(rp.is_blocked, false) = false
    )
  )
);

-- Un solo invito per persona e per Flash (qualunque sia lo stato), come per gli altri tipi.
-- Identica a 20260822200902_one_time_direct_contact_requests.sql con in più il ramo flash_invite.
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
  elsif new.contact_type = 'flash_invite' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'bajuju:flash-invite:' || actor_id::text || ':' || new.receiver_id::text || ':' || coalesce(new.activity_id::text, ''),
        0
      )
    );

    select exists (
      select 1
      from public.direct_contact_requests dcr
      where coalesce(dcr.requester_id, dcr.sender_id) = actor_id
        and dcr.receiver_id = new.receiver_id
        and dcr.activity_id = new.activity_id
        and dcr.contact_type = 'flash_invite'
    )
    into already_sent;

    if already_sent then
      raise exception using
        errcode = '23505',
        message = 'Hai già invitato questa persona a questo Flash.';
    end if;
  end if;

  return new;
end;
$$;
