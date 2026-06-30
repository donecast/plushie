-- ─── Per-photo "don't show my name" opt-out ─────────────────────────
-- A contributor suggesting a picture can now ask that their @handle NOT be
-- shown publicly under the photo. Admins still see the real @handle (rendered
-- in blue as a signal), but the public sees an anonymous "a crypt member"
-- credit instead. The choice is captured per-suggestion and travels with the
-- photo all the way to whichever cover table ends up rendering it.
--
-- credit_anon = true  → opted out (hide @handle publicly)
-- credit_anon = false → normal public credit (the existing behaviour)
--
-- Default false everywhere, so every existing row keeps showing its credit
-- exactly as before. Apply BEFORE deploying the code that selects these
-- columns (listCatalogOverrides/listVariantCovers name their columns
-- explicitly — a missing column there throws and blacks out the override
-- layer).

alter table catalog_photo_suggestions add column if not exists credit_anon boolean not null default false;
alter table catalog_photos            add column if not exists credit_anon boolean not null default false;
alter table catalog_overrides         add column if not exists credit_anon boolean not null default false;
alter table catalog_items             add column if not exists credit_anon boolean not null default false;
alter table catalog_variant_covers    add column if not exists credit_anon boolean not null default false;
