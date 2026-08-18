ALTER TABLE public.direct_contact_requests DROP CONSTRAINT IF EXISTS direct_contact_requests_status_check;
ALTER TABLE public.direct_contact_requests ADD CONSTRAINT direct_contact_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'archived'::text]));
