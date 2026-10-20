-- ============================================================
-- Plushie tracker — migration 0106: the For Sale market (phase 1: listings
-- + offers). Payments (Stripe Connect checkout, payout hold) are phase 2.
-- Safe to re-run.
-- ============================================================
--
-- THE RULE. You may only list something for sale if Plushie Dreadfuls is NOT
-- selling it at the moment you post. If PD later restocks it, the listing may
-- stay up — but only at or below PD's current price. Any price/detail edit
-- re-runs the check.
--
-- WHO ENFORCES IT. The live PD check can't be trusted to the browser (the
-- shared catalog_snapshot is fed by clients), so listings are written ONLY by
-- the `market-listing` edge function, which fetches PD itself with a privileged
-- key. Clients get no INSERT/UPDATE policy on market_listings or its photos.
-- Offers go through the SECURITY DEFINER RPCs below.
--
-- RESTOCKS. A trigger on catalog_snapshot pauses any active listing priced
-- above PD's price when that product comes back in stock (or PD's price drops
-- while it's in stock), and tells the seller. We never change a seller's price
-- for them; un-pausing goes back through the edge function, which re-checks PD
-- live. The snapshot price is product-level (the cheapest variant), so a
-- pricier variant may get paused conservatively — the live re-check on resume
-- is exact per variant.
--
-- GATING. Insider-only until payments ship: admins + the allowlist (mirrors
-- data.ALWAYS_GRANTED_USERNAMES in data.js — keep the two in sync).

-- ─── Gate ────────────────────────────────────────────────────────────
create or replace function market_allowed(p_uid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = p_uid
      and (p.is_admin or lower(coalesce(p.username, '')) in ('redrambler'))
  );
$$;
revoke all on function market_allowed(uuid) from public, anon;
grant execute on function market_allowed(uuid) to authenticated;

-- ─── Listings ────────────────────────────────────────────────────────
create table if not exists market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  -- The seller's collection row this copy comes from (ownership proof).
  plushie_id uuid references plushies(id) on delete set null,
  catalog_id text not null,
  catalog_handle text,
  pd_variant_id text,            -- set when catalog_id is a '<product>::<variant>' card
  name text not null,
  price_cents integer not null check (price_cents between 100 and 1000000),
  shipping_cents integer not null default 0 check (shipping_cents between 0 and 20000),
  notes text check (char_length(notes) <= 500),
  extras jsonb,                  -- [{ name, included }] includes checklist, same shape as trade_items
  cover_path text,               -- 'social' bucket key of photo #1
  status text not null default 'active'
    check (status in ('active', 'paused', 'reserved', 'sold', 'removed')),
  pause_reason text,             -- 'pd_restocked' | 'pd_price_drop'
  paused_at timestamptz,
  -- An accepted offer holds the listing for the buyer to pay (phase 2).
  reserved_offer_id uuid,
  reserved_until timestamptz,
  -- What the edge function saw on PD at the last check.
  pd_checked_at timestamptz not null,
  pd_state text not null check (pd_state in ('sold_out', 'not_on_pd', 'in_stock_capped')),
  pd_price_cents integer,        -- PD's price at the last check (null when not on PD)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_listings_status_idx on market_listings(status, created_at desc);
create index if not exists market_listings_seller_idx on market_listings(seller_id, status);
create index if not exists market_listings_handle_idx on market_listings(catalog_handle) where status = 'active';

create table if not exists market_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references market_listings(id) on delete cascade,
  social_path text not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists market_listing_photos_idx on market_listing_photos(listing_id, position);

alter table market_listings enable row level security;
alter table market_listing_photos enable row level security;

-- Read: live listings are visible to market insiders (minus anyone you're
-- blocked with); your own listings are always visible to you.
drop policy if exists market_listings_read on market_listings;
create policy market_listings_read on market_listings
  for select to authenticated using (
    seller_id = auth.uid()
    or is_admin()
    or (status in ('active', 'reserved')
        and market_allowed(auth.uid())
        and seller_id not in (select blocked_user_ids()))
  );

drop policy if exists market_listing_photos_read on market_listing_photos;
create policy market_listing_photos_read on market_listing_photos
  for select to authenticated using (
    exists (select 1 from market_listings l where l.id = listing_id)   -- inherits listing RLS
  );
-- No INSERT/UPDATE/DELETE policies: writes go through the edge function
-- (privileged key) or the RPCs below.

-- ─── Offers ──────────────────────────────────────────────────────────
-- One negotiation thread per (listing, buyer). from_role says who made THIS
-- offer; the other side responds. A counter closes the offer it answers
-- ('countered') and opens a new one from the other side.
create table if not exists market_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references market_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  from_role text not null check (from_role in ('buyer', 'seller')),
  amount_cents integer not null check (amount_cents between 100 and 1000000),
  message text check (char_length(message) <= 300),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'countered', 'superseded')),
  parent_offer_id uuid references market_offers(id) on delete set null,
  expires_at timestamptz not null default now() + interval '48 hours',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_offers_listing_idx on market_offers(listing_id, created_at desc);
create index if not exists market_offers_buyer_idx on market_offers(buyer_id, created_at desc);

alter table market_offers enable row level security;
drop policy if exists market_offers_read on market_offers;
create policy market_offers_read on market_offers
  for select to authenticated using (
    buyer_id = auth.uid()
    or is_admin()
    or exists (select 1 from market_listings l where l.id = listing_id and l.seller_id = auth.uid())
  );
-- No write policies: offers move only through the RPCs.

