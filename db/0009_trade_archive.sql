-- ─── Archive (soft-delete) for trade items ────────────────
-- Trade items are referenced by trade_line_items with ON DELETE
-- RESTRICT, so once an item has been part of any trade — including
-- rejected / cancelled / completed ones that persist for history —
-- it can never be hard-deleted. The client's "Remove" button then
-- throws an unhandled FK violation and appears to do nothing.
--
-- Fix: an `archived` flag. The client hard-deletes when the item is
-- truly unreferenced, and falls back to setting archived = true when
-- the FK blocks it. Archived items are hidden from the owner's
-- offerings list and from Browse, but the row survives so historical
-- trade_line_items keep their reference.

alter table trade_items
  add column if not exists archived boolean not null default false;

-- Partial index: the common queries filter to non-archived rows.
create index if not exists trade_items_active_idx
  on trade_items(owner_id, kind) where archived = false;
