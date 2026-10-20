-- ============================================================
-- Plushie tracker — migration 0107: For Sale market, phase 2 (payments).
-- Stripe Connect Express sellers, one order per accepted offer, webhook
-- idempotency. Money moves only in edge functions with the Stripe secret
-- key; clients can read their own rows and nothing else.
-- ============================================================
--
-- FLOW. Buyer pays the PLATFORM (separate charge). The seller's share is
-- transferred only after delivery is confirmed (or the auto-release window
-- passes), which is the payout hold. Refunds before release need no transfer
-- reversal.

-- A seller's connected Stripe account. Separate from profiles so the
-- admin-only profile lockdown (db/0080) stays untouched.
create table if not exists market_sellers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table market_sellers enable row level security;
create policy market_sellers_read_own on market_sellers
  for select to authenticated using (user_id = auth.uid() or is_admin());
-- No write policies: only the stripe edge functions write (service key).

-- One order per accepted offer. Amounts are frozen at checkout time.
create table if not exists market_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references market_listings(id),
  offer_id uuid not null references market_offers(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  item_cents integer not null check (item_cents >= 100),
  shipping_cents integer not null check (shipping_cents >= 0),
  buyer_fee_cents integer not null check (buyer_fee_cents >= 0),
  seller_fee_cents integer not null check (seller_fee_cents >= 0),
  total_cents integer not null,            -- what the buyer is charged
  seller_payout_cents integer not null,    -- what the seller receives on release
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'paid', 'shipped', 'delivered',
                      'released', 'refunded', 'cancelled', 'disputed')),
  stripe_session_id text unique,
  stripe_payment_intent text unique,
  stripe_transfer_id text unique,
  tracking_carrier text,
  tracking_number text,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = item_cents + shipping_cents + buyer_fee_cents),
  check (seller_payout_cents = item_cents + shipping_cents - seller_fee_cents)
);
create index if not exists market_orders_buyer_idx on market_orders(buyer_id, created_at desc);
create index if not exists market_orders_seller_idx on market_orders(seller_id, created_at desc);
-- At most one live order per offer.
create unique index if not exists market_orders_one_live_per_offer
  on market_orders(offer_id) where status not in ('cancelled', 'refunded');
alter table market_orders enable row level security;
create policy market_orders_read on market_orders
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid() or is_admin());

-- Stripe retries webhooks; remember what we've handled.
create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table stripe_events enable row level security;   -- service key only

select
  (select count(*) from information_schema.tables
    where table_name in ('market_sellers', 'market_orders', 'stripe_events')) as phase2_tables_created;
