CREATE OR REPLACE FUNCTION public.claim_push_token_for_current_user(p_token text, p_platform text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Utente non autenticato'; END IF;
  INSERT INTO public.push_tokens (user_id, expo_push_token, platform, is_active, last_seen_at)
  VALUES (v_user_id, p_token, p_platform, true, now())
  ON CONFLICT (expo_push_token) DO UPDATE SET user_id = v_user_id, platform = EXCLUDED.platform, is_active = true, last_seen_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_token_for_current_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_push_token_for_current_user(text, text) TO authenticated;
