-- 0026_username_cooldown.sql
-- Item 8: changing your username is fine — doing it more than once every
-- 30 days is not. We track when the username last changed and enforce the
-- cooldown in a BEFORE UPDATE trigger so it can't be bypassed from the client.

alter table profiles
  add column if not exists username_updated_at timestamptz;

-- Reject a username change that lands inside the 30-day window, and stamp the
-- change time on every successful rename. Other profile edits (bio, avatar)
-- are untouched because we only act when the username actually changes.
create or replace function enforce_username_cooldown()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    if old.username_updated_at is not null
       and old.username_updated_at > now() - interval '30 days' then
      raise exception 'username_cooldown: username can only change once every 30 days (next change allowed %)',
        to_char(old.username_updated_at + interval '30 days', 'YYYY-MM-DD');
    end if;
    new.username_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_username_cooldown on profiles;
create trigger trg_username_cooldown
  before update on profiles
  for each row
  execute function enforce_username_cooldown();
