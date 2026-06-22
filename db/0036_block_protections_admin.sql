-- 0036_block_protections_admin.sql
-- Two block-system tweaks for the admin era. Paste into the Supabase SQL
-- Editor and run. Safe to re-run.
--
-- 1. Protected users (admins + the redrambler moderator account) can NEVER
--    be blocked by anyone. Enforced in the user_blocks INSERT policy so it
--    holds regardless of client. Any pre-existing blocks against them are
--    swept on apply.
-- 2. Admins can READ every block row (the per-user admin view lists a
--    collector's blocks-initiated and blocked-by). Non-admins still only
--    see the blocks they created.

-- ─── Who can't be blocked ──────────────────────────────────────────
-- True for any admin profile, plus the redrambler moderator account
-- (she'll get real admin powers later; for now this keeps her
-- unblockable). SECURITY DEFINER so the INSERT policy can call it
-- without the blocker needing to read the target's profile row.
create or replace function is_protected_user(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = uid
      and (is_admin = true or lower(username) = 'redrambler')
  );
$$;

-- Sweep any blocks that already exist against a protected user.
delete from user_blocks where is_protected_user(blocked_id);

-- ─── Re-gate user_blocks policies ──────────────────────────────────
-- INSERT: still only as yourself, and never against a protected user.
drop policy if exists blocks_insert on user_blocks;
create policy blocks_insert on user_blocks for insert to authenticated
  with check (blocker_id = auth.uid()
              and not is_protected_user(blocked_id));

-- READ: your own blocks as before, plus admins can read everyone's (for
-- the admin user view's Blocks section).
drop policy if exists blocks_read on user_blocks;
create policy blocks_read on user_blocks for select to authenticated
  using (blocker_id = auth.uid() or is_admin());
