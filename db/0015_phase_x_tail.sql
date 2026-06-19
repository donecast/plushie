-- ─── Phase X tail items: trust + merge ────────────────────────────
-- Three pieces, all server-side:
--
-- 1. Trusted submitter check. Once a user has had a catalog_items
--    submission approved, future submissions skip the queue and land
--    as status='approved' immediately. They still surface in the
--    admin queue (review_seen = false), but they're publicly visible
--    right away. Untrusted submitters land status='pending' as before.
--
-- 2. Catalog_items INSERT RLS rewritten to enforce the above. A
--    submitter setting status='approved' without being trusted (or
--    admin) is rejected at the database, not just the client.
--
-- 3. Merge RPC: collapse a duplicate catalog_items submission into a
--    canonical catalog item (Shopify or another catalog_items row).
--    Re-points plushies / wishlist / trade_items references, then
--    marks the duplicate rejected with a note.

create or replace function user_is_trusted_submitter()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists(
    select 1 from catalog_items
    where submitted_by = auth.uid()
      and status = 'approved'
  );
$$;

drop policy if exists catalog_items_insert on catalog_items;
create policy catalog_items_insert on catalog_items for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and (
      status = 'pending'
      or (
        status = 'approved'
        and (user_is_trusted_submitter() or is_admin())
      )
    )
  );

-- Merge a duplicate catalog_items submission into a canonical catalog
-- item. winner_id is text because the canonical may be a Shopify
-- product id (numeric string) or a catalog_items UUID (uuid string).
-- duplicate_id is always a catalog_items UUID.
create or replace function admin_merge_catalog_item(duplicate_id uuid, winner_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  dup_handle text;
  winner_handle text;
begin
  if not is_admin() then
    raise exception 'forbidden';
  end if;
  if duplicate_id is null or winner_id is null then
    raise exception 'both ids required';
  end if;

  select handle into dup_handle from catalog_items where id = duplicate_id;
  -- winner can be a Shopify id (no catalog_items row); leave handle null then.
  select handle into winner_handle from catalog_items where id::text = winner_id;

  -- Re-point every references-by-catalog_id row from the duplicate to
  -- the winner. catalog_id is text on each child table so the same
  -- update statement covers both Shopify-id and uuid winners.
  update plushies     set catalog_id = winner_id where catalog_id = duplicate_id::text;
  update wishlist     set catalog_id = winner_id where catalog_id = duplicate_id::text;
  update trade_items  set catalog_id = winner_id where catalog_id = duplicate_id::text;

  update catalog_items
     set status        = 'rejected',
         notes_to_admin = coalesce(notes_to_admin || E'\n', '')
                          || 'Merged into ' || coalesce(winner_handle, winner_id),
         review_seen   = true,
         approved_by   = auth.uid(),
         approved_at   = now()
   where id = duplicate_id;
end;
$$;

revoke all on function admin_merge_catalog_item(uuid, text) from public;
grant execute on function admin_merge_catalog_item(uuid, text) to authenticated;
