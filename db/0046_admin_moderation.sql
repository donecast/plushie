-- 0046_admin_moderation.sql
-- Two admin moderation levers on a user, set from the admin user-detail view:
--
--   * app_blocked — a full ban. The client shows a "you've been removed"
--     takeover at boot (like maintenance mode) and never boots the app for
--     them. Server-side, a blocked user is also isolated from everyone else's
--     content (see is_suppressed below), so even a hand-rolled API call sees
--     nothing and surfaces nothing to others.
--
--   * ghosted — a shadow-ban. The user can still sign in and use the app, but
--     they see nothing belonging to anyone else (empty feed, empty trades, no
--     other profiles), and nobody else sees their posts/trades/friendships.
--     They are, effectively, a ghost: present but invisible, and blind to the
--     living.
--
-- Both isolation directions are enforced by is_suppressed(), folded into the
-- existing read paths (can_see_post / trades_read / friendships_read). Ghosted
-- users may still WRITE — their writes just fall into the void for everyone
-- else — which is what "can still access the app" means.

alter table profiles add column if not exists app_blocked boolean not null default false;
alter table profiles add column if not exists ghosted     boolean not null default false;

-- A user is "suppressed" — isolated from the rest of the app's social graph —
-- when an admin has either fully blocked or ghosted them. SECURITY DEFINER so
-- it can read profiles regardless of the caller's own RLS.
create or replace function is_suppressed(uid uuid)
returns boolean language sql security definer stable as $$
  select coalesce(
    (select p.app_blocked or p.ghosted from profiles p where p.id = uid),
    false);
$$;

-- Belt and suspenders: never let an admin account be blocked or ghosted, even
-- if the UI guard is bypassed. Admins moderate; they don't get moderated.
create or replace function prevent_moderating_admins()
returns trigger language plpgsql as $$
begin
  if (new.app_blocked or new.ghosted) and coalesce(new.is_admin, false) then
    raise exception 'Cannot block or ghost an admin account';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prevent_moderating_admins on profiles;
create trigger trg_prevent_moderating_admins
  before update on profiles
  for each row execute function prevent_moderating_admins();

-- ── Read isolation ──────────────────────────────────────────────────────────
-- Each rule short-circuits to "owner always sees their own row" first, then
-- hides everything if EITHER the viewer or the other party is suppressed.

-- Posts (also gates comments, which select through can_see_post). Mirrors the
-- 0034 body with two suppression clauses added right after the self-check.
create or replace function can_see_post(author uuid, vis post_visibility)
returns boolean language sql security definer stable as $$
  select case
    when author = auth.uid()                  then true
    when is_suppressed(auth.uid())            then false
    when is_suppressed(author)                then false
    when blocked_between(author, auth.uid())  then false
    when vis::text = 'public'                 then true
    when vis::text = 'friends'                then are_friends(author, auth.uid())
    when vis::text = 'inner'                  then is_inner(author, auth.uid())
    when vis::text = 'coffin_buddies'         then is_coffin_buddy(author, auth.uid())
    else false
  end;
$$;

-- Trades — keep the admin escape hatch; otherwise hide if the viewer or the
-- trade partner is suppressed.
drop policy if exists trades_read on trades;
create policy trades_read on trades for select to authenticated using (
  is_admin()
  or (
    (proposer_id = auth.uid() or recipient_id = auth.uid())
    and not is_suppressed(auth.uid())
    and not is_suppressed(case when proposer_id = auth.uid() then recipient_id else proposer_id end)
  )
);

-- Friendships — hide if the viewer or the other party is suppressed.
drop policy if exists friendships_read on friendships;
create policy friendships_read on friendships for select to authenticated using (
  (requester_id = auth.uid() or addressee_id = auth.uid())
  and not is_suppressed(auth.uid())
  and not is_suppressed(case when requester_id = auth.uid() then addressee_id else requester_id end)
);
