-- ─── Worn-by: link a clothing accessory to the plush wearing it ────
-- A clothing accessory in someone's collection (a "Plush Outfit" /
-- "Dreadful Disguises" item, or anything the client flags as plush
-- clothing) can be attached to another collection row — the plush that
-- wears it. Attached accessories are pulled out of the main grid and
-- shown beside their plush. ON DELETE SET NULL so removing the plush
-- just releases its accessories back into the grid.
--
-- v1 assumes one accessory per plush in the UI; the column itself
-- already supports many → one, so multi-accessory display is a later
-- client change with no schema work.
--
-- Safe to re-run.
alter table plushies
  add column if not exists worn_by uuid references plushies(id) on delete set null;

create index if not exists plushies_worn_by_idx
  on plushies(worn_by) where worn_by is not null;
