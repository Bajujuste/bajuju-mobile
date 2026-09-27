revoke all on function public.process_activity_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.process_activity_waitlist(uuid) to service_role;
