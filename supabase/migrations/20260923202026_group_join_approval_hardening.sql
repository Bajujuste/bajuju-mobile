-- Keep join requests readable only by the requester, group owner or Bajuju admin.
-- Add covering indexes for the new foreign keys.

grant select on table public.group_join_requests to authenticated;

drop policy if exists "Richieste gruppo visibili in modo limitato" on public.group_join_requests;
create policy "Richieste gruppo visibili in modo limitato"
on public.group_join_requests for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_current_user_admin()
  or exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.owner_id = (select auth.uid())
  )
);

create index if not exists group_join_requests_user_idx
  on public.group_join_requests (user_id);

create index if not exists group_join_requests_responded_by_idx
  on public.group_join_requests (responded_by)
  where responded_by is not null;
