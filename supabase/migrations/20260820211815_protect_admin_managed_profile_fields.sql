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
  ) and not public.is_current_user_admin() then
    raise exception 'Questi campi del profilo possono essere modificati solo da un amministratore Bajuju.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_admin_managed_profile_fields_trigger on public.profiles;

create trigger protect_admin_managed_profile_fields_trigger
before update of is_admin, is_premium_organizer, is_location_organizer, location_profile_text, organizer_grade_override
on public.profiles
for each row
execute function public.protect_admin_managed_profile_fields();
