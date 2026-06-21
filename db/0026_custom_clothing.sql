-- ============================================================
-- Plushie tracker — migration 0026: private custom clothing
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Lets a (gated) user add their OWN clothing to a plush's closet —
-- pieces that aren't Plushie Dreadfuls products (handmade, thrifted,
-- another shop). These live as ordinary collection rows in `plushies`
-- with catalog_id = null, so existing RLS already keeps them private to
-- the owner's collection: they never touch the public catalog and no
-- other user can see them.
--
-- Two pieces:
--
-- 1. plushies.clothing_scale — the explicit "this row is user-added
--    clothing" marker. NULL for everything that exists today (catalog
--    clothing is still detected via the catalog join; this column is
--    only set on off-catalog custom pieces). When non-null it both
--    flags the row as wearable AND records which closet it belongs in —
--    'full' (full-size Plushes closet) or 'mini' (Minis closet) — so the
--    client never has to guess scale from a free-text name.
--
-- 2. profiles.custom_clothing_enabled — per-user entitlement for the
--    feature, OFF by default. Mirrors photo_uploads_enabled (migration
--    0019/0022): admins always have access, and the client also grants a
--    small hardcoded allowlist; everyone else needs this flag flipped on
--    by an admin. Built gated from day one so nobody is given the
--    feature and then later walled off behind it.

alter table plushies
  add column if not exists clothing_scale text;

-- Constrain to the two known scales (guarded so the migration stays
-- safe to re-run — Postgres has no ADD CONSTRAINT IF NOT EXISTS).
do $$ begin
  alter table plushies
    add constraint plushies_clothing_scale_chk
    check (clothing_scale is null or clothing_scale in ('full','mini'));
exception when duplicate_object then null; end $$;

alter table profiles
  add column if not exists custom_clothing_enabled boolean not null default false;
