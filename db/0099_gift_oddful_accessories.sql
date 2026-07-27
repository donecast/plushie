-- ============================================================
-- Plushie tracker — migration 0099: gift metadata + oddful reason + damaged accessories
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
--  • damaged_accessories: parallel to missing_accessories — an accessory is now
--    tri-state (Have / Missing / Damaged). A key lives in at most one array.
--  • oddful_reason: free-text "what makes it an oddful" for the genuinely weird
--    stuff (missing magnet, two left hands…). Bag oddness is captured by the
--    accessories checklist instead (no bag → Missing, damaged bag → Damaged).
--  • gifted_by_username: denormalised sender handle so a received gift's note can
--    read "From @sender: …" even if the sender later changes their name.
--
--  respond_gift now, on accept, stamps the sender handle and rewrites
--  acquired_how: -> 'Gift', or 'Gift/Oddful' when a free-text oddful reason
--  survives (pure bag oddness lives in the accessories, so it drops to plain
--  'Gift' — nothing mysterious to hunt for).
-- ============================================================

alter table plushies
  add column if not exists damaged_accessories text[] not null default '{}',
  add column if not exists oddful_reason       text,
  add column if not exists gifted_by_username   text;

create or replace function respond_gift(p_gift uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g gifts; dest_coll uuid; def_vis item_visibility; src_reason text; sender_handle text;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select * into g from gifts where id = p_gift for update;
  if not found then raise exception 'no such gift'; end if;
  if g.recipient_id is distinct from auth.uid() then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'gift already resolved'; end if;

  if p_accept then
    select id into dest_coll from collections
      where owner_id = auth.uid() order by created_at asc limit 1;
    if dest_coll is null then raise exception 'no destination collection'; end if;
    select default_item_visibility into def_vis from profiles where id = auth.uid();
    select oddful_reason into src_reason from plushies where id = g.plush_id;
    select username into sender_handle from profiles where id = g.sender_id;
    update plushies set
      collection_id      = dest_coll,
      is_gift            = true,
      gifted_by          = g.sender_id,
      gifted_by_username = sender_handle,
      gift_message       = g.message,
      is_present         = false,
      visibility         = coalesce(def_vis, 'inner'),
      -- Retain the oddful quality ONLY when a free-text reason survives; pure
      -- bag oddness is already recorded in the accessories checklist.
      acquired_how       = case
        when src_reason is not null and btrim(src_reason) <> '' then 'Gift/Oddful'
        else 'Gift' end,
      added_at           = now(),
      updated_at         = now()
    where id = g.plush_id;
    update gifts set status = 'accepted', responded_at = now() where id = p_gift;
    perform _push_send(g.sender_id,
      _push_handle(auth.uid()) || ' accepted your gift 🎁', 'It''s in their crypt now.',
      './', 'gift-' || p_gift::text);
  else
    update gifts set status = 'declined', responded_at = now() where id = p_gift;
    perform _push_send(g.sender_id,
      _push_handle(auth.uid()) || ' declined your gift', 'The plush stayed in your crypt.',
      './', 'gift-' || p_gift::text);
  end if;
end; $$;

-- ── Confirmation ─────────────────────────────────────────────────────────
do $$
begin
  raise notice 'db/0099 applied: damaged_accessories + oddful_reason + gifted_by_username columns; respond_gift stamps sender + acquired_how.';
end $$;

select count(*) as new_cols from information_schema.columns
where table_name='plushies' and column_name in ('damaged_accessories','oddful_reason','gifted_by_username');
