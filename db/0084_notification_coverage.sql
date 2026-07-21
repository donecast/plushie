-- ============================================================
-- Plushie tracker — migration 0084: full notification coverage
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Audit result: 0042/0077/0083 cover friend events, new posts, comments
-- on YOUR post, reactions, the trade lifecycle, and DMs. This fills the
-- common-sense gaps (Facebook standard):
--   * replies to YOUR COMMENT (previously only the post author heard)
--   * @mentions in posts and comments (mentions existed but were silent)
--   * trade feedback received
--   * "your suggested photo / catalog item was approved" (delight)
--   * work-queue pings: new report → moderators; new photo/catalog
--     suggestion + account-deletion request → admins
-- House rules, everywhere: never notify yourself, respect blocks, ghosted
-- actors stay silent (is_suppressed — their activity is invisible anyway),
-- and each recipient gets ONE notification per event (most specific wins:
-- reply > comment-on-post > mention).

-- ── @mention resolution: usernames in a body → profile ids ────────────
-- Same charset/length rule as the client's linkifyMentions.
create or replace function _mention_uids(p_body text)
returns setof uuid language sql stable security definer
set search_path = public as $$
  select p.id from (
    select distinct lower(m[1]) as uname
    from regexp_matches(coalesce(p_body, ''), '@([a-zA-Z0-9_-]{3,20})', 'g') m
  ) x
  join profiles p on lower(p.username) = x.uname;
$$;

-- ── Comments: reply → parent author, comment → post author, @mentions ──
-- Replaces the 0042 version (post author only). One send per recipient,
-- most specific message wins.
create or replace function trg_push_post_comment()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_handle text := _push_handle(new.author_id);
  v_tag    text := 'comment-' || new.post_id::text;
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
      v_handle || ' replied to your comment 🦇', './', v_tag);
    notified := notified || v_parent_author;
  end if;

  -- Comment → the post's author (unless they were the parent author above).
  if v_post_author is not null and not (v_post_author = any(notified))
     and not blocked_between(v_post_author, new.author_id) then
    perform _push_send(v_post_author, '🦇 The Plush Crypt',
      v_handle || ' commented on your post 🦇', './', v_tag);
    notified := notified || v_post_author;
  end if;

  -- @mentions → anyone named who wasn't already notified.
  for r in select * from _mention_uids(new.body) loop
    if not (r = any(notified)) and not blocked_between(r, new.author_id) then
      perform _push_send(r, '🦇 The Plush Crypt',
        v_handle || ' mentioned you in a comment 🦇', './', v_tag);
      notified := notified || r;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists push_post_comment on post_comments;
create trigger push_post_comment
  after insert on post_comments
  for each row execute function trg_push_post_comment();

-- ── New posts: @mentions first, then the audience fan-out ──────────────
-- Replaces the 0042 version. A mentioned friend gets the specific
-- "mentioned you" message instead of the generic "shared a new post".
create or replace function trg_push_post()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_handle text := _push_handle(new.author_id);
  v_body   text;
  v_tag    text := 'post-' || new.id::text;
  notified uuid[] := array[new.author_id];
  r record;
  m uuid;
begin
  if is_suppressed(new.author_id) then return null; end if;

  -- Mentions (any visibility — if you're named, you should hear).
  for m in select * from _mention_uids(new.body) loop
    if not (m = any(notified)) and not blocked_between(m, new.author_id) then
      perform _push_send(m, '🦇 The Plush Crypt',
        v_handle || ' mentioned you in a post 🦇', './', v_tag);
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
      perform _push_send(r.uid, '🦇 The Plush Crypt', v_body, './', v_tag);
      notified := notified || r.uid;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists push_post on posts;
create trigger push_post
  after insert on posts
  for each row execute function trg_push_post();

-- ── Trade feedback received ─────────────────────────────────────────────
create or replace function trg_push_trade_feedback()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.ratee_id <> new.rater_id
     and not is_suppressed(new.rater_id)
     and not blocked_between(new.ratee_id, new.rater_id) then
    perform _push_send(new.ratee_id, '🦇 The Plush Crypt',
      _push_handle(new.rater_id) || ' left you trade feedback 🦇', './',
      'feedback-' || new.trade_id::text);
  end if;
  return null;
end;
$$;

drop trigger if exists push_trade_feedback on trade_feedback;
create trigger push_trade_feedback
  after insert on trade_feedback
  for each row execute function trg_push_trade_feedback();

-- ── Photo suggestions: queue ping to admins + approval to the suggester ─
create or replace function trg_push_photo_suggestion()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  a uuid;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    -- Skip admin self-submissions (they're doing the reviewing anyway).
    if not exists (select 1 from profiles where id = new.submitted_by and is_admin) then
      for a in select id from profiles where is_admin loop
        if a <> new.submitted_by then
          perform _push_send(a, '🦇 The Plush Crypt',
            _push_handle(new.submitted_by) || ' suggested a catalog photo 📷', './', 'admin-photo');
        end if;
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'approved' then
    if new.submitted_by is not null and new.submitted_by is distinct from new.reviewed_by then
      perform _push_send(new.submitted_by, '🦇 The Plush Crypt',
        'Your photo made the catalog! Thank you 🖤', './', 'photo-approved');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists push_photo_suggestion on catalog_photo_suggestions;
create trigger push_photo_suggestion
  after insert or update on catalog_photo_suggestions
  for each row execute function trg_push_photo_suggestion();

-- ── Catalog item suggestions: queue ping + approval ─────────────────────
create or replace function trg_push_catalog_suggestion()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  a uuid;
begin
  if tg_op = 'INSERT' and new.status = 'pending' and new.submitted_by is not null then
    if not exists (select 1 from profiles where id = new.submitted_by and is_admin) then
      for a in select id from profiles where is_admin loop
        if a <> new.submitted_by then
          perform _push_send(a, '🦇 The Plush Crypt',
            _push_handle(new.submitted_by) || ' suggested a new catalog item 🧸', './', 'admin-catalog');
        end if;
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'approved' then
    if new.submitted_by is not null and new.submitted_by is distinct from new.approved_by then
      perform _push_send(new.submitted_by, '🦇 The Plush Crypt',
        'Your suggested plush was added to the catalog! 🖤', './', 'catalog-approved');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists push_catalog_suggestion on catalog_items;
create trigger push_catalog_suggestion
  after insert or update on catalog_items
  for each row execute function trg_push_catalog_suggestion();

-- ── New content report → everyone who can moderate ──────────────────────
create or replace function trg_push_report()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  m uuid;
begin
  for m in select id from profiles where is_admin or is_moderator loop
    if m <> new.reporter_id then
      perform _push_send(m, '🦇 The Plush Crypt',
        'New report in the crypt — the queue needs you 🚩', './', 'admin-report');
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists push_report on content_reports;
create trigger push_report
  after insert on content_reports
  for each row execute function trg_push_report();

-- ── Account-deletion request → admins (db/0068 review queue) ────────────
create or replace function trg_push_deletion_request()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  a uuid;
begin
  if old.deletion_requested_at is null and new.deletion_requested_at is not null then
    for a in select id from profiles where is_admin loop
      if a <> new.id then
        perform _push_send(a, '🦇 The Plush Crypt',
          _push_handle(new.id) || ' asked to delete their account', './', 'admin-deletion');
      end if;
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists push_deletion_request on profiles;
create trigger push_deletion_request
  after update on profiles
  for each row execute function trg_push_deletion_request();

-- Confirmation.
select 'notification coverage installed: replies, mentions (posts+comments), trade feedback, photo/catalog approvals, mod/admin queue pings' as status;
