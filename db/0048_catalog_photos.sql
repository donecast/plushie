-- ─── Catalog photos: lettered (fan/community) + numbered (official) ──
-- Until now every catalog row carried exactly ONE image (Shopify's first
-- product photo, optionally swapped by catalog_overrides.image). This
-- table is the system of record for a richer, multi-photo model that we
-- can grow into a real gallery later.
--
-- SLOT scheme (the whole point):
--   * NUMBERED slots  '0','1','2',…  = official Plushie Dreadfuls imagery.
--   * LETTERED slots  'A','B','C',…  = fan / community / owner-submitted
--     photos. "Picture A" is the first community shot for an item, and —
--     when present — the one we surface as that product's MAIN image
--     site-wide.
--
-- TARGETING mirrors catalog_photo_suggestions: exactly one of
-- (target_handle, target_catalog_item_id, target_pen_id) is set, so a
-- photo can attach to a Shopify product, a custom catalog_items row, or a
-- pen divider.
--
-- IMAGE reference: image_path is a key inside an R2/storage bucket
-- (default 'catalog'); image_url is an absolute URL fallback for the rare
-- hot-linked case. At least one must be present.
--
-- ── RENDER BRIDGE (pilot) ───────────────────────────────────────────
-- The live catalog still resolves its main image from
-- catalog_snapshot.image / catalog_overrides.image (see
-- applyCatalogOverrides in app-core.js). While this is a pilot we ALSO
-- mirror each is_primary lettered row's resolved URL into
-- catalog_overrides.image, so the existing render path shows Picture A as
-- the cover with NO client change. A later change will have the catalog
-- read primaries directly from this table and retire that mirroring.
-- Non-Shopify URLs already pass through the render path untouched
-- (app-ui.js: only cdn.shopify.com URLs get the _<size>x variant), so an
-- R2-hosted community photo renders as-is.

create table if not exists catalog_photos (
  id                     uuid primary key default gen_random_uuid(),

  -- exactly one target (enforced by the check below)
  target_handle          text,                                   -- Shopify product handle
  target_catalog_item_id uuid references catalog_items(id) on delete cascade,
  target_pen_id          text,                                   -- pens.id

  -- 'A','B',… = community/fan;  '0','1',… = official PD
  slot                   text not null,

  -- one of these carries the bytes' location
  image_path             text,            -- key within `bucket` (R2/Supabase storage)
  image_url              text,            -- absolute URL fallback (hot-link)
  bucket                 text not null default 'catalog',

  -- provenance / attribution (we keep web-sourced pics honest)
  source                 text,            -- 'owner','community','web','pd', …
  source_url             text,            -- where it came from
  credit                 text,            -- display credit, if any
  notes                  text,

  -- the one surfaced as the item's main image (at most one per target)
  is_primary             boolean not null default false,

  submitted_by           uuid references profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint catalog_photos_one_target check (
    (target_handle is not null)::int
    + (target_catalog_item_id is not null)::int
    + (target_pen_id is not null)::int = 1
  ),
  constraint catalog_photos_has_image check (
    image_path is not null or image_url is not null
  )
);

-- one row per (target, slot)
create unique index if not exists catalog_photos_handle_slot
  on catalog_photos (target_handle, slot) where target_handle is not null;
create unique index if not exists catalog_photos_item_slot
  on catalog_photos (target_catalog_item_id, slot) where target_catalog_item_id is not null;
create unique index if not exists catalog_photos_pen_slot
  on catalog_photos (target_pen_id, slot) where target_pen_id is not null;

-- at most one primary per target
create unique index if not exists catalog_photos_primary_handle
  on catalog_photos (target_handle) where is_primary and target_handle is not null;
create unique index if not exists catalog_photos_primary_item
  on catalog_photos (target_catalog_item_id) where is_primary and target_catalog_item_id is not null;
create unique index if not exists catalog_photos_primary_pen
  on catalog_photos (target_pen_id) where is_primary and target_pen_id is not null;

create or replace function catalog_photos_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalog_photos_updated_at on catalog_photos;
create trigger catalog_photos_updated_at
  before update on catalog_photos
  for each row execute function catalog_photos_touch_updated_at();

alter table catalog_photos enable row level security;

-- SELECT: any authenticated user (everyone needs them to render).
drop policy if exists catalog_photos_read on catalog_photos;
create policy catalog_photos_read on catalog_photos for select to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: admin only — this is the shared catalog.
drop policy if exists catalog_photos_insert on catalog_photos;
create policy catalog_photos_insert on catalog_photos for insert to authenticated
  with check (is_admin());

drop policy if exists catalog_photos_update on catalog_photos;
create policy catalog_photos_update on catalog_photos for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists catalog_photos_delete on catalog_photos;
create policy catalog_photos_delete on catalog_photos for delete to authenticated
  using (is_admin());
