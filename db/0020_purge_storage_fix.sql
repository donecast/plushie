-- ============================================================
-- Plushie tracker — migration 0020: admin_purge_user storage fix
-- Paste into Supabase SQL Editor and run.
-- Safe to re-run.
-- ============================================================
--
-- Supabase tightened its rules: SECURITY DEFINER functions can no
-- longer DELETE FROM storage.objects directly. The previous purge
-- RPC tripped on that and aborted with "Direct deletion from
-- storage tables is not allowed. Use the Storage API instead."
--
-- The fix: leave the auth.users cascade in the RPC and return the
-- list of collection IDs the user owned. The client uses that to
-- wipe photos through the Storage API (or the R2 Worker, once the
-- migration is complete) — RLS already gives admins delete rights.

-- The return type changes from void to uuid[]; Postgres won't allow
-- that via CREATE OR REPLACE, so drop the old signature first. Safe
-- to re-run (IF EXISTS).
drop function if exists admin_purge_user(uuid);

create or replace function admin_purge_user(target uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public, auth
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

  select username into username_snapshot from profiles where id = target;
  raise notice 'admin_purge_user: % purging % (@%)', auth.uid(), target, coalesce(username_snapshot, '?');

  select array_agg(id) into collection_ids
    from collections where owner_id = target;

  -- The cascade chain handles the rest of the public schema.
  delete from auth.users where id = target;

  return coalesce(collection_ids, array[]::uuid[]);
end;
$$;

revoke all on function admin_purge_user(uuid) from public;
grant execute on function admin_purge_user(uuid) to authenticated;
