-- ============================================================
-- Plushie tracker — migration 0075: un-grandfather trade proof photos
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Migration 0074 added a real-photo proof gallery for trade offerings and, to
-- avoid regressing existing offerings, *grandfathered* each one's single
-- collection photo (photo_social_path) into the gallery at position 0.
--
-- That was a mistake. #145's entire premise was that the collection photo "is
-- very often just the catalog stock render, so nothing proved ownership." By
-- seeding the proof gallery from that same photo, 0074 reintroduced exactly the
-- untrustworthy image the feature exists to eliminate: four live offerings ended
-- up showing a stock catalog render as "proof," which a trader can't tell from a
-- genuine shot.
--
-- Fix: delete the grandfathered rows — the ones whose social_path is a verbatim
-- copy of the parent offering's photo_social_path. That leaves those offerings
-- with an empty gallery, so the client renders the honest "📷 picture soon"
-- placeholder until the owner uploads a REAL photo through the listing modal.
--
-- Reversible: photo_social_path still holds the same path on trade_items, and
-- the storage object is untouched (it remains the card cover), so 0074's
-- grandfather insert could be re-run if ever needed.
--
-- Only genuine uploads (social_path != the cover) survive. Idempotent.

delete from trade_item_photos p
using trade_items ti
where p.trade_item_id = ti.id
  and ti.kind = 'offering'
  and p.social_path = ti.photo_social_path;
