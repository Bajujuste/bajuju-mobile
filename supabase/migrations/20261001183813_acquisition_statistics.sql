create table public.acquisition_events (
 id bigint generated always as identity primary key,
 session_id uuid not null, event_name text not null check(event_name in ('page_view','download_page','store_apple','store_android','register_open','register_attempt','register_error','register_success')),
 platform text not null check(platform in ('web','android','ios')), domain text not null default '' check(length(domain)<=120),
 source text not null default '' check(length(source)<=80), created_at timestamptz not null default now()
);
alter table public.acquisition_events enable row level security;
revoke all on public.acquisition_events from public,anon,authenticated;
create index acquisition_created_idx on public.acquisition_events(created_at);
create index acquisition_session_idx on public.acquisition_events(session_id,created_at);
create function public.record_acquisition_event(p_session uuid,p_event text,p_platform text,p_domain text default '',p_source text default '') returns void language plpgsql security definer set search_path = public as $$
begin
 if p_session is null or p_platform not in ('web','android','ios') or p_event not in ('page_view','download_page','store_apple','store_android','register_open','register_attempt','register_error','register_success') then return; end if;
 if p_platform='web' and lower(p_domain) not in ('bajuju.it','www.bajuju.it','bajuju.com','www.bajuju.com') then return; end if;
 if (select count(*) from public.acquisition_events where session_id=p_session and created_at>now()-interval '1 hour') >= 100 then return; end if;
 insert into public.acquisition_events(session_id,event_name,platform,domain,source) values(p_session,p_event,p_platform,left(lower(coalesce(p_domain,'')),120),left(coalesce(p_source,''),80));
end $$;
revoke all on function public.record_acquisition_event(uuid,text,text,text,text) from public;
grant execute on function public.record_acquisition_event(uuid,text,text,text,text) to anon,authenticated;
create function public.master_get_acquisition_summary(days_back integer default 1) returns jsonb language plpgsql security definer set search_path = public as $$
declare since_time timestamptz; result jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and coalesce(is_admin,false)) then raise exception 'Solo admin'; end if;
 since_time := ((now() at time zone 'Europe/Rome')::date - (greatest(1,least(coalesce(days_back,1),30))-1))::timestamp at time zone 'Europe/Rome';
 select jsonb_build_object(
 'since',since_time,
 'tracking_since',(select min(created_at) from public.acquisition_events),
 'web_sessions',(select count(distinct session_id) from public.acquisition_events where created_at>=since_time and platform='web' and event_name='page_view'),
 'web_views',(select count(*) from public.acquisition_events where created_at>=since_time and platform='web' and event_name='page_view'),
 'download_sessions',(select count(distinct session_id) from public.acquisition_events where created_at>=since_time and event_name='download_page'),
 'apple_clicks',(select count(*) from public.acquisition_events where created_at>=since_time and event_name='store_apple'),
 'android_clicks',(select count(*) from public.acquisition_events where created_at>=since_time and event_name='store_android'),
 'register_opens',(select count(distinct session_id) from public.acquisition_events where created_at>=since_time and event_name='register_open'),
 'register_attempts',(select count(*) from public.acquisition_events where created_at>=since_time and event_name='register_attempt'),
 'register_errors',(select count(*) from public.acquisition_events where created_at>=since_time and event_name='register_error'),
 'registrations',(select count(*) from auth.users where created_at>=since_time and deleted_at is null and not coalesce(is_anonymous,false)),
 'confirmed_registrations',(select count(*) from auth.users where created_at>=since_time and email_confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous,false)),
 'pending_registrations',(select count(*) from auth.users where created_at>=since_time and email_confirmed_at is null and deleted_at is null and not coalesce(is_anonymous,false)),
 'confirmations',(select count(*) from auth.users where email_confirmed_at>=since_time and deleted_at is null and not coalesce(is_anonymous,false)),
 'domains',coalesce((select jsonb_agg(t) from(select domain,count(*) as views,count(distinct session_id) as sessions from public.acquisition_events where created_at>=since_time and platform='web' and event_name='page_view' group by domain)t),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(t) from(select source,count(*) as views from public.acquisition_events where created_at>=since_time and platform='web' and event_name='page_view' group by source order by count(*) desc limit 10)t),'[]'::jsonb)
 ) into result; return result;
end $$;
revoke all on function public.master_get_acquisition_summary(integer) from public,anon;
grant execute on function public.master_get_acquisition_summary(integer) to authenticated;
