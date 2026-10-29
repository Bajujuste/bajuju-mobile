-- Bajuju · Gruppi v2: ruoli (proprietario/admin/membro), colori, bacheca (post, like, commenti), espulsioni e blocchi.
-- Migrazione additiva: le funzioni esistenti mantengono firma e valori di ritorno, così la versione
-- dell'app già installata continua a funzionare. Le tabelle nuove si usano solo tramite le funzioni qui sotto.

------------------------------------------------------------------------
-- 1. Colonne nuove
------------------------------------------------------------------------
alter table public.group_members
  add column if not exists role text not null default 'member';

alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check check (role in ('owner', 'admin', 'member'));

update public.group_members gm
   set role = 'owner'
  from public.groups g
 where g.id = gm.group_id
   and g.owner_id = gm.user_id
   and gm.role <> 'owner';

alter table public.groups
  add column if not exists color_primary text,
  add column if not exists color_secondary text;

alter table public.groups drop constraint if exists groups_color_primary_check;
alter table public.groups drop constraint if exists groups_color_secondary_check;
alter table public.groups
  add constraint groups_color_primary_check
    check (color_primary is null or color_primary ~ '^#[0-9A-F]{6}$'),
  add constraint groups_color_secondary_check
    check (color_secondary is null or color_secondary ~ '^#[0-9A-F]{6}$');

