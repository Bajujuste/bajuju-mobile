drop policy if exists "Proprietario o admin elimina gruppo" on public.groups;

create policy "Solo admin elimina gruppo"
on public.groups
for delete
to authenticated
using (public.is_current_user_admin());

create or replace function public.bajuju_groups_guard_owner_update()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  -- Operazioni interne del backend, come il trasferimento automatico a Bajuju,
  -- non hanno un utente auth e devono poter proseguire.
  if viewer_id is null then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  if old.owner_id = viewer_id then
    if new.name is distinct from old.name
      or new.normalized_name is distinct from old.normalized_name
      or new.city is distinct from old.city
      or new.province is distinct from old.province
      or new.category is distinct from old.category
      or new.cover_url is distinct from old.cover_url
      or new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.status is distinct from old.status
      or new.transferred_to_bajuju_at is distinct from old.transferred_to_bajuju_at
      or new.latitude is distinct from old.latitude
      or new.longitude is distinct from old.longitude
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Il creatore può modificare solo la descrizione del gruppo.';
    end if;
    return new;
  end if;

  raise exception 'Non puoi modificare questo gruppo.';
end;
$$;

drop trigger if exists groups_guard_owner_update_trg on public.groups;

create trigger groups_guard_owner_update_trg
before update on public.groups
for each row
execute function public.bajuju_groups_guard_owner_update();
