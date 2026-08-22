-- Allinea le richieste storiche al campo usato dall'app.
update public.direct_contact_requests
set requester_id = sender_id
where requester_id is null
  and sender_id is not null
  and contact_type in ('telefono', 'telegram', 'experience_invite');

-- Per i contatti diretti WhatsApp/Telegram conta un solo invio totale A -> B.
-- Se esistono duplicati storici, conserva il primo invio e rimuove solo i successivi.
with ranked as (
  select id,
         row_number() over (
           partition by sender_id, receiver_id
           order by created_at asc nulls last, id asc
         ) as rn
  from public.direct_contact_requests
  where contact_type in ('telefono', 'telegram')
)
delete from public.direct_contact_requests d
using ranked r
where d.id = r.id
  and r.rn > 1;

-- Anche l'invito a uscire può essere inviato una sola volta A -> B,
-- indipendentemente da esperienza e stato (pending/accepted/rejected/etc.).
with ranked as (
  select id,
         row_number() over (
           partition by sender_id, receiver_id
           order by created_at asc nulls last, id asc
         ) as rn
  from public.direct_contact_requests
  where contact_type = 'experience_invite'
)
delete from public.direct_contact_requests d
using ranked r
where d.id = r.id
  and r.rn > 1;

create unique index if not exists direct_contact_requests_one_direct_contact_per_pair_idx
  on public.direct_contact_requests (sender_id, receiver_id)
  where contact_type in ('telefono', 'telegram');

create unique index if not exists direct_contact_requests_one_experience_invite_per_pair_idx
  on public.direct_contact_requests (sender_id, receiver_id)
  where contact_type = 'experience_invite';