------------------------------------------------------------------------
-- 2. Tabelle nuove (accesso solo tramite funzioni, come i sondaggi)
------------------------------------------------------------------------
create table if not exists public.group_bans (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  banned_by  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_bans_user_idx on public.group_bans (user_id);

create table if not exists public.group_posts (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',
  image_urls  text[] not null default '{}',
  is_pinned   boolean not null default false,
  pinned_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint group_posts_body_len check (char_length(body) <= 2000),
  constraint group_posts_images_max check (cardinality(image_urls) <= 6),
  constraint group_posts_not_empty check (char_length(btrim(body)) > 0 or cardinality(image_urls) > 0)
);
create index if not exists group_posts_feed_idx
  on public.group_posts (group_id, is_pinned desc, created_at desc)
  where deleted_at is null;
create index if not exists group_posts_author_idx on public.group_posts (author_id);

create table if not exists public.group_post_likes (
  post_id    uuid not null references public.group_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists group_post_likes_user_idx on public.group_post_likes (user_id);

create table if not exists public.group_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.group_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint group_post_comments_len check (char_length(btrim(body)) between 1 and 1000)
);
create index if not exists group_post_comments_post_idx on public.group_post_comments (post_id, created_at);
create index if not exists group_post_comments_user_idx on public.group_post_comments (user_id);

alter table public.group_bans          enable row level security;
alter table public.group_posts         enable row level security;
alter table public.group_post_likes    enable row level security;
alter table public.group_post_comments enable row level security;
revoke all on table public.group_bans          from anon, authenticated;
revoke all on table public.group_posts         from anon, authenticated;
revoke all on table public.group_post_likes    from anon, authenticated;
revoke all on table public.group_post_comments from anon, authenticated;

------------------------------------------------------------------------
-- 3. Funzioni di supporto (private)
------------------------------------------------------------------------
create or replace function private.bajuju_group_role(p_group_id uuid, p_user_id uuid)
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when g.owner_id = p_user_id then 'owner' else gm.role end
    from public.groups g
    left join public.group_members gm on gm.group_id = g.id and gm.user_id = p_user_id
   where g.id = p_group_id
     and p_user_id is not null
     and (g.owner_id = p_user_id or gm.user_id is not null);
$$;

-- Gestore = proprietario, admin del gruppo oppure Admin di Bajuju.
create or replace function private.bajuju_can_manage_group(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select public.is_current_user_admin()
      or coalesce(private.bajuju_group_role(p_group_id, (select auth.uid())) in ('owner', 'admin'), false);
$$;

create or replace function private.bajuju_is_group_banned(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.group_bans b where b.group_id = p_group_id and b.user_id = p_user_id);
$$;

-- Bacheca: gruppo con ingresso libero → visibile a tutti tranne chi è bloccato dal gruppo;
-- gruppo con approvazione → solo membri. Il proprietario e gli Admin di Bajuju la vedono sempre.
create or replace function private.bajuju_can_view_group_board(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.groups g
        where g.id = p_group_id
          and (
            public.is_current_user_admin()
            or g.owner_id = (select auth.uid())
            or (
              g.status = 'active'
              and (
                exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.user_id = (select auth.uid()))
                or (
                  coalesce(g.join_approval_required, false) = false
                  and not private.bajuju_is_group_banned(g.id, (select auth.uid()))
                )
              )
            )
          )
     );
$$;

-- Like e commenti: solo i membri (e gli Admin di Bajuju), in un gruppo attivo.
create or replace function private.bajuju_can_interact_group_board(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select (select auth.uid()) is not null
     and not public.is_user_blocked((select auth.uid()))
     and exists (
       select 1 from public.groups g
        where g.id = p_group_id
          and g.status = 'active'
          and (
            public.is_current_user_admin()
            or g.owner_id = (select auth.uid())
            or exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.user_id = (select auth.uid()))
          )
     );
$$;

create or replace function private.bajuju_group_of_post(p_post_id uuid)
returns uuid
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.group_id from public.group_posts p where p.id = p_post_id and p.deleted_at is null;
$$;

revoke all on function
  private.bajuju_group_role(uuid, uuid),
  private.bajuju_can_manage_group(uuid),
  private.bajuju_is_group_banned(uuid, uuid),
  private.bajuju_can_view_group_board(uuid),
  private.bajuju_can_interact_group_board(uuid),
  private.bajuju_group_of_post(uuid)
from public, anon;
-- La policy dello storage le richiama con i permessi dell'utente.
grant execute on function
  private.bajuju_group_role(uuid, uuid),
  private.bajuju_can_manage_group(uuid)
to authenticated;

------------------------------------------------------------------------
-- 4. Trigger
------------------------------------------------------------------------
-- Il proprietario ha sempre ruolo 'owner'; se la proprietà passa ad altri, il vecchio proprietario resta membro.
create or replace function private.bajuju_groups_ensure_owner_member()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.group_bans where group_id = new.id and user_id = new.owner_id;

  perform set_config('bajuju.role_change', 'on', true);

  insert into public.group_members(group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner'
    where public.group_members.role <> 'owner';

  update public.group_members
     set role = 'member'
   where group_id = new.id
     and role = 'owner'
     and user_id <> new.owner_id;

  perform set_config('bajuju.role_change', 'off', true);
  return new;
end;
$$;

-- Nessuno si assegna un ruolo da solo: chi entra è sempre 'member'. Chi è bloccato dal gruppo non rientra.
create or replace function private.bajuju_group_members_guard_role()
returns trigger
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.groups where id = new.group_id;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from v_owner and private.bajuju_is_group_banned(new.group_id, new.user_id) then
      raise exception 'BAJUJU_GROUP_BANNED';
    end if;
    if new.user_id = v_owner then
      new.role := 'owner';
    elsif current_setting('bajuju.role_change', true) is distinct from 'on' then
      new.role := 'member';
    elsif new.role = 'owner' then
      new.role := 'member';
    end if;
    return new;
  end if;

  if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id then
    raise exception 'BAJUJU_GROUP_ROLE_FORBIDDEN';
  end if;

  if new.role is distinct from old.role then
    if (select auth.uid()) is not null
       and current_setting('bajuju.role_change', true) is distinct from 'on' then
      raise exception 'BAJUJU_GROUP_ROLE_FORBIDDEN';
    end if;
    if new.user_id = v_owner then
      new.role := 'owner';
    elsif new.role = 'owner' then
      new.role := 'member';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_guard_role_trg on public.group_members;
create trigger group_members_guard_role_trg
  before insert or update on public.group_members
  for each row execute function private.bajuju_group_members_guard_role();

-- Modifiche al gruppo: si aggiunge solo il cambio colori da parte degli admin del gruppo (tramite set_group_colors).
create or replace function public.bajuju_groups_guard_owner_update()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  viewer_id uuid := (select auth.uid());
begin
  -- Operazioni interne del backend non hanno un utente auth.
  if viewer_id is null then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  -- set_group_colors ha già controllato che chi chiama sia un gestore del gruppo.
  if current_setting('bajuju.colors_change', true) = 'on'
     and (to_jsonb(new) - 'color_primary' - 'color_secondary' - 'updated_at')
         = (to_jsonb(old) - 'color_primary' - 'color_secondary' - 'updated_at') then
    return new;
  end if;

  if old.owner_id = viewer_id then
    -- Stato e campi di moderazione restano sempre sotto controllo Admin.
    if new.owner_id is distinct from old.owner_id
      or new.created_by is distinct from old.created_by
      or new.status is distinct from old.status
      or new.transferred_to_bajuju_at is distinct from old.transferred_to_bajuju_at
      or new.review_note is distinct from old.review_note
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Lo stato del gruppo può essere modificato solo da Bajuju.';
    end if;

    -- Prima dell'approvazione (o dopo un rifiuto) il creatore può correggere
    -- tutti i dati descrittivi. Dopo l'approvazione conserva le regole attuali:
    -- copertina e descrizione modificabili, gli altri dati richiedono Admin.
    if old.status not in ('pending', 'rejected') then
      if new.name is distinct from old.name
        or new.normalized_name is distinct from old.normalized_name
        or new.city is distinct from old.city
        or new.province is distinct from old.province
        or new.category is distinct from old.category
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
      then
        raise exception 'Dopo l’approvazione puoi modificare copertina e descrizione. Per gli altri dati contatta Bajuju.';
      end if;
    end if;

    return new;
  end if;

  raise exception 'Non puoi modificare questo gruppo.';
end;
$$;

-- Le notifiche di nuova richiesta arrivano al proprietario e agli admin del gruppo.
create or replace function private.bajuju_notify_owner_on_group_join_request()
returns trigger
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $$
declare
  v_owner_id uuid;
  v_group_name text;
  v_requester_name text;
  v_recipient uuid;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  -- L'utente che preme nuovamente "richiedi" mentre è già in attesa
  -- non deve generare notifiche duplicate.
  if tg_op = 'UPDATE' then
    if old.status = 'pending' then
      return new;
    end if;
  end if;

  select g.owner_id, g.name
    into v_owner_id, v_group_name
  from public.groups g
  where g.id = new.group_id
    and g.status = 'active'
    and g.join_approval_required = true;

  if v_owner_id is null then
    return new;
  end if;

  select coalesce(nullif(btrim(p.nickname), ''), 'Un utente Bajuju')
    into v_requester_name
  from public.profiles p
  where p.id = new.user_id;

  v_requester_name := coalesce(v_requester_name, 'Un utente Bajuju');

  for v_recipient in
    select v_owner_id
    union
    select gm.user_id from public.group_members gm
     where gm.group_id = new.group_id and gm.role = 'admin'
  loop
    if v_recipient = new.user_id then
      continue;
    end if;

    -- Un errore nel sistema di notifica non deve impedire l'iscrizione.
    begin
      insert into public.push_notification_logs (
        user_id, notification_type, type, title, body, data, status, success, is_read
      )
      values (
        v_recipient,
        'group_join_request',
        'group_join_request',
        'Nuova richiesta per il tuo gruppo',
        left(v_requester_name, 80) || ' vuole entrare in "' || left(v_group_name, 60) || '".',
        jsonb_build_object(
          'type', 'group_join_request',
          'screen', 'group-detail',
          'groupId', new.group_id::text,
          'section', 'requests',
          'requestUserId', new.user_id::text
        ),
        'in_app',
        null,
        false
      );
    exception when others then
      raise warning 'Bajuju: notifica nuova richiesta gruppo non registrata (SQLSTATE %)', SQLSTATE;
    end;
  end loop;

  return new;
end;
$$;

------------------------------------------------------------------------
-- 5. Funzioni esistenti aggiornate (stessa firma, stessi valori di ritorno)
------------------------------------------------------------------------
create or replace function public.request_group_join(p_group_id uuid)
returns text
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_owner_id uuid;
  v_status text;
  v_requires_approval boolean;
  v_min_age integer;
  v_max_age integer;
  v_age integer;
begin
  if v_user_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if public.is_user_blocked(v_user_id) then raise exception 'BAJUJU_USER_BLOCKED'; end if;

  select g.owner_id, g.status, coalesce(g.join_approval_required, false), g.min_age, g.max_age
    into v_owner_id, v_status, v_requires_approval, v_min_age, v_max_age
  from public.groups g
  where g.id = p_group_id;

  if not found then raise exception 'BAJUJU_GROUP_NOT_FOUND'; end if;
  if v_owner_id = v_user_id then return 'owner'; end if;
  if v_status <> 'active' then raise exception 'BAJUJU_GROUP_NOT_ACTIVE'; end if;
  if private.bajuju_is_group_banned(p_group_id, v_user_id) then raise exception 'BAJUJU_GROUP_BANNED'; end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_user_id
  ) then
    return 'joined';
  end if;

  select p.age into v_age
  from public.profiles p
  where p.id = v_user_id;

  if v_age is null or v_age < 18 or v_age > 80 then
    return 'age_required';
  end if;

  if (v_min_age is not null and v_age < v_min_age)
     or (v_max_age is not null and v_age > v_max_age) then
    return 'age_restricted';
  end if;

  if v_requires_approval then
    insert into public.group_join_requests (
      group_id, user_id, status, requested_at, responded_at, responded_by
    )
    values (p_group_id, v_user_id, 'pending', now(), null, null)
    on conflict (group_id, user_id) do update
      set status = 'pending',
          requested_at = now(),
          responded_at = null,
          responded_by = null;
    return 'pending';
  end if;

  insert into public.group_members (group_id, user_id)
  values (p_group_id, v_user_id)
  on conflict (group_id, user_id) do nothing;

  delete from public.group_join_requests
  where group_id = p_group_id and user_id = v_user_id;

  return 'joined';
end;
$$;

create or replace function public.review_group_join_request(p_group_id uuid, p_user_id uuid, p_accept boolean)
returns text
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_manager_id uuid := (select auth.uid());
  v_group_status text;
  v_min_age integer;
  v_max_age integer;
  v_age integer;
begin
  if v_manager_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;

  select g.status, g.min_age, g.max_age
    into v_group_status, v_min_age, v_max_age
  from public.groups g
  where g.id = p_group_id;

  if not found then raise exception 'BAJUJU_GROUP_NOT_FOUND'; end if;
  if v_group_status <> 'active' then raise exception 'BAJUJU_GROUP_NOT_ACTIVE'; end if;

  if not exists (
    select 1 from public.group_join_requests r
    where r.group_id = p_group_id
      and r.user_id = p_user_id
      and r.status = 'pending'
  ) then
    raise exception 'BAJUJU_JOIN_REQUEST_NOT_PENDING';
  end if;

  if p_accept then
    if private.bajuju_is_group_banned(p_group_id, p_user_id) then
      raise exception 'BAJUJU_GROUP_BANNED';
    end if;

    select p.age into v_age
    from public.profiles p
    where p.id = p_user_id;

    if v_age is null or v_age < 18 or v_age > 80 then
      raise exception 'BAJUJU_PROFILE_AGE_REQUIRED';
    end if;

    if (v_min_age is not null and v_age < v_min_age)
       or (v_max_age is not null and v_age > v_max_age) then
      raise exception 'BAJUJU_AGE_RESTRICTED';
    end if;

    insert into public.group_members (group_id, user_id)
    values (p_group_id, p_user_id)
    on conflict (group_id, user_id) do nothing;

    update public.group_join_requests
      set status = 'approved', responded_at = now(), responded_by = v_manager_id
    where group_id = p_group_id and user_id = p_user_id;

    return 'approved';
  end if;

  update public.group_join_requests
    set status = 'rejected', responded_at = now(), responded_by = v_manager_id
  where group_id = p_group_id and user_id = p_user_id;

  return 'rejected';
end;
$$;

create or replace function public.get_group_join_requests(p_group_id uuid)
returns table(user_id uuid, nickname text, avatar_url text, age_range text, gender text, origin text, requested_at timestamptz)
language plpgsql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.nickname,
    p.avatar_url,
    coalesce(p.age::text, p.age_range),
    p.gender,
    coalesce(
      nullif(trim(p.location_profile_text), ''),
      nullif(trim(p.city), ''),
      nullif(trim(p.province), ''),
      ''
    ) as origin,
    r.requested_at
  from public.group_join_requests r
  join public.profiles p on p.id = r.user_id
  where r.group_id = p_group_id
    and r.status = 'pending'
    and coalesce(p.is_deleted, false) = false
  order by r.requested_at asc;
end;
$$;

-- Stato ingresso: in più restituisce 'banned' per chi è stato bloccato dal gruppo.
create or replace function public.get_group_join_state(p_group_id uuid)
returns text
language plpgsql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_owner_id uuid;
  v_request_status text;
begin
  if v_user_id is null then
    return 'none';
  end if;

  select g.owner_id into v_owner_id
  from public.groups g
  where g.id = p_group_id;

  if not found then
    return 'none';
  end if;

  if v_owner_id = v_user_id then
    return 'owner';
  end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_user_id
  ) then
    return 'joined';
  end if;

  if private.bajuju_is_group_banned(p_group_id, v_user_id) then
    return 'banned';
  end if;

  select r.status into v_request_status
  from public.group_join_requests r
  where r.group_id = p_group_id
    and r.user_id = v_user_id;

  return coalesce(v_request_status, 'none');
