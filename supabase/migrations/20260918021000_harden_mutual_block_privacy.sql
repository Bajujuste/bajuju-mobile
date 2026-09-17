-- Evita che un client possa interrogare direttamente chi lo ha bloccato.
-- Le policy usano l'helper nel schema private, non esposto da PostgREST.

drop function if exists public.bajuju_get_current_blocked_user_ids();
drop function if exists public.bajuju_current_user_block_conflict(uuid);

grant usage on schema private to authenticated;
grant execute on function private.bajuju_users_block_each_other(uuid, uuid) to authenticated;

drop policy if exists "Profili visibili salvo blocco reciproco" on public.profiles;
create policy "Profili visibili salvo blocco reciproco"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_current_user_admin()
  or not private.bajuju_users_block_each_other(auth.uid(), id)
);

drop policy if exists "Partecipanti visibili salvo blocco reciproco" on public.activity_participants;
create policy "Partecipanti visibili salvo blocco reciproco"
on public.activity_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_current_user_admin()
  or not private.bajuju_users_block_each_other(auth.uid(), user_id)
);

drop policy if exists "Messaggi visibili ai partecipanti salvo blocco reciproco" on public.activity_messages;
create policy "Messaggi visibili ai partecipanti salvo blocco reciproco"
on public.activity_messages
for select
to authenticated
using (
  (
    public.is_activity_participant(activity_id, auth.uid())
    or exists (
      select 1
      from public.activities a
      where a.id = activity_messages.activity_id
        and a.creator_id = auth.uid()
    )
    or public.is_admin(auth.uid())
  )
  and (
    sender_id = auth.uid()
    or public.is_current_user_admin()
    or not private.bajuju_users_block_each_other(auth.uid(), sender_id)
  )
);

drop policy if exists "event_album_photos_select_block_aware" on public.event_album_photos;
create policy "event_album_photos_select_block_aware"
on public.event_album_photos
for select
to authenticated
using (
  coalesce(user_id, profile_id) = auth.uid()
  or public.is_current_user_admin()
  or not private.bajuju_users_block_each_other(auth.uid(), coalesce(user_id, profile_id))
);
