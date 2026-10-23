-- ============================================================
-- Plushie tracker — migration 0109: Seller Agreement acceptance + what
-- sellers owe.
--
-- SELLER AGREEMENT. Selling (listing, payout setup) requires accepting the
-- current Seller Agreement (index.html → Legal → Seller Agreement). One row
-- per user per version; a new version means everyone re-accepts.
--
-- SELLER FEES ARE OWED EITHER WAY (Scott, 2026-10-22). If a seller cancels a
-- paid order, the buyer gets every cent back and the seller still owes the 5%
-- seller fee. It's recorded here and withheld from their next payout(s).
-- Ledger: + = owed, − = settled. Safe to re-run.
-- ============================================================

create table if not exists market_seller_terms (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table market_seller_terms enable row level security;
drop policy if exists market_seller_terms_read on market_seller_terms;
create policy market_seller_terms_read on market_seller_terms
  for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists market_seller_terms_accept on market_seller_terms;
create policy market_seller_terms_accept on market_seller_terms
  for insert to authenticated with check (user_id = auth.uid());

create table if not exists market_seller_ledger (
  id bigint generated always as identity primary key,
  seller_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references market_orders(id),
  amount_cents integer not null check (amount_cents <> 0),
  kind text not null check (kind in ('cancel_fee', 'withheld_from_payout', 'admin_adjust')),
  note text,
  created_at timestamptz not null default now(),
  unique (order_id, kind)            -- one fee and one withholding per order
);
create index if not exists market_seller_ledger_seller_idx on market_seller_ledger(seller_id);
alter table market_seller_ledger enable row level security;
drop policy if exists market_seller_ledger_read on market_seller_ledger;
create policy market_seller_ledger_read on market_seller_ledger
  for select to authenticated using (seller_id = auth.uid() or is_admin());
-- No write policies: only market-checkout (service key) writes.

select
  (select count(*) from information_schema.tables
    where table_name in ('market_seller_terms', 'market_seller_ledger')) as tables_created;
