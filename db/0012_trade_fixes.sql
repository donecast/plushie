-- ─── Trade fixes: reservation release + fall-through confirmation ──
--
-- Two-part fix triggered by RedRambler's stuck "1 reserved" rows.
--
-- BUG 1: When User B cancels (or marks fell-through) an accepted
-- trade where User A owned the offering, the client's
-- _releaseReservations runs as User B. trade_items.write RLS only
-- allows the OWNER to update, so the decrement silently fails. Items
-- stay marked reserved forever, blocking the owner from removing or
-- editing them. The 'reserved > 0' guard in the client then refuses
-- the remove.
--
-- Fix: a SECURITY DEFINER RPC that anyone party to the trade can
-- call. It bypasses RLS to update trade_items.reserved.
--
-- BUG 2: Either party in an accepted trade can unilaterally hit
-- "Fell through" and the trade goes to 'cancelled' immediately. Scam
-- vector: A receives B's package, marks fell-through, denies receipt,
-- vanishes. Fall-through on an accepted trade should require both
-- parties to agree, or admin to intervene.
--
-- Fix: two new columns on trades — fell_through_requested_by and
-- fell_through_requested_at — plus the client's "Fell through"
-- button on accepted trades flips to setting these instead of
-- cancelling. The OTHER party sees a banner asking them to confirm
-- or dispute.

create or replace function release_trade_reservations(target_trade uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from trades
    where id = target_trade
      and (proposer_id = auth.uid() or recipient_id = auth.uid())
  ) into allowed;
  if not coalesce(allowed, false) and not is_admin() then
    raise exception 'forbidden';
  end if;

  -- Decrement each affected trade_item's reserved count by the
  -- amount this trade reserved. Capped at 0 in case earlier bugs
  -- left the counter inflated.
  update trade_items ti
  set reserved = greatest(0, ti.reserved - coalesce((
    select sum(li.quantity)
    from trade_line_items li
    where li.trade_item_id = ti.id and li.trade_id = target_trade
  ), 0))
  where exists (
    select 1 from trade_line_items li
    where li.trade_item_id = ti.id and li.trade_id = target_trade
  );
end;
$$;

revoke all on function release_trade_reservations(uuid) from public;
grant execute on function release_trade_reservations(uuid) to authenticated;


-- One-time backfill: recompute every trade_item.reserved from
-- scratch based on currently-active trades. This frees RedRambler's
-- stuck Overthinking Bunny + Year of the Snake Rabbit, and anything
-- else in the same boat.
update trade_items ti set reserved = coalesce((
  select sum(li.quantity)
  from trade_line_items li
  join trades t on t.id = li.trade_id
  where li.trade_item_id = ti.id
    and t.status in ('pending', 'accepted')
), 0);


-- Fall-through confirmation columns. Either party setting
-- fell_through_requested_by signals 'I think this trade fell
-- through'. The trade stays in 'accepted' until the other party
-- confirms (-> cancelled, run release_trade_reservations) or
-- disputes (-> clear the columns).
alter table trades
  add column if not exists fell_through_requested_by uuid
    references auth.users(id) on delete set null,
  add column if not exists fell_through_requested_at timestamptz;
