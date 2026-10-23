-- ============================================================
-- Plushie tracker — migration 0110: For Sale minimum price is $5 (was $1).
-- With the $1-minimum seller fee (2026-10-22), a $1 sale left the seller
-- nothing; $5 keeps every sale worth something. Listings, offers, counters and
-- orders all floor at 500 cents. Safe to re-run.
-- ============================================================

alter table market_listings drop constraint if exists market_listings_price_cents_check;
alter table market_listings add constraint market_listings_price_cents_check
  check (price_cents between 500 and 1000000);
alter table market_offers drop constraint if exists market_offers_amount_cents_check;
alter table market_offers add constraint market_offers_amount_cents_check
  check (amount_cents between 500 and 1000000);
alter table market_orders drop constraint if exists market_orders_item_cents_check;
alter table market_orders add constraint market_orders_item_cents_check
  check (item_cents >= 500);

-- Offer + counter floors (bodies otherwise unchanged from db/0106).
create or replace function market_make_offer(p_listing uuid, p_amount integer, p_message text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  l market_listings%rowtype;
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not market_allowed(v_uid) then raise exception 'MARKET_NOT_ENABLED'; end if;
  select * into l from market_listings where id = p_listing for update;
  if not found then raise exception 'MARKET_LISTING_NOT_FOUND'; end if;
  if l.seller_id = v_uid then raise exception 'MARKET_OWN_LISTING'; end if;
  if l.seller_id in (select blocked_user_ids()) then raise exception 'MARKET_LISTING_NOT_FOUND'; end if;
  if not _market_listing_open(l) then raise exception 'MARKET_LISTING_UNAVAILABLE'; end if;
  if p_amount is null or p_amount < 500 then raise exception 'MARKET_OFFER_TOO_LOW'; end if;
  if p_amount > l.price_cents then raise exception 'MARKET_OFFER_ABOVE_PRICE'; end if;

  -- One live offer per buyer per listing: a fresh offer replaces any pending one.
  update market_offers set status = 'superseded', responded_at = now()
    where listing_id = p_listing and buyer_id = v_uid and status = 'pending';

  insert into market_offers (listing_id, buyer_id, from_role, amount_cents, message)
    values (p_listing, v_uid, 'buyer', p_amount, nullif(btrim(coalesce(p_message, '')), ''))
    returning id into v_id;

  perform _push_send(l.seller_id, '🦇 The Plush Crypt',
    _push_handle(v_uid) || ' offered $' || to_char(p_amount / 100.0, 'FM999990.00') || ' for your ' || l.name,
    './#trade', 'market-offer-' || p_listing::text || '-' || v_uid::text, v_uid, 'market_offer');
  return v_id;
end;
$$;

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

select
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'market_listings_price_cents_check') as listing_floor,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'market_offers_amount_cents_check') as offer_floor;
