-- I campi di moderazione del profilo possono essere modificati solo da un admin
-- (o dal service role, ad es. le edge function, dove auth.uid() è null).
-- Prima un utente sospeso o bloccato poteva sbloccarsi aggiornando il proprio profilo.
create or replace function public.protect_admin_managed_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (
    new.is_admin is distinct from old.is_admin
    or new.is_premium_organizer is distinct from old.is_premium_organizer
    or new.is_location_organizer is distinct from old.is_location_organizer
    or new.location_profile_text is distinct from old.location_profile_text
    or new.organizer_grade_override is distinct from old.organizer_grade_override
    or new.is_blocked is distinct from old.is_blocked
    or new.blocked_until is distinct from old.blocked_until
    or new.suspended_until is distinct from old.suspended_until
    or new.launch_access is distinct from old.launch_access
    or new.is_deleted is distinct from old.is_deleted
  ) and not public.is_current_user_admin() then
    raise exception 'Questi campi del profilo possono essere modificati solo da un amministratore Bajuju.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_admin_managed_profile_fields_trigger on public.profiles;

create trigger protect_admin_managed_profile_fields_trigger
before update of
  is_admin, is_premium_organizer, is_location_organizer, location_profile_text, organizer_grade_override,
  is_blocked, blocked_until, suspended_until, launch_access, is_deleted
on public.profiles
for each row
execute function public.protect_admin_managed_profile_fields();
