-- ─── Catalog items: admin-curated additions to the Shopify feed ──
-- The catalog in state.catalog is normally populated from
-- plushiedreadfuls.com's products.json feed. This table is for
-- entries that the feed doesn't cover, in two cases:
--
--   1) Variants ('forms') of an existing Shopify product that the
--      upstream catalog doesn't distinguish. Concrete example: the
--      Overthinking Bunny was redesigned but kept the same SKU, so
--      the feed only shows v2. Admin creates a row here with
--      parent_handle = 'overthinking-bunny' and form_label =
--      '(Original)' so collectors who own v1 can add it.
--
--   2) Plushies that pre-date the Shopify catalog or are off-site
--      entirely (Patreon-only, retired before the store existed,
--      etc.). parent_handle is null.
--
-- The flow:
--   * Admin or trusted user creates a row, status = 'pending'.
--   * Admin reviews from the admin queue, sets status = 'approved'.
--   * Approved rows merge into state.catalog client-side, alongside
--     Shopify items.
--   * Collectors add them by clicking Own/Want like any other catalog
--     item; their plushies.catalog_id ends up pointing at this row's
--     UUID instead of a Shopify numeric id.

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  handle text not null unique,             -- url-safe slug
  type text default 'plush',               -- 'plush' | 'pen' | 'charm' | etc.

  -- If this is a form/variant of a Shopify item, parent_handle links
  -- them so the UI can group them visually.
  parent_handle text,                       -- e.g. 'overthinking-bunny'
  form_label text,                          -- e.g. '(Original)'

  -- Image lives in the 'catalog' storage bucket; this is the object
  -- path. Nullable so an item can exist before a photo is sourced
  -- (the 'do you have this photo?' flow fills it in later).
  image_path text,

  -- Lore fields — populated later by Phase L extraction or by hand.
  description text,
  lore text,
  symbolism text,

  -- Free-form tags for filtering (mirrors the Shopify shape).
  tags text[] not null default '{}',

  -- Availability mirrors the Shopify flag — for off-catalog items,
  -- admin sets these by hand.
  available boolean not null default true,
  retired boolean not null default false,

  -- Workflow.
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  review_seen boolean not null default false,
  notes_to_admin text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_items_status_idx
  on catalog_items(status, submitted_at desc);

create index if not exists catalog_items_parent_idx
  on catalog_items(parent_handle)
  where parent_handle is not null;

-- Touch updated_at on every UPDATE.
create or replace function catalog_items_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists catalog_items_updated_at on catalog_items;
create trigger catalog_items_updated_at
  before update on catalog_items
  for each row execute function catalog_items_touch_updated_at();

alter table catalog_items enable row level security;

-- SELECT: anyone authenticated reads approved rows. Submitters can
-- see their own pending rows. Admin sees everything.
drop policy if exists catalog_items_read on catalog_items;
create policy catalog_items_read on catalog_items for select to authenticated
  using (
    status = 'approved'
    or submitted_by = auth.uid()
    or is_admin()
  );

-- INSERT: any authenticated user can submit. status defaults to
-- 'pending'; the client passes submitted_by = auth.uid().
drop policy if exists catalog_items_insert on catalog_items;
create policy catalog_items_insert on catalog_items for insert to authenticated
  with check (submitted_by = auth.uid());

-- UPDATE: admin only. Submitters can't edit after submission — keeps
-- the shared catalog stable.
drop policy if exists catalog_items_update on catalog_items;
create policy catalog_items_update on catalog_items for update to authenticated
  using (is_admin())
  with check (is_admin());

-- DELETE: admin only.
drop policy if exists catalog_items_delete on catalog_items;
create policy catalog_items_delete on catalog_items for delete to authenticated
  using (is_admin());


-- ─── Storage bucket for catalog images ────────────────────────────
-- Separate from the 'photos' bucket so the per-collection folder
-- scoping there doesn't apply. Catalog images are read by everyone
-- signed in; only admin writes (for now — trusted-submitter writes
-- land in Phase X).

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', false)
on conflict (id) do nothing;

drop policy if exists catalog_storage_read on storage.objects;
create policy catalog_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'catalog');

drop policy if exists catalog_storage_insert on storage.objects;
create policy catalog_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and is_admin());

drop policy if exists catalog_storage_update on storage.objects;
create policy catalog_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and is_admin())
  with check (bucket_id = 'catalog' and is_admin());

drop policy if exists catalog_storage_delete on storage.objects;
create policy catalog_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and is_admin());


-- ─── Photo suggestions: "do you have this picture?" ──────────────
-- When a catalog item has no image (or admin wants alternatives),
-- collectors can propose one. Each suggestion is a row here with the
-- proposed image uploaded to the 'catalog' bucket under a
-- suggestions/ prefix. Admin reviews, picks a winner, copies the
-- path into catalog_items.image_path.

create table if not exists catalog_photo_suggestions (
  id uuid primary key default gen_random_uuid(),

  -- The catalog item this suggests a photo for. Can target either a
  -- Shopify item (target_shopify_id text) or a catalog_items row
  -- (target_catalog_item_id uuid). Exactly one populated.
  target_shopify_id text,
  target_catalog_item_id uuid references catalog_items(id) on delete cascade,

  image_path text not null,                 -- 'catalog' bucket path
  notes text,                               -- submitter's notes
  submitted_by uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,

  constraint catalog_photo_one_target check (
    (target_shopify_id is not null)::int +
    (target_catalog_item_id is not null)::int = 1
  )
);

create index if not exists catalog_photo_suggestions_status_idx
  on catalog_photo_suggestions(status, submitted_at desc);

alter table catalog_photo_suggestions enable row level security;

drop policy if exists catalog_photo_read on catalog_photo_suggestions;
create policy catalog_photo_read on catalog_photo_suggestions for select to authenticated
  using (
    submitted_by = auth.uid()
    or is_admin()
  );

drop policy if exists catalog_photo_insert on catalog_photo_suggestions;
create policy catalog_photo_insert on catalog_photo_suggestions for insert to authenticated
  with check (submitted_by = auth.uid() and status = 'pending');

drop policy if exists catalog_photo_update on catalog_photo_suggestions;
create policy catalog_photo_update on catalog_photo_suggestions for update to authenticated
  using (is_admin())
  with check (is_admin());

-- Submitters can upload to suggestions/* in the catalog bucket.
drop policy if exists catalog_storage_suggestion_insert on storage.objects;
create policy catalog_storage_suggestion_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalog'
    and name like 'suggestions/%'
  );
