-- ============================================================
-- Plushie tracker — migration 0100: rich notifications (Facebook-style)
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Why: notifications only stored a pre-rendered headline ("@alice commented
-- on your post 🦇") and always routed to the top of a tab. You could see THAT
-- someone commented, never WHAT they said, and tapping never took you to the
-- actual post. This adds the structured payload Facebook-style rows need:
--   * actor_id  — who did it (for an avatar in the in-app bell)
--   * kind      — the event type (comment/reply/like/reaction/mention/dm/post)
--   * post_id / comment_id — the deep-link target
--   * excerpt   — the content itself (the comment/reply/message text)
-- and threads them through _push_send, which now (a) stores them, (b) builds a
-- real deep-link url ('./#post-<id>' / '…_c_<commentId>') when a post is the
-- target, and (c) appends the excerpt to the PUSH body so the OS banner shows
-- what happened too. Old rows and non-content events (friend/trade/admin/gift/
-- relic) leave the new columns null and render/route exactly as before.

-- ── 1. Structured columns (all nullable, additive) ─────────────────────
alter table notifications add column if not exists actor_id   uuid references auth.users(id) on delete set null;
alter table notifications add column if not exists kind       text;
alter table notifications add column if not exists post_id    uuid;
alter table notifications add column if not exists comment_id uuid;
alter table notifications add column if not exists excerpt    text;

-- ── 2. _push_send: queue (now with structure) first, then push ─────────
-- Adding optional params to a defaulted signature would make the old 5-arg
-- calls ambiguous, so drop the previous version first. Every existing
-- 5-arg call site then binds to this one (the new params default to null).
drop function if exists _push_send(uuid, text, text, text, text);

create or replace function _push_send(
  target    uuid,
  p_title   text,
  p_body    text,
  p_url     text default './',
  p_tag     text default 'plush-push',
  p_actor   uuid default null,
  p_kind    text default null,
  p_post    uuid default null,
  p_comment uuid default null,
  p_excerpt text default null
) returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url       text;       -- vault: project url
  v_key       text;       -- vault: send-push key
  v_link      text;       -- the deep-link we store + push
  v_excerpt   text;       -- trimmed content preview (null if empty)
  v_pushbody  text;       -- push banner body (headline + excerpt)
begin
  if target is null then return; end if;

  v_excerpt := nullif(btrim(coalesce(p_excerpt, '')), '');

  -- Deep-link: when a post is the target and the caller didn't override the
  -- url, route straight to that post (and comment). The client + sw.js parse
  -- this '#post-<uuid>[_c_<uuid>]' hash to scroll + highlight.
  v_link := p_url;
  if p_post is not null and (p_url is null or p_url = './') then
    v_link := './#post-' || p_post::text
      || case when p_comment is not null then '_c_' || p_comment::text else '' end;
  end if;

  -- Queue unconditionally: the app's while-open poll delivers anything real
  -- push doesn't reach. Opportunistic hygiene: this user's ancient rows go too.
  delete from notifications where user_id = target and created_at < now() - interval '45 days';
  insert into notifications (user_id, title, body, url, tag, actor_id, kind, post_id, comment_id, excerpt)
  values (target, p_title, p_body, v_link, p_tag, p_actor, p_kind, p_post, p_comment, v_excerpt);

  -- No subscription on file → queue-only (the poll will deliver it).
  if not exists (select 1 from push_subscriptions where user_id = target) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url'   limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then
    return;  -- not configured yet; stay harmless
  end if;

  -- OS banner shows WHAT happened: headline, then the quoted excerpt. Kept
  -- short so it doesn't get truncated mid-word by the platform.
  v_pushbody := p_body;
  if v_excerpt is not null then
    v_pushbody := p_body || ' — “' || left(v_excerpt, 120) || '”';
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := jsonb_build_object(
      'user_ids', jsonb_build_array(target),
      'title',    p_title,
      'body',     v_pushbody,
      'url',      v_link,
      'tag',      p_tag
    )
  );
exception when others then
  -- A push must never break the actual social/trade write.
  raise warning 'push notify failed for %: %', target, sqlerrm;
end;
$$;

-- ── 3. Content triggers: pass actor + target + excerpt ─────────────────
-- Each is the current live body (0084 for comment/post, 0042 for like, 0051
-- for reaction, 0083 for dm) with the structured args added. Behaviour —
-- who gets notified, blocks, ghosting, one-send-per-recipient — is unchanged.

-- Comments: reply → parent author, comment → post author, @mentions.
create or replace function trg_push_post_comment()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_handle text := _push_handle(new.author_id);
  v_tag    text := 'comment-' || new.post_id::text;
  v_excerpt text := new.body;
  v_post_author   uuid;
  v_parent_author uuid;
  notified uuid[] := array[new.author_id];   -- never notify yourself
  r uuid;
