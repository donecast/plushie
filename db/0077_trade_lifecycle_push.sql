-- ============================================================
-- Plushie tracker — migration 0077: notify on every noteworthy trade event
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- trg_push_trade (0042) only pushed on offer / counter / accept / decline /
-- ship. But plenty else happens on a trade you're in that the other party
-- should hear about: the item was received, the trade completed, it was
-- cancelled or expired, someone flagged it as fallen-through, a dispute was
-- opened, a dispute statement was added, or an admin resolved the dispute.
--
-- This replaces the function with the full lifecycle. Rules of thumb:
--   * When we can tell WHO acted (from an actor column), we notify only the
--     OTHER party — never buzz someone about their own action.
--   * Mutual, actor-less milestones (completed / cancelled / expired) notify
--     BOTH parties.
--   * Everything still shares tag 'trade-<id>', so the newest state replaces
--     the previous notification for that trade instead of stacking.
--
-- Guard: resolveDispute sets dispute_resolved_at AND may flip status to
-- cancelled/completed in the same UPDATE. We detect that (v_resolving) and let
-- the dispute-resolved branch speak, so the generic status branches don't
-- double-fire.

create or replace function trg_push_trade()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_tag   text := 'trade-' || new.id::text;
  v_other uuid;
  v_resolving boolean;
begin
  if tg_op = 'INSERT' then
    if new.parent_trade_id is null then
      perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
        _push_handle(new.proposer_id) || ' sent you a trade offer 🦇', './', v_tag);
    else
      perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
        _push_handle(new.proposer_id) || ' countered your trade 🦇', './', v_tag);
    end if;
    return null;
  end if;

  v_resolving := old.dispute_resolved_at is null and new.dispute_resolved_at is not null;

  -- ── Accept / decline → the proposer, who's been waiting on a reply ──
  if old.status = 'pending' and new.status = 'accepted' then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' accepted your trade 🦇', './', v_tag);
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' declined your trade', './', v_tag);
  end if;

  -- ── Completed → both parties (skip if an admin dispute-resolve did it) ──
  if new.status = 'completed' and old.status is distinct from 'completed' and not v_resolving then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt', 'Your trade is complete 🎉', './', v_tag);
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt', 'Your trade is complete 🎉', './', v_tag);
  end if;

  -- ── Cancelled / expired → both parties (skip cancel if dispute-resolve) ──
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and not v_resolving then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt', 'Your trade was cancelled', './', v_tag);
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt', 'Your trade was cancelled', './', v_tag);
  elsif new.status = 'expired' and old.status is distinct from 'expired' then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt', 'Your trade offer expired ⌛', './', v_tag);
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt', 'Your trade offer expired ⌛', './', v_tag);
  end if;

  -- ── Shipping → the OTHER party (their item is on the way) ──
  if old.proposer_shipped_at is null and new.proposer_shipped_at is not null then
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
      _push_handle(new.proposer_id) || ' shipped your trade item 📦', './', v_tag);
  end if;
  if old.recipient_shipped_at is null and new.recipient_shipped_at is not null then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' shipped your trade item 📦', './', v_tag);
  end if;

  -- ── Received confirmation → the OTHER party ──
  if old.proposer_received_at is null and new.proposer_received_at is not null then
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
      _push_handle(new.proposer_id) || ' confirmed they got your item ✅', './', v_tag);
  end if;
  if old.recipient_received_at is null and new.recipient_received_at is not null then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      _push_handle(new.recipient_id) || ' confirmed they got your item ✅', './', v_tag);
  end if;

  -- ── Fall-through flagged → the party who must confirm or dispute ──
  if old.fell_through_requested_at is null and new.fell_through_requested_at is not null then
    v_other := case when new.fell_through_requested_by = new.proposer_id
                    then new.recipient_id else new.proposer_id end;
    perform _push_send(v_other, '🦇 The Plush Crypt',
      _push_handle(new.fell_through_requested_by) || ' flagged a trade as fallen through — confirm or dispute', './', v_tag);
  end if;

  -- ── Dispute opened → the other party ──
  if old.dispute_open = false and new.dispute_open = true then
    v_other := case when new.dispute_opened_by = new.proposer_id
                    then new.recipient_id else new.proposer_id end;
    perform _push_send(v_other, '🦇 The Plush Crypt',
      _push_handle(new.dispute_opened_by) || ' opened a dispute on your trade ⚖️', './', v_tag);
  end if;

  -- ── Dispute statement added on an already-open dispute → the other party ──
  if old.dispute_open = true and new.dispute_open = true then
    if old.dispute_proposer_statement_at is null and new.dispute_proposer_statement_at is not null then
      perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
        _push_handle(new.proposer_id) || ' responded in your trade dispute', './', v_tag);
    end if;
    if old.dispute_recipient_statement_at is null and new.dispute_recipient_statement_at is not null then
      perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
        _push_handle(new.recipient_id) || ' responded in your trade dispute', './', v_tag);
    end if;
  end if;

  -- ── Dispute resolved by an admin → both parties, with the outcome ──
  if v_resolving then
    perform _push_send(new.proposer_id, '🦇 The Plush Crypt',
      'An admin resolved your trade dispute: ' || coalesce(new.dispute_outcome, 'resolved') || ' ⚖️', './', v_tag);
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
      'An admin resolved your trade dispute: ' || coalesce(new.dispute_outcome, 'resolved') || ' ⚖️', './', v_tag);
  end if;

  return null;
end;
$$;

drop trigger if exists push_trade on trades;
create trigger push_trade
  after insert or update on trades
  for each row execute function trg_push_trade();
