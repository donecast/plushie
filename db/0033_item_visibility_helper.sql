-- 0033_item_visibility_helper.sql
-- Staging the read-gate for per-item collection visibility (item 11) ahead of
-- the cross-user collection viewer (which will likely live in the social
-- section). DEFINED BUT NOT YET WIRED: nothing calls this and no policy uses
-- it, so applying this migration changes no behaviour today. It exists so the
-- tier logic for items is settled and mirrors can_see_post() exactly.
--
-- When the viewer is built, add a plushies SELECT policy that ORs the existing
-- collection-membership rule with can_see_item(<owner>, visibility). The one
-- open question to resolve THEN: `plushies` rows currently belong to a
-- *collection*, not a user — so <owner> will be the collection's owner (or a
-- new owner_id reference), decided alongside the viewer.

create or replace function can_see_item(owner uuid, vis item_visibility)
returns boolean language sql security definer stable as $$
  select case
    when owner = auth.uid()           then true
    when vis::text = 'public'         then true
    when vis::text = 'friends'        then are_friends(owner, auth.uid())
    when vis::text = 'inner'          then is_inner(owner, auth.uid())
    when vis::text = 'coffin_buddies' then is_coffin_buddy(owner, auth.uid())
    else false   -- 'private' → only the owner (covered by the first branch)
  end;
$$;
