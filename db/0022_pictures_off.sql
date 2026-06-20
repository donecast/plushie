-- ============================================================
-- Pictures off by default. User image uploads now require being
-- "cleared for images" (profiles.photo_uploads_enabled = true):
--   * Collection/wishlist custom photos + photo suggestions (already
--     gated by this flag) → off, so collection uses stock catalog art.
--   * Social post photos → gated client-side behind the same flag.
--   * Avatars are intentionally NOT gated (always allowed).
-- Admins keep access via the client-side override and can clear any
-- individual user from the admin panel.
--
-- Safe to re-run.
-- ============================================================

-- Flip the default off and clear everyone. Admins are unaffected in
-- practice (the client grants them access regardless of this column).
alter table profiles alter column photo_uploads_enabled set default false;

update profiles
   set photo_uploads_enabled = false
 where photo_uploads_enabled is distinct from false;

-- Stock-image posts: a post that only tags a catalog plush (no caption,
-- no uploaded photo) is now valid content. Widen the body_or_photo
-- check to also accept catalog_id so "share a stock image" works
-- without forcing a caption.
alter table posts drop constraint if exists body_or_photo;
alter table posts add constraint body_or_photo
  check (body is not null or photo_path is not null or catalog_id is not null);
