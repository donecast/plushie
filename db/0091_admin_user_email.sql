-- ============================================================
-- Plushie tracker — migration 0091: sign-up email in admin overview
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
-- Surfaces each member's sign-up email in the admin user list. Emails
-- live only in auth.users; admin_user_overview() is already SECURITY
-- DEFINER and admin-gated (is_admin()), so it can read auth.users.email
-- without exposing it to anyone else. This just adds one column to the
-- existing return shape from db/0045 — everything else is unchanged.
-- ============================================================

-- Return shape changes (new email column), so the old function must be
-- dropped before recreating — Postgres won't CREATE OR REPLACE across a
-- changed OUT-parameter row type.
drop function if exists admin_user_overview();

create function admin_user_overview()
returns table(
  id              uuid,
  username        text,
  email           text,
  is_admin        boolean,
  created_at      timestamptz,
  last_seen_at    timestamptz,
  full_name       text,
  collection_count int,
  wishlist_count   int,
  for_trade_count  int,
  good_count      int,
  meh_count       int,
  bad_count       int,
  total_count     int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    return;
  end if;
  return query
    select
      p.id,
      p.username::text,
      u.email::text,
      p.is_admin,
      p.created_at,
      pp.last_seen_at,
      case
        when coalesce(btrim(pp.first_name), '') = '' then null
        else btrim(pp.first_name)
             || case when coalesce(btrim(pp.last_name), '') <> ''
                     then ' ' || btrim(pp.last_name) else '' end
      end,
      coalesce(cc.n, 0)::int,
      coalesce(wc.n, 0)::int,
      coalesce(tc.n, 0)::int,
      coalesce(f.good_count, 0)::int,
      coalesce(f.meh_count, 0)::int,
      coalesce(f.bad_count, 0)::int,
      coalesce(f.total_count, 0)::int
    from profiles p
    left join auth.users u on u.id = p.id
    left join profile_private pp on pp.id = p.id
    left join lateral (
      select count(*) n from plushies px
      join collections c on c.id = px.collection_id
      where c.owner_id = p.id
    ) cc on true
    left join lateral (
      select count(*) n from wishlist wx
      join collections c on c.id = wx.collection_id
      where c.owner_id = p.id
    ) wc on true
    left join lateral (
      select count(*) n from trade_items ti
      where ti.owner_id = p.id and ti.kind = 'offering' and ti.archived = false
    ) tc on true
    left join user_feedback_summary f on f.user_id = p.id
    order by p.created_at desc;
end;
$$;
grant execute on function admin_user_overview() to authenticated;
revoke execute on function admin_user_overview() from anon, public;

-- Sanity check: admins should now see an email column populated.
do $$ begin raise notice 'admin_user_overview now returns an email column (db/0091 applied).'; end $$;
