-- ============================================================
-- Plushie tracker — migration 0093: delete an incomplete sign-up
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
-- db/0092 surfaced auth accounts that never became members (no profiles
-- row). This adds the admin-only RPC to blow one away: delete the auth.users
-- row for a sign-up that never finished.
--
-- Hard guardrail: it REFUSES to delete anything that has a profiles row, so
-- this RPC can only ever touch a genuinely incomplete sign-up — never a real
-- member (that's what admin_purge_user + its cascade is for). SECURITY
-- DEFINER + is_admin() gate, same shape as admin_incomplete_signups().
-- ============================================================

create or replace function admin_delete_incomplete_signup(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not is_admin() then
    raise exception 'forbidden: admin required';
  end if;
  if target is null then
    raise exception 'target required';
  end if;
  if target = auth.uid() then
    raise exception 'cannot delete your own account through this RPC';
  end if;
  -- The whole point: only ever remove a sign-up that never became a member.
  -- If a profiles row exists, this is a real account — refuse and point the
  -- caller at the proper purge path.
  if exists (select 1 from profiles where id = target) then
    raise exception 'target % has a profile — use admin_purge_user, not this RPC', target;
  end if;

  raise notice 'admin_delete_incomplete_signup: % deleting incomplete sign-up %', auth.uid(), target;
  delete from auth.users where id = target;
end;
$$;

revoke all on function admin_delete_incomplete_signup(uuid) from public;
grant execute on function admin_delete_incomplete_signup(uuid) to authenticated;

-- Sanity check.
do $$ begin raise notice 'admin_delete_incomplete_signup() created (db/0093 applied).'; end $$;
