-- 0034_block_report.sql
-- Block-a-user + report-content (posts / comments / users).
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Design
-- ──────
-- * Blocking is DIRECTED (blocker → blocked) but enforced MUTUALLY: if a
--   block exists in EITHER direction, the two can't see each other's
--   posts, can't friend each other, and can't open a trade with each
--   other. blocked_between() is the symmetric test the policies use.
-- * Blocking someone immediately severs any existing friendship and
--   removes them from your circles (and you from theirs) via a trigger.
-- * Reports land in content_reports for admin review (mirrors the trade
--   dispute queue). Admins can resolve/dismiss and — via the new admin
--   delete grants below — remove the offending post or comment.

create extension if not exists pgcrypto;

-- ─── Blocks ────────────────────────────────────────────────────────
create table if not exists user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on user_blocks(blocked_id);

alter table user_blocks enable row level security;
-- You manage (and can read) only the blocks YOU created. The blocked
-- party is never told they were blocked — no select for blocked_id.
drop policy if exists blocks_read   on user_blocks;
drop policy if exists blocks_insert on user_blocks;
drop policy if exists blocks_delete on user_blocks;
create policy blocks_read   on user_blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy blocks_insert on user_blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy blocks_delete on user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Symmetric block test. SECURITY DEFINER so it can be called from inside
-- other tables' policies (and by the blocked party) without exposing the
-- user_blocks rows directly.
create or replace function blocked_between(a uuid, b uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- All user ids the current user is blocked-with, in either direction —
-- direction deliberately hidden. The client uses this to hide blocked
-- people from feeds, browse, comments, and profiles.
create or replace function blocked_user_ids()
returns setof uuid language sql security definer stable as $$
  select blocked_id from user_blocks where blocker_id = auth.uid()
  union
  select blocker_id from user_blocks where blocked_id = auth.uid();
$$;

-- Convenience for the client trade/friend guards: am I blocked-with X?
create or replace function blocked_with_me(other uuid)
returns boolean language sql security definer stable as $$
  select blocked_between(auth.uid(), other);
$$;

-- Blocking severs the relationship both ways.
create or replace function sever_on_block()
returns trigger language plpgsql security definer as $$
begin
  delete from friendships
   where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
      or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  delete from inner_circle
   where (owner_id = new.blocker_id and member_id = new.blocked_id)
      or (owner_id = new.blocked_id and member_id = new.blocker_id);
  delete from coffin_buddies
   where (owner_id = new.blocker_id and member_id = new.blocked_id)
      or (owner_id = new.blocked_id and member_id = new.blocker_id);
  return new;
end $$;
drop trigger if exists trg_sever_on_block on user_blocks;
create trigger trg_sever_on_block
  after insert on user_blocks
  for each row execute function sever_on_block();

-- ─── Re-gate posts: a block hides posts in both directions ─────────
-- Re-declares can_see_post() (last set in 0030) with a block check added
-- right after the self check. Keep the rest identical.
create or replace function can_see_post(author uuid, vis post_visibility)
returns boolean language sql security definer stable as $$
  select case
    when author = auth.uid()                  then true
    when blocked_between(author, auth.uid())  then false
    when vis::text = 'public'                 then true
    when vis::text = 'friends'                then are_friends(author, auth.uid())
    when vis::text = 'inner'                  then is_inner(author, auth.uid())
    when vis::text = 'coffin_buddies'         then is_coffin_buddy(author, auth.uid())
    else false
  end;
$$;

-- ─── Block the side-channels: friend requests + new trades ─────────
-- Can't send a friend request to someone you're blocked-with.
drop policy if exists friendships_insert on friendships;
create policy friendships_insert on friendships for insert to authenticated
  with check (requester_id = auth.uid()
              and not blocked_between(requester_id, addressee_id));

-- Can't open a trade with someone you're blocked-with.
drop policy if exists trades_proposer_ins on trades;
create policy trades_proposer_ins on trades for insert to authenticated
  with check (proposer_id = auth.uid()
              and not blocked_between(proposer_id, recipient_id));

-- ─── Admin can remove reported content ─────────────────────────────
-- Authors still delete their own; admins gain delete so the reports
-- queue can actually action a post/comment.
drop policy if exists posts_delete on posts;
create policy posts_delete on posts for delete to authenticated
  using (author_id = auth.uid() or is_admin());

drop policy if exists comments_delete on post_comments;
create policy comments_delete on post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or is_admin()
    or exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- ─── Reports ───────────────────────────────────────────────────────
do $$ begin
  create type report_target as enum ('post', 'comment', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  target_type     report_target not null,
  target_id       text not null,            -- post/comment uuid, or reported user's uuid
  target_owner_id uuid references auth.users(id) on delete set null,
  reason          text not null,            -- short category, e.g. 'harassment'
  details         text,                     -- optional free text from the reporter
  status          report_status not null default 'open',
  created_at      timestamptz not null default now(),
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text
);
create index if not exists content_reports_status_idx on content_reports(status, created_at);

alter table content_reports enable row level security;
drop policy if exists reports_insert on content_reports;
drop policy if exists reports_read   on content_reports;
drop policy if exists reports_update on content_reports;
-- Anyone signed in can file a report as themselves.
create policy reports_insert on content_reports for insert to authenticated
  with check (reporter_id = auth.uid());
-- You can see your own reports; admins see everything.
create policy reports_read on content_reports for select to authenticated
  using (reporter_id = auth.uid() or is_admin());
-- Only admins resolve/dismiss.
create policy reports_update on content_reports for update to authenticated
  using (is_admin()) with check (is_admin());
