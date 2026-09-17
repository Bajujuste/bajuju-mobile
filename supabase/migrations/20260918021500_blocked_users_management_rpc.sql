create or replace function public.bajuju_get_users_blocked_by_me()
returns table(
  user_id uuid,
  nickname text,
  avatar_url text,
  city text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    p.id as user_id,
    coalesce(nullif(trim(p.nickname), ''), 'Utente Bajuju')::text as nickname,
    nullif(trim(p.avatar_url), '')::text as avatar_url,
    nullif(trim(p.city), '')::text as city
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc nulls last, p.nickname asc;
$$;

revoke all on function public.bajuju_get_users_blocked_by_me() from public, anon;
grant execute on function public.bajuju_get_users_blocked_by_me() to authenticated;
