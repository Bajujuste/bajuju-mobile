alter function public.handle_new_user() set search_path = public;
alter function public.is_activity_participant(uuid, uuid) set search_path = public;
alter function public.is_admin(uuid) set search_path = public;
alter function public.is_user_blocked(uuid) set search_path = public;
alter function public.prevent_profile_nickname_change() set search_path = public;
alter function public.notify_new_activity_trigger() set search_path = public;
alter function public.set_updated_at() set search_path = public;

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from PUBLIC, anon',
      r.nspname,
      r.proname,
      r.args
    );
  end loop;
end
$$;
