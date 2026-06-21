-- 0028_collection_sort.sql
-- Item 20: let collectors hand-sort their collection (drag & drop / move
-- up-down). A nullable sort_order on plushies; NULL means "not yet hand-placed"
-- and sorts after placed items (newest-added first) in the client.

alter table plushies
  add column if not exists sort_order int;

create index if not exists plushies_sort_order_idx
  on plushies(collection_id, sort_order)
  where sort_order is not null;
