-- 0086: trade offering honesty — per-offering includes checklist.
--
-- trade_items.extras: jsonb array of { "name": text, "included": bool },
-- snapshotting the product's expected extras (parsed client-side from the
-- catalog's "Set Includes") with the owner's explicit yes/no answer for each.
-- Null = listed before this feature, or a product with no expected extras.
-- Snapshotted (not re-derived) so a listing keeps saying what the owner
-- answered even if the catalog parse changes later.

alter table trade_items add column if not exists extras jsonb;

comment on column trade_items.extras is
  'Includes checklist: [{"name": text, "included": bool}] answered by the owner when listing; null = pre-0086 listing or no expected extras.';

-- Confirmation
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trade_items' and column_name = 'extras'
  ) then
    raise notice '✅ 0086 applied — trade_items.extras is live.';
  else
    raise exception '❌ 0086 failed — trade_items.extras is missing.';
  end if;
end $$;
