-- Sondaggi nei gruppi: una domanda, da 2 a 4 risposte, un voto per persona (modificabile).
-- Tutto passa dalle funzioni qui sotto: le tabelle non sono leggibili direttamente.

create table if not exists public.group_polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  options text[] not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint group_polls_question_length_chk check (char_length(btrim(question)) between 3 and 140),
  constraint group_polls_options_count_chk check (cardinality(options) between 2 and 4)
);

create index if not exists group_polls_group_created_idx on public.group_polls (group_id, created_at desc);
create index if not exists group_polls_created_by_idx on public.group_polls (created_by);

create table if not exists public.group_poll_votes (
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 3),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists group_poll_votes_user_id_idx on public.group_poll_votes (user_id);

alter table public.group_polls enable row level security;
alter table public.group_poll_votes enable row level security;
revoke all on table public.group_polls from anon, authenticated;
revoke all on table public.group_poll_votes from anon, authenticated;

create or replace function private.bajuju_can_use_group_polls(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.status = 'active'
      and (
        public.is_current_user_admin()
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = g.id and gm.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function private.bajuju_can_use_group_polls(uuid) from public, anon, authenticated;

create or replace function public.get_group_polls(p_group_id uuid)
returns table (
  id uuid,
  question text,
  options text[],
  created_by uuid,
  creator_nickname text,
  closed_at timestamptz,
  created_at timestamptz,
  vote_counts integer[],
  total_votes integer,
  my_vote integer,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean := public.is_current_user_admin();
  v_owner uuid;
begin
  if auth.uid() is null or not private.bajuju_can_use_group_polls(p_group_id) then
    return;
  end if;

  select g.owner_id into v_owner from public.groups g where g.id = p_group_id;

  return query
  select
    gp.id,
    gp.question,
    gp.options,
    gp.created_by,
    coalesce(pr.nickname, 'Utente Bajuju')::text,
    gp.closed_at,
    gp.created_at,
    array(
      select count(v.user_id)::integer
      from generate_series(0, cardinality(gp.options) - 1) as idx
      left join public.group_poll_votes v on v.poll_id = gp.id and v.option_index = idx
      group by idx
      order by idx
    ),
    (select count(*)::integer from public.group_poll_votes v where v.poll_id = gp.id),
    (select v.option_index::integer from public.group_poll_votes v where v.poll_id = gp.id and v.user_id = auth.uid()),
    (v_is_admin or gp.created_by = auth.uid() or v_owner = auth.uid())
  from public.group_polls gp
  left join public.profiles pr on pr.id = gp.created_by
  where gp.group_id = p_group_id
  order by (gp.closed_at is null) desc, gp.created_at desc
  limit 20;
end;
$$;

create or replace function public.create_group_poll(p_group_id uuid, p_question text, p_options text[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_options text[];
  v_question text := btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if auth.uid() is null or not private.bajuju_can_use_group_polls(p_group_id) then
    raise exception 'Devi essere iscritto al gruppo per creare un sondaggio.';
  end if;

  if exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_blocked, false)) then
    raise exception 'Il tuo account non può creare sondaggi.';
  end if;

  select coalesce(array_agg(btrim(o) order by ord), '{}')
    into v_options
  from unnest(coalesce(p_options, '{}')) with ordinality as t(o, ord)
  where btrim(coalesce(o, '')) <> '';

  if char_length(v_question) < 3 or char_length(v_question) > 140 then
    raise exception 'La domanda deve avere da 3 a 140 caratteri.';
  end if;
  if cardinality(v_options) < 2 or cardinality(v_options) > 4 then
    raise exception 'Inserisci da 2 a 4 risposte.';
  end if;
  if exists (select 1 from unnest(v_options) o where char_length(o) > 80) then
    raise exception 'Ogni risposta può avere al massimo 80 caratteri.';
  end if;
  if (select count(distinct lower(o)) from unnest(v_options) o) < cardinality(v_options) then
    raise exception 'Le risposte devono essere diverse tra loro.';
  end if;
  if (
    select count(*) from public.group_polls gp
    where gp.created_by = auth.uid() and gp.created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Hai creato troppi sondaggi oggi. Riprova domani.';
  end if;

  insert into public.group_polls (group_id, created_by, question, options)
  values (p_group_id, auth.uid(), v_question, v_options)
  returning group_polls.id into v_id;

  return v_id;
end;
$$;

create or replace function public.vote_group_poll(p_poll_id uuid, p_option_index integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_poll public.group_polls%rowtype;
begin
  select * into v_poll from public.group_polls gp where gp.id = p_poll_id;

  if not found or auth.uid() is null or not private.bajuju_can_use_group_polls(v_poll.group_id) then
    raise exception 'Devi essere iscritto al gruppo per votare.';
  end if;
  if v_poll.closed_at is not null then
    raise exception 'Il sondaggio è chiuso.';
  end if;
  if p_option_index is null or p_option_index < 0 or p_option_index >= cardinality(v_poll.options) then
    raise exception 'Risposta non valida.';
  end if;

  insert into public.group_poll_votes (poll_id, user_id, option_index)
  values (p_poll_id, auth.uid(), p_option_index)
  on conflict (poll_id, user_id)
  do update set option_index = excluded.option_index, updated_at = now();
end;
$$;

create or replace function public.manage_group_poll(p_poll_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_poll public.group_polls%rowtype;
  v_owner uuid;
begin
  select * into v_poll from public.group_polls gp where gp.id = p_poll_id;
  if not found then
    raise exception 'Sondaggio non trovato.';
  end if;

  select g.owner_id into v_owner from public.groups g where g.id = v_poll.group_id;

  if auth.uid() is null or not (
    public.is_current_user_admin() or v_poll.created_by = auth.uid() or v_owner = auth.uid()
  ) then
    raise exception 'Non puoi gestire questo sondaggio.';
  end if;

  if p_action = 'close' then
    update public.group_polls set closed_at = coalesce(closed_at, now()) where id = p_poll_id;
  elsif p_action = 'delete' then
    delete from public.group_polls where id = p_poll_id;
  else
    raise exception 'Azione non valida.';
  end if;
end;
$$;

revoke all on function public.get_group_polls(uuid) from public, anon;
revoke all on function public.create_group_poll(uuid, text, text[]) from public, anon;
revoke all on function public.vote_group_poll(uuid, integer) from public, anon;
revoke all on function public.manage_group_poll(uuid, text) from public, anon;
grant execute on function public.get_group_polls(uuid) to authenticated;
grant execute on function public.create_group_poll(uuid, text, text[]) to authenticated;
grant execute on function public.vote_group_poll(uuid, integer) to authenticated;
grant execute on function public.manage_group_poll(uuid, text) to authenticated;
