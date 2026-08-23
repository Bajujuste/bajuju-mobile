alter function public.guard_standard_activity_participant_insert() security definer;
alter function public.mark_waitlist_joined_after_participant_insert() security definer;

revoke execute on function public.guard_standard_activity_participant_insert() from public, anon, authenticated;
revoke execute on function public.mark_waitlist_joined_after_participant_insert() from public, anon, authenticated;
