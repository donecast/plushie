-- ─── Photo-watch skip list ──────────────────────────────────────────
-- The every-4-days photo-watch routine (scripts/plush_photo_watch.py) surfaces
-- store-only plush/mini items that now have customer photos on Okendo. Some
-- finds the human will never want (e.g. a keychain the app happens to file
-- under Minis, or a product whose only review photos are bad). Without a memory
-- of those, the routine would re-post them every run. This table is that memory.
--
-- `key` is the find's identity: a Shopify VARIANT id for a per-variant find, or
-- a product HANDLE for a whole-product find — the same value the watcher keys on.
create table if not exists photo_watch_skips (
  key        text primary key,
  label      text,                                   -- human-readable, for audit
  reason     text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table photo_watch_skips enable row level security;

drop policy if exists photo_watch_skips_admin on photo_watch_skips;
create policy photo_watch_skips_admin on photo_watch_skips for all to authenticated
  using (is_admin()) with check (is_admin());

-- What the watcher should EXCLUDE = everything already covered (a community
-- cover exists) PLUS everything explicitly skipped. Flattened to a single set of
-- keys (handles for product-level, variant ids for variant-level), exposed to
-- the unauthenticated watcher. Only public join keys leave the DB.
create or replace function public.photo_watch_excluded()
returns table(key text)
language sql
security definer
set search_path = public
as $$
  select handle     from covered_photo_targets() where variant_id is null
  union
  select variant_id from covered_photo_targets() where variant_id is not null
  union
  select key        from photo_watch_skips
$$;

revoke all on function public.photo_watch_excluded() from public;
grant execute on function public.photo_watch_excluded() to anon, authenticated;
