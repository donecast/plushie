-- ─── Admin account purge ──────────────────────────────────
-- Single-call RPC that wipes a user account end-to-end:
--   1. The auth.users row goes (which cascades to every
--      profiles / collections / plushies / wishlist / pen_counts /
--      trade_items / trades / trade_addresses / trade_feedback /
--      consent_log row via the on-delete-cascade FKs).
--   2. Storage photos under the user's owned collection folders go
--      (storage isn't FK'd to auth, so we sweep it explicitly).
--
-- The function is SECURITY DEFINER so it can touch auth.users and
-- storage.objects regardless of the caller's RLS context. We gate it
-- with is_admin() and refuse to delete the caller's own account (use
-- a self-delete flow for that — not built yet).
--
-- Called from app.js after the admin types the target username to
-- confirm. The client-side guard is for UX; this server-side guard
-- is for security.

create or replace function admin_purge_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  collection_ids uuid[];
  username_snapshot text;
begin
  if not is_admin() then
    raise exception 'forbidden: admin required';
  end if;
  if target is null then
    raise exception 'target required';
  end if;
  if target = auth.uid() then
    raise exception 'cannot purge your own account through this RPC';
  end if;

  -- Capture identity for the audit logs before we cascade.
  select username into username_snapshot from profiles where id = target;
  raise notice 'admin_purge_user: % purging % (@%)', auth.uid(), target, coalesce(username_snapshot, '?');

  -- Collect collection IDs owned by this user; we use them to clean
  -- storage after the auth row is gone.
  select array_agg(id) into collection_ids
    from collections where owner_id = target;

  -- The cascade chain handles the rest.
  delete from auth.users where id = target;

  if collection_ids is not null then
    delete from storage.objects
    where bucket_id = 'photos'
      and ((storage.foldername(name))[1])::uuid = any(collection_ids);
  end if;
end;
$$;

revoke all on function admin_purge_user(uuid) from public;
grant execute on function admin_purge_user(uuid) to authenticated;
