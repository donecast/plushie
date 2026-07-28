-- ============================================================
-- Plushie tracker — migration 0101: aggregated notifications (Facebook-style)
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Why: 0100 made notifications rich (who + what + deep-link). This closes the
-- last parity gap — the pile-up. Twenty people liking your post shouldn't be
-- twenty bell rows; Facebook collapses them into "Amber and 19 others liked
-- your post." We aggregate exactly the high-volume, text-less events:
--   * likes/reactions on a post   (post_likes → kind 'like')
--   * reactions on your comment   (comment_reactions → kind 'reaction')
-- Comments, replies, mentions and DMs stay INDIVIDUAL on purpose: their
-- excerpt (0100) is the whole point — you want to read each one.
--
-- How: a per-recipient, per-target UNSEEN row accumulates its distinct actors.
-- A new actor bumps the count, rebuilds the "X and N others …" headline,
-- refreshes the timestamp and clears delivered_at so it re-surfaces (a fresh
-- OS banner, collapsed by tag). Once you've SEEN it, the next like starts a new
-- row — "new since you last looked", exactly like Facebook. The client is
-- untouched: it already renders body + the latest actor's avatar + the
-- deep-link url, all of which we keep current here.

-- ── 1. Aggregate bookkeeping columns ───────────────────────────────────
alter table notifications add column if not exists actor_ids   uuid[];
alter table notifications add column if not exists actor_count int not null default 1;

-- ── 2. Split delivery out of _push_send so both the single-shot and the
--       aggregate path can push without duplicating the http plumbing ────
create or replace function _push_deliver(
  target  uuid,
  p_title text,
  p_body  text,
  p_url   text,
  p_tag   text
) returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url text;
  v_key text;
begin
  if target is null then return; end if;
  if not exists (select 1 from push_subscriptions where user_id = target) then
    return;  -- no subscription → the app-open poll delivers it from the queue
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url'   limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then
    return;  -- not configured yet; stay harmless
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
      'body',     p_body,
      'url',      p_url,
      'tag',      p_tag
    )
  );
exception when others then
  raise warning 'push deliver failed for %: %', target, sqlerrm;
end;
$$;

-- _push_send: unchanged behaviour (queue rich row, then push), now delegating
-- the http send to _push_deliver.
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
  v_link      text;
  v_excerpt   text;
  v_pushbody  text;
begin
  if target is null then return; end if;

  v_excerpt := nullif(btrim(coalesce(p_excerpt, '')), '');

  v_link := p_url;
  if p_post is not null and (p_url is null or p_url = './') then
    v_link := './#post-' || p_post::text
      || case when p_comment is not null then '_c_' || p_comment::text else '' end;
  end if;

  delete from notifications where user_id = target and created_at < now() - interval '45 days';
  insert into notifications (user_id, title, body, url, tag, actor_id, kind, post_id, comment_id, excerpt)
  values (target, p_title, p_body, v_link, p_tag, p_actor, p_kind, p_post, p_comment, v_excerpt);

  v_pushbody := p_body;
  if v_excerpt is not null then
    v_pushbody := p_body || ' — “' || left(v_excerpt, 120) || '”';
  end if;
  perform _push_deliver(target, p_title, v_pushbody, v_link, p_tag);
end;
$$;

-- ── 3. Aggregate headline builder ──────────────────────────────────────
-- n=1 → "Amber liked your post 🦇"
-- n=2 → "Amber and 1 other liked your post 🦇"
-- n>2 → "Amber and 12 others liked your post 🦇"
create or replace function _agg_headline(p_handle text, p_count int, p_verb text)
returns text language sql immutable as $$
  select p_handle
    || case
         when p_count <= 1 then ''
         when p_count = 2  then ' and 1 other'
         else ' and ' || (p_count - 1) || ' others'
       end
    || ' ' || p_verb || ' 🦇';
$$;

-- ── 4. The aggregator ──────────────────────────────────────────────────
-- Collapse a like/reaction into the recipient's single UNSEEN row for this
-- (kind, target). Grouping is by (kind, post, comment) — NOT tag — because a
-- reaction shares the 'comment-<post>' tag with plain comment notifications;
-- kind keeps them apart.
create or replace function _notify_aggregate(
  target    uuid,
  p_actor   uuid,
  p_kind    text,
  p_post    uuid,
  p_comment uuid,
  p_verb    text,
  p_tag     text
) returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_row    notifications%rowtype;
  v_ids    uuid[];
  v_count  int;
  v_handle text := _push_handle(p_actor);
  v_link   text;
  v_body   text;
begin
  if target is null then return; end if;

  v_link := './#post-' || p_post::text
    || case when p_comment is not null then '_c_' || p_comment::text else '' end;

  select * into v_row from notifications
   where user_id = target
     and seen_at is null
     and kind = p_kind
     and post_id    is not distinct from p_post
     and comment_id is not distinct from p_comment
   order by created_at desc
   limit 1;

  if found then
    v_ids := coalesce(v_row.actor_ids, array[]::uuid[]);
    if p_actor = any(v_ids) then
      -- Same person again (un-like/re-like): resurface, don't double-count.
      v_ids   := array_prepend(p_actor, array_remove(v_ids, p_actor));
      v_count := v_row.actor_count;
    else
      v_ids   := array_prepend(p_actor, v_ids);
      v_count := v_row.actor_count + 1;
    end if;
    v_body := _agg_headline(v_handle, v_count, p_verb);
    update notifications
       set actor_ids   = v_ids[1:8],   -- keep a small recent window
           actor_count = v_count,
           actor_id    = p_actor,      -- latest actor drives the avatar
           body        = v_body,
           created_at  = now(),
           delivered_at = null         -- re-surface (fresh banner, tag-collapsed)
     where id = v_row.id;
  else
    v_body := _agg_headline(v_handle, 1, p_verb);
    delete from notifications where user_id = target and created_at < now() - interval '45 days';
    insert into notifications (user_id, title, body, url, tag, actor_id, kind, post_id, comment_id, actor_ids, actor_count)
    values (target, '🦇 The Plush Crypt', v_body, v_link, p_tag, p_actor, p_kind, p_post, p_comment, array[p_actor], 1);
  end if;

  perform _push_deliver(target, '🦇 The Plush Crypt', v_body, v_link, p_tag);
end;
$$;

-- ── 5. Point the like + reaction triggers at the aggregator ────────────
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
    perform _notify_aggregate(v_author, new.user_id, 'like', new.post_id, null,
      'liked your post', 'like-' || new.post_id::text);
  end if;
  return null;
end;
$$;

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
    perform _notify_aggregate(v_author, new.user_id, 'reaction', v_post, new.comment_id,
      'reacted to your comment', 'comment-' || v_post::text);
  end if;
  return null;
end;
$$;

-- Confirmation.
select 'aggregated notifications live: likes + comment-reactions collapse into one “X and N others …” row per target; comments/replies/mentions/DMs stay individual' as status;
