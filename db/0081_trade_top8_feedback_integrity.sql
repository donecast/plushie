-- 0081_trade_top8_feedback_integrity.sql
-- Three data-integrity fixes. Paste into the Supabase SQL Editor and run.
-- Safe to re-run. All three are additive/tightening and the current client
-- keeps working after they're applied, so this can go live before the
-- matching client deploy.
--
--  1. accept_trade(): make trade acceptance atomic. The client used to read
--     each item's `reserved`, add, and write it back — a last-write-wins
--     update that lets two concurrent accepts of the same item both pass the
--     `reserved <= quantity` check individually and over-reserve. Doing the
--     increment in one SQL statement makes the row lock + check constraint do
--     their job, and wrapping status + reservation in one function makes it
--     all-or-nothing.
--
--  2. set_top_plushes(): the client did delete-then-insert with no
--     transaction, so a failed insert permanently wiped the user's Top 8
--     (free plan = no backups). Moving both into one function makes the
--     delete roll back if the insert fails.
--
--  3. feedback_write: the insert policy only checked rater_id = auth.uid(),
--     so a user could fabricate trade_feedback rows against anyone (or inflate
--     their own) for trades they were never part of. Require a real COMPLETED
--     trade whose two parties are exactly the rater and ratee.

-- ─── 1. Atomic trade acceptance ────────────────────────────────────
-- SECURITY DEFINER so the reservation update bypasses trade_items.write RLS
-- (the acceptor is usually the counterparty, not the item owner) — same
-- pattern as release_trade_reservations (db/0012). Only the two trade parties
-- (or an admin) may call it, and only a still-pending trade is accepted, so a
-- double-accept can't re-reserve.
create or replace function accept_trade(target_trade uuid)
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

  -- Flip pending -> accepted first, guarded on status. A concurrent second
  -- accept of THIS trade finds it no longer pending and aborts before
  -- reserving anything. If the reservation below fails, this rolls back too.
  update trades
     set status = 'accepted', responded_at = now()
   where id = target_trade and status = 'pending';
  if not found then
    raise exception 'trade_not_pending';
  end if;

  -- Reserve every line item in one statement. The row lock serialises
  -- concurrent accepts of the SAME item across DIFFERENT trades, and the
  -- reserved_le_quantity check constraint rejects over-reservation atomically.
  begin
    update trade_items ti
       set reserved = ti.reserved + sub.qty
      from (
        select li.trade_item_id as id, sum(li.quantity) as qty
        from trade_line_items li
        where li.trade_id = target_trade
        group by li.trade_item_id
      ) sub
     where ti.id = sub.id;
  exception when check_violation then
    raise exception 'item_unavailable';
  end;
end;
$$;
revoke all on function accept_trade(uuid) from public;
grant execute on function accept_trade(uuid) to authenticated;

-- ─── 2. Atomic Top 8 replace ───────────────────────────────────────
-- SECURITY INVOKER (default): delete + insert run under the caller's RLS,
-- exactly as the client did, but now inside one transaction so a failed
-- insert leaves the old Top 8 intact. owner_id is forced to auth.uid()
-- server-side — the client can't write someone else's list.
create or replace function set_top_plushes(p_rows jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from top_plushes where owner_id = auth.uid();
  insert into top_plushes (owner_id, position, plush_name, catalog_id, photo_path)
  select auth.uid(),
         (r->>'position')::int,
         r->>'plush_name',
         nullif(r->>'catalog_id', '')::uuid,
         r->>'photo_path'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
end;
$$;
revoke all on function set_top_plushes(jsonb) from public;
grant execute on function set_top_plushes(jsonb) to authenticated;

-- ─── 3. Feedback must reference a real completed trade ─────────────
drop policy if exists feedback_write on trade_feedback;
create policy feedback_write on trade_feedback for insert to authenticated
with check (
  rater_id = auth.uid()
  and exists (
    select 1 from trades t
    where t.id = trade_feedback.trade_id
      and t.status = 'completed'
      and (
        (t.proposer_id  = auth.uid() and t.recipient_id = trade_feedback.ratee_id)
        or (t.recipient_id = auth.uid() and t.proposer_id  = trade_feedback.ratee_id)
      )
  )
);

-- ─── Confirmation ──────────────────────────────────────────────────
do $$
begin
  raise notice '0081 applied: atomic accept_trade + set_top_plushes RPCs, feedback linkage enforced.';
end $$;
