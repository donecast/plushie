-- 0080_lock_privilege_columns.sql
-- Close a live privilege-escalation hole: any signed-in user could make
-- themselves an admin. Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Background
-- ──────────
-- Postgres RLS is row-level, not column-level. The `profiles_update_self`
-- policy (db/schema.sql) lets a user update their OWN row, and UPDATE was
-- granted to the `authenticated` (and `anon`) role on every column, including
-- `is_admin`, `is_moderator`, `app_blocked`, and `ghosted`. Nothing restricted
-- WHICH columns the self-update could touch, and the existing guard trigger
-- (db/0066 `prevent_moderating_admins`) only stopped blocking/ghosting an
-- already-privileged account — it did nothing to stop self-elevation.
--
-- Result: any signed-in user could
--   PATCH /rest/v1/profiles?id=eq.<their-uid>  {"is_admin": true}
-- with the public anon key and become a full admin (account purge, read every
-- user's private data, catalog write, moderation). On the free plan (no
-- backups) that is unrecoverable. This migration closes it.
--
-- The fix
-- ───────
-- Extend the BEFORE UPDATE trigger so a NON-admin end-user request cannot
-- change any of the four privilege/moderation columns. Admins (is_admin() is
-- true) still toggle is_moderator/app_blocked/ghosted from the admin UI exactly
-- as before — those PATCHes run as the authenticated admin, so is_admin()
-- passes. Server-side maintenance (SQL editor / service_role) has no auth.uid()
-- and is trusted, so it is exempt (that is how is_admin itself gets seeded).
--
-- We keep the column grant on `authenticated` (admins are that same role and
-- need it); the trigger is what enforces the boundary. We DO revoke the grant
-- from `anon` — anonymous requests never legitimately update profiles (RLS
-- already blocks them), so this just tightens the surface.

-- ─── Tighten the anon surface (defense in depth) ───────────────────
revoke update (is_admin, is_moderator, app_blocked, ghosted) on profiles from anon;

-- ─── Guard: only admins may change privilege/moderation columns ────
-- Rebuilds db/0066's trigger function, preserving its original protection
-- (never block/ghost a privileged account) and adding the self-elevation guard.
create or replace function prevent_moderating_admins()
returns trigger language plpgsql as $$
begin
  -- (db/0046 / db/0066) never block or ghost an admin or moderator account.
  if (new.app_blocked or new.ghosted)
     and (coalesce(new.is_admin, false) or coalesce(new.is_moderator, false)) then
    raise exception 'Cannot block or ghost an admin or moderator account';
  end if;

  -- (db/0080) only admins may change the privilege / moderation columns.
  -- auth.uid() is null for server-side contexts (SQL editor, service_role,
  -- SECURITY DEFINER seeds) — those are trusted and exempt. A real end-user
  -- request has a uid; if that user is not already an admin, reject any change
  -- to these columns. Uses IS DISTINCT FROM so ordinary profile edits (bio,
  -- username, etc.) that leave these columns untouched are unaffected.
  if auth.uid() is not null and not is_admin() then
    if new.is_admin     is distinct from old.is_admin
    or new.is_moderator is distinct from old.is_moderator
    or new.app_blocked  is distinct from old.app_blocked
    or new.ghosted      is distinct from old.ghosted then
      raise exception 'Not authorized to change privilege or moderation flags';
    end if;
  end if;

  return new;
end;
$$;

-- Trigger itself is unchanged from db/0066; re-assert it so this file is
-- self-contained and safe to run standalone.
drop trigger if exists trg_prevent_moderating_admins on profiles;
create trigger trg_prevent_moderating_admins
  before update on profiles
  for each row execute function prevent_moderating_admins();

-- ─── Confirmation ──────────────────────────────────────────────────
do $$
begin
  raise notice '0080 applied: privilege columns on profiles are now admin-only (self-elevation blocked).';
end $$;
