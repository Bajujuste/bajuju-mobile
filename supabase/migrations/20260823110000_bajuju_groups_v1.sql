-- Bajuju Groups v1
-- Gruppi separati da Flash: community, membership, associazione esperienze,
-- privacy iscritti, nomi unici/simili e trasferimento automatico a Bajuju.

create schema if not exists extensions;
create schema if not exists private;

create extension if not exists pg_trgm with schema extensions;

do $$
declare
  current_schema text;
begin
  select n.nspname into current_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if current_schema is distinct from 'extensions' then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end $$;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  description text not null default '',
  city text,
  province text,
  category text,
  cover_url text,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  transferred_to_bajuju_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_length_chk check (char_length(trim(name)) between 3 and 60),
  constraint groups_description_length_chk check (char_length(description) <= 500)
);

create unique index if not exists groups_normalized_name_uq
  on public.groups (normalized_name);
create index if not exists groups_owner_id_idx
  on public.groups (owner_id);
create index if not exists groups_status_created_idx
  on public.groups (status, created_at desc);
create index if not exists groups_normalized_name_trgm_idx
  on public.groups using gin (normalized_name extensions.gin_trgm_ops);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

create table if not exists public.group_activities (
  group_id uuid not null references public.groups(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  linked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, activity_id)
);

create index if not exists group_activities_activity_id_idx
  on public.group_activities (activity_id);

