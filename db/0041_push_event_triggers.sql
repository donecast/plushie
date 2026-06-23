-- ============================================================
-- 0041 — Fire real (closed-app) push on social + trade events.
--
-- This is the payoff layer on top of 0037_push_subscriptions and the
-- send-push edge function. Postgres AFTER triggers detect the events that
-- matter (a friend request, an accept, a comment, a like, a new post, a
-- Coffin Buddy add, a trade offer / counter / accept / decline / ship) and
-- hand each one to send-push via pg_net, which delivers a Web Push that
-- reaches the recipient even when the app is closed.
--
-- Why server-side: send-push only lets a non-admin caller push to THEMSELVES
-- (so nobody can spam-push another user from the client). Fanning a push out
-- to *another* user therefore has to come from a trusted server caller — the
-- service role — which is exactly what these triggers are.
--
-- Consent model: a row in push_subscriptions IS the opt-in. Turn reminders
-- off and the client deletes the row; _push_send then no-ops for that user.
-- Nothing here forces a notification on anyone who hasn't subscribed.
--
-- Safe to re-run (idempotent). Paste into the Supabase SQL Editor.
--
-- ── ONE-TIME SETUP (run once, with YOUR real values) ───────────────────
-- The triggers read the project URL and a privileged key from Supabase
-- Vault so nothing secret lives in this committed file. Use the NEW Supabase
-- secret key (sb_secret_…, from Settings → API Keys), NOT the deprecated
-- service-role key — and store that SAME value as the send-push edge-function
-- secret SEND_PUSH_KEY, so the function recognises the trigger as trusted.
-- In the SQL Editor:
--
--   select vault.create_secret(
--     'https://<your-project-ref>.supabase.co', 'project_url');
--   select vault.create_secret(
--     'sb_secret_…',                            'send_push_key');
--
-- (Re-running create_secret with an existing name errors; use
--  vault.update_secret(id, new_value) to rotate. List with:
--   select id, name from vault.secrets;)
-- If either secret is missing, _push_send simply no-ops — triggers stay
-- harmless until setup is done.
-- ============================================================

create extension if not exists pg_net;

