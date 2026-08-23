-- 1) Galleria evento: una sola policy INSERT realmente restrittiva.
drop policy if exists "event_album_photos_insert_own" on public.event_album_photos;
drop policy if exists "event_album_photos_insert_participants" on public.event_album_photos;
drop policy if exists "event_album_photos_insert_strict" on public.event_album_photos;

create policy "event_album_photos_insert_strict"
on public.event_album_photos
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce(profile_id, user_id) = (select auth.uid())
  and coalesce(event_id, activity_id) = activity_id
  and status = 'visible'
  and exists (
    select 1
    from public.activities a
    where a.id = event_album_photos.activity_id
      and coalesce(a.is_flash, false) = false
      and a.deleted_at is null
      and (
        a.creator_id = (select auth.uid())
        or exists (
          select 1
          from public.activity_participants ap
          where ap.activity_id = a.id
            and ap.user_id = (select auth.uid())
            and ap.status = 'partecipo'
        )
      )
  )
  and (
    select count(*)
    from public.event_album_photos existing
    where existing.activity_id = event_album_photos.activity_id
      and existing.status = 'visible'
  ) < 15
  and (
    select count(*)
    from public.event_album_photos existing
    where existing.activity_id = event_album_photos.activity_id
      and existing.user_id = (select auth.uid())
      and existing.status = 'visible'
  ) < 3
);

-- Storage event-photos: un file può essere caricato solo nella cartella di un evento
-- dal creatore o da un partecipante attivo, e il nome deve iniziare col proprio user id.
drop policy if exists "event_photos_insert_members_only" on storage.objects;
create policy "event_photos_insert_members_only"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'event-photos'
  or (
    (storage.filename(name) like ((select auth.uid())::text || '-%'))
    and exists (
      select 1
      from public.activities a
      where a.id::text = (storage.foldername(name))[1]
        and a.deleted_at is null
        and (
          a.creator_id = (select auth.uid())
          or exists (
            select 1
            from public.activity_participants ap
            where ap.activity_id = a.id
              and ap.user_id = (select auth.uid())
              and ap.status = 'partecipo'
          )
        )
    )
  )
);

-- 2) Chat: il limite 1..1000 caratteri e la membership valgono sempre,
-- anche in presenza di vecchie policy permissive.
drop policy if exists "activity_messages_insert_strict" on public.activity_messages;
create policy "activity_messages_insert_strict"
on public.activity_messages
as restrictive
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and length(trim(message)) between 1 and 1000
  and not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and coalesce(p.is_blocked, false) = true
  )
  and (
    exists (
      select 1 from public.activities a
      where a.id = activity_messages.activity_id
        and a.creator_id = (select auth.uid())
    )
    or exists (
      select 1 from public.activity_participants ap
      where ap.activity_id = activity_messages.activity_id
        and ap.user_id = (select auth.uid())
        and ap.status = 'partecipo'
    )
  )
);

-- 3) Profilo: usa una sola preferenza effettiva per i contatti diretti.
update public.profiles
set wants_receive_direct_contacts = coalesce(allow_direct_contacts, wants_receive_direct_contacts, true),
    allow_direct_contacts = coalesce(allow_direct_contacts, wants_receive_direct_contacts, true)
where wants_receive_direct_contacts is distinct from coalesce(allow_direct_contacts, wants_receive_direct_contacts, true)
   or allow_direct_contacts is distinct from coalesce(allow_direct_contacts, wants_receive_direct_contacts, true);

create or replace function public.sync_direct_contact_preference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.allow_direct_contacts := coalesce(new.allow_direct_contacts, new.wants_receive_direct_contacts, true);
    new.wants_receive_direct_contacts := new.allow_direct_contacts;
  elsif new.allow_direct_contacts is distinct from old.allow_direct_contacts then
    new.wants_receive_direct_contacts := coalesce(new.allow_direct_contacts, true);
  elsif new.wants_receive_direct_contacts is distinct from old.wants_receive_direct_contacts then
    new.allow_direct_contacts := new.wants_receive_direct_contacts;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_direct_contact_preference_trg on public.profiles;
create trigger sync_direct_contact_preference_trg
before insert or update of allow_direct_contacts, wants_receive_direct_contacts
on public.profiles
for each row execute function public.sync_direct_contact_preference();

-- 4) Le richieste contatto/invito devono rispettare davvero identità, blocchi e stessa esperienza.
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
  and contact_type in ('telefono','telegram','experience_invite')
  and activity_id is not null
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = direct_contact_requests.receiver_id)
       or (b.blocker_id = direct_contact_requests.receiver_id and b.blocked_id = (select auth.uid()))
  )
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
  and (
    contact_type = 'experience_invite'
    or exists (
      select 1
      from public.profiles rp
      where rp.id = direct_contact_requests.receiver_id
        and coalesce(rp.allow_direct_contacts, rp.wants_receive_direct_contacts, true) = true
        and coalesce(rp.is_blocked, false) = false
    )
  )
);

-- 5) launch_access era una vecchia policy sovrapposta: oggi tutti gli utenti non bloccati
-- possono creare esperienze, quindi la policy obsoleta viene rimossa.
drop policy if exists "activities_insert_launch_access_v85" on public.activities;
