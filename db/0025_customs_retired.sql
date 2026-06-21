-- ============================================================
-- Plushie tracker — migration 0025: customs are retired by default
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================
--
-- Every catalog_items row is a custom / off-catalog plushie, created
-- precisely because it's an early / Patreon-era / retired item that's
-- gone from the live store. So treat them as Retired by definition:
-- default the flag to true for future customs and backfill existing
-- rows. The client already renders the "Retired" badge + filter off
-- this column, so no app deploy is needed.

alter table catalog_items alter column retired set default true;

update catalog_items
  set retired = true
  where retired is distinct from true;
