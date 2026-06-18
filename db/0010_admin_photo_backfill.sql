-- ─── Admin write on plushies + photo storage ────────────────
-- The admin-side photo backfill tool (Admin → Tools → Re-snapshot
-- hot-linked catalog photos) iterates every plushies + wishlist row
-- whose photo_path is still a Shopify CDN URL, downloads through the
-- img-proxy Worker, uploads to Supabase Storage, and rewrites the
-- path on the row.
--
-- The plushies UPDATE policy in schema.sql currently only allows
-- can_edit(collection_id), which an admin doesn't satisfy unless
-- they're explicitly a member. wishlist already has admin in 0005;
-- this migration brings plushies in line and also grants admin
-- insert/update on the photos bucket so the backfill upload step
-- succeeds.

drop policy if exists plushies_write on plushies;
create policy plushies_write on plushies for all to authenticated
  using (can_edit(collection_id) or is_admin())
  with check (can_edit(collection_id) or is_admin());

drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (can_edit(((storage.foldername(name))[1])::uuid) or is_admin())
  );

drop policy if exists photos_update on storage.objects;
create policy photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and (can_edit(((storage.foldername(name))[1])::uuid) or is_admin())
  )
  with check (
    bucket_id = 'photos'
    and (can_edit(((storage.foldername(name))[1])::uuid) or is_admin())
  );
