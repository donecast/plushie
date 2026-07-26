-- ============================================================
-- Plushie tracker — migration 0096: gift transfer + "present" flag
-- Paste into Supabase SQL Editor and run. Safe to re-run.
--
-- Two related capabilities:
--
--  • PRESENT (feature 4): mark one of your own plushes as a present. The
--    client forces its visibility to Only-me and shows a 🎁 badge; it's the
--    pre-gift state. Just a boolean column here.
--
--  • GIFT TRANSFER (feature 5): hand a plush to a Coven+ friend. This is a
--    MOVE, not a copy — the row's collection_id changes owner — but with a
--    PENDING accept/decline holding state so nothing leaves until the
--    recipient says yes. A gifts table tracks the lifecycle; three
--    SECURITY DEFINER RPCs are the only way to mutate it (send / respond /
--    cancel). The gift carries a sender-authored free-text message the
--    recipient can later clear.
--
-- Trades never moved ownership in-app; this is a genuinely new path, so it
-- stands alone rather than reusing the trade tables.
-- ============================================================

-- 1. Columns on plushies -------------------------------------------------
alter table plushies
  add column if not exists is_present  boolean not null default false,
  add column if not exists is_gift     boolean not null default false,  -- received as a gift
  add column if not exists gifted_by   uuid references profiles(id) on delete set null,
  add column if not exists gift_message text;

-- 2. Gift lifecycle table ------------------------------------------------
create table if not exists gifts (
  id            uuid primary key default gen_random_uuid(),
  plush_id      uuid not null references plushies(id) on delete cascade,
  sender_id     uuid not null references profiles(id) on delete cascade,
  recipient_id  uuid not null references profiles(id) on delete cascade,
  message       text,
  status        text not null default 'pending'
                check (status in ('pending','accepted','declined','cancelled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint gifts_not_self check (sender_id <> recipient_id)
);
-- At most one PENDING gift per plush (belt-and-braces with the RPC check).
create unique index if not exists gifts_one_pending_per_plush
  on gifts(plush_id) where status = 'pending';
create index if not exists gifts_recipient_idx on gifts(recipient_id, status);
create index if not exists gifts_sender_idx    on gifts(sender_id, status);

alter table gifts enable row level security;
-- Either party can read their own gifts. All WRITES go through the RPCs below
-- (SECURITY DEFINER), so there are deliberately no insert/update/delete
-- policies — direct table writes from the client are denied.
drop policy if exists gifts_read on gifts;
create policy gifts_read on gifts for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- 3. RPCs ----------------------------------------------------------------

-- Offer a plush you own to a Coven+ friend. Returns the new gift id.
create or replace function send_gift(p_plush uuid, p_recipient uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g_id uuid; p_name text;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  -- Must own the plush (via its collection).
  if not exists (
    select 1 from plushies pl join collections c on c.id = pl.collection_id
    where pl.id = p_plush and c.owner_id = auth.uid()
  ) then raise exception 'not your plush'; end if;
  -- Minimum tier: Coven (accepted friends). Trades are only block-gated, so
  -- this is a stricter, gift-specific gate.
  if not are_friends(auth.uid(), p_recipient) then
    raise exception 'recipient must be in your Coven';
  end if;
  if blocked_between(auth.uid(), p_recipient) then
    raise exception 'blocked';
  end if;
  if exists (select 1 from gifts where plush_id = p_plush and status = 'pending') then
    raise exception 'a gift for this plush is already pending';
  end if;

  insert into gifts(plush_id, sender_id, recipient_id, message)
    values (p_plush, auth.uid(), p_recipient, nullif(btrim(p_message), ''))
    returning id into g_id;

  select coalesce(nickname, name) into p_name from plushies where id = p_plush;
  perform _push_send(p_recipient,
    _push_handle(auth.uid()) || ' sent you a gift 🎁',
    coalesce(p_name, 'A plush') || ' is waiting for you to accept.',
    './', 'gift-' || g_id::text);
  return g_id;
end; $$;

-- Recipient accepts (moves the plush into their crypt) or declines.
create or replace function respond_gift(p_gift uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g gifts; dest_coll uuid; def_vis item_visibility;
begin
  select * into g from gifts where id = p_gift for update;
  if not found then raise exception 'no such gift'; end if;
  if g.recipient_id <> auth.uid() then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'gift already resolved'; end if;

  if p_accept then
    select id into dest_coll from collections
      where owner_id = auth.uid() order by created_at asc limit 1;
    if dest_coll is null then raise exception 'no destination collection'; end if;
    select default_item_visibility into def_vis from profiles where id = auth.uid();
    -- The MOVE: reassign the plush to the recipient and stamp gift metadata.
    -- (This is an UPDATE, so the insert-time default-visibility trigger does
    -- not fire — we set visibility explicitly to the recipient's default.)
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

-- Sender withdraws a still-pending gift.
create or replace function cancel_gift(p_gift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g gifts;
begin
  select * into g from gifts where id = p_gift for update;
  if not found then raise exception 'no such gift'; end if;
  if g.sender_id <> auth.uid() then raise exception 'not your gift'; end if;
  if g.status <> 'pending' then raise exception 'gift already resolved'; end if;
  update gifts set status = 'cancelled', responded_at = now() where id = p_gift;
end; $$;

-- Pending gifts for the current user, BOTH directions, joined with enough to
-- render the tray. SECURITY DEFINER so the recipient can see a pending gift's
-- plush name/photo even when it's a private "present" (they're party to it).
create or replace function list_my_gifts()
returns table(
  id uuid, direction text, status text, message text,
  plush_id uuid, plush_name text, photo_path text, catalog_id text,
  other_id uuid, other_username text, created_at timestamptz
) language sql security definer stable set search_path = public as $$
  select g.id,
    case when g.sender_id = auth.uid() then 'out' else 'in' end,
    g.status, g.message,
    p.id, coalesce(p.nickname, p.name), p.photo_path, p.catalog_id,
    (case when g.sender_id = auth.uid() then g.recipient_id else g.sender_id end),
    pr.username, g.created_at
  from gifts g
  join plushies p  on p.id = g.plush_id
  join profiles pr on pr.id = (case when g.sender_id = auth.uid() then g.recipient_id else g.sender_id end)
  where (g.sender_id = auth.uid() or g.recipient_id = auth.uid())
    and g.status = 'pending'
  order by g.created_at desc;
$$;

revoke all on function send_gift(uuid,uuid,text)  from public;
revoke all on function respond_gift(uuid,boolean) from public;
revoke all on function cancel_gift(uuid)          from public;
revoke all on function list_my_gifts()            from public;
grant execute on function send_gift(uuid,uuid,text)  to authenticated;
grant execute on function respond_gift(uuid,boolean) to authenticated;
grant execute on function cancel_gift(uuid)          to authenticated;
grant execute on function list_my_gifts()            to authenticated;

-- ── Confirmation ─────────────────────────────────────────────────────────
do $$
begin
  raise notice 'db/0096 applied: gifts table + present/gift columns + send/respond/cancel/list_my_gifts RPCs.';
end $$;

select proname from pg_proc
where proname in ('send_gift','respond_gift','cancel_gift','list_my_gifts')
order by proname;
