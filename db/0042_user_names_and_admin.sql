-- ─── Real names, public-name visibility, last-seen, admin overview ──────
--
-- Captures collectors' real names for trade safety and moderation:
--   * first name (required, enforced in the app's onboarding gate)
--   * last name (an initial is enough day-to-day; a FULL last name is
--     required to list anything for trade — enforced server-side below)
--   * a per-user choice of how the name appears on their public profile
--
-- Names are sensitive, and profiles.profiles_read_all lets ANY signed-in
-- user select ANY profile row. Rather than fight column-level grants on
-- that table (a table-level SELECT grant overrides column REVOKEs in
-- Postgres), the names live in a separate, locked-down table whose raw
-- rows only the owner and admins can read. Everyone else reaches a name
-- only through the security-definer accessors here, which decide what to
-- reveal: the visibility-aware public display name, or the full name for
-- the other party in a trade (shipping safety).

-- ─── 1. Private profile fields ──────────────────────────────────────────
create table if not exists profile_private (
  id              uuid primary key references profiles(id) on delete cascade,
  first_name      text,
  last_name       text,
  name_visibility text not null default 'first_initial'
                  check (name_visibility in ('hidden', 'first_initial', 'full')),
  last_seen_at    timestamptz
);

alter table profile_private enable row level security;

-- Self: read & maintain your own row. Admins: read everyone's.
drop policy if exists pp_self_read   on profile_private;
drop policy if exists pp_self_insert on profile_private;
drop policy if exists pp_self_update on profile_private;
drop policy if exists pp_admin_read  on profile_private;
create policy pp_self_read   on profile_private for select to authenticated using (id = auth.uid());
create policy pp_self_insert on profile_private for insert to authenticated with check (id = auth.uid());
create policy pp_self_update on profile_private for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy pp_admin_read  on profile_private for select to authenticated using (is_admin());

grant select, insert, update on profile_private to authenticated;

-- ─── 2. Public display name (honours the owner's visibility choice) ─────
-- Returns null when the user opted out ('hidden') or has no first name.
-- 'full'          → "First Last"
-- 'first_initial' → "First L."   (the default)
create or replace function public_display_name(p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_first text; v_last text; v_vis text;
begin
  select btrim(first_name), btrim(last_name), name_visibility
    into v_first, v_last, v_vis
    from profile_private where id = p_user;
  if coalesce(v_first, '') = '' or v_vis = 'hidden' then
    return null;
  end if;
  if v_vis = 'full' and coalesce(v_last, '') <> '' then
    return v_first || ' ' || v_last;
  end if;
  if coalesce(v_last, '') <> '' then
    return v_first || ' ' || upper(left(v_last, 1)) || '.';
  end if;
  return v_first;
end;
$$;
grant execute on function public_display_name(uuid) to authenticated;

-- ─── 3. Trade-partner full name (shipping safety) ───────────────────────
-- Either party of a trade may see the other party's FULL name. Verifies
-- the caller and the target are the two sides of the given trade.
create or replace function trade_party_name(p_trade uuid, p_user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_first text; v_last text; v_ok boolean;
begin
  select exists(
    select 1 from trades t
    where t.id = p_trade
      and auth.uid() in (t.proposer_id, t.recipient_id)
      and p_user   in (t.proposer_id, t.recipient_id)
  ) into v_ok;
  if not v_ok then return null; end if;
  select btrim(first_name), btrim(last_name) into v_first, v_last
    from profile_private where id = p_user;
  if coalesce(v_first, '') = '' then return null; end if;
  return v_first || case when coalesce(v_last, '') <> '' then ' ' || v_last else '' end;
end;
$$;
grant execute on function trade_party_name(uuid, uuid) to authenticated;

-- ─── 4. Trade safety: full last name required to LIST an offering ───────
-- Day-to-day a last initial is fine, but offering an item for trade means
-- a real exchange (and shipping), so require a real last name — at least
-- two letters, so a bare "S" / "S." won't pass. Enforced on INSERT only:
-- editing the quantity of an existing offering must not break, and old
-- pre-migration offerings are left undisturbed.
create or replace function require_full_last_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_last text;
begin
  if new.kind = 'offering' then
    select last_name into v_last from profile_private where id = new.owner_id;
    if length(regexp_replace(coalesce(v_last, ''), '[^[:alpha:]]', '', 'g')) < 2 then
      raise exception 'full_last_name_required_to_offer'
        using hint = 'Add your full last name in Account before listing items for trade.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_offering_requires_last_name on trade_items;
create trigger trg_offering_requires_last_name
  before insert on trade_items
  for each row execute function require_full_last_name();

-- ─── 5. Last-seen touch (called once per app boot) ──────────────────────
-- A plain upsert from the client would do, but a definer function keeps
-- the write cheap and lets us touch last_seen without the client needing
-- to round-trip the rest of the row.
create or replace function touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into profile_private (id, last_seen_at)
    values (auth.uid(), now())
  on conflict (id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;
grant execute on function touch_last_seen() to authenticated;

-- ─── 6. Admin overview: one call for the Users table ────────────────────
-- Per-user collection / wish-list / for-trade counts + last seen + full
-- name + feedback tallies, in a single round trip. is_admin()-gated; a
-- non-admin gets zero rows. (Net score is intentionally omitted.)
create or replace function admin_user_overview()
returns table(
  id              uuid,
  username        text,
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
