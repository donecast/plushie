-- ============================================================
-- 0050 — Fire real (closed-app) push when someone REACTS to your comment.
--
-- Closes a gap left by 0042_push_event_triggers: that file wired comments,
-- post likes, posts, friendships, coffin buddies and trades — but NOT the
-- emoji reactions on comments (the 👍 🖤 😂 😮 😢 😡 set shipped in #97,
-- stored in `comment_reactions`). So reacting to someone's comment notified
-- nobody. This adds the missing AFTER-INSERT trigger, reusing the same
-- _push_send / _push_handle helpers and consent model from 0042 (a row in
-- push_subscriptions IS the opt-in; no subscription → _push_send no-ops).
--
-- Safe to re-run (idempotent). Paste into the Supabase SQL Editor.
-- ============================================================

-- ── Reactions on your comment ──────────────────────────────────────────
-- Notify the comment's author when someone else reacts. Self-reactions and
-- blocked pairs stay silent. Tag is per-comment ('comment-<id>') so it routes
-- to the social tab (sw.js tabForTag) and a flurry of reactions on the same
-- comment collapses into one replaced banner instead of stacking.
create or replace function trg_push_comment_reaction()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_author uuid;
begin
  select author_id into v_author from post_comments where id = new.comment_id;
  if v_author is not null
     and v_author <> new.user_id
     and not blocked_between(v_author, new.user_id) then
    perform _push_send(
      v_author, '🦇 The Plush Crypt',
      _push_handle(new.user_id) || ' reacted ' || new.emoji || ' to your comment 🦇',
      './', 'comment-' || new.comment_id::text);
  end if;
  return null;
end;
$$;

drop trigger if exists push_comment_reaction on comment_reactions;
create trigger push_comment_reaction
  after insert on comment_reactions
  for each row execute function trg_push_comment_reaction();
