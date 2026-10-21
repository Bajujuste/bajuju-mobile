-- La descrizione dei gruppi passa da 500 a 1500 caratteri: i testi lunghi venivano tagliati a metà parola.
alter table public.groups drop constraint if exists groups_description_length_chk;
alter table public.groups add constraint groups_description_length_chk check (char_length(description) <= 1500);
