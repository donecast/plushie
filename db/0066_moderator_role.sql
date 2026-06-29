-- 0066_moderator_role.sql
-- A real "moderator" role, replacing the hardcoded redrambler placeholder.
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Background
-- ──────────
-- db/0034 gave admins delete grants on posts/comments and the reports queue;
-- db/0036 made "the redrambler moderator account" unblockable, noting she'd
-- "get real admin powers later". This migration delivers those powers as a
-- proper, grantable role:
--
--   * is_moderator — a profile flag, toggled from the admin user-detail view.
--   * can_moderate() — the role test the policies use: admin OR moderator.
--
-- A moderator can delete any post/comment and work the content_reports queue,
-- but is NOT a full admin (no user list, catalog, maintenance, etc. — that
-- stays is_admin()-only, gated client-side). Moderators are also protected:
-- they can't be blocked, app-blocked, or ghosted.

-- ─── The flag ──────────────────────────────────────────────────────
alter table profiles
  add column if not exists is_moderator boolean not null default false;

-- ─── The role test ─────────────────────────────────────────────────
-- True for admins (who moderate everything) and for moderators. SECURITY
-- DEFINER so it can be called from inside other tables' policies without the
-- caller needing to read the profiles row. Mirrors is_admin() from db/0005.
create or replace function can_moderate()
returns boolean language sql security definer stable as $$
  select is_admin() or coalesce(
    (select p.is_moderator from profiles p where p.id = auth.uid()), false);
$$;

-- ─── Re-gate delete: moderators can remove any post/comment ─────────
-- Replaces the is_admin() clause from db/0034 with can_moderate(). Authors
-- still delete their own; the post owner still deletes comments on their post.
drop policy if exists posts_delete on posts;
create policy posts_delete on posts for delete to authenticated
  using (author_id = auth.uid() or can_moderate());

drop policy if exists comments_delete on post_comments;
create policy comments_delete on post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or can_moderate()
    or exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- ─── Reports queue: open read + resolve to moderators ──────────────
-- Replaces the is_admin() clauses from db/0034. Reporters still see their own
-- reports; moderators (and admins) see and resolve everything.
drop policy if exists reports_read on content_reports;
create policy reports_read on content_reports for select to authenticated
  using (reporter_id = auth.uid() or can_moderate());

drop policy if exists reports_update on content_reports;
create policy reports_update on content_reports for update to authenticated
  using (can_moderate()) with check (can_moderate());

-- ─── Protected users now include moderators ────────────────────────
-- Generalize is_protected_user() (db/0036) from the hardcoded redrambler
-- username to any admin or moderator. They can never be blocked.
create or replace function is_protected_user(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles
    where id = uid
      and (is_admin = true or is_moderator = true)
  );
$$;

-- Sweep any blocks that already exist against a now-protected user.
delete from user_blocks where is_protected_user(blocked_id);

-- ─── Moderators can't be moderated ─────────────────────────────────
-- Extend the db/0046 guard: never let a moderator (or admin) account be
-- app-blocked or ghosted, even if a UI guard is bypassed.
create or replace function prevent_moderating_admins()
returns trigger language plpgsql as $$
begin
  if (new.app_blocked or new.ghosted)
     and (coalesce(new.is_admin, false) or coalesce(new.is_moderator, false)) then
    raise exception 'Cannot block or ghost an admin or moderator account';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prevent_moderating_admins on profiles;
create trigger trg_prevent_moderating_admins
  before update on profiles
  for each row execute function prevent_moderating_admins();

-- ─── Seed Amber ────────────────────────────────────────────────────
-- redrambler is Amber — the account db/0036 reserved as the moderator.
update profiles set is_moderator = true where lower(username) = 'redrambler';
