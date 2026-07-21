-- ============================================================
-- Plushie tracker — migration 0088: Relics (achievement badges)
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Untappd-style achievements, tuned for this community: relics reward
-- PARTICIPATION and care (first plush, first trade, honest feedback, a
-- photo enshrined in the catalog), never collection completeness — the
-- crypt stays deliberately non-completionist (see Crypt Vitals).
--
-- Mechanics:
--   * user_relics — one row per (user, relic). Readable by every signed-in
--     user (they show on profiles); written ONLY by security-definer fns.
--   * award_relic(user, key) — idempotent. On a FIRST award it (a) queues a
--     push/inbox notification via _push_send and (b) drops a public feed
--     post so friends discover relics exist (posts.relic_key marks it for
--     the fancy card; the body doubles as a plain-text fallback on stale
--     clients). Repeat calls no-op.
--   * Triggers on the existing tables award event relics; claim_time_relics()
--     is called by the client at boot for time-based ones (year-one).
--   * Existing users are BACKFILLED SILENTLY (no posts, no notifications) so
--     day one doesn't flood the feed with a hundred retroactive unlocks.

-- ── The relic ledger ────────────────────────────────────────────────────
create table if not exists user_relics (
  user_id   uuid not null references auth.users(id) on delete cascade,
  relic_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, relic_key)
);
create index if not exists user_relics_user_idx on user_relics(user_id, earned_at);

alter table user_relics enable row level security;
drop policy if exists relics_read on user_relics;
create policy relics_read on user_relics for select to authenticated using (true);
revoke insert, update, delete on user_relics from authenticated;

-- Feed posts announcing an unlock carry the relic key so the client can
-- render the ornate card; body text stays as the fallback for old clients.
alter table posts add column if not exists relic_key text;

-- ── Relic metadata (names/blurbs snapshot into posts + notifications) ──
create or replace function _relic_meta(p_key text)
returns table(emoji text, title text, blurb text)
language sql immutable as $$
  select v.emoji, v.title, v.blurb from (values
    ('first-soul',        '🕯️', 'First Soul',         'welcomed their first plush into the crypt'),
    ('first-proclamation','📜', 'First Proclamation', 'made their first post to the crypt'),
    ('coven-kin',         '🦇', 'Coven Kin',          'formed their first Coven bond'),
    ('first-pact',        '🤝', 'First Pact',         'completed their first trade'),
    ('seasoned-trader',   '🕸️', 'Seasoned Trader',    'completed five trades'),
    ('honest-quill',      '🪶', 'Honest Quill',       'left honest feedback after a trade'),
    ('crypt-chronicler',  '📷', 'Crypt Chronicler',   'had a photo enshrined in the catalog'),
    ('year-one',          '🕰️', 'Year One',           'has haunted the crypt for a full year')
  ) v(key, emoji, title, blurb) where v.key = p_key;
$$;