begin
  if is_suppressed(new.author_id) then return null; end if;
  select author_id into v_post_author from posts where id = new.post_id;
  if new.parent_comment_id is not null then
    select author_id into v_parent_author from post_comments where id = new.parent_comment_id;
  end if;

  -- Reply → the comment's author (most specific).
  if v_parent_author is not null and not (v_parent_author = any(notified))
     and not blocked_between(v_parent_author, new.author_id) then
    perform _push_send(v_parent_author, '🦇 The Plush Crypt',
      v_handle || ' replied to your comment 🦇', './', v_tag,
      new.author_id, 'reply', new.post_id, new.id, v_excerpt);
    notified := notified || v_parent_author;
  end if;

  -- Comment → the post's author (unless they were the parent author above).
  if v_post_author is not null and not (v_post_author = any(notified))
     and not blocked_between(v_post_author, new.author_id) then
    perform _push_send(v_post_author, '🦇 The Plush Crypt',
      v_handle || ' commented on your post 🦇', './', v_tag,
      new.author_id, 'comment', new.post_id, new.id, v_excerpt);
    notified := notified || v_post_author;
  end if;

  -- @mentions → anyone named who wasn't already notified.
  for r in select * from _mention_uids(new.body) loop
    if not (r = any(notified)) and not blocked_between(r, new.author_id) then
      perform _push_send(r, '🦇 The Plush Crypt',
        v_handle || ' mentioned you in a comment 🦇', './', v_tag,
        new.author_id, 'mention_comment', new.post_id, new.id, v_excerpt);
      notified := notified || r;
    end if;
  end loop;
  return null;
end;
$$;

-- New posts: @mentions first, then the audience fan-out.
create or replace function trg_push_post()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_handle text := _push_handle(new.author_id);
  v_body   text;
  v_tag    text := 'post-' || new.id::text;
  v_excerpt text := new.body;
  notified uuid[] := array[new.author_id];
  r record;
  m uuid;
begin
  if is_suppressed(new.author_id) then return null; end if;

  -- Mentions (any visibility — if you're named, you should hear).
  for m in select * from _mention_uids(new.body) loop
    if not (m = any(notified)) and not blocked_between(m, new.author_id) then
      perform _push_send(m, '🦇 The Plush Crypt',
        v_handle || ' mentioned you in a post 🦇', './', v_tag,
        new.author_id, 'mention_post', new.id, null, v_excerpt);
      notified := notified || m;
    end if;
  end loop;

  v_body := case
    when new.plush_name is not null
      then v_handle || ' posted about ' || new.plush_name || ' 🦇'
    else v_handle || ' shared a new post 🦇'
  end;

  for r in
    select uid from (
      select case when requester_id = new.author_id then addressee_id else requester_id end as uid
        from friendships
       where status = 'accepted'
         and (requester_id = new.author_id or addressee_id = new.author_id)
         and new.visibility::text in ('public','friends')
      union
      select member_id as uid from inner_circle
       where owner_id = new.author_id and new.visibility::text = 'inner'
      union
      select member_id as uid from coffin_buddies
       where owner_id = new.author_id and new.visibility::text = 'coffin_buddies'
    ) aud
  loop
    if not (r.uid = any(notified)) and not blocked_between(new.author_id, r.uid) then
      perform _push_send(r.uid, '🦇 The Plush Crypt', v_body, './', v_tag,
        new.author_id, 'post', new.id, null, v_excerpt);
      notified := notified || r.uid;
    end if;
  end loop;
  return null;
end;
$$;

-- Likes on your post (excerpt-less; a like has no text).
create or replace function trg_push_post_like()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_author uuid;
begin
  select author_id into v_author from posts where id = new.post_id;
  if v_author is not null
     and v_author <> new.user_id
     and not blocked_between(v_author, new.user_id) then
    perform _push_send(
      v_author, '🦇 The Plush Crypt',
      _push_handle(new.user_id) || ' liked your post 🦇',
      './', 'like-' || new.post_id::text,
      new.user_id, 'like', new.post_id, null, null);
  end if;
  return null;
end;
$$;

-- Reactions on your comment (deep-link to the comment; emoji lives in headline).
create or replace function trg_push_comment_reaction()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_author uuid;
  v_post   uuid;
begin
  select author_id, post_id into v_author, v_post from post_comments where id = new.comment_id;
  if v_author is not null
     and v_author <> new.user_id
     and not blocked_between(v_author, new.user_id) then
    perform _push_send(
      v_author, '🦇 The Plush Crypt',
      _push_handle(new.user_id) || ' reacted ' || new.emoji || ' to your comment 🦇',
      './', 'comment-' || v_post::text,
      new.user_id, 'reaction', v_post, new.comment_id, null);
  end if;
  return null;
end;
$$;

-- Direct messages (excerpt = message preview; routes to the DM surface by tag).
create or replace function trg_push_dm()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if not is_suppressed(new.sender_id) then
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
      _push_handle(new.sender_id) || ' sent you a message 💌', './', 'dm-' || new.sender_id::text,
      new.sender_id, 'dm', null, null, new.body);
  end if;
  return null;
end;
$$;

-- Confirmation.
select 'rich notifications live: actor + kind + post/comment target + excerpt; _push_send builds deep-links and shows content in the banner' as status;
