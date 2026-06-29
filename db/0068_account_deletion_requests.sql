-- 0068_account_deletion_requests.sql
-- Self-serve "Delete my account" that is really a REQUEST queued for admin
-- review — the account is NEVER actually deleted by the user themselves.
--
-- When a collector taps "Delete my account" in Settings, the client:
--   * stamps profiles.deletion_requested_at = now() (a self-update, allowed by
--     the existing profiles_update_self policy), and
--   * stores their exit-survey answer ("what made you want to leave?") in the
--     locked-down profile_private table (admin + self read only), so the
--     reason is never world-readable the way profiles rows are.
--
-- The account then BEHAVES deleted, but the row survives for review:
--   * boot shows the user a "your account has been deleted" takeover (client
--     gate on currentUser.pendingDeletion), so they can't get back in — the
--     strongest version of the illusion, matching app_blocked, AND
--   * is_suppressed() folds pending-deletion in alongside app_blocked/ghosted,
--     so they vanish from everyone else's feed, trades, and profiles at once.
--
-- An admin reviews the queue and then either truly purges the account
-- (adminPurgeUser, which cascades the row away) or RESTORES it by clearing
-- deletion_requested_at — both reversible until the purge happens.

alter table profiles        add column if not exists deletion_requested_at timestamptz;
alter table profile_private add column if not exists deletion_reason       text;

-- Fold pending-deletion into the existing isolation predicate (db/0046). A user
-- who has "left" is hidden from everyone else exactly like a blocked/ghosted
-- user — until an admin purges or restores them. SECURITY DEFINER so it can
-- read profiles regardless of the caller's own RLS.
create or replace function is_suppressed(uid uuid)
returns boolean language sql security definer stable as $$
  select coalesce(
    (select p.app_blocked or p.ghosted or (p.deletion_requested_at is not null)
       from profiles p where p.id = uid),
    false);
$$;
