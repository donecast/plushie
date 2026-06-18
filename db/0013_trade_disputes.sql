-- ─── Trade disputes ───────────────────────────────────────────────
-- When one party requests fall-through and the other party disputes,
-- the trade enters a dispute state. Both parties write a statement
-- explaining what happened; admin reviews both and picks an outcome.
--
-- All dispute state lives on the trade row (no separate table) to
-- keep the join shape simple in listTrades. Admins read all rows via
-- 0005's trades_read policy; trade participants update their own
-- statement column via trades_party_update.

alter table trades
  add column if not exists dispute_open boolean not null default false,
  add column if not exists dispute_opened_by uuid references auth.users(id) on delete set null,
  add column if not exists dispute_opened_at timestamptz,
  add column if not exists dispute_proposer_statement text,
  add column if not exists dispute_recipient_statement text,
  add column if not exists dispute_proposer_statement_at timestamptz,
  add column if not exists dispute_recipient_statement_at timestamptz,
  add column if not exists dispute_admin_notes text,
  add column if not exists dispute_outcome text
    check (dispute_outcome in ('cancelled', 'restored', 'completed')),
  add column if not exists dispute_resolved_at timestamptz,
  add column if not exists dispute_resolved_by uuid references auth.users(id) on delete set null;

create index if not exists trades_dispute_open_idx
  on trades(dispute_open) where dispute_open = true;
