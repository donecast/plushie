-- 0030_item_visibility.sql
-- Item 11: per-collection-item visibility. Same tiers as posts, plus a
-- private "Only me" option:
--   public · friends (Coven) · inner (Castle Crew) · coffin_buddies · private
-- (Names are expected to change later — they live behind ITEM_VIS_META in the
-- client, so re-theming is a one-place edit.)
--
-- This stores the per-item choice. Cross-user collection viewing isn't built
-- yet, so there's no read-RLS to gate here today; when that lands, gate it with
-- the same can_see_* helpers using this column.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'item_visibility') then
    create type item_visibility as enum
      ('public', 'friends', 'inner', 'coffin_buddies', 'private');
  end if;
end$$;

alter table plushies
  add column if not exists visibility item_visibility not null default 'friends';
