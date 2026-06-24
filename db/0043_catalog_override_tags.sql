-- 0043_catalog_override_tags.sql
-- Let admins hand-correct two more catalog tags from the "Edit details" overlay,
-- so they don't need a code change for every mislabeled item:
--   * category — re-categorise an item (e.g. clothing that Shopify types as
--     'accessory', or a keychain that's really a plush). NULL = inherit.
--   * retired  — force an item retired/active regardless of the live feed.
--     TRUE = retired, FALSE = active, NULL = inherit.
-- These overlay the live-parsed Shopify rows, keyed by handle, just like the
-- existing lore/symbolism/accessories/image overrides.

alter table catalog_overrides
  add column if not exists category text,
  add column if not exists retired boolean;