end;
$$;

-- Le richieste restano visibili anche agli admin del gruppo.
drop policy if exists "Richieste gruppo visibili in modo limitato" on public.group_join_requests;
create policy "Richieste gruppo visibili in modo limitato" on public.group_join_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or private.bajuju_can_manage_group(group_id));

-- Foto del gruppo (copertina e bacheca): percorso groups/<group_id>/<user_id>-..., ora anche per gli admin del gruppo.
drop policy if exists event_photos_insert_members_only on storage.objects;
create policy event_photos_insert_members_only on storage.objects
  as restrictive
  for insert to authenticated
  with check (
    (bucket_id <> 'event-photos'::text)
    or (
      (storage.filename(name) ~~ (((select auth.uid())::text) || '-%'::text))
      and (
        (
          ((storage.foldername(name))[1] <> 'groups'::text)
          and exists (
            select 1 from public.activities a
             where (a.id)::text = (storage.foldername(objects.name))[1]
               and a.deleted_at is null
               and (
                 a.creator_id = (select auth.uid())
                 or public.is_current_user_admin()
                 or exists (
                   select 1 from public.activity_participants ap
                    where ap.activity_id = a.id
                      and ap.user_id = (select auth.uid())
                      and ap.status = 'partecipo'::participation_status
                 )
               )
          )
        )
        or (
          ((storage.foldername(name))[1] = 'groups'::text)
          and exists (
            select 1 from public.groups g
             where (g.id)::text = (storage.foldername(objects.name))[2]
               and private.bajuju_can_manage_group(g.id)
          )
        )
      )
    )
  );

