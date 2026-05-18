-- ============================================================
-- Plushie tracker — migration 0003: collection quantity
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run; uses IF NOT EXISTS and guarded constraint add.
-- ============================================================

alter table plushies
  add column if not exists quantity integer not null default 1;

do $$ begin
  alter table plushies
    add constraint plushies_quantity_positive check (quantity > 0);
exception when duplicate_object then null; end $$;
