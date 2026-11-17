-- ============================================================
-- Plushie tracker — migration 0113: For Sale launch hardening.
-- Safe to re-run.
-- ============================================================
--
-- 1. PROBLEMS. A buyer can report a problem with a shipped/delivered order
--    (market-checkout `report_problem`). While it's open the automatic 3-day
--    payout is held; an admin settles it by refunding the buyer or paying the
--    seller. payout_withheld_cents fixes a payout's amount once, so a retried
--    payout always asks Stripe for the same transfer.
-- 2. PAYOUTS BEFORE ACCEPT. An offer can't be accepted until the seller can be
--    paid (Stripe onboarding finished).
-- 3. LAPSED HOLDS. An accepted deal the buyer never pays for goes back on sale
--    by itself: the hourly job re-opens the listing, cancels the unpaid order
--    and closes the offer, and tells both sides.
-- 4. THE HOURLY JOB now wakes market-checkout whenever any order is in flight
--    (it retries labels, re-reads tracking, refunds unshipped orders after 5
--    days and pays out delivered ones) — not only when one is delivered.
-- 5. ADMIN ALERTS. _market_alert_admins() pings every admin (inbox + push)
--    when an order needs a person.
-- 6. BUYERS can always read a listing they have an offer or order on.

alter table market_orders add column if not exists problem_reported_at timestamptz;
alter table market_orders add column if not exists problem_note text;
alter table market_orders add column if not exists problem_resolved_at timestamptz;
alter table market_orders add column if not exists payout_withheld_cents integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'market_orders_problem_note_len') then
    alter table market_orders add constraint market_orders_problem_note_len check (char_length(problem_note) <= 1000);
  end if;
end $$;

-- ─── Admin alerts ────────────────────────────────────────────────────
-- Server-side only: callable by the edge function's privileged key and by
-- other definer functions, never by a signed-in user.
create or replace function _market_alert_admins(p_body text, p_tag text default 'market-admin')
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is not null then raise exception 'MARKET_SERVER_ONLY'; end if;
  for r in select id from profiles where is_admin loop
    perform _push_send(r.id, '🛠️ For Sale needs you', p_body, './#admin', p_tag, null, 'market_order');
  end loop;
end;
$$;

-- ─── Lapsed holds go back on sale ────────────────────────────────────
-- 10 minutes of grace past the hold so a payment that is completing right now
-- (checkout keeps the hold alive 5 minutes past its own page) always wins.
create or replace function _market_expire_holds()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  if auth.uid() is not null then raise exception 'MARKET_SERVER_ONLY'; end if;
  for r in
    select l.id, l.seller_id, l.name, l.reserved_offer_id, o.buyer_id
      from market_listings l
      left join market_offers o on o.id = l.reserved_offer_id
     where l.status = 'reserved'
       and l.reserved_until < now() - interval '10 minutes'
       and not exists (select 1 from market_orders mo
                        where mo.offer_id = l.reserved_offer_id
                          and mo.status not in ('awaiting_payment', 'cancelled', 'refunded'))
       for update of l skip locked
  loop
    update market_orders set status = 'cancelled', updated_at = now()
     where offer_id = r.reserved_offer_id and status = 'awaiting_payment';
    update market_offers set status = 'withdrawn', responded_at = now()
     where id = r.reserved_offer_id and status = 'accepted';
    update market_listings
       set status = 'active', reserved_offer_id = null, reserved_until = null, updated_at = now()
     where id = r.id;
    perform _push_send(r.seller_id, '🦇 The Plush Crypt',
      'The hold on ' || r.name || ' ended without payment — it''s back on sale.',
      './#trade', 'market-hold-' || r.id::text, null, 'market_offer');
    if r.buyer_id is not null then
      perform _push_send(r.buyer_id, '🦇 The Plush Crypt',
        'Your hold on ' || r.name || ' ended before it was paid. If it''s still there you can make a new offer.',
        './#trade', 'market-hold-' || r.id::text, null, 'market_offer');
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ─── The hourly job ──────────────────────────────────────────────────
create or replace function _market_release_tick()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  perform _market_expire_holds();
  if not exists (select 1 from market_orders
                  where status in ('paid', 'shipped', 'delivered')
                     or (status = 'released' and stripe_transfer_id is null)) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'market hourly job: vault secrets project_url / send_push_key are missing';
    return;
  end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/market-checkout?cron=release',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