------------------------------------------------------------------------
-- 6. RPC nuove: ruoli, membri, espulsioni, colori
------------------------------------------------------------------------
create or replace function public.get_my_group_role(p_group_id uuid)
returns text
language sql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select private.bajuju_group_role(p_group_id, (select auth.uid()));
$$;

create or replace function public.get_group_members_with_roles(p_group_id uuid)
returns table(user_id uuid, nickname text, avatar_url text, age_range text, origin text, role text, joined_at timestamptz)
language sql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    p.id,
    p.nickname,
    p.avatar_url,
    p.age_range,
    coalesce(
      nullif(trim(p.location_profile_text), ''),
      nullif(trim(p.city), ''),
      nullif(trim(p.province), ''),
      ''
    ) as origin,
    case when g.owner_id = gm.user_id then 'owner' else gm.role end as role,
    gm.joined_at
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and (select auth.uid()) is not null
    and (g.status = 'active' or private.bajuju_can_manage_group(g.id))
    and coalesce(p.is_deleted, false) = false
    and not private.bajuju_users_block_each_other((select auth.uid()), p.id)
  order by
    case when g.owner_id = gm.user_id then 0 when gm.role = 'admin' then 1 else 2 end,
    lower(coalesce(p.nickname, '')),
    gm.joined_at;
