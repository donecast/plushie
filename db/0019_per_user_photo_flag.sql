-- ============================================================
-- Plushie tracker — migration 0019: per-user photo uploads flag
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================
--
-- Replaces the global app_settings 'feature.user_photo_uploads'
-- toggle with a per-account boolean. Admin (is_admin = true) is
-- ALWAYS allowed regardless of this column. Default is true so
-- existing users aren't broken at install.
--
-- The old app_settings row is left alone (the table still backs
-- future global flags); the client just stops reading it for this
-- one feature.

alter table profiles
  add column if not exists photo_uploads_enabled boolean not null default true;

-- Admins need to flip the flag on other users' profiles. The base
-- policy only let users update their own row; add an admin escape
-- hatch alongside it.
drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles for update to authenticated
  using (is_admin()) with check (is_admin());
