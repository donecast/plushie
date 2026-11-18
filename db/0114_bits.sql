-- ============================================================
-- Plushie tracker — migration 0114: Bits (points + leaderboard).
-- Safe to re-run.
-- ============================================================
--
-- Members earn Bits for showing up, being active, contributing photos and
-- finishing deals. For now Bits are ONLY a leaderboard: nothing can be spent.
-- The future exchange rate (2 Bits = 1¢ off a Plush Crypt fee) and the
-- spending switch live in app_settings 'bits.config' so turning spending on
-- later is a settings change plus the spend code, not a data migration.
--
-- Every award is written by the database (triggers + one check-in rpc), never
-- by the client, so Bits can't be faked. Awards are idempotent: one ledger row
-- per (user, reason, ref).
--
-- Amounts live in bits_rules so they can be retuned without shipping code.
--
-- "Total earned" (all ledger rows) is public via the leaderboard rpc.
-- The spendable balance (rows with counts_balance) is private to the owner.
-- Photos approved BEFORE this migration are backfilled leaderboard-only
-- (counts_balance = false), so past work ranks but isn't spendable.

-- ─── Rules (amounts) ─────────────────────────────────────────
create table if not exists bits_rules (
  key   text primary key,
  bits  integer not null,
  label text not null,
  sort  integer not null default 0
);
alter table bits_rules enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bits_rules' and policyname = 'bits_rules_read') then
    create policy bits_rules_read on bits_rules for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bits_rules' and policyname = 'bits_rules_admin') then
    create policy bits_rules_admin on bits_rules for all to authenticated using (is_admin()) with check (is_admin());
  end if;
end $$;

insert into bits_rules (key, bits, label, sort) values
  ('login',              2,   'Log in (first visit of the day)',                       10),
  ('streak_7',           20,  '7-day streak bonus (every 7 days in a row)',            11),
  ('streak_30',          100, '30-day streak bonus (every 30 days in a row)',          12),
  ('add_item',           1,   'Add an item to your Crypt',                             20),
  ('post',               2,   'Post',                                                  21),
  ('comment',            1,   'Comment on someone else''s post',                       22),
  ('feedback',           5,   'Leave feedback after a trade',                          23),
  ('activity_daily_cap', 15,  'Daily limit for items, posts, comments and feedback',   29),
  ('photo',              25,  'Approved photo of a catalog item',                      30),
  ('photo_cover',        100, 'Approved photo that replaces the store photo as cover', 31),
  ('photo_cover_plush',  150, 'The same, for a full plush',                            32),
  ('trade',              25,  'Complete a trade (each side)',                          40),
  ('sale_per_dollar',    1,   'Buy or sell something (per $1 of item price)',          41),
  ('first_deal',         50,  'Your first-ever sale or trade',                         42)
on conflict (key) do nothing;

create or replace function bits_rule(p_key text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select bits from bits_rules where key = p_key), 0);
$$;

-- Config: future exchange rate + spending switch (OFF) + the day boundary.
insert into app_settings (key, value) values
  ('bits.config', '{"bits_per_cent": 2, "spending_enabled": false, "max_fee_share": 0.5, "timezone": "America/New_York", "hidden_usernames": ["e2e_seller", "e2e_buyer", "e2e_admin"]}'::jsonb)
on conflict (key) do nothing;

create or replace function bits_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce(
    (select value->>'timezone' from app_settings where key = 'bits.config'), 'America/New_York'))::date;
$$;

-- ─── Ledger ──────────────────────────────────────────────────
create table if not exists bits_ledger (
  id             bigserial primary key,
  user_id        uuid not null references profiles(id) on delete cascade,
  amount         integer not null,
  reason         text not null,
  ref            text not null,
  day            date not null default bits_today(),
  counts_balance boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (user_id, reason, ref)
);
create index if not exists bits_ledger_user_idx on bits_ledger (user_id, day);
create index if not exists bits_ledger_day_idx  on bits_ledger (day);
alter table bits_ledger enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bits_ledger' and policyname = 'bits_ledger_read_own') then
    create policy bits_ledger_read_own on bits_ledger for select to authenticated
      using (user_id = auth.uid() or is_admin());
  end if;
end $$;
-- No write policies: only the security-definer functions below write.

create table if not exists bits_streaks (
  user_id  uuid primary key references profiles(id) on delete cascade,
  current  integer not null default 0,
  best     integer not null default 0,
  last_day date
);
alter table bits_streaks enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bits_streaks' and policyname = 'bits_streaks_read_own') then
    create policy bits_streaks_read_own on bits_streaks for select to authenticated
      using (user_id = auth.uid() or is_admin());
  end if;
end $$;