$$;

-- Solo il proprietario (o un Admin di Bajuju) nomina o toglie gli admin.
create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns text
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_caller uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_caller is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if p_role not in ('admin', 'member') then raise exception 'BAJUJU_GROUP_ROLE_INVALID'; end if;

  select owner_id into v_owner from public.groups where id = p_group_id;
  if not found then raise exception 'BAJUJU_GROUP_NOT_FOUND'; end if;

  if not (v_owner = v_caller or public.is_current_user_admin()) then
    raise exception 'BAJUJU_ONLY_OWNER_CAN_SET_ROLES';
  end if;
  if p_user_id = v_owner then raise exception 'BAJUJU_CANNOT_CHANGE_OWNER'; end if;

  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'BAJUJU_NOT_GROUP_MEMBER';
  end if;

  perform set_config('bajuju.role_change', 'on', true);
  update public.group_members set role = p_role
   where group_id = p_group_id and user_id = p_user_id;
  perform set_config('bajuju.role_change', 'off', true);

  return p_role;
end;
$$;

-- "Rimuovi dal gruppo" (p_ban = false) oppure "Rimuovi e blocca" (p_ban = true).
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid, p_ban boolean default false)
returns text
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_caller uuid := (select auth.uid());
  v_owner uuid;
  v_caller_role text;
  v_target_role text;
