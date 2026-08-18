-- BAJUJU - NOTIFICHE GEOGRAFICHE ENTRO 25 KM
-- Aggiunge l'ultima posizione nota dell'utente alle preferenze notifiche.
-- La posizione viene aggiornata dall'app quando l'utente usa Bajuju.

alter table public.notification_preferences
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_latitude_check;

alter table public.notification_preferences
  add constraint notification_preferences_latitude_check
  check (latitude is null or latitude between -90 and 90);

alter table public.notification_preferences
  drop constraint if exists notification_preferences_longitude_check;

alter table public.notification_preferences
  add constraint notification_preferences_longitude_check
  check (longitude is null or longitude between -180 and 180);

create index if not exists notification_preferences_new_experience_idx
  on public.notification_preferences (enabled, notify_new_experience)
  where enabled = true and notify_new_experience = true;
