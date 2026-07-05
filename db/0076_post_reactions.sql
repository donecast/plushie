-- ============================================================
-- Plushie tracker — migration 0076: emoji reactions on posts
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Comments got the full Facebook-style reaction palette (👍🖤😂😮😢😡) back in
-- 0032 (comment_reactions), but posts were left with a single boolean "like"
-- (post_likes). On desktop a reply shows the whole palette on hover while the
-- original post offers only the one — an obvious inconsistency.
--
-- Rather than add a parallel post_reactions table, we extend post_likes with an
-- emoji column. The existing primary key (post_id, user_id) already enforces
-- one reaction per user per post (mutual exclusivity), so a "swap" is a single
-- upsert that UPDATEs the row — which does NOT re-fire the after-insert push
-- trigger (push_post_like, 0042), so changing your reaction won't re-notify.
--
-- Existing likes were rendered as a black heart, so they map to 🖤 ("Love").

alter table post_likes
  add column if not exists emoji text not null default '🖤';
