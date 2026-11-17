-- ============================================================
-- For Sale — clear SANDBOX data when switching to LIVE keys.
-- Run ONCE in the Supabase SQL editor, right after you put the live
-- STRIPE_SECRET_KEY + EASYPOST_API_KEY into the edge-function secrets and
-- BEFORE anyone sells for real.
-- ============================================================
--
-- Why: everything made while testing points at Stripe's sandbox. A sandbox
-- seller account id doesn't exist in live mode, so payouts setup and checkout
-- would fail for that seller; sandbox orders/fees would sit in the admin list
-- and in sellers' "you owe" totals as if they were real.
--
-- What it removes: every For Sale listing, offer, order, seller-fee ledger row,
-- Stripe seller link and handled-webhook marker. (All of it is test data: the
-- market has never been open with live keys.)
-- What it keeps: Seller Agreement acceptances, ship-from addresses, early-access
-- grants, and the on/off switch.
--
-- After it runs, every seller (you included) sets up payouts again — for real
-- this time.

begin;

-- Refuse to run if a real (live-mode) payment has ever been recorded.
do $$
begin
  if exists (select 1 from market_orders where stripe_session_id like 'cs_live_%') then
    raise exception 'Live orders exist — this reset is only for sandbox data. Nothing was changed.';
  end if;
end $$;

delete from market_seller_ledger;
delete from market_orders;
delete from market_offers;
delete from market_listing_photos;
delete from market_listings;
delete from market_sellers;
delete from stripe_events;

commit;

-- Confirmation: every count should be 0.
select
  (select count(*) from market_listings)      as listings,
  (select count(*) from market_offers)        as offers,
  (select count(*) from market_orders)        as orders,
  (select count(*) from market_seller_ledger) as ledger_rows,
  (select count(*) from market_sellers)       as seller_links;