create or replace function public.bajuju_normalize_group_name(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g'));
$$;

create or replace function public.bajuju_group_name_signature(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(
    regexp_replace(
      public.bajuju_normalize_group_name(value),
      '\s+(ufficiale|official|vero|vera|originale|original|nuovo|nuova)$',
      '',
      'g'
    )
  );
$$;

create or replace function public.bajuju_groups_prepare_name()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  normalized text;
  signature text;
  conflicting_name text;
begin
  normalized := public.bajuju_normalize_group_name(new.name);
  signature := public.bajuju_group_name_signature(new.name);

  if char_length(normalized) < 3 then
    raise exception 'Il nome del gruppo è troppo corto.';
  end if;

  new.name := trim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.normalized_name := normalized;

  select g.name into conflicting_name
  from public.groups g
  where g.id is distinct from new.id
    and (
      g.normalized_name = normalized
      or public.bajuju_group_name_signature(g.name) = signature
      or extensions.similarity(g.normalized_name, normalized) >= 0.80
    )
  order by extensions.similarity(g.normalized_name, normalized) desc
  limit 1;

  if conflicting_name is not null then
    raise exception 'Esiste già un gruppo con un nome uguale o troppo simile: %', conflicting_name;
  end if;

  return new;
end;
$$;

create or replace function public.bajuju_groups_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.bajuju_main_admin_id()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.is_admin = true
    and coalesce(p.is_deleted, false) = false
  order by
    case when lower(trim(p.nickname)) = 'bajuju' then 0 else 1 end,
    p.created_at asc
  limit 1;
$$;

create or replace function public.bajuju_groups_validate_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.owner_id
      and coalesce(p.is_deleted, false) = false
      and (p.is_admin = true or p.is_premium_organizer = true)
  ) then
    raise exception 'Il proprietario del gruppo deve essere Admin o Organizzatore Premium.';
  end if;
  return new;
end;
$$;

create or replace function private.bajuju_groups_ensure_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.group_members(group_id, user_id)
  values (new.id, new.owner_id)
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function private.bajuju_transfer_owned_groups_to_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  admin_id uuid;
  should_transfer boolean := false;
begin
  if tg_op = 'DELETE' then
    should_transfer := true;
  else
    should_transfer := (
      (old.is_premium_organizer = true and new.is_premium_organizer = false)
      or (coalesce(old.is_deleted, false) = false and coalesce(new.is_deleted, false) = true)
      or (old.deletion_requested_at is null and new.deletion_requested_at is not null)
    );
  end if;

  if not should_transfer then
    return coalesce(new, old);
  end if;

  admin_id := public.bajuju_main_admin_id();
  if admin_id is null then
    raise exception 'Admin principale Bajuju non trovato: impossibile trasferire i gruppi.';
  end if;

  if admin_id <> old.id then
    update public.groups
    set owner_id = admin_id,
        transferred_to_bajuju_at = now(),
        updated_at = now()
    where owner_id = old.id;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function private.bajuju_group_member_profiles(p_group_id uuid, p_viewer_id uuid)
returns table(user_id uuid, nickname text, age_range text, origin text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.nickname,
    p.age_range,
    coalesce(
      nullif(trim(p.location_profile_text), ''),
      nullif(trim(p.city), ''),
      nullif(trim(p.province), ''),
      ''
    ) as origin
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = p_group_id
    and g.status = 'active'
    and p_viewer_id = (select auth.uid())
    and coalesce(p.is_deleted, false) = false
    and not exists (
      select 1
      from public.user_blocks ub
      where (ub.blocker_id = p_viewer_id and ub.blocked_id = p.id)
         or (ub.blocker_id = p.id and ub.blocked_id = p_viewer_id)
    )
  order by lower(p.nickname);
$$;

create or replace function private.bajuju_groups_discovery(
  p_viewer_id uuid,
  p_limit integer default 60,
  p_owner_id uuid default null
)
returns table(
  id uuid,
  name text,
  description text,
  city text,
  province text,
  category text,
  cover_url text,
  owner_id uuid,
  member_count bigint,
  joined_by_me boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    g.id,
    g.name,
    g.description,
    g.city,
    g.province,
    g.category,
    g.cover_url,
    g.owner_id,
    count(gm.user_id)::bigint as member_count,
    bool_or(gm.user_id = p_viewer_id) as joined_by_me,
    g.created_at
  from public.groups g
  left join public.group_members gm on gm.group_id = g.id
  where p_viewer_id = (select auth.uid())
    and g.status = 'active'
    and (p_owner_id is null or g.owner_id = p_owner_id)
  group by g.id
  order by g.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100));
$$;

create or replace function public.get_group_member_profiles(p_group_id uuid)
returns table(user_id uuid, nickname text, age_range text, origin text)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select *
  from private.bajuju_group_member_profiles(p_group_id, (select auth.uid()));
$$;

create or replace function public.get_bajuju_groups(
  p_limit integer default 60,
  p_owner_id uuid default null
)
returns table(
  id uuid,
  name text,
  description text,
  city text,
  province text,
  category text,
  cover_url text,
  owner_id uuid,
  member_count bigint,
  joined_by_me boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select *
  from private.bajuju_groups_discovery((select auth.uid()), p_limit, p_owner_id);
$$;

-- Triggers

drop trigger if exists groups_prepare_name_trg on public.groups;
create trigger groups_prepare_name_trg
before insert or update of name on public.groups
for each row execute function public.bajuju_groups_prepare_name();

drop trigger if exists groups_updated_at_trg on public.groups;
create trigger groups_updated_at_trg
before update on public.groups
for each row execute function public.bajuju_groups_set_updated_at();

drop trigger if exists groups_validate_owner_trg on public.groups;
create trigger groups_validate_owner_trg
before insert or update of owner_id on public.groups
for each row execute function public.bajuju_groups_validate_owner();

drop trigger if exists groups_owner_member_insert_trg on public.groups;
create trigger groups_owner_member_insert_trg
after insert on public.groups
for each row execute function private.bajuju_groups_ensure_owner_member();

drop trigger if exists groups_owner_member_update_trg on public.groups;
create trigger groups_owner_member_update_trg
after update of owner_id on public.groups
for each row
when (old.owner_id is distinct from new.owner_id)
execute function private.bajuju_groups_ensure_owner_member();

drop trigger if exists profiles_transfer_groups_update_trg on public.profiles;
create trigger profiles_transfer_groups_update_trg
after update of is_premium_organizer, is_deleted, deletion_requested_at on public.profiles
for each row execute function private.bajuju_transfer_owned_groups_to_admin();

drop trigger if exists profiles_transfer_groups_delete_trg on public.profiles;
create trigger profiles_transfer_groups_delete_trg
before delete on public.profiles
for each row execute function private.bajuju_transfer_owned_groups_to_admin();

-- RLS + grants

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_activities enable row level security;

revoke all on table public.groups, public.group_members, public.group_activities from anon, authenticated;
grant select, insert, update, delete on table public.groups to authenticated;
grant select, insert, delete on table public.group_members to authenticated;
grant select, insert, delete on table public.group_activities to authenticated;

drop policy if exists "Gruppi visibili agli autenticati" on public.groups;
create policy "Gruppi visibili agli autenticati"
on public.groups for select to authenticated
using (
  status = 'active'
  or owner_id = (select auth.uid())
  or is_current_user_admin()
);

drop policy if exists "Premium e admin possono creare gruppi" on public.groups;
create policy "Premium e admin possono creare gruppi"
on public.groups for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_deleted, false) = false
      and (p.is_admin = true or p.is_premium_organizer = true)
  )
);