-- Which catalog targets have ever had a community photo as their cover. The
-- FIRST one replaces the store photo and earns the cover bonus; later cover
-- swaps don't. Pre-existing community covers are recorded (no award) so the
-- bonus can't be re-earned for items that already got off the store photo.
create table if not exists bits_cover_firsts (
  target_key  text primary key,          -- 'h:<handle>' or 'h:<handle>#<variant>'
  handle      text,
  image_path  text,
  awarded_to  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table bits_cover_firsts enable row level security;   -- no policies: internal

-- ─── Award helper ────────────────────────────────────────────
-- Internal helpers live in their own schema: the API only exposes `public`,
-- so members can't call these over rpc to award themselves.
create schema if not exists bits_private;

-- Inserts one ledger row (idempotent). p_capped rows share the daily activity
-- cap: the award is trimmed to whatever is left today. Returns bits awarded.
create or replace function bits_private._bits_award(
  p_uid uuid, p_reason text, p_ref text, p_amount integer,
  p_capped boolean default false, p_counts_balance boolean default true,
  p_day date default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_amt integer := p_amount;
  v_day date := coalesce(p_day, bits_today());
  v_used integer;
  v_n integer;
begin
  if p_uid is null or coalesce(p_amount, 0) = 0 then return 0; end if;
  if not exists (select 1 from profiles where id = p_uid) then return 0; end if;
  if p_capped then
    select coalesce(sum(amount), 0) into v_used from bits_ledger
     where user_id = p_uid and day = v_day
       and reason in ('add_item', 'post', 'comment', 'feedback');
    v_amt := least(v_amt, greatest(bits_rule('activity_daily_cap') - v_used, 0));
    if v_amt <= 0 then return 0; end if;
  end if;
  insert into bits_ledger (user_id, amount, reason, ref, day, counts_balance)
  values (p_uid, v_amt, p_reason, p_ref, v_day, p_counts_balance)
  on conflict (user_id, reason, ref) do nothing;
  get diagnostics v_n = row_count;
  return case when v_n > 0 then v_amt else 0 end;
end $$;

-- One-time "first sale or trade" bonus.
create or replace function bits_private._bits_first_deal(p_uid uuid) returns integer
language sql security definer set search_path = public as $$
  select bits_private._bits_award(p_uid, 'first_deal', 'once', bits_rule('first_deal'));
$$;

-- ─── Daily check-in (login + streaks) ────────────────────────
-- Called by the app on load. Returns what was earned just now (0 if already
-- checked in today) plus the current streak.
create or replace function bits_checkin()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := bits_today();
  v_s bits_streaks;
  v_earned integer := 0;
  v_cur integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from profiles where id = v_uid and (app_blocked or ghosted)) then
    return jsonb_build_object('earned', 0, 'streak', 0);
  end if;

  insert into bits_streaks (user_id) values (v_uid) on conflict do nothing;
  select * into v_s from bits_streaks where user_id = v_uid for update;

  if v_s.last_day = v_today then
    return jsonb_build_object('earned', 0, 'streak', v_s.current);
  end if;

  v_cur := case when v_s.last_day = v_today - 1 then v_s.current + 1 else 1 end;
  update bits_streaks set current = v_cur, best = greatest(best, v_cur), last_day = v_today
   where user_id = v_uid;

  v_earned := v_earned + bits_private._bits_award(v_uid, 'login', v_today::text, bits_rule('login'));
  if v_cur % 7 = 0 then
    v_earned := v_earned + bits_private._bits_award(v_uid, 'streak_7', v_today::text, bits_rule('streak_7'));
  end if;
  if v_cur % 30 = 0 then
    v_earned := v_earned + bits_private._bits_award(v_uid, 'streak_30', v_today::text, bits_rule('streak_30'));
  end if;
  return jsonb_build_object('earned', v_earned, 'streak', v_cur);
end $$;

-- ─── Activity triggers (share the daily cap) ─────────────────
create or replace function _bits_on_plushie() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  v_uid := coalesce(auth.uid(), (select owner_id from collections where id = new.collection_id));
  perform bits_private._bits_award(v_uid, 'add_item', new.id::text, bits_rule('add_item'), true);
  return null;
exception when others then
  raise warning 'bits add_item: %', sqlerrm;   -- never block adding an item
  return null;
end $$;
create or replace trigger bits_on_plushie after insert on plushies
  for each row execute function _bits_on_plushie();

create or replace function _bits_on_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.relic_key is null then   -- relic auto-posts aren't the member's own effort
    perform bits_private._bits_award(new.author_id, 'post', new.id::text, bits_rule('post'), true);
  end if;
  return null;
exception when others then
  raise warning 'bits post: %', sqlerrm;
  return null;
end $$;
create or replace trigger bits_on_post after insert on posts
  for each row execute function _bits_on_post();

create or replace function _bits_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is distinct from (select author_id from posts where id = new.post_id) then
    perform bits_private._bits_award(new.author_id, 'comment', new.id::text, bits_rule('comment'), true);
  end if;
  return null;
exception when others then
  raise warning 'bits comment: %', sqlerrm;
  return null;
end $$;
create or replace trigger bits_on_comment after insert on post_comments
  for each row execute function _bits_on_comment();

create or replace function _bits_on_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform bits_private._bits_award(new.rater_id, 'feedback', new.trade_id::text, bits_rule('feedback'), true);
  return null;
exception when others then
  raise warning 'bits feedback: %', sqlerrm;
  return null;
end $$;
create or replace trigger bits_on_feedback after insert on trade_feedback
  for each row execute function _bits_on_feedback();

-- ─── Photos ──────────────────────────────────────────────────
create or replace function _bits_is_full_plush(p_handle text) returns boolean
language sql immutable as $$
  select coalesce(p_handle ilike '%plush%' and p_handle not ilike '%mini%', false);
$$;

-- Record the first community cover for each target (no award here — the
-- suggestion-approval trigger pays the submitter).
create or replace function _bits_on_catalog_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_primary and new.source = 'community' and new.target_handle is not null then
    insert into bits_cover_firsts (target_key, handle, image_path)
    values ('h:' || new.target_handle || coalesce('#' || new.target_variant_id::text, ''),
            new.target_handle, new.image_path)
    on conflict (target_key) do nothing;
  end if;
  return null;
exception when others then
  raise warning 'bits cover-first: %', sqlerrm;
  return null;
end $$;
create or replace trigger bits_on_catalog_photo after insert or update of is_primary on catalog_photos
  for each row execute function _bits_on_catalog_photo();

-- Pay a suggestion's submitter. Shared by the live trigger and the backfill.
create or replace function bits_private._bits_pay_photo(p_sugg catalog_photo_suggestions, p_counts_balance boolean, p_day date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_first bits_cover_firsts;
  v_total integer;
begin
  perform bits_private._bits_award(p_sugg.submitted_by, 'photo', p_sugg.id::text, bits_rule('photo'),
                      false, p_counts_balance, p_day);

  -- Did this photo become the FIRST community cover of its item?
  select * into v_first from bits_cover_firsts
   where image_path = p_sugg.image_path and awarded_to is null
   limit 1 for update;
  if found then
    update bits_cover_firsts set awarded_to = p_sugg.submitted_by where target_key = v_first.target_key;
    v_total := case when _bits_is_full_plush(v_first.handle)
                    then bits_rule('photo_cover_plush') else bits_rule('photo_cover') end;
    perform bits_private._bits_award(p_sugg.submitted_by, 'photo_cover', p_sugg.id::text,
                        v_total - bits_rule('photo'), false, p_counts_balance, p_day);
  end if;
end $$;

create or replace function _bits_on_photo_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform bits_private._bits_pay_photo(new, true, null);
  end if;
  return null;
exception when others then
  raise warning 'bits photo: %', sqlerrm;   -- never block an approval
  return null;
end $$;
create or replace trigger bits_on_photo_suggestion after update of status on catalog_photo_suggestions
  for each row execute function _bits_on_photo_suggestion();

-- ─── Trades + sales ──────────────────────────────────────────
create or replace function _bits_on_trade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform bits_private._bits_award(new.proposer_id,  'trade', new.id::text, bits_rule('trade'));
    perform bits_private._bits_award(new.recipient_id, 'trade', new.id::text, bits_rule('trade'));
    perform bits_private._bits_first_deal(new.proposer_id);
    perform bits_private._bits_first_deal(new.recipient_id);
  end if;
  return null;
exception when others then
  raise warning 'bits trade: %', sqlerrm;
  return null;
end $$;
create or replace trigger bits_on_trade after update of status on trades
  for each row execute function _bits_on_trade();

-- A sale pays out once it's released to the seller (the deal is final). A
-- later refund takes the Bits back.
create or replace function _bits_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bits integer;
begin
  if new.status = 'released' and old.status is distinct from 'released' then
    v_bits := (new.item_cents / 100) * bits_rule('sale_per_dollar');
    perform bits_private._bits_award(new.buyer_id,  'purchase', new.id::text, v_bits);
    perform bits_private._bits_award(new.seller_id, 'sale',     new.id::text, v_bits);
    perform bits_private._bits_first_deal(new.seller_id);
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    insert into bits_ledger (user_id, amount, reason, ref, counts_balance)
    select l.user_id, -l.amount, 'reversed', l.reason || ':' || l.ref, l.counts_balance
      from bits_ledger l
     where l.ref = new.id::text and l.reason in ('purchase', 'sale')
    on conflict (user_id, reason, ref) do nothing;
  end if;
  return null;
exception when others then
  raise warning 'bits order: %', sqlerrm;
  return null;
end $$;
create or replace trigger bits_on_order after update of status on market_orders
  for each row execute function _bits_on_order();

-- ─── Reads ───────────────────────────────────────────────────
-- Who appears on the board: not blocked/ghosted/deleting, and not one of the
-- test accounts listed in bits.config.hidden_usernames (they still earn).
create or replace function bits_on_board(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = p_uid
       and not p.app_blocked and not p.ghosted and p.deletion_requested_at is null
       and not coalesce(lower(p.username::text) in (
             select lower(jsonb_array_elements_text(coalesce(s.value->'hidden_usernames', '[]'::jsonb)))
               from app_settings s where s.key = 'bits.config'), false)
  );
$$;

-- Public leaderboard: total earned, all time or this month. Hides blocked,
-- ghosted and deletion-requested accounts.
create or replace function bits_leaderboard(p_period text default 'all', p_limit integer default 50)
returns table (rank bigint, user_id uuid, username text, avatar_path text, bits bigint)
language sql stable security definer set search_path = public as $$
  with totals as (
    select l.user_id, sum(l.amount) as bits
      from bits_ledger l
     where p_period <> 'month' or l.day >= date_trunc('month', bits_today())::date
     group by l.user_id
  )
  select rank() over (order by t.bits desc), t.user_id, p.username::text, p.avatar_path, t.bits
    from totals t join profiles p on p.id = t.user_id
   where auth.uid() is not null and t.bits > 0 and bits_on_board(t.user_id)
   order by t.bits desc, p.username
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- My own Bits: total earned, spendable balance (private), rank, streak,
-- today's activity vs the cap, and recent entries.
create or replace function bits_me()
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  board as (
    select l.user_id, sum(l.amount) as bits
      from bits_ledger l
     where bits_on_board(l.user_id)
     group by l.user_id having sum(l.amount) > 0
  )
  select jsonb_build_object(
    'total',   coalesce((select sum(amount) from bits_ledger, me where user_id = me.uid), 0),
    'balance', coalesce((select sum(amount) from bits_ledger, me where user_id = me.uid and counts_balance), 0),
    'month',   coalesce((select sum(amount) from bits_ledger, me where user_id = me.uid
                          and day >= date_trunc('month', bits_today())::date), 0),
    'rank',    (select 1 + count(*) from board, me
                 where board.bits > coalesce((select bits from board b2 where b2.user_id = me.uid), 0)),
    'members', (select count(*) from board),
    'on_board', (select bits_on_board(uid) from me),
    'streak',  coalesce((select case when s.last_day >= bits_today() - 1 then s.current else 0 end
                           from bits_streaks s, me where s.user_id = me.uid), 0),
    'best_streak', coalesce((select best from bits_streaks s, me where s.user_id = me.uid), 0),
    'activity_today', coalesce((select sum(amount) from bits_ledger, me where user_id = me.uid
                                 and day = bits_today()
                                 and reason in ('add_item', 'post', 'comment', 'feedback')), 0),
    'activity_cap', bits_rule('activity_daily_cap'),
    'recent', coalesce((select jsonb_agg(r order by r.created_at desc) from (
                select amount, reason, created_at from bits_ledger, me
                 where user_id = me.uid order by created_at desc limit 15) r), '[]'::jsonb)
  );
$$;

-- Someone else's total (profile badge). Public by design; balance isn't exposed.
create or replace function bits_total_for(p_uid uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from bits_ledger where user_id = p_uid and auth.uid() is not null;
$$;

-- ─── Backfill: past approved photos, leaderboard-only ────────
insert into bits_cover_firsts (target_key, handle, image_path)
select distinct on (k) k, cp.target_handle, cp.image_path
  from (select *, 'h:' || target_handle || coalesce('#' || target_variant_id::text, '') as k
          from catalog_photos
         where is_primary and source = 'community' and target_handle is not null) cp
 order by k, cp.created_at
on conflict (target_key) do nothing;

do $$
declare r catalog_photo_suggestions;
begin
  for r in select * from catalog_photo_suggestions where status = 'approved' order by coalesce(reviewed_at, submitted_at) loop
    perform bits_private._bits_pay_photo(r, false, coalesce(r.reviewed_at, r.submitted_at)::date);
  end loop;
end $$;

-- Confirmation.
select
  (select count(*) from bits_rules)                                as rules,
  (select value from app_settings where key = 'bits.config')        as config,
  (select count(*) from bits_ledger)                               as ledger_rows,
  (select count(distinct user_id) from bits_ledger)                as members_with_bits,
  (select count(*) from bits_cover_firsts)                         as covers_recorded,
  (select count(*) from bits_cover_firsts where awarded_to is not null) as covers_credited;
