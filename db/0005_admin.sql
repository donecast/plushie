-- ============================================================
-- Plushie tracker — migration 0005: admin role
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run (uses CREATE OR REPLACE / DROP IF EXISTS).
-- ============================================================

-- Boolean flag on profiles. is_admin() reads it for the current user.
alter table profiles
  add column if not exists is_admin boolean not null default false;

create or replace function is_admin() returns boolean
  language sql security definer stable as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;

-- ─── Read access for admins everywhere ─────────────────────
drop policy if exists collections_member_read on collections;
create policy collections_member_read on collections for select to authenticated
  using (is_member(id) or is_admin());

drop policy if exists members_read on collection_members;
create policy members_read on collection_members for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid())
  or is_admin()
);

drop policy if exists plushies_read on plushies;
create policy plushies_read on plushies for select to authenticated
  using (is_member(collection_id) or is_admin());

-- Wishlist: admin can read AND edit (helps a user fix a broken entry).
drop policy if exists wishlist_read on wishlist;
drop policy if exists wishlist_write on wishlist;
create policy wishlist_read on wishlist for select to authenticated
  using (is_member(collection_id) or is_admin());
create policy wishlist_write on wishlist for all to authenticated
  using (can_edit(collection_id) or is_admin())
  with check (can_edit(collection_id) or is_admin());

drop policy if exists pen_counts_read on pen_counts;
create policy pen_counts_read on pen_counts for select to authenticated
  using (is_member(collection_id) or is_admin());

drop policy if exists trades_read on trades;
create policy trades_read on trades for select to authenticated
  using (proposer_id = auth.uid() or recipient_id = auth.uid() or is_admin());

drop policy if exists trade_li_read on trade_line_items;
create policy trade_li_read on trade_line_items for select to authenticated using (
  exists (select 1 from trades t where t.id = trade_id
            and (t.proposer_id = auth.uid() or t.recipient_id = auth.uid()))
  or is_admin()
);

drop policy if exists trade_addr_read on trade_addresses;
create policy trade_addr_read on trade_addresses for select to authenticated using (
  exists (select 1 from trades t where t.id = trade_id
            and (t.proposer_id = auth.uid() or t.recipient_id = auth.uid()))
  or is_admin()
);

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos'
  and (is_member(((storage.foldername(name))[1])::uuid) or is_admin())
);

-- ─── Promote @thegamersdome ────────────────────────────────
update profiles set is_admin = true where username = 'thegamersdome';
