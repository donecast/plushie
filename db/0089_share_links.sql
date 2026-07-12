-- ============================================================
-- Plushie tracker — migration 0089: shareable wish list / crypt links
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Opt-in, read-only public pages: a collector can mint an unguessable
-- link to their WISH LIST ("here's what to get me") or their CRYPT
-- (collection showcase) and hand it to anyone — no account needed to
-- view. The whole app stays account-walled; ONLY these two surfaces,
-- ONLY when the owner mints a link, ONLY via the token.
--
-- Privacy rules:
--   * Wish list shares expose name / photo-snapshot / store link /
--     stock flag — never notes.
--   * Crypt shares expose ONLY items the owner marked Public (per-item
--     visibility, db/0031) — name, photo snapshot, quantity. Nicknames
--     are the item names by design; personal meaning is never included.
--   * Photos: only http(s) snapshots (Shopify CDN etc.) are handed out.
--     Storage paths need signed URLs an anonymous viewer can't mint, so
--     the client falls back to the catalog stock image for those.
--   * Revoking deletes the row; re-sharing mints a fresh token.

create table if not exists share_links (
  token text primary key default encode(gen_random_bytes(12), 'hex'),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  kind text not null check (kind in ('wishlist', 'collection')),
  created_at timestamptz not null default now(),
  unique (user_id, collection_id, kind)
);

alter table share_links enable row level security;
drop policy if exists share_links_own on share_links;
-- Owners manage their own links, and only for collections they belong to.
create policy share_links_own on share_links for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_member(collection_id));

-- ── The public read: one RPC, callable anonymously with the token ──────
create or replace function shared_list_page(p_token text)
returns jsonb language plpgsql security definer stable
set search_path = public as $$
declare
  l record;
  items jsonb;
begin
  if p_token is null or length(p_token) < 8 then return null; end if;
  select s.kind, s.collection_id, p.username
    into l
    from share_links s
    join profiles p on p.id = s.user_id
   where s.token = p_token;
  if l is null then return null; end if;

  if l.kind = 'wishlist' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'name', w.name,
        'catalogId', w.catalog_id,
        'photo', case when w.photo_path like 'http%' then w.photo_path end,
        'url', w.url,
        'outOfStock', w.out_of_stock
      ) order by w.sort_order asc nulls last, w.added_at desc), '[]'::jsonb)
      into items
      from wishlist w
     where w.collection_id = l.collection_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
        'name', pl.name,
        'catalogId', pl.catalog_id,
        'photo', case when pl.photo_path like 'http%' then pl.photo_path end,
        'quantity', pl.quantity
      ) order by pl.sort_order asc nulls last, pl.added_at desc), '[]'::jsonb)
      into items
      from plushies pl
     where pl.collection_id = l.collection_id
       and pl.visibility = 'public';
  end if;

  return jsonb_build_object('owner', l.username, 'kind', l.kind, 'items', items);
end;
$$;

grant execute on function shared_list_page(text) to anon, authenticated;

-- ── Confirmation ────────────────────────────────────────────────────────
select 'share links ready — ' || count(*) || ' existing links' as status from share_links;
