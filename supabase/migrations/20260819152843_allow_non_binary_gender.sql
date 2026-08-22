alter table public.profiles
  drop constraint if exists profiles_gender_check;

alter table public.profiles
  add constraint profiles_gender_check
  check (gender = any (array[
    'maschio'::text,
    'femmina'::text,
    'preferisco_non_specificarlo'::text,
    'non_binario'::text
  ]));
