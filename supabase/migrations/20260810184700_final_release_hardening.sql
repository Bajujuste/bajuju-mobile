-- Bajuju final release hardening: notification deletion and live chat.

drop policy if exists "push_notification_logs_delete_own" on public.push_notification_logs;
create policy "push_notification_logs_delete_own"
on public.push_notification_logs
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists push_notification_logs_user_sent_idx
on public.push_notification_logs(user_id, sent_at desc);

do $$
begin
  if to_regclass('public.activity_messages') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'activity_messages'
     ) then
    alter publication supabase_realtime add table public.activity_messages;
  end if;
end
$$;
