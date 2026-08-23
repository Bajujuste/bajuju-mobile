drop policy if exists "event_photos_insert_members_only" on storage.objects;

create policy "event_photos_insert_members_only"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'event-photos'
  or (
    storage.filename(name) like ((select auth.uid())::text || '-%')
    and (
      (
        (storage.foldername(name))[1] <> 'groups'
        and exists (
          select 1
          from public.activities a
          where a.id::text = (storage.foldername(storage.objects.name))[1]
            and a.deleted_at is null
            and (
              a.creator_id = (select auth.uid())
              or exists (
                select 1
                from public.activity_participants ap
                where ap.activity_id = a.id
                  and ap.user_id = (select auth.uid())
                  and ap.status = 'partecipo'::participation_status
              )
            )
        )
      )
      or (
        (storage.foldername(name))[1] = 'groups'
        and exists (
          select 1
          from public.groups g
          where g.id::text = (storage.foldername(storage.objects.name))[2]
            and (
              g.owner_id = (select auth.uid())
              or public.is_current_user_admin()
            )
        )
      )
    )
  )
);