drop policy if exists "Proprietario o admin modifica gruppo" on public.groups;
create policy "Proprietario o admin modifica gruppo"
on public.groups for update to authenticated
using (owner_id = (select auth.uid()) or is_current_user_admin())
with check (owner_id = (select auth.uid()) or is_current_user_admin());

drop policy if exists "Proprietario o admin elimina gruppo" on public.groups;
create policy "Proprietario o admin elimina gruppo"
on public.groups for delete to authenticated
using (owner_id = (select auth.uid()) or is_current_user_admin());

drop policy if exists "Iscrizioni gruppi visibili agli autenticati" on public.group_members;
drop policy if exists "Iscrizioni gruppo visibili in modo limitato" on public.group_members;
create policy "Iscrizioni gruppo visibili in modo limitato"
on public.group_members for select to authenticated
using (
  user_id = (select auth.uid())
  or is_current_user_admin()
  or exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.owner_id = (select auth.uid())
  )
);

drop policy if exists "Utente può iscriversi a gruppo" on public.group_members;
create policy "Utente può iscriversi a gruppo"
on public.group_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and is_user_blocked((select auth.uid())) = false
  and exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.status = 'active'
  )
);

drop policy if exists "Utente proprietario o admin può rimuovere iscrizione" on public.group_members;
create policy "Utente proprietario o admin può rimuovere iscrizione"
on public.group_members for delete to authenticated
using (
  is_current_user_admin()
  or (
    user_id = (select auth.uid())
    and not exists (
      select 1
      from public.groups g
      where g.id = group_id
        and g.owner_id = (select auth.uid())
    )
  )
  or exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.owner_id = (select auth.uid())
      and user_id <> (select auth.uid())
  )
);

drop policy if exists "Associazioni gruppi esperienze visibili" on public.group_activities;
create policy "Associazioni gruppi esperienze visibili"
on public.group_activities for select to authenticated
using (true);

drop policy if exists "Proprietario collega propria esperienza" on public.group_activities;
create policy "Proprietario collega propria esperienza"
on public.group_activities for insert to authenticated
with check (
  linked_by = (select auth.uid())
  and (
    is_current_user_admin()
    or (
      exists (
        select 1
        from public.groups g
        where g.id = group_id
          and g.owner_id = (select auth.uid())
      )
      and exists (
        select 1
        from public.activities a
        where a.id = activity_id
          and a.creator_id = (select auth.uid())
      )
    )
  )
);

drop policy if exists "Proprietario o admin scollega esperienza" on public.group_activities;
create policy "Proprietario o admin scollega esperienza"
on public.group_activities for delete to authenticated
using (
  is_current_user_admin()
  or exists (
    select 1
    from public.groups g
    where g.id = group_id
      and g.owner_id = (select auth.uid())
  )
);

-- Function privileges. Internal trigger/helper functions are not client-callable.
revoke all on function public.bajuju_normalize_group_name(text) from public, anon, authenticated;
revoke all on function public.bajuju_group_name_signature(text) from public, anon, authenticated;
revoke all on function public.bajuju_groups_prepare_name() from public, anon, authenticated;
revoke all on function public.bajuju_groups_set_updated_at() from public, anon, authenticated;
revoke all on function public.bajuju_groups_validate_owner() from public, anon, authenticated;
revoke all on function private.bajuju_groups_ensure_owner_member() from public, anon, authenticated;
revoke all on function private.bajuju_transfer_owned_groups_to_admin() from public, anon, authenticated;
revoke all on function private.bajuju_group_member_profiles(uuid, uuid) from public, anon, authenticated;
revoke all on function private.bajuju_groups_discovery(uuid, integer, uuid) from public, anon, authenticated;

revoke all on function public.get_group_member_profiles(uuid) from public, anon;
grant execute on function public.get_group_member_profiles(uuid) to authenticated;
revoke all on function public.get_bajuju_groups(integer, uuid) from public, anon;
grant execute on function public.get_bajuju_groups(integer, uuid) to authenticated;
