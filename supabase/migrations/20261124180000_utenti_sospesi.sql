-- Utenti sospesi (profiles.suspended_until nel futuro): possono solo scrivere a Bajuju
-- ("Chiedi a Bajuju", admin_private_*). Le policy RESTRICTIVE qui sotto si sommano a quelle
-- esistenti e bloccano le scritture dirette sulle tabelle dei contenuti. Gli admin non sono mai sospesi.

create or replace function public.bajuju_is_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and coalesce(p.is_admin, false) = false
      and p.suspended_until is not null
      and p.suspended_until > now()
  );
$$;

revoke all on function public.bajuju_is_suspended(uuid) from public;
grant execute on function public.bajuju_is_suspended(uuid) to authenticated, service_role;

create policy "Utenti sospesi non creano eventi" on public.activities
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non modificano eventi" on public.activities
  as restrictive for update to authenticated using (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non scrivono in chat evento" on public.activity_messages
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non partecipano" on public.activity_participants
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non reagiscono" on public.chat_message_reactions
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non caricano foto album" on public.event_album_photos
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non creano eventi di gruppo" on public.group_activities
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non entrano nei gruppi" on public.group_members
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non scrivono nei gruppi" on public.group_messages
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non creano gruppi" on public.groups
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non modificano gruppi" on public.groups
  as restrictive for update to authenticated using (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non chiedono contatti" on public.direct_contact_requests
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non seguono organizzatori" on public.organizer_followers
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non segnano disponibilita" on public.user_availability
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
create policy "Utenti sospesi non creano location" on public.bajuju_locations
  as restrictive for insert to authenticated with check (not public.bajuju_is_suspended((select auth.uid())));
