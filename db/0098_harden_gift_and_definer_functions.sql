-- ============================================================
-- Plushie tracker — migration 0098: harden the db/0094-0096 SECURITY DEFINER fns
-- Paste into Supabase SQL Editor and run. Safe to re-run.
-- (0097 is taken by a separate branch's Top 8 fix; this is the next free number.)
--
-- Supabase grants EXECUTE to `anon` by default on new public functions. Two
-- problems fell out of that for the gift/vault work:
--
--  1. SECURITY BUG: respond_gift / cancel_gift guarded ownership with
--     `<> auth.uid()`. For an unauthenticated (anon) caller auth.uid() is NULL,
--     and `x <> NULL` is NULL — never true — so the guard was skipped, letting
--     anon DECLINE or CANCEL any pending gift. Fixed two ways: an explicit
--     `auth.uid() is null` guard up front, and null-safe `is distinct from`.
--
--  2. Hardening: pin search_path on collection_owner + apply_default_item_
--     visibility (the two definer helpers from db/0094 that lacked it), and
--     REVOKE EXECUTE from anon on every gift/vault RPC — none is meant for
--     unauthenticated callers.
-- ============================================================

create or replace function collection_owner(coll_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select owner_id from collections where id = coll_id;
$$;

create or replace function apply_default_item_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.visibility := coalesce(
    (select default_item_visibility from profiles where id = collection_owner(new.collection_id)),
    new.visibility);
  return new;
end;
$$;

create or replace function respond_gift(p_gift uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g gifts; dest_coll uuid; def_vis item_visibility;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select * into g from gifts where id = p_gift for update;
  if not found then raise exception 'no such gift'; end if;
  if g.recipient_id is distinct from auth.uid() then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'gift already resolved'; end if;

  if p_accept then
    select id into dest_coll from collections
      where owner_id = auth.uid() order by created_at asc limit 1;
    if dest_coll is null then raise exception 'no destination collection'; end if;
    select default_item_visibility into def_vis from profiles where id = auth.uid();
    update plushies set
      collection_id = dest_coll,
      is_gift       = true,
      gifted_by     = g.sender_id,
      gift_message  = g.message,
      is_present    = false,
      visibility    = coalesce(def_vis, 'inner'),
      added_at      = now(),
      updated_at    = now()
    where id = g.plush_id;
    update gifts set status = 'accepted', responded_at = now() where id = p_gift;
    perform _push_send(g.sender_id,
      _push_handle(auth.uid()) || ' accepted your gift 🎁', 'It''s in their crypt now.',
      './', 'gift-' || p_gift::text);
  else
    update gifts set status = 'declined', responded_at = now() where id = p_gift;
    perform _push_send(g.sender_id,
      _push_handle(auth.uid()) || ' declined your gift', 'The plush stayed in your crypt.',
      './', 'gift-' || p_gift::text);
  end if;
end; $$;

create or replace function cancel_gift(p_gift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g gifts;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select * into g from gifts where id = p_gift for update;
  if not found then raise exception 'no such gift'; end if;
  if g.sender_id is distinct from auth.uid() then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'gift already resolved'; end if;
  update gifts set status = 'cancelled', responded_at = now() where id = p_gift;
end; $$;

revoke execute on function send_gift(uuid,uuid,text)  from anon;
revoke execute on function respond_gift(uuid,boolean) from anon;
revoke execute on function cancel_gift(uuid)          from anon;
revoke execute on function list_my_gifts()            from anon;
revoke execute on function get_user_vault(uuid)       from anon;

-- ── Confirmation ─────────────────────────────────────────────────────────
do $$
begin
  raise notice 'db/0098 applied: gift/vault definer functions hardened (null-safe auth guards, search_path pinned, anon execute revoked).';
end $$;

select proname,
  has_function_privilege('anon', oid, 'EXECUTE') as anon_can_exec
from pg_proc
where proname in ('send_gift','respond_gift','cancel_gift','list_my_gifts','get_user_vault')
order by proname;
