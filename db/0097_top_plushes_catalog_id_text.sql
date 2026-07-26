-- 0096_top_plushes_catalog_id_text.sql
-- Fix: saving your Top 8 Buns silently failed for almost everyone.
--
-- top_plushes.catalog_id is a TEXT column (db/0021) and always has been —
-- it holds whatever a collection item's plushies.catalog_id holds. For buns
-- sourced from the live Shopify catalog that's the Shopify product id
-- (e.g. '7412345678901') or, for a variant, 'parentId::variantId'. Neither
-- is a UUID.
--
-- db/0081 rewrote set_top_plushes() as an atomic delete+insert and, in the
-- process, cast the incoming value with `nullif(r->>'catalog_id','')::uuid`.
-- That cast throws `invalid input syntax for type uuid` for every non-UUID
-- catalog_id, so the whole transaction rolls back and the Top 8 never saves.
-- Only Tom (a UUID-shaped id) and custom catalog_items (real UUIDs) survived
-- the cast — every real store plush a collector picked broke the save.
--
-- Fix: insert catalog_id AS TEXT, matching the column. Empty string -> NULL
-- is preserved. Everything else about the function is unchanged (still
-- atomic, owner_id still forced to auth.uid()). Safe to re-run.

create or replace function set_top_plushes(p_rows jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from top_plushes where owner_id = auth.uid();
  insert into top_plushes (owner_id, position, plush_name, catalog_id, photo_path)
  select auth.uid(),
         (r->>'position')::int,
         r->>'plush_name',
         nullif(r->>'catalog_id', ''),   -- TEXT column: no ::uuid cast
         r->>'photo_path'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
end;
$$;
revoke all on function set_top_plushes(jsonb) from public;
grant execute on function set_top_plushes(jsonb) to authenticated;

-- ─── Confirmation ──────────────────────────────────────────────────
do $$
begin
  raise notice '0096 applied: set_top_plushes now stores catalog_id as text (Top 8 saves for store-sourced buns again).';
end $$;