-- ── Core sender ────────────────────────────────────────────────────────
-- Best-effort, fire-and-forget. Skips users with no subscription (saves a
-- wasted HTTP round-trip) and never lets a delivery hiccup roll back the
-- write that triggered it.
create or replace function _push_send(
  target   uuid,
  p_title  text,
  p_body   text,
  p_url    text default './',
  p_tag    text default 'plush-push'
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

  -- No subscription on file → user hasn't opted in (or revoked). No-op.
  if not exists (select 1 from push_subscriptions where user_id = target) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url'   limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then
    return;  -- not configured yet; stay harmless
  end if;

  -- send the key as both Authorization (our own auth check) and apikey (so
  -- the gateway accepts the opaque sb_secret_ key, which isn't a JWT).
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
  -- A push must never break the actual social/trade write.
  raise warning 'push notify failed for %: %', target, sqlerrm;
end;
$$;

-- Small helper: '@username' for a user id (empty string if somehow missing).
create or replace function _push_handle(uid uuid)
returns text language sql security definer stable
set search_path = public as $$
  select '@' || coalesce((select username::text from profiles where id = uid), 'someone');
$$;

-- ── Friendships: request received + request accepted ───────────────────
create or replace function trg_push_friendship()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if not blocked_between(new.requester_id, new.addressee_id) then
      perform _push_send(
        new.addressee_id, '🦇 The Plush Crypt',
        _push_handle(new.requester_id) || ' sent you a friend request 🦇',
        './', 'friend-request');
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    if not blocked_between(new.requester_id, new.addressee_id) then
      perform _push_send(
        new.requester_id, '🦇 The Plush Crypt',
        _push_handle(new.addressee_id) || ' accepted your friend request 🦇',
        './', 'friend-accept');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists push_friendship on friendships;
create trigger push_friendship
  after insert or update on friendships
  for each row execute function trg_push_friendship();

-- ── Comments on your post ──────────────────────────────────────────────
create or replace function trg_push_post_comment()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_author uuid;
begin
  select author_id into v_author from posts where id = new.post_id;
  if v_author is not null
     and v_author <> new.author_id
     and not blocked_between(v_author, new.author_id) then
    perform _push_send(
      v_author, '🦇 The Plush Crypt',
      _push_handle(new.author_id) || ' commented on your post 🦇',
      './', 'comment-' || new.post_id::text);
  end if;
  return null;
end;
$$;

drop trigger if exists push_post_comment on post_comments;
create trigger push_post_comment
  after insert on post_comments
  for each row execute function trg_push_post_comment();

-- ── Likes on your post (tag is per-post, so a flurry of likes collapses
--    into one replaced notification instead of N) ──────────────────────
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
      './', 'like-' || new.post_id::text);
  end if;
  return null;
end;
$$;

drop trigger if exists push_post_like on post_likes;
create trigger push_post_like
  after insert on post_likes
  for each row execute function trg_push_post_like();

-- ── New post → fan out to the audience that can see it ─────────────────
--    public/friends  → the author's accepted friends
--    inner           → the author's Inner Circle members
--    coffin_buddies  → the author's Coffin Buddies
--    (blocks already sever friendships, but we re-check defensively.)
create or replace function trg_push_post()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_handle text := _push_handle(new.author_id);
  v_body   text;
  r        record;
begin
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
    if not blocked_between(new.author_id, r.uid) then
      perform _push_send(r.uid, '🦇 The Plush Crypt', v_body, './',
                         'post-' || new.id::text);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists push_post on posts;
create trigger push_post
  after insert on posts
  for each row execute function trg_push_post();

-- ── Coffin Buddy add ───────────────────────────────────────────────────
create or replace function trg_push_coffin_buddy()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if not blocked_between(new.owner_id, new.member_id) then
    perform _push_send(
      new.member_id, '🦇 The Plush Crypt',
      _push_handle(new.owner_id) || ' added you to their Coffin Buddies 🦇',
      './', 'coffin-buddy');
  end if;
  return null;
end;
$$;

drop trigger if exists push_coffin_buddy on coffin_buddies;
create trigger push_coffin_buddy
  after insert on coffin_buddies
  for each row execute function trg_push_coffin_buddy();

-- ── Trades: offer / counter / accept / decline / ship ──────────────────
--    All trade notifications share tag 'trade-<id>' so the latest state of a
--    given trade replaces the previous notification rather than stacking.
create or replace function trg_push_trade()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_tag text;
begin
  v_tag := 'trade-' || new.id::text;

  if tg_op = 'INSERT' then
    if new.parent_trade_id is null then
      perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
        _push_handle(new.proposer_id) || ' sent you a trade offer 🦇', './', v_tag);
    else
      perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
        _push_handle(new.proposer_id) || ' countered your trade 🦇', './', v_tag);
    end if;
    return null;
  end if;

  -- UPDATE: status transitions notify the proposer (the one waiting on a reply)
  if old.status = 'pending' and new.status = 'accepted' then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' accepted your trade 🦇', './', v_tag);
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' declined your trade', './', v_tag);
  end if;

  -- Shipping milestones notify the OTHER party that their item is on the way.
  if old.proposer_shipped_at is null and new.proposer_shipped_at is not null then
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
      _push_handle(new.proposer_id) || ' shipped your trade item 📦', './', v_tag);
  end if;
  if old.recipient_shipped_at is null and new.recipient_shipped_at is not null then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' shipped your trade item 📦', './', v_tag);
  end if;

  return null;
end;
$$;

drop trigger if exists push_trade on trades;
create trigger push_trade
  after insert or update on trades
  for each row execute function trg_push_trade();
