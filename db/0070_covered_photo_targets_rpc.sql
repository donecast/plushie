-- ─── Public read of "which catalog targets already have a community cover" ──
-- Supports the every-4-days photo-watch routine (scripts/plush_photo_watch.py),
-- which needs to know which products/variants are ALREADY covered so it only
-- surfaces newly-photographable ones. The watcher runs unauthenticated, but the
-- catalog_* tables are SELECT-only to `authenticated`, so it can't read them
-- directly. This SECURITY DEFINER function exposes ONLY the join keys — Shopify
-- product handles + variant ids, which are already public on the storefront —
-- and nothing sensitive (no credits, URLs, or user ids).
create or replace function public.covered_photo_targets()
returns table(handle text, variant_id text)
language sql
security definer
set search_path = public
as $$
  select target_handle, target_variant_id
    from catalog_photos where target_handle is not null
  union
  select handle, null
    from catalog_overrides where image is not null and image <> ''
  union
  select handle, variant_id
    from catalog_variant_covers where image is not null and image <> ''
$$;

revoke all on function public.covered_photo_targets() from public;
grant execute on function public.covered_photo_targets() to anon, authenticated;
