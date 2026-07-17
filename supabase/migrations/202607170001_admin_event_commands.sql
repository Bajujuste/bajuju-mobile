-- Backend support for safe admin event commands.
-- This migration does not alter the existing activities table or mobile app behavior.

create table if not exists public.admin_event_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  activity_id text null,
  request_payload jsonb not null,
  response_payload jsonb null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  error_message text null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists admin_event_requests_admin_created_idx
  on public.admin_event_requests (admin_user_id, created_at desc);

create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_table text not null,
  target_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_logs_admin_created_idx
  on public.admin_action_logs (admin_user_id, created_at desc);

alter table public.admin_event_requests enable row level security;
alter table public.admin_action_logs enable row level security;

-- No client policies are intentionally created. These tables are accessible only
-- through trusted server code using the Supabase service role.

comment on table public.admin_event_requests is
  'Idempotency and execution state for authenticated admin event commands.';
comment on table public.admin_action_logs is
  'Append-only audit trail for privileged Bajuju administration actions.';
