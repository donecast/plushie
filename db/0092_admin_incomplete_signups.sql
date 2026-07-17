-- ============================================================
-- Plushie tracker — migration 0092: incomplete sign-ups view
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
-- Some people create an auth account (magic-link sign-up) but never finish:
-- they either don't click the verification link, or they sign in once and
-- bail before choosing a username — so no profiles row is ever created.
-- Those accounts are invisible in the admin Users list (which is built from
-- profiles). This admin-only RPC surfaces them so we can see who started but
-- didn't complete, and reach out.
--
-- SECURITY DEFINER + is_admin() gate, exactly like admin_user_overview():
-- only admins can read auth.users email here.
-- ============================================================

create or replace function admin_incomplete_signups()
returns table(
  id               uuid,
  email            text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  confirmed        boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    return;
  end if;
  return query
    select
      u.id,
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at is not null) as confirmed
    from auth.users u
    left join profiles p on p.id = u.id
    where p.id is null
    order by u.created_at desc;
end;
$$;
grant execute on function admin_incomplete_signups() to authenticated;
revoke execute on function admin_incomplete_signups() from anon, public;

-- Sanity check.
do $$ begin raise notice 'admin_incomplete_signups() created (db/0092 applied).'; end $$;
