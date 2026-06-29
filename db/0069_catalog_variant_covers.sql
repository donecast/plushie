-- ─── Per-variant community covers ───────────────────────────────────
-- Some Shopify products ship as ONE listing with several collectible
-- variants (a single Color/Type option, ≥2 values) — e.g. the Sensory
-- Processing Disorder Jellybun (Blue/Orange) or Taurus Rabbit (Green/Cream
-- ears). The client expands those into one card PER variant
-- (expandVariants), but every card shares the parent's `handle`.
--
-- catalog_overrides + catalog_photos key by HANDLE, so a single community
-- "Picture A" painted EVERY variant with the same shot. That's why the
-- photo sweep had to PULL the few variant-parent covers it sourced and park
-- them here as "needs a per-variant model". This migration is that model.
--
-- Two pieces:
--   1. catalog_photos.target_variant_id — lets the gallery hold photos
--      scoped to one variant (still under the parent handle for grouping).
--      The slot/primary uniqueness is re-scoped to (handle, variant) so each
--      variant gets its own 'A' slot and its own primary.
--   2. catalog_variant_covers — the public render bridge, mirroring
--      catalog_overrides but keyed by the Shopify VARIANT id. applyVariant-
--      Covers (app-core.js) lays image/image_credit onto the matching
--      expanded child only, leaving its siblings on their own store photo.

-- ── 1. variant-scoped gallery photos ───────────────────────────────
alter table catalog_photos
  add column if not exists target_variant_id text;   -- Shopify variant id; parent handle still in target_handle

-- Re-scope the handle uniqueness to (handle, variant). A NULL variant
-- (the existing whole-product photos) collapses to '' so they keep ONE
-- group per handle exactly as before; each variant id gets its own group.
drop index if exists catalog_photos_handle_slot;
create unique index if not exists catalog_photos_handle_variant_slot
  on catalog_photos (target_handle, coalesce(target_variant_id, ''), slot)
  where target_handle is not null;

drop index if exists catalog_photos_primary_handle;
create unique index if not exists catalog_photos_primary_handle_variant
  on catalog_photos (target_handle, coalesce(target_variant_id, ''))
  where is_primary and target_handle is not null;

-- ── 2. per-variant cover render bridge ─────────────────────────────
create table if not exists catalog_variant_covers (
  -- The Shopify VARIANT id (text; e.g. '46803132547304'). One cover per
  -- variant. handle is the parent product handle, kept for admin grouping
  -- and so a future cleanup can find a product's variant covers.
  variant_id   text primary key,
  handle       text not null,
  image        text,                 -- resolved cover URL (R2 / hot-link / store)
  image_credit text,                 -- '@handle' when a community shot is the cover
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);

create or replace function catalog_variant_covers_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalog_variant_covers_updated_at on catalog_variant_covers;
create trigger catalog_variant_covers_updated_at
  before update on catalog_variant_covers
  for each row execute function catalog_variant_covers_touch_updated_at();

alter table catalog_variant_covers enable row level security;

-- SELECT: anyone authenticated reads them (everyone needs them to render).
drop policy if exists catalog_variant_covers_read on catalog_variant_covers;
create policy catalog_variant_covers_read on catalog_variant_covers for select to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: admin only — this edits the shared catalog.
drop policy if exists catalog_variant_covers_insert on catalog_variant_covers;
create policy catalog_variant_covers_insert on catalog_variant_covers for insert to authenticated
  with check (is_admin());

drop policy if exists catalog_variant_covers_update on catalog_variant_covers;
create policy catalog_variant_covers_update on catalog_variant_covers for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists catalog_variant_covers_delete on catalog_variant_covers;
create policy catalog_variant_covers_delete on catalog_variant_covers for delete to authenticated
  using (is_admin());
