ALTER TABLE public.direct_contact_requests DROP CONSTRAINT IF EXISTS direct_contact_requests_contact_type_check;
ALTER TABLE public.direct_contact_requests ADD CONSTRAINT direct_contact_requests_contact_type_check CHECK (contact_type = ANY (ARRAY['telefono'::text, 'telegram'::text, 'flash_invite'::text, 'experience_invite'::text]));
