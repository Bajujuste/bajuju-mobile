create index if not exists activity_messages_sender_id_idx on public.activity_messages(sender_id);
create index if not exists reports_activity_id_idx on public.reports(activity_id);
create index if not exists reports_message_id_idx on public.reports(message_id);
create index if not exists reports_reporter_id_idx on public.reports(reporter_id);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks(blocked_id);
create index if not exists user_notifications_user_id_idx on public.user_notifications(user_id);

drop policy if exists app_analytics_insert_own on public.app_analytics_events;
create policy app_analytics_insert_own
on public.app_analytics_events
for insert
to authenticated
with check (user_id = (select auth.uid()));