begin
  if v_caller is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  select owner_id into v_owner from public.groups where id = p_group_id;
  if not found then raise exception 'BAJUJU_GROUP_NOT_FOUND'; end if;

  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;
  if p_user_id = v_owner then raise exception 'BAJUJU_CANNOT_REMOVE_OWNER'; end if;
  if p_user_id = v_caller then raise exception 'BAJUJU_CANNOT_REMOVE_SELF'; end if;

  v_caller_role := case when public.is_current_user_admin() then 'owner'
                        else private.bajuju_group_role(p_group_id, v_caller) end;
  select role into v_target_role from public.group_members
   where group_id = p_group_id and user_id = p_user_id;

  if v_target_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'BAJUJU_ADMIN_CANNOT_REMOVE_ADMIN';
  end if;
  if v_target_role is null and not coalesce(p_ban, false) then
    raise exception 'BAJUJU_NOT_GROUP_MEMBER';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;

  if coalesce(p_ban, false) then
    delete from public.group_join_requests where group_id = p_group_id and user_id = p_user_id;
    insert into public.group_bans (group_id, user_id, banned_by)
    values (p_group_id, p_user_id, v_caller)
    on conflict (group_id, user_id) do update set banned_by = excluded.banned_by, created_at = now();
    return 'banned';
  end if;

  -- Può chiedere di rientrare: una vecchia richiesta "approvata" non deve restare.
  delete from public.group_join_requests
   where group_id = p_group_id and user_id = p_user_id and status <> 'pending';
  return 'removed';
end;
$$;

create or replace function public.get_group_bans(p_group_id uuid)
returns table(user_id uuid, nickname text, avatar_url text, banned_at timestamptz, banned_by_nickname text)
language plpgsql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
begin
  if (select auth.uid()) is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;

  return query
  select b.user_id, p.nickname, p.avatar_url, b.created_at, bp.nickname
    from public.group_bans b
    join public.profiles p on p.id = b.user_id
    left join public.profiles bp on bp.id = b.banned_by
   where b.group_id = p_group_id
   order by b.created_at desc;
end;
$$;

