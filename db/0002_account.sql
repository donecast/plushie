-- ============================================================
-- Plushie tracker — migration 0002: account profile data
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run; uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- Each user's default shipping address, used to pre-fill trade
-- address exchanges. Separate table so it's not world-readable
-- via the public profiles row.
create table if not exists user_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  address text,
  updated_at timestamptz not null default now()
);

alter table user_addresses enable row level security;

drop policy if exists addr_self_all on user_addresses;
create policy addr_self_all on user_addresses for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
