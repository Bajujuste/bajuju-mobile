-- Nome utente e nome gruppo modificabili. I doppioni restano impossibili:
-- profiles_nickname_unique_lower_idx per gli utenti, bajuju_groups_prepare_name per i gruppi.

create or replace function public.prevent_profile_nickname_change()
returns trigger
language plpgsql
as $fn$
begin
  -- Il nome si può cambiare (l'indice unico impedisce i doppioni), ma non svuotare.
  if old.nickname is not null
     and trim(old.nickname) <> ''
     and (new.nickname is null or char_length(trim(new.nickname)) < 3) then
    raise exception 'Il nome utente deve contenere almeno 3 caratteri.';
  end if;

  return new;
end;
$fn$;

create or replace function public.bajuju_groups_guard_owner_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  viewer_id uuid := (select auth.uid());
begin
  if viewer_id is null then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  if current_setting('bajuju.colors_change', true) = 'on'
     and (to_jsonb(new) - 'color_primary' - 'color_secondary' - 'logo_url' - 'updated_at')
         = (to_jsonb(old) - 'color_primary' - 'color_secondary' - 'logo_url' - 'updated_at') then
    return new;
  end if;

  if old.owner_id = viewer_id then
    if new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.status is distinct from old.status
      or new.transferred_to_bajuju_at is distinct from old.transferred_to_bajuju_at
      or new.review_note is distinct from old.review_note
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Lo stato del gruppo può essere modificato solo da Bajuju.';
    end if;

    -- Il nome resta modificabile anche dopo l'approvazione: bajuju_groups_prepare_name
    -- rifiuta i nomi uguali o troppo simili a quelli di altri gruppi.
    if old.status not in ('pending', 'rejected') then
      if new.city is distinct from old.city
        or new.province is distinct from old.province
        or new.category is distinct from old.category
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
      then
        raise exception 'Dopo l’approvazione puoi modificare nome, copertina e descrizione. Per gli altri dati contatta Bajuju.';
      end if;
    end if;

    return new;
  end if;

  raise exception 'Non puoi modificare questo gruppo.';
end;
$fn$;
