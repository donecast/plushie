-- ─── Posts default to Public ────────────────────────────────────────
-- Postings should be Public by default everywhere. The composer UI already
-- pre-selects Public, and data.createPost() now falls back to 'public', but
-- the table default still read 'friends' — so any insert that omitted the
-- column (or a future code path that forgets it) would silently land as
-- friends-only. Align the column default with the product decision.
--
-- This only changes the DEFAULT for new rows; existing posts keep whatever
-- visibility they already have. (All 12 current posts are already public.)
alter table posts alter column visibility set default 'public';
