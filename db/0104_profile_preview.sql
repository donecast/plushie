-- db/0104 — "what does my profile look like to someone at tier X?"
--
-- Asked for by @ydkj: "it would be neat if there was a way to preview how your
-- profile looks to the public." Everything needed to answer that already lives
-- in SQL — can_see_item()/can_see_post() (db/0033, db/0046) decide it for real
-- — but those read auth.uid() internally, so they can answer "can THIS viewer
-- see it?" and not "could a hypothetical Coven member see it?".
--
-- Rather than mirror the rule in JavaScript (a second source of truth that
-- drifts silently, and drifts toward telling people their things are more
-- private than they are), the tier ladder is defined here, once, and both
-- preview RPCs read it.
--
-- THE LADDER IS AN ASSUMPTION WORTH NAMING. can_see_item treats the tiers as
-- independent membership tests: are_friends / inner_circle / coffin_buddies are
-- three separate tables, and nothing in the schema forces a Castle Crew member
-- to also be a friend. The app's own visibility picker, though, presents them
-- as one ladder — Public → Coven → Castle Crew → Coffin Buddies → Only me —
-- and that's how collectors read it. So the preview assumes the ladder: a
-- Coffin Buddy sees everything a Castle Crew member sees, and so on. If that
-- ever stops being true in the UI, change it HERE and the preview follows.
--
-- Safety: both RPCs are hard-wired to auth.uid() as the owner. They can only
-- ever return the caller's own rows, so security definer leaks nothing — the
-- filtering is about showing you LESS of your own data, never someone else's.

create or replace function visibility_ladder(p_tier text)
returns text[]
language sql
immutable
as $$
  select case p_tier
    when 'public'         then array['public']
    when 'friends'        then array['public', 'friends']
    when 'inner'          then array['public', 'friends', 'inner']
    when 'coffin_buddies' then array['public', 'friends', 'inner', 'coffin_buddies']
    -- Anything unrecognised gets the narrowest answer. A preview that errs
    -- toward "they see less" would be the dangerous direction; this errs the
    -- other way only for tiers that don't exist.
    else array['public']
  end;
$$;

-- Returns setof plushies so the client can reuse _rowToItem + renderVault
-- unchanged, exactly like get_user_vault (db/0095).
create or replace function preview_my_vault_as(p_tier text)
returns setof plushies
language sql
security definer
stable
set search_path = public
as $$
  select p.*
  from plushies p
  join collections c on c.id = p.collection_id
  where c.owner_id = auth.uid()
    and p.visibility::text = any (visibility_ladder(p_tier))
  order by p.sort_order nulls last, p.added_at desc;
$$;

create or replace function preview_my_posts_as(p_tier text)
returns setof posts
language sql
security definer
stable
set search_path = public
as $$
  select p.*
  from posts p
  where p.author_id = auth.uid()
    and p.visibility::text = any (visibility_ladder(p_tier))
  order by p.created_at desc
  limit 40;
$$;

revoke all on function preview_my_vault_as(text) from public;
revoke all on function preview_my_posts_as(text) from public;
grant execute on function preview_my_vault_as(text) to authenticated;
grant execute on function preview_my_posts_as(text) to authenticated;

do $$
begin
  raise notice 'db/0104 applied: visibility_ladder + preview_my_vault_as + preview_my_posts_as.';
end $$;

-- Confirmation — the ladder widens by exactly one step at a time.
select t as tier, visibility_ladder(t) as sees
from unnest(array['public', 'friends', 'inner', 'coffin_buddies']) as t;
