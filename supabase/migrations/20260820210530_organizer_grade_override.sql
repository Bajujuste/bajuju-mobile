alter table public.profiles
  add column if not exists organizer_grade_override text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_organizer_grade_override_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_organizer_grade_override_check
      check (
        organizer_grade_override is null
        or organizer_grade_override in (
          'Organizzatore base',
          'Organizzatore attivo',
          'Organizzatore esperto',
          'Organizzatore top'
        )
      );
  end if;
end $$;
