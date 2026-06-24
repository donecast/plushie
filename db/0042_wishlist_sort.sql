-- 0042_wishlist_sort.sql
-- Let collectors hand-prioritise their wish list (drag & drop / move up-down),
-- mirroring the collection ordering from 0029. A nullable sort_order on
-- wishlist; NULL means "not yet hand-placed" and sorts after placed items
-- (newest-added first) in the client. The top of this order is what surfaces
-- in the Crypt Vitals "top of your wishlist" rail.

alter table wishlist
  add column if not exists sort_order int;

create index if not exists wishlist_sort_order_idx
  on wishlist(collection_id, sort_order)
  where sort_order is not null;
