-- ─── Alt-lore: our own same-style retelling of each item's lore ──────
-- The lore shown for Shopify-fed items is parsed live from Plushie
-- Dreadfuls' product body_html — i.e. PD's own copyrighted prose. We want
-- the app to display an ORIGINAL retelling in the same voice instead of
-- reproducing that prose verbatim, while still keeping PD's original on
-- hand (it's only ever live-parsed, never overwritten) in case the app is
-- one day sold to PD and they want their words back.
--
-- This adds a single nullable `alt_lore` column to both lore-bearing
-- tables:
--   * catalog_overrides — the overlay for upstream Shopify products.
--   * catalog_items      — admin-curated custom products.
--
-- Display rule (client side): show `alt_lore` when present, else fall
-- back to the original `lore` (override → live parse). `alt_lore` is
-- additive and non-destructive; nothing about the existing `lore` /
-- `symbolism` / `accessories` columns changes.

alter table catalog_overrides add column if not exists alt_lore text;
alter table catalog_items     add column if not exists alt_lore text;
