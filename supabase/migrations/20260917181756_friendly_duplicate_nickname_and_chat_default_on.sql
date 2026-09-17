create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nickname text;
  v_constraint text;
begin
  v_nickname := coalesce(new.raw_user_meta_data->>'nickname', 'Nuovo utente');

  if exists (
    select 1
    from public.profiles p
    where p.nickname is not null
      and trim(p.nickname) <> ''
      and lower(trim(p.nickname)) = lower(trim(v_nickname))
  ) then
    raise exception using
      errcode = '23505',
      message = 'Questo nome utente è già in uso. Scegline un altro.';
  end if;

  begin
    insert into public.profiles (
      id,
      nickname,
      city,
      area,
      age_range,
      interests
    )
    values (
      new.id,
      v_nickname,
      new.raw_user_meta_data->>'city',
      new.raw_user_meta_data->>'area',
      new.raw_user_meta_data->>'age_range',
      array[]::text[]
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'profiles_nickname_unique_lower_idx' then
        raise exception using
          errcode = '23505',
          message = 'Questo nome utente è già in uso. Scegline un altro.';
      end if;
      raise;
  end;

  return new;
end;
$$;

alter table public.notification_preferences
  alter column notify_chat_messages set default true;
