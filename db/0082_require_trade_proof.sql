-- 0082: offerings without real proof photos cannot enter a trade.
--
-- Migration 0074 added the proof-photo gallery and the client has required
-- at least one real photo on every NEW listing since PR #145 (2026-07-04).
-- But offerings listed before that (all of the current ones, in practice)
-- are grandfathered with zero photos and can still be traded — condition
-- unseen. Close the hole at the source of truth: a trigger on
-- trade_line_items refuses to reference a photo-less offering, so no
-- client (stale cached bundle included) can put one into a trade. The
-- owner just adds a photo via Manage and the item becomes tradeable.
--
-- Existing trades are untouched (the trigger only fires on new line items).

create or replace function public.enforce_trade_proof()
returns trigger
language plpgsql
as $$
declare
  item_kind trade_item_kind;
  item_name text;
begin
  select kind, name into item_kind, item_name
    from trade_items where id = new.trade_item_id;
  if item_kind = 'offering'
     and not exists (select 1 from trade_item_photos tp
                      where tp.trade_item_id = new.trade_item_id) then
    raise exception 'TRADE_PROOF_REQUIRED: "%" has no real photos yet — the owner must add at least one before it can be traded', item_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trade_line_items_require_proof on trade_line_items;
create trigger trade_line_items_require_proof
  before insert on trade_line_items
  for each row execute function public.enforce_trade_proof();

-- Confirmation: how many live offerings are currently blocked from trading
-- (zero proof photos). These stay listed; they just can't enter a trade
-- until their owner adds a photo.
select count(*) as offerings_awaiting_photos
from trade_items ti
where ti.kind = 'offering'
  and not exists (select 1 from trade_item_photos tp where tp.trade_item_id = ti.id);
