-- Chat: una sola policy permissiva minima; la policy restrictive applica tutte le regole reali.
drop policy if exists "Solo partecipanti non bloccati possono scrivere messaggi" on public.activity_messages;
drop policy if exists "activity_messages_insert_creator_or_participant" on public.activity_messages;
drop policy if exists "activity_messages_insert_policy" on public.activity_messages;
drop policy if exists "activity_messages_insert_authenticated" on public.activity_messages;

create policy "activity_messages_insert_authenticated"
on public.activity_messages
for insert
to authenticated
with check (sender_id = (select auth.uid()));

-- Contatti: elimina le due policy public sovrapposte; una sola policy authenticated
-- concede l'operazione, la restrictive verifica esperienza, blocchi e consenso.
drop policy if exists "Users insert own direct contact requests" on public.direct_contact_requests;
drop policy if exists "direct_contact_requests_insert_own" on public.direct_contact_requests;
drop policy if exists "direct_contact_requests_insert_authenticated" on public.direct_contact_requests;

create policy "direct_contact_requests_insert_authenticated"
on public.direct_contact_requests
for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and sender_id = (select auth.uid())
);

-- Partecipazione: stessa regola, evitando rivalutazioni inutili di auth.uid().
drop policy if exists "Utenti non bloccati possono partecipare" on public.activity_participants;
create policy "Utenti non bloccati possono partecipare"
on public.activity_participants
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_user_blocked((select auth.uid())) = false
);
