-- Errori di registrazione divisi per motivo: l'app salva il motivo nella colonna source degli eventi register_error.
create or replace function public.master_get_acquisition_summary(days_back integer default 1) returns jsonb language plpgsql security definer set search_path = public as $$
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
 'register_error_reasons',coalesce((select jsonb_agg(t) from(select source as reason,count(*) as errors from public.acquisition_events where created_at>=since_time and event_name='register_error' group by source order by count(*) desc)t),'[]'::jsonb),
 'registrations',(select count(*) from auth.users where created_at>=since_time and deleted_at is null and not coalesce(is_anonymous,false)),
 'confirmed_registrations',(select count(*) from auth.users where created_at>=since_time and email_confirmed_at is not null and deleted_at is null and not coalesce(is_anonymous,false)),
 'pending_registrations',(select count(*) from auth.users where created_at>=since_time and email_confirmed_at is null and deleted_at is null and not coalesce(is_anonymous,false)),
 'confirmations',(select count(*) from auth.users where email_confirmed_at>=since_time and deleted_at is null and not coalesce(is_anonymous,false)),
 'domains',coalesce((select jsonb_agg(t) from(select domain,count(*) as views,count(distinct session_id) as sessions from public.acquisition_events where created_at>=since_time and platform='web' and event_name='page_view' group by domain)t),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(t) from(select source,count(*) as views from public.acquisition_events where created_at>=since_time and platform='web' and event_name='page_view' group by source order by count(*) desc limit 10)t),'[]'::jsonb)
 ) into result; return result;
end $$;
