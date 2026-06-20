-- ============================================================
-- Plushie tracker — migration 0024: cross-user trade item photos
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================
--
-- Trade item photos live in trade_items.photo_path, which points at the
-- collection-scoped 'photos' bucket. That bucket's RLS only lets members
-- of the owning collection read it, so when ANOTHER collector browses
-- offerings the photo is unreadable (400s) and Browse falls back to the
-- catalog image. User-uploaded photos — especially on custom items with
-- no catalog image — therefore never showed to other people.
--
-- This adds a second path that points at the public-readable 'social'
-- bucket (introduced in 0021). When an item is marked for trade the
-- client copies the photo into 'social' and stores the resulting key
-- here; Browse resolves photos from this column so every signed-in user
-- can see them. The original photo_path is left untouched (the owner
-- still reads their own items out of the 'photos' bucket).

alter table trade_items
  add column if not exists photo_social_path text;
