-- ============================================================
-- Plushie tracker — migration 0094: default item visibility + enforce it
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
-- Two changes, both foundations for cross-user vault sharing:
--
--  1. A per-user DEFAULT visibility for newly added plushes. Until now the
--     plushies.visibility column defaulted to 'friends' (Coven) for everyone.
--     Now each user picks their own default (stored here, chosen in Settings)
--     and a trigger stamps it onto every new plush. Default 'inner' (Castle
--     Crew), per product decision.
--
--  2. Finally WIRE the long-staged can_see_item() gate (db/0033) into the
--     plushies read policy, so a plush's visibility actually decides who can
--     read it. The owner is the plush's collection owner (as db/0033 called
--     out). Owner + shared members + admins keep full access exactly as
--     before; the new clause only ADDS cross-user reads that a viewer's tier
--     already permits. Nothing queries other users' plushes yet (the vault
--     browser is a following change), so this broadens no surface today — it
--     just gives the visibility value teeth for when the browser lands.
-- ============================================================

-- Owner of a collection (SECURITY DEFINER so the read policy + the insert
-- trigger can resolve it without the caller reading `collections` directly).
-- Mirrors the is_member / can_edit helper shape.
create or replace function collection_owner(coll_id uuid)
returns uuid language sql security definer stable as $$
  select owner_id from collections where id = coll_id;
$$;

-- 1. Per-user default visibility for new items ---------------------------
alter table profiles
  add column if not exists default_item_visibility item_visibility not null default 'inner';

-- 1b. Stamp every NEW plush with its owner's chosen default. A per-item
--     override is always a LATER update (setItemVisibility / the edit modal),
--     never part of the insert, so this trigger can never clobber a choice —
--     it just replaces the old blanket 'friends' column default with the
--     owner's preference, covering every insert path (catalog add, "Got it",
--     clothing add, imports) in one place. A gift MOVE is an update, not an
--     insert, so it is unaffected (the gift RPC sets visibility itself).
create or replace function apply_default_item_visibility()
returns trigger language plpgsql security definer as $$
begin
  new.visibility := coalesce(
    (select default_item_visibility from profiles where id = collection_owner(new.collection_id)),
    new.visibility);
  return new;
end;
$$;

drop trigger if exists plushies_default_visibility on plushies;
create trigger plushies_default_visibility
  before insert on plushies
  for each row execute function apply_default_item_visibility();

-- 2. Read policy: membership OR admin OR the viewer's tier clears the item's
--    visibility. can_see_item already treats owner=self and 'private' as
--    owner-only, so this never leaks a private item.
drop policy if exists plushies_read on plushies;
create policy plushies_read on plushies for select to authenticated
  using (
    is_member(collection_id)
    or is_admin()
    or can_see_item(collection_owner(collection_id), visibility)
  );

-- ── Confirmation ─────────────────────────────────────────────────────────
do $$
begin
  raise notice 'db/0094 applied: default_item_visibility column + insert trigger + plushies_read honours can_see_item().';
end $$;

-- Should return one row: the new column with default 'inner'.
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'profiles' and column_name = 'default_item_visibility';
