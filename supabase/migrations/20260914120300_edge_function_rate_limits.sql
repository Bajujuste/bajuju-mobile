-- Limite di richieste per utente per le edge function che chiamano API esterne a pagamento
-- (es. Google Places in address-autocomplete). Finestra fissa: max richieste ogni p_window_seconds.
create schema if not exists private;

create table if not exists private.edge_rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table private.edge_rate_limits enable row level security;
revoke all on table private.edge_rate_limits from public, anon, authenticated;

-- Consuma una richiesta per l'utente autenticato e restituisce false se il limite è superato.
-- Ogni utente può consumare solo la propria quota (auth.uid()).
create or replace function public.consume_edge_rate_limit(
  p_bucket text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  uid uuid := auth.uid();
  safe_window integer := greatest(10, least(coalesce(p_window_seconds, 600), 86400));
  safe_max integer := greatest(1, least(coalesce(p_max_requests, 60), 10000));
  current_window timestamptz;
  new_count integer;
begin
  if uid is null then
    return false;
  end if;

  if p_bucket is null or p_bucket !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'Bucket non valido.';
  end if;

  current_window := to_timestamp(floor(extract(epoch from now()) / safe_window) * safe_window);

  insert into private.edge_rate_limits as rl (user_id, bucket, window_start, request_count)
  values (uid, p_bucket, current_window, 1)
  on conflict (user_id, bucket, window_start)
  do update set request_count = rl.request_count + 1
  returning request_count into new_count;

  -- Pulizia delle finestre vecchie dello stesso utente.
  if new_count = 1 then
    delete from private.edge_rate_limits
    where user_id = uid
      and window_start < now() - interval '1 day';
  end if;

  return new_count <= safe_max;
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_edge_rate_limit(text, integer, integer) to authenticated, service_role;
