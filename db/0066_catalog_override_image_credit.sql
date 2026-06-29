-- ─── Catalog overrides: attribution for a community cover photo ──────
-- When an item's cover is a COMMUNITY-submitted photo (a lettered
-- "Picture A" slot in catalog_photos, source = 'community'), we want the
-- detail view to credit the collector who sent it — "Image courtesy of
-- @redrambler".
--
-- The live catalog resolves its cover through the render bridge
-- (catalog_overrides.image; see applyCatalogOverrides in app-core.js),
-- and the runtime catalog carries only ONE image per row with no link
-- back to the catalog_photos row it came from. So, mirroring how `image`
-- was added (db/0040), we add an optional `image_credit` text that rides
-- alongside the chosen cover: a display credit (typically the submitter's
-- @handle) for community covers, null for store/official photos. The
-- admin cover picker writes it when a community shot is chosen and clears
-- it when the cover reverts to a store photo.

alter table catalog_overrides add column if not exists image_credit text;
