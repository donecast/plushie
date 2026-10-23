-- ============================================================
-- Plushie tracker — migration 0108: For Sale shipping on our labels
-- (EasyPost). Sellers set a package + the services they'll ship with; the
-- buyer picks a live rate at checkout and pays exactly that; the platform
-- buys the label after payment and the seller prints it. Carrier tracking
-- drives the order (shipped → delivered) and the seller is paid
-- automatically 3 days after delivery (hourly sweep below).
--
-- Because shipping is now the real label cost, fees apply to the item only
-- and the shipping money pays for the label — the seller's payout is
-- item − seller fee (db/0107's check assumed the seller kept shipping).
-- Safe to re-run.
-- ============================================================

-- Where a seller ships from. Private: only the owner reads/writes it; the
-- market-checkout function reads it with the service key to rate + label.
create table if not exists market_ship_from (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  street1 text not null check (char_length(street1) between 1 and 100),
  street2 text check (char_length(street2) <= 100),
  city text not null check (char_length(city) between 1 and 60),
  state text not null check (state ~ '^[A-Z]{2}$'),
  zip text not null check (zip ~ '^\d{5}(-\d{4})?$'),
  updated_at timestamptz not null default now()
);
alter table market_ship_from enable row level security;
drop policy if exists market_ship_from_own on market_ship_from;
create policy market_ship_from_own on market_ship_from
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What the seller will ship: { preset: 'mailer'|'small'|'medium'|'large', weightOz }
-- and which services (rules.mjs SHIP_SERVICES keys) the buyer may pick from.
alter table market_listings add column if not exists parcel jsonb;
alter table market_listings add column if not exists ship_services text[];

-- The label we buy for an order.
alter table market_orders add column if not exists easypost_shipment_id text;
alter table market_orders add column if not exists easypost_rate_id text;
alter table market_orders add column if not exists ship_service text;        -- SHIP_SERVICES key
alter table market_orders add column if not exists label_url text;
alter table market_orders add column if not exists easypost_tracker_id text unique;
alter table market_orders add column if not exists tracking_status text;     -- EasyPost tracker status
alter table market_orders add column if not exists label_error text;         -- last label-purchase failure, if any
alter table market_orders add column if not exists label_refunded boolean not null default false;

-- Seller payout no longer includes shipping.
alter table market_orders drop constraint if exists market_orders_check1;
alter table market_orders add constraint market_orders_payout_check
  check (seller_payout_cents = item_cents - seller_fee_cents);

-- Hourly: ask market-checkout to pay out orders delivered 3+ days ago.
create extension if not exists pg_cron;
create or replace function _market_release_tick()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then return; end if;
  if not exists (select 1 from market_orders where status = 'delivered') then return; end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/market-checkout?cron=release',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := '{}'::jsonb
  );
end;
$$;
revoke all on function _market_release_tick() from public, anon, authenticated;
select cron.schedule('market-release', '23 * * * *', 'select public._market_release_tick()');

select
  (select count(*) from information_schema.tables where table_name = 'market_ship_from') as ship_from_table,
  (select count(*) from information_schema.columns where table_name = 'market_orders' and column_name = 'label_url') as label_cols,
  (select count(*) from cron.job where jobname = 'market-release') as release_job;
