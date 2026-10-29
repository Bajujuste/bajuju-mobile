-- Logo del gruppo: foto quadrata al posto delle iniziali, la cambiano proprietario e admin del gruppo.
alter table public.groups add column if not exists logo_url text;

alter table public.groups drop constraint if exists groups_logo_url_length;
alter table public.groups add constraint groups_logo_url_length
  check (logo_url is null or char_length(logo_url) <= 1000);

create or replace function public.bajuju_groups_guard_owner_update()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  -- Operazioni interne del backend non hanno un utente auth.
  if viewer_id is null then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  -- set_group_colors e set_group_logo hanno già controllato che chi chiama sia un gestore del gruppo.
  if current_setting('bajuju.colors_change', true) = 'on'
     and (to_jsonb(new) - 'color_primary' - 'color_secondary' - 'logo_url' - 'updated_at')
         = (to_jsonb(old) - 'color_primary' - 'color_secondary' - 'logo_url' - 'updated_at') then
    return new;
  end if;

  if old.owner_id = viewer_id then
    -- Stato e campi di moderazione restano sempre sotto controllo Admin.
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

    -- Prima dell'approvazione (o dopo un rifiuto) il creatore può correggere
    -- tutti i dati descrittivi. Dopo l'approvazione conserva le regole attuali:
    -- copertina e descrizione modificabili, gli altri dati richiedono Admin.
    if old.status not in ('pending', 'rejected') then
      if new.name is distinct from old.name
        or new.normalized_name is distinct from old.normalized_name
        or new.city is distinct from old.city
        or new.province is distinct from old.province
        or new.category is distinct from old.category
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
      then
        raise exception 'Dopo l’approvazione puoi modificare copertina e descrizione. Per gli altri dati contatta Bajuju.';
      end if;
    end if;

    return new;
  end if;

  raise exception 'Non puoi modificare questo gruppo.';
end;
$$;

create or replace function public.set_group_logo(p_group_id uuid, p_logo_url text)
returns void
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
begin
  if (select auth.uid()) is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'BAJUJU_GROUP_NOT_FOUND';
  end if;
  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;
  if v_logo is not null and (
       char_length(v_logo) > 1000
       or position('/storage/v1/object/public/event-photos/groups/' || p_group_id::text || '/' in v_logo) = 0
     ) then
    raise exception 'BAJUJU_GROUP_LOGO_INVALID';
  end if;

  perform set_config('bajuju.colors_change', 'on', true);
  update public.groups set logo_url = v_logo where id = p_group_id;
  perform set_config('bajuju.colors_change', 'off', true);
end;
$$;

revoke all on function public.set_group_logo(uuid, text) from public, anon;
grant execute on function public.set_group_logo(uuid, text) to authenticated;