-- A listing is open to offers when active, or reserved by an accept whose
-- payment window lapsed (phase 2 checkout re-validates the hold) — and never
-- while PD (per the snapshot) sells it for less than the asking price. That
-- last clause closes the gaps the restock trigger can't see, e.g. a hold that
-- lapses after the restock already happened.
create or replace function _market_listing_open(l market_listings)
returns boolean language sql stable
set search_path = public
as $$
  select (l.status = 'active'
          or (l.status = 'reserved' and l.reserved_until is not null and l.reserved_until < now()))
     and not exists (
       select 1 from catalog_snapshot s
        where s.handle = l.catalog_handle and s.available
          and s.price is not null and round(s.price * 100) < l.price_cents);
$$;

-- ─── RPC: make an offer (buyer) ──────────────────────────────────────
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
  if p_amount is null or p_amount < 100 then raise exception 'MARKET_OFFER_TOO_LOW'; end if;
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

-- ─── RPC: respond to an offer (accept / decline / counter) ────────────
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
    if p_counter is null or p_counter < 100 then raise exception 'MARKET_OFFER_TOO_LOW'; end if;
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

-- ─── RPC: withdraw your own pending offer ────────────────────────────
create or replace function market_withdraw_offer(p_offer uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  o market_offers%rowtype;
  l market_listings%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into o from market_offers where id = p_offer for update;
  if not found then raise exception 'MARKET_OFFER_NOT_FOUND'; end if;
  select * into l from market_listings where id = o.listing_id;
  if not ((o.from_role = 'buyer' and o.buyer_id = v_uid) or (o.from_role = 'seller' and l.seller_id = v_uid)) then
    raise exception 'MARKET_NOT_YOUR_OFFER';
  end if;
  if o.status <> 'pending' then raise exception 'MARKET_OFFER_CLOSED'; end if;
  update market_offers set status = 'withdrawn', responded_at = now() where id = o.id;
end;
$$;

-- ─── RPC: take your listing down ─────────────────────────────────────
create or replace function market_remove_listing(p_listing uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l market_listings%rowtype;
begin
  select * into l from market_listings where id = p_listing for update;
  if not found or l.seller_id <> auth.uid() then raise exception 'MARKET_LISTING_NOT_FOUND'; end if;
  if l.status = 'sold' then raise exception 'MARKET_LISTING_SOLD'; end if;
  if l.status = 'reserved' and l.reserved_until > now() then raise exception 'MARKET_LISTING_RESERVED'; end if;
  update market_listings set status = 'removed', updated_at = now() where id = p_listing;
  update market_offers set status = 'declined', responded_at = now()
    where listing_id = p_listing and status = 'pending';
end;
$$;

revoke all on function market_make_offer(uuid, integer, text) from public, anon;
revoke all on function market_respond_offer(uuid, text, integer, text) from public, anon;
revoke all on function market_withdraw_offer(uuid) from public, anon;
revoke all on function market_remove_listing(uuid) from public, anon;
grant execute on function market_make_offer(uuid, integer, text) to authenticated;
grant execute on function market_respond_offer(uuid, text, integer, text) to authenticated;
grant execute on function market_withdraw_offer(uuid) to authenticated;
grant execute on function market_remove_listing(uuid) to authenticated;

-- ─── Restock watcher ────────────────────────────────────────────────
-- Fires when PD's product comes back in stock, or its price drops while in
-- stock. Pauses every ACTIVE listing of that product priced above PD and
-- tells the seller. Reserved/sold listings are left alone (a deal is done).
create or replace function trg_market_restock_pause()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_pd_cents integer;
  r record;
begin
  -- Sold out again: live listings that were showing "back at PD" go back to
  -- reading sold out. (Paused ones stay paused — the seller re-saves, and the
  -- edge function's live check lets it through.)
  if not coalesce(new.available, false) then
    if coalesce(old.available, false) then
      update market_listings set pd_state = 'sold_out', updated_at = now()
       where catalog_handle = new.handle and status in ('active', 'reserved')
         and pd_state = 'in_stock_capped';
    end if;
    return null;
  end if;
  if new.price is null then return null; end if;
  if coalesce(old.available, false) and old.price is not distinct from new.price then return null; end if;
  v_pd_cents := round(new.price * 100)::integer;

  -- Listings already at or under PD's price stay up; just show PD's price.
  update market_listings
     set pd_state = 'in_stock_capped', pd_price_cents = v_pd_cents, updated_at = now()
   where catalog_handle = new.handle and status in ('active', 'reserved')
     and price_cents <= v_pd_cents;

  for r in
    update market_listings l
       set status = 'paused',
           pause_reason = case when coalesce(old.available, false) then 'pd_price_drop' else 'pd_restocked' end,
           paused_at = now(), updated_at = now(),
           -- Record what PD now charges so the seller knows the cap to meet.
           pd_state = 'in_stock_capped', pd_price_cents = v_pd_cents
     where l.catalog_handle = new.handle
       and l.status = 'active'
       and l.price_cents > v_pd_cents
    returning l.id, l.seller_id, l.name
  loop
    perform _push_send(r.seller_id, '🦇 The Plush Crypt',
      'Plushie Dreadfuls '
        || case when coalesce(old.available, false) then 'dropped ' || r.name || ' to $' else 'has ' || r.name || ' back in stock at $' end
        || to_char(new.price, 'FM999990.00')
        || ' — your listing is paused until it''s priced at or below that',
      './#trade', 'market-paused-' || r.id::text, null, 'market_paused');
  end loop;
  return null;
end;
$$;

drop trigger if exists market_restock_pause on catalog_snapshot;
create trigger market_restock_pause
  after update of available, price on catalog_snapshot
  for each row execute function trg_market_restock_pause();

-- Confirmation
select
  (select count(*) from information_schema.tables
    where table_name in ('market_listings', 'market_listing_photos', 'market_offers')) as market_tables_created,
  (select count(*) from pg_trigger where tgname = 'market_restock_pause') as restock_trigger_installed;
