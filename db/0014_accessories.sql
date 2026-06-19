-- ─── Phase C: accessories as per-collection-item checklist ──────
-- The catalog item knows what accessories COME WITH the plushie (parsed
-- from Shopify body_html's 'Set Includes' list — Phase L). The user's
-- collection row now records which of those they DON'T have (default
-- empty array = they have all of them, the common case).
--
-- 'Has bag' was the same idea applied to one accessory only. The
-- existing has_bag column is kept for now so older clients don't break;
-- the migration backfills any has_bag=false rows into the new array.

alter table plushies
  add column if not exists missing_accessories text[] not null default '{}';

-- Backfill: every row currently flagged has_bag = false gets 'tote bag'
-- pushed into missing_accessories. Lowercase canonical name; the client
-- canonicalizes parsed accessory strings the same way (strip the 'Nx '
-- prefix, strip parenthesized measurements, lowercase) before comparing.
update plushies
   set missing_accessories = array_append(missing_accessories, 'tote bag')
 where has_bag = false
   and not ('tote bag' = any(missing_accessories));

-- Custom catalog items (admin-curated, off-catalog plushies) can carry
-- their own accessories list — variants of Shopify items inherit from
-- the parent automatically via resolveCatalogItem.
alter table catalog_items
  add column if not exists accessories jsonb not null default '[]'::jsonb;
