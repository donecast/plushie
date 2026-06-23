-- ─── Catalog overrides: pick a different cover photo ─────────────
-- Shopify-fed catalog items default their cover to the product's FIRST
-- image (images[0]). That isn't always the most representative shot —
-- e.g. Insomnia Moth Rabbit reads far better with its 4th photo.
--
-- Add an optional `image` to the existing catalog_overrides overlay
-- (db/0038): a non-null value replaces the default cover for that one
-- handle; null keeps inheriting the live images[0]. We store the chosen
-- image's URL (resolved by the admin picker from the product's live
-- image list) so the runtime catalog — which only carries one image per
-- row — can apply it without re-fetching every product.

alter table catalog_overrides add column if not exists image text;

-- Migrate the one hand-coded override that previously lived in
-- app-core.js (CATALOG_IMAGE_OVERRIDES) into the table, so the consolidated
-- DB-driven path is the single source of truth and nothing regresses.
insert into catalog_overrides (handle, image)
values (
  'plushie-dreadfuls-insomnia-moth-rabbit-plush-stuffed-animal',
  'https://cdn.shopify.com/s/files/1/0306/6745/files/plushie-dreadfuls-insomnia-moth-rabbit-plush-stuffed-animal-357.jpg?v=1754993899'
)
on conflict (handle) do update set image = excluded.image;
