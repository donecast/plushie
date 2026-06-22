-- ─── Catalog overrides: hand-edited fields for Shopify-fed items ──
-- Most of the catalog comes live from plushiedreadfuls.com's
-- products.json feed. Lore, symbolism, and the "Set Includes" list for
-- those rows are parsed on the fly from each product's body_html every
-- time the catalog loads — they aren't stored anywhere, so there's
-- nothing for an admin to edit. That's a problem when the upstream
-- description is wrong or incomplete: e.g. Vertigo Rabbit ships with a
-- tote bag that only appears in the product photos, never in the text,
-- so the parser can't know about it.
--
-- This table is a thin OVERLAY keyed by the Shopify handle. Each column
-- is optional; a non-null value replaces what the live parse produced
-- for that one field, while everything left null keeps updating live
-- from Shopify. Custom catalog_items rows have their own editable
-- columns and are NOT touched by this table — overrides are only for
-- upstream Shopify products.
--
-- The flow:
--   * Admin opens a Shopify item's detail, taps "Edit details".
--   * The modal pre-fills with the current (parsed) values; the admin
--     adds the missing tote / fixes the lore / etc.
--   * Save upserts a row here; the catalog merge lays it on top of the
--     live data on every load.

create table if not exists catalog_overrides (
  -- The Shopify product handle (stable slug, e.g. 'vertigo-rabbit').
  -- One override row per upstream product.
  handle text primary key,

  -- Each optional. NULL means "no override — inherit the live value".
  -- accessories is the same [{ "name", "key" }] shape custom items use,
  -- so the collection checklist treats both sources identically.
  lore text,
  symbolism text,
  accessories jsonb,

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function catalog_overrides_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalog_overrides_updated_at on catalog_overrides;
create trigger catalog_overrides_updated_at
  before update on catalog_overrides
  for each row execute function catalog_overrides_touch_updated_at();

alter table catalog_overrides enable row level security;

-- SELECT: anyone authenticated reads overrides (everyone needs them to
-- render the catalog correctly).
drop policy if exists catalog_overrides_read on catalog_overrides;
create policy catalog_overrides_read on catalog_overrides for select to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: admin only — this edits the shared catalog.
drop policy if exists catalog_overrides_insert on catalog_overrides;
create policy catalog_overrides_insert on catalog_overrides for insert to authenticated
  with check (is_admin());

drop policy if exists catalog_overrides_update on catalog_overrides;
create policy catalog_overrides_update on catalog_overrides for update to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists catalog_overrides_delete on catalog_overrides;
create policy catalog_overrides_delete on catalog_overrides for delete to authenticated
  using (is_admin());
