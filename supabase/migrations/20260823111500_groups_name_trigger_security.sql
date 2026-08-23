-- Il trigger sui nomi deve poter usare le funzioni interne anche quando
-- l'INSERT viene eseguito da un utente authenticated.
alter function public.bajuju_groups_prepare_name() security definer;
revoke all on function public.bajuju_groups_prepare_name() from public, anon, authenticated;