create or replace function public.unban_group_user(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
begin
  if (select auth.uid()) is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;
  delete from public.group_bans where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- Colori del gruppo: null = colori standard di Bajuju.
create or replace function public.set_group_colors(p_group_id uuid, p_primary text, p_secondary text)
returns void
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_primary text := nullif(upper(btrim(coalesce(p_primary, ''))), '');
  v_secondary text := nullif(upper(btrim(coalesce(p_secondary, ''))), '');
begin
  if (select auth.uid()) is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'BAJUJU_GROUP_NOT_FOUND';
  end if;
  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;
  if (v_primary is not null and v_primary !~ '^#[0-9A-F]{6}$')
     or (v_secondary is not null and v_secondary !~ '^#[0-9A-F]{6}$') then
    raise exception 'BAJUJU_GROUP_COLOR_INVALID';
  end if;

  perform set_config('bajuju.colors_change', 'on', true);
  update public.groups
     set color_primary = v_primary,
         color_secondary = v_secondary
   where id = p_group_id;
  perform set_config('bajuju.colors_change', 'off', true);
end;
$$;

------------------------------------------------------------------------
-- 7. RPC nuove: bacheca
------------------------------------------------------------------------
-- Fissati in cima (solo nella prima pagina), poi gli altri dal più recente.
-- p_before = created_at dell'ultimo post non fissato già mostrato.
create or replace function public.get_group_posts(p_group_id uuid, p_limit integer default 20, p_before timestamptz default null)
returns table(
  id uuid,
  group_id uuid,
  author_id uuid,
  author_nickname text,
  author_avatar_url text,
  author_role text,
  body text,
  image_urls text[],
  is_pinned boolean,
  pinned_at timestamptz,
  created_at timestamptz,
  like_count integer,
  comment_count integer,
  liked_by_me boolean,
  can_manage boolean
)
language plpgsql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user uuid := (select auth.uid());
  v_can_manage boolean;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if not private.bajuju_can_view_group_board(p_group_id) then
    return;
  end if;
  v_can_manage := private.bajuju_can_manage_group(p_group_id);

  return query
  with picked as (
    (select gp.* from public.group_posts gp
      where gp.group_id = p_group_id and gp.deleted_at is null and gp.is_pinned and p_before is null)
    union all
    (select gp.* from public.group_posts gp
      where gp.group_id = p_group_id and gp.deleted_at is null and not gp.is_pinned
        and (p_before is null or gp.created_at < p_before)
      order by gp.created_at desc
      limit v_limit)
  )
  select
    x.id,
    x.group_id,
    x.author_id,
    p.nickname,
    p.avatar_url,
    private.bajuju_group_role(x.group_id, x.author_id),
    x.body,
    x.image_urls,
    x.is_pinned,
    x.pinned_at,
    x.created_at,
    (select count(*)::int from public.group_post_likes l where l.post_id = x.id),
    (select count(*)::int from public.group_post_comments c
      where c.post_id = x.id and not private.bajuju_users_block_each_other(v_user, c.user_id)),
    exists (select 1 from public.group_post_likes l where l.post_id = x.id and l.user_id = v_user),
    v_can_manage
  from picked x
  left join public.profiles p on p.id = x.author_id
  order by x.is_pinned desc, x.pinned_at desc nulls last, x.created_at desc;
end;
$$;

create or replace function public.create_group_post(p_group_id uuid, p_body text, p_image_urls text[] default '{}')
returns uuid
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_images text[] := coalesce(p_image_urls, '{}');
  v_url text;
  v_id uuid;
begin
  if v_user is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if public.is_user_blocked(v_user) then raise exception 'BAJUJU_USER_BLOCKED'; end if;
  if not exists (select 1 from public.groups where id = p_group_id and status = 'active') then
    raise exception 'BAJUJU_GROUP_NOT_ACTIVE';
  end if;
  if not private.bajuju_can_manage_group(p_group_id) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;
  if char_length(v_body) > 2000 then raise exception 'BAJUJU_POST_TOO_LONG'; end if;
  if cardinality(v_images) > 6 then raise exception 'BAJUJU_POST_TOO_MANY_IMAGES'; end if;
  if char_length(v_body) = 0 and cardinality(v_images) = 0 then raise exception 'BAJUJU_POST_EMPTY'; end if;

  -- Solo foto caricate nella cartella di questo gruppo.
  foreach v_url in array v_images loop
    if position(('/storage/v1/object/public/event-photos/groups/' || p_group_id::text || '/') in v_url) = 0 then
      raise exception 'BAJUJU_POST_IMAGE_INVALID';
    end if;
  end loop;

  insert into public.group_posts (group_id, author_id, body, image_urls)
  values (p_group_id, v_user, v_body, v_images)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_group_post_pinned(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_group uuid := private.bajuju_group_of_post(p_post_id);
begin
  if (select auth.uid()) is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if v_group is null then raise exception 'BAJUJU_POST_NOT_FOUND'; end if;
  if not private.bajuju_can_manage_group(v_group) then raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN'; end if;

  update public.group_posts
     set is_pinned = coalesce(p_pinned, false),
         pinned_at = case when coalesce(p_pinned, false) then now() else null end,
         updated_at = now()
   where id = p_post_id;
end;
$$;

create or replace function public.delete_group_post(p_post_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_group uuid := private.bajuju_group_of_post(p_post_id);
begin
  if (select auth.uid()) is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if v_group is null then raise exception 'BAJUJU_POST_NOT_FOUND'; end if;
  if not private.bajuju_can_manage_group(v_group) then raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN'; end if;

  update public.group_posts
     set deleted_at = now(), is_pinned = false, pinned_at = null, updated_at = now()
   where id = p_post_id;
end;
$$;

create or replace function public.toggle_group_post_like(p_post_id uuid)
returns boolean
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user uuid := (select auth.uid());
  v_group uuid := private.bajuju_group_of_post(p_post_id);
begin
  if v_user is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if v_group is null then raise exception 'BAJUJU_POST_NOT_FOUND'; end if;
  if not private.bajuju_can_interact_group_board(v_group) then raise exception 'BAJUJU_GROUP_MEMBERS_ONLY'; end if;

  delete from public.group_post_likes where post_id = p_post_id and user_id = v_user;
  if found then
    return false;
  end if;

  insert into public.group_post_likes (post_id, user_id) values (p_post_id, v_user)
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.get_group_post_comments(p_post_id uuid)
returns table(id uuid, user_id uuid, nickname text, avatar_url text, role text, body text, created_at timestamptz, can_delete boolean)
language plpgsql stable security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user uuid := (select auth.uid());
  v_group uuid := private.bajuju_group_of_post(p_post_id);
  v_can_manage boolean;
begin
  if v_group is null or not private.bajuju_can_view_group_board(v_group) then
    return;
  end if;
  v_can_manage := private.bajuju_can_manage_group(v_group);

  return query
  select c.id, c.user_id, p.nickname, p.avatar_url,
         private.bajuju_group_role(v_group, c.user_id),
         c.body, c.created_at,
         (c.user_id = v_user or v_can_manage)
    from public.group_post_comments c
    left join public.profiles p on p.id = c.user_id
   where c.post_id = p_post_id
     and not private.bajuju_users_block_each_other(v_user, c.user_id)
   order by c.created_at asc;
end;
$$;

create or replace function public.add_group_post_comment(p_post_id uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user uuid := (select auth.uid());
  v_group uuid := private.bajuju_group_of_post(p_post_id);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_user is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;
  if v_group is null then raise exception 'BAJUJU_POST_NOT_FOUND'; end if;
  if not private.bajuju_can_interact_group_board(v_group) then raise exception 'BAJUJU_GROUP_MEMBERS_ONLY'; end if;
  if char_length(v_body) = 0 then raise exception 'BAJUJU_COMMENT_EMPTY'; end if;
  if char_length(v_body) > 1000 then raise exception 'BAJUJU_COMMENT_TOO_LONG'; end if;

  insert into public.group_post_comments (post_id, user_id, body)
  values (p_post_id, v_user, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_group_post_comment(p_comment_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
declare
  v_user uuid := (select auth.uid());
  v_author uuid;
  v_group uuid;
begin
  if v_user is null then raise exception 'BAJUJU_AUTH_REQUIRED'; end if;

  select c.user_id, gp.group_id into v_author, v_group
    from public.group_post_comments c
    join public.group_posts gp on gp.id = c.post_id
   where c.id = p_comment_id;
  if not found then raise exception 'BAJUJU_COMMENT_NOT_FOUND'; end if;

  if not (v_author = v_user or private.bajuju_can_manage_group(v_group)) then
    raise exception 'BAJUJU_GROUP_MANAGE_FORBIDDEN';
  end if;

  delete from public.group_post_comments where id = p_comment_id;
end;
$$;

------------------------------------------------------------------------
-- 8. Permessi sulle funzioni pubbliche
------------------------------------------------------------------------
revoke all on function
  public.get_my_group_role(uuid),
  public.get_group_members_with_roles(uuid),
  public.set_group_member_role(uuid, uuid, text),
  public.remove_group_member(uuid, uuid, boolean),
  public.get_group_bans(uuid),
  public.unban_group_user(uuid, uuid),
  public.set_group_colors(uuid, text, text),
  public.get_group_posts(uuid, integer, timestamptz),
  public.create_group_post(uuid, text, text[]),
  public.set_group_post_pinned(uuid, boolean),
  public.delete_group_post(uuid),
  public.toggle_group_post_like(uuid),
  public.get_group_post_comments(uuid),
  public.add_group_post_comment(uuid, text),
  public.delete_group_post_comment(uuid)
from public, anon;

grant execute on function
  public.get_my_group_role(uuid),
  public.get_group_members_with_roles(uuid),
  public.set_group_member_role(uuid, uuid, text),
  public.remove_group_member(uuid, uuid, boolean),
  public.get_group_bans(uuid),
  public.unban_group_user(uuid, uuid),
  public.set_group_colors(uuid, text, text),
  public.get_group_posts(uuid, integer, timestamptz),
  public.create_group_post(uuid, text, text[]),
  public.set_group_post_pinned(uuid, boolean),
  public.delete_group_post(uuid),
  public.toggle_group_post_like(uuid),
  public.get_group_post_comments(uuid),
  public.add_group_post_comment(uuid, text),
  public.delete_group_post_comment(uuid)
to authenticated;
