drop policy if exists "Attività attive visibili agli autenticati" on public.activities;
drop policy if exists "Creators can update own activities" on public.activities;

drop policy if exists "activity_participants_select_authenticated_v85" on public.activity_participants;

drop policy if exists "activity_messages_select_creator_or_participant" on public.activity_messages;
drop policy if exists "activity_messages_select_policy" on public.activity_messages;
drop policy if exists "activity_messages_delete_policy" on public.activity_messages;

drop policy if exists "Users can create direct contact requests" on public.direct_contact_requests;
drop policy if exists "Receivers can read own direct contact requests" on public.direct_contact_requests;
drop policy if exists "Senders can read own direct contact requests" on public.direct_contact_requests;
drop policy if exists "Receivers can answer direct contact requests" on public.direct_contact_requests;
drop policy if exists "Receivers update direct contact requests" on public.direct_contact_requests;
