-- 0039_orphaned_photo_paths.sql
--
-- Clean up photo_path values that point at objects which no longer exist
-- in the Supabase Storage `photos` bucket. These are the source of the
-- "signed url failed … Object not found" 400s in the browser console:
-- the app asks Storage to sign a URL for a key that isn't there.
--
-- A photo_path is "orphaned" when it is a storage key (NOT an http(s)
-- URL — those are Shopify CDN links still pending snapshot) and has no
-- matching row in storage.objects for the `photos` bucket.
--
-- ⚠️ Run the REPORT section first and eyeball the counts. Nulling a
-- photo_path is not reversible (the item just loses its picture and has
-- to be re-photographed). If a count is unexpectedly large, STOP — that
-- points at a bucket-level problem (e.g. a bad migration), not a handful
-- of stragglers, and bulk-nulling would be the wrong fix.

-- ── REPORT: how many orphans per table ────────────────────────────────
select 'plushies' as tbl, count(*) as orphaned
from plushies p
where p.photo_path is not null
  and p.photo_path not like 'http%'
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'photos' and o.name = p.photo_path
  )
union all
select 'wishlist', count(*)
from wishlist w
where w.photo_path is not null
  and w.photo_path not like 'http%'
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'photos' and o.name = w.photo_path
  )
union all
select 'trade_items', count(*)
from trade_items t
where t.photo_path is not null
  and t.photo_path not like 'http%'
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'photos' and o.name = t.photo_path
  );

-- Optional: see the actual offending rows before deciding.
-- select id, name, photo_path from plushies p
-- where p.photo_path is not null and p.photo_path not like 'http%'
--   and not exists (select 1 from storage.objects o
--                   where o.bucket_id = 'photos' and o.name = p.photo_path);

-- ── CLEANUP: null the orphans (run only after reviewing the report) ────
-- update plushies p set photo_path = null
-- where p.photo_path is not null and p.photo_path not like 'http%'
--   and not exists (select 1 from storage.objects o
--                   where o.bucket_id = 'photos' and o.name = p.photo_path);
--
-- update wishlist w set photo_path = null
-- where w.photo_path is not null and w.photo_path not like 'http%'
--   and not exists (select 1 from storage.objects o
--                   where o.bucket_id = 'photos' and o.name = w.photo_path);
--
-- update trade_items t set photo_path = null
-- where t.photo_path is not null and t.photo_path not like 'http%'
--   and not exists (select 1 from storage.objects o
--                   where o.bucket_id = 'photos' and o.name = t.photo_path);
