-- ============================================================
-- Plushie tracker — migration 0004: nickname
-- Paste into Supabase SQL Editor and run.
-- ============================================================

alter table plushies
  add column if not exists nickname text;
