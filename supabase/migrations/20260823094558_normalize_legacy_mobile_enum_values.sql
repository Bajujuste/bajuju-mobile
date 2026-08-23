-- Compatibilità con vecchi payload mobile: accetta i valori storici ma salva sempre i valori canonici.
alter type public.participation_status add value if not exists 'accepted';
alter type public.activity_status add value if not exists 'deleted';

create or replace function public.normalize_participation_status_legacy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status::text = 'accepted' then
    new.status := 'partecipo';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_participation_status_legacy_trg on public.activity_participants;
create trigger normalize_participation_status_legacy_trg
before insert or update of status on public.activity_participants
for each row execute function public.normalize_participation_status_legacy();

create or replace function public.normalize_activity_status_legacy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status::text = 'deleted' then
    new.status := 'eliminata';
    if new.deleted_at is null then
      new.deleted_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_activity_status_legacy_trg on public.activities;
create trigger normalize_activity_status_legacy_trg
before insert or update of status on public.activities
for each row execute function public.normalize_activity_status_legacy();
