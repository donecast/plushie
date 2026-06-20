-- ============================================================
-- Plushie tracker — migration 0018: catalog release_year + edits
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================

-- Year the plushie was first released. Optional; useful on customs
-- (Patreon-era + retired-before-Shopify items where there's no
-- product page to scrape a date from).
alter table catalog_items
  add column if not exists release_year integer;

-- Sanity range so a typo doesn't write release_year = 20025.
do $$
begin
  alter table catalog_items
    add constraint catalog_items_release_year_range
    check (release_year is null or (release_year between 1900 and 2100));
exception when duplicate_object then null;
end $$;
