-- ============================================================
-- Plushie tracker — migration 0095: get_user_vault() for the vault browser
-- Paste into Supabase SQL Editor and run. Safe to re-run.
-- REQUIRES db/0094 (default_item_visibility + can_see_item wiring) applied first.
--
-- The vault browser lets you look at another collector's crypt, filtered to
-- the plushes your friend tier is allowed to see. The client can't do this
-- directly: `collections` is member-only (schema.sql:298), so a non-member
-- can't even resolve someone else's collection id to list its plushes. This
-- SECURITY DEFINER RPC does it server-side and returns ONLY the rows the
-- caller may see:
--   • target = you            → every plush you own (can_see_item owner branch)
--   • target = a friend       → only plushes whose visibility your tier clears
--   • either side blocked      → nothing
--
-- Visibility is decided by can_see_item(owner, vis) (db/0033), which reads
-- auth.uid() internally — and auth.uid() is preserved across SECURITY DEFINER,
-- so the gate is always relative to the CALLER, never the definer. This never
-- widens what a viewer can see beyond the plushies read policy from db/0094;
-- it just makes it queryable without exposing the collections table.
-- ============================================================

create or replace function get_user_vault(target uuid)
returns setof plushies
language sql
security definer
stable
set search_path = public
as $$
  select p.*
  from plushies p
  join collections c on c.id = p.collection_id
  where c.owner_id = target
    and can_see_item(target, p.visibility)
    and not blocked_between(target, auth.uid())
  order by p.sort_order nulls last, p.added_at desc;
$$;

revoke all on function get_user_vault(uuid) from public;
grant execute on function get_user_vault(uuid) to authenticated;

-- ── Confirmation ─────────────────────────────────────────────────────────
do $$
begin
  raise notice 'db/0095 applied: get_user_vault(uuid) created (vault browser read path).';
end $$;

-- Should return one row describing the function.
select proname, pg_get_function_result(oid) as returns
from pg_proc where proname = 'get_user_vault';