-- ── award_relic: idempotent award + fanfare ────────────────────────────
create or replace function award_relic(p_user uuid, p_key text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  m record;
begin
  if p_user is null then return; end if;
  select * into m from _relic_meta(p_key);
  if m is null then
    raise warning 'award_relic: unknown relic key %', p_key;
    return;
  end if;

  insert into user_relics(user_id, relic_key) values (p_user, p_key)
  on conflict do nothing;
  if not found then return; end if;   -- already earned → no fanfare

  -- The unlock notification (push + inbox, per 0085).
  perform _push_send(p_user, '🦇 The Plush Crypt',
    'You unearthed a relic: ' || m.emoji || ' ' || m.title || '! 🖤',
    './', 'relic-' || p_key);

  -- The feed post friends discover relics through (Untappd-style). Public,
  -- matching the app's post default (0072); a ghosted author's posts stay
  -- shadow-hidden by the existing visibility rules, so no leak there.
  insert into posts(author_id, body, visibility, relic_key)
  values (p_user,
          'unearthed a relic: ' || m.emoji || ' ' || m.title || ' — ' || m.blurb || ' 🖤',
          'public', p_key);
end;
$$;

-- ── Event triggers ──────────────────────────────────────────────────────

-- First plush → the collection owner's First Soul.
create or replace function trg_relic_first_plush()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform award_relic((select owner_id from collections where id = new.collection_id), 'first-soul');
  return null;
end;
$$;
drop trigger if exists relic_first_plush on plushies;
create trigger relic_first_plush after insert on plushies
  for each row execute function trg_relic_first_plush();

-- First post — but never for the relic announcement posts themselves.
create or replace function trg_relic_first_post()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.relic_key is null then
    perform award_relic(new.author_id, 'first-proclamation');
  end if;
  return null;
end;
$$;
drop trigger if exists relic_first_post on posts;
create trigger relic_first_post after insert on posts
  for each row execute function trg_relic_first_post();

-- Friendship accepted → Coven Kin for both sides.
create or replace function trg_relic_friend()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform award_relic(new.requester_id, 'coven-kin');
    perform award_relic(new.addressee_id, 'coven-kin');
  end if;
  return null;
end;
$$;
drop trigger if exists relic_friend on friendships;
create trigger relic_friend after insert or update on friendships
  for each row execute function trg_relic_friend();

-- Trade completed → First Pact (and Seasoned Trader at five) for both parties.
create or replace function trg_relic_trade_done()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  p uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    foreach p in array array[new.proposer_id, new.recipient_id] loop
      perform award_relic(p, 'first-pact');
      if (select count(*) from trades
          where status = 'completed' and (proposer_id = p or recipient_id = p)) >= 5 then
        perform award_relic(p, 'seasoned-trader');
      end if;
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists relic_trade_done on trades;
create trigger relic_trade_done after update on trades
  for each row execute function trg_relic_trade_done();

-- Trade feedback left → Honest Quill for the rater.
create or replace function trg_relic_feedback()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  perform award_relic(new.rater_id, 'honest-quill');
  return null;
end;
$$;
drop trigger if exists relic_feedback on trade_feedback;
create trigger relic_feedback after insert on trade_feedback
  for each row execute function trg_relic_feedback();

-- Community photo approved → Crypt Chronicler for the suggester.
create or replace function trg_relic_photo()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'approved' and new.submitted_by is not null then
    perform award_relic(new.submitted_by, 'crypt-chronicler');
  end if;
  return null;
end;
$$;
drop trigger if exists relic_photo on catalog_photo_suggestions;
create trigger relic_photo after update on catalog_photo_suggestions
  for each row execute function trg_relic_photo();

-- ── Time-based relics: claimed by the client at boot ───────────────────
create or replace function claim_time_relics()
returns void language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from profiles
             where id = auth.uid() and created_at <= now() - interval '1 year') then
    perform award_relic(auth.uid(), 'year-one');
  end if;
end;
$$;
grant execute on function claim_time_relics() to authenticated;

-- ── Silent backfill for existing users (no posts, no notifications) ────
insert into user_relics(user_id, relic_key)
  select distinct c.owner_id, 'first-soul' from plushies p join collections c on c.id = p.collection_id
union
  select distinct author_id, 'first-proclamation' from posts where relic_key is null
union
  select requester_id, 'coven-kin' from friendships where status = 'accepted'
union
  select addressee_id, 'coven-kin' from friendships where status = 'accepted'
union
  select proposer_id, 'first-pact' from trades where status = 'completed'
union
  select recipient_id, 'first-pact' from trades where status = 'completed'
union
  select uid, 'seasoned-trader' from (
    select uid from (
      select proposer_id as uid from trades where status = 'completed'
      union all
      select recipient_id from trades where status = 'completed'
    ) t group by uid having count(*) >= 5
  ) s
union
  select distinct rater_id, 'honest-quill' from trade_feedback
union
  select distinct submitted_by, 'crypt-chronicler' from catalog_photo_suggestions
    where status = 'approved' and submitted_by is not null
union
  select id, 'year-one' from profiles where created_at <= now() - interval '1 year'
on conflict do nothing;

-- ── Confirmation ────────────────────────────────────────────────────────
select 'relics live: ' || count(*) || ' backfilled across ' || count(distinct user_id) || ' collectors'
  as status from user_relics;