-- ─── Offers: no accept until the seller can be paid ──────────────────
-- (body otherwise unchanged from db/0110)
create or replace function market_respond_offer(
  p_offer uuid, p_action text, p_counter integer default null, p_message text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  o market_offers%rowtype;
  l market_listings%rowtype;
  v_uid uuid := auth.uid();
  v_responder_role text;
  v_new uuid;
  v_other uuid;
  v_tag text;
begin
  if v_uid is null or not market_allowed(v_uid) then raise exception 'MARKET_NOT_ENABLED'; end if;
  select * into o from market_offers where id = p_offer for update;
  if not found then raise exception 'MARKET_OFFER_NOT_FOUND'; end if;
  select * into l from market_listings where id = o.listing_id for update;

  -- Only the side that did NOT make the offer may answer it.
  v_responder_role := case when o.from_role = 'buyer' then 'seller' else 'buyer' end;
  if (v_responder_role = 'seller' and v_uid <> l.seller_id)
     or (v_responder_role = 'buyer' and v_uid <> o.buyer_id) then
    raise exception 'MARKET_NOT_YOUR_OFFER';
  end if;
  if o.status <> 'pending' then raise exception 'MARKET_OFFER_CLOSED'; end if;
  if o.expires_at < now() then raise exception 'MARKET_OFFER_EXPIRED'; end if;

  v_other := case when v_responder_role = 'seller' then o.buyer_id else l.seller_id end;
  v_tag := 'market-offer-' || l.id::text || '-' || o.buyer_id::text;

  if p_action = 'decline' then
    update market_offers set status = 'declined', responded_at = now() where id = o.id;
    perform _push_send(v_other, '🦇 The Plush Crypt',
      _push_handle(v_uid) || ' declined your offer on ' || l.name, './#trade', v_tag, v_uid, 'market_offer');
    return o.id;
  end if;

  if not _market_listing_open(l) then raise exception 'MARKET_LISTING_UNAVAILABLE'; end if;

  if p_action = 'accept' then
    if o.amount_cents > l.price_cents then raise exception 'MARKET_OFFER_ABOVE_PRICE'; end if;
    -- A deal the buyer can't pay for just burns the 48-hour hold: the seller
    -- must be able to receive money before anything is accepted.
    if not exists (select 1 from market_sellers ms
                    where ms.user_id = l.seller_id and ms.charges_enabled and ms.payouts_enabled) then
      raise exception 'MARKET_PAYOUTS_NOT_READY';
    end if;
    update market_offers set status = 'accepted', responded_at = now() where id = o.id;
    update market_listings
       set status = 'reserved', reserved_offer_id = o.id,
           reserved_until = now() + interval '48 hours', updated_at = now()
     where id = l.id;
    perform _push_send(v_other, '🦇 The Plush Crypt',
      _push_handle(v_uid) || ' accepted $' || to_char(o.amount_cents / 100.0, 'FM999990.00') || ' for ' || l.name || ' 🎉',
      './#trade', v_tag, v_uid, 'market_offer');
    return o.id;
  end if;

  if p_action = 'counter' then
    if p_counter is null or p_counter < 500 then raise exception 'MARKET_OFFER_TOO_LOW'; end if;
    if p_counter > l.price_cents then raise exception 'MARKET_OFFER_ABOVE_PRICE'; end if;
    update market_offers set status = 'countered', responded_at = now() where id = o.id;
    insert into market_offers (listing_id, buyer_id, from_role, amount_cents, message, parent_offer_id)
      values (l.id, o.buyer_id, v_responder_role, p_counter,
              nullif(btrim(coalesce(p_message, '')), ''), o.id)
      returning id into v_new;
    perform _push_send(v_other, '🦇 The Plush Crypt',
      _push_handle(v_uid) || ' countered at $' || to_char(p_counter / 100.0, 'FM999990.00') || ' for ' || l.name,
      './#trade', v_tag, v_uid, 'market_offer');
    return v_new;
  end if;

  raise exception 'MARKET_BAD_ACTION';
end;
$$;

-- ─── A buyer keeps seeing what they dealt on ─────────────────────────
-- Sold/removed listings were invisible to everyone but the seller, so the
-- buyer's own order lost its item name, photo and seller the moment they paid.
-- Anyone with an offer or an order on a listing can always read it. (A definer
-- helper, because market_offers' own policy looks back at market_listings.)
create or replace function _market_my_deal(p_listing uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from market_offers o where o.listing_id = p_listing and o.buyer_id = auth.uid())
      or exists (select 1 from market_orders mo where mo.listing_id = p_listing and mo.buyer_id = auth.uid());
$$;
alter policy market_listings_read on market_listings
  using (
    seller_id = auth.uid()
    or is_admin()
    or (status in ('active', 'reserved')
        and market_allowed(auth.uid())
        and seller_id not in (select blocked_user_ids()))
    or _market_my_deal(id)
  );

-- Confirmation.
select
  (select count(*) from information_schema.columns
    where table_name = 'market_orders' and column_name in ('problem_reported_at', 'problem_note', 'problem_resolved_at', 'payout_withheld_cents')) as new_order_columns,
  (select count(*) from pg_proc where proname in ('_market_alert_admins', '_market_expire_holds')) as new_functions,
  (select count(*) from cron.job where jobname = 'market-release' and active) as hourly_job_active,
  (select count(*) from vault.decrypted_secrets where name in ('project_url', 'send_push_key')) as vault_secrets_present;
