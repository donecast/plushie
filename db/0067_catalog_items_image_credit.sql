-- ─── catalog_items: attribution for a community-submitted cover photo ──
-- The legacy photo-suggestion flow (catalog_photo_suggestions → approve)
-- drops the submitted image onto a catalog_items row's image_path. Until
-- now that lost the contributor: nothing recorded WHO sent the shot.
--
-- Mirror the convention used for Shopify-fed covers (catalog_overrides
-- carries an image_credit alongside its picked cover): an optional display
-- credit — typically the submitter's @handle — that rides alongside the
-- cover image. On approval we resolve the submitter's username and store it
-- here; mergeCustomCatalog surfaces it as item.imageCredit so the detail
-- view can credit the contributor ("Image courtesy of @handle"). Null for
-- admin/official photos.

alter table catalog_items add column if not exists image_credit text;
