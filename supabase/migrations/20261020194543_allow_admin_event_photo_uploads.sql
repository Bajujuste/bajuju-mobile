DO $$
DECLARE original text; revised text;
BEGIN
 SELECT pg_get_expr(polwithcheck,polrelid) INTO original FROM pg_policy
 WHERE polrelid='storage.objects'::regclass AND polname='event_photos_insert_members_only';
 revised := replace(original, '(a.creator_id = ( SELECT auth.uid() AS uid))', '((a.creator_id = ( SELECT auth.uid() AS uid)) OR public.is_current_user_admin())');
 IF revised IS NULL OR revised = original THEN RAISE EXCEPTION 'Unexpected storage policy; no changes applied'; END IF;
 EXECUTE format('ALTER POLICY event_photos_insert_members_only ON storage.objects WITH CHECK (%s)', revised);
END $$;
