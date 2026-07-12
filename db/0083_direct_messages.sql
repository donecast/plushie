-- ============================================================
-- Plushie tracker — migration 0083: private messages (DMs)
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- 1:1 private messages between friends, Facebook-Messenger style. One flat
-- messages table; "threads" are derived per partner (the dm_threads RPC
-- returns the latest message + unread count per conversation).
--
-- Rules, all enforced here (not just in the client):
--   * Only accepted friends can message each other (are_friends, 0021).
--   * A block in either direction kills the channel (blocked_between, 0034).
--   * Ghosted senders (0046) keep the illusion: their sends succeed and they
--     see their own messages, but the recipient never does (is_suppressed
--     filter in the read policy), same stance as the feed.
--   * Recipients can only ever flip read_at — column-level grant, so a
--     recipient can't edit the body of a message they received.
--   * No deletes: messages are the trade-dispute paper trail of the social
--     layer. (Free plan, no backups — a delete would be unrecoverable anyway.)

create table if not exists dm_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint no_self_dm check (sender_id <> recipient_id)
);

-- Thread fetch: both directions of a pair, newest first.
create index if not exists dm_messages_pair_idx
  on dm_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
-- Unread badge: cheap partial index.
create index if not exists dm_messages_unread_idx
  on dm_messages (recipient_id) where read_at is null;

alter table dm_messages enable row level security;

drop policy if exists dm_read   on dm_messages;
drop policy if exists dm_insert on dm_messages;
drop policy if exists dm_update on dm_messages;

-- I see what I sent; I see what I received unless the sender is ghosted
-- (the ghost still sees their own copy, so nothing looks wrong to them).
create policy dm_read on dm_messages for select to authenticated
  using (
    sender_id = auth.uid()
    or (recipient_id = auth.uid() and not is_suppressed(sender_id))
  );

-- Friends only, no blocks either way, and you can only send as yourself.
create policy dm_insert on dm_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and are_friends(sender_id, recipient_id)
    and not blocked_between(sender_id, recipient_id)
  );

-- Mark-as-read: the recipient may update their received messages…
create policy dm_update on dm_messages for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
-- …but only the read_at column (body/sender/etc. stay immutable).
revoke update on dm_messages from authenticated;
grant update (read_at) on dm_messages to authenticated;

-- ─── Thread list RPC ─────────────────────────────────────────────────
-- Latest message + unread count per conversation partner, newest first.
-- SECURITY INVOKER (default): the dm_read policy above scopes rows, so the
-- ghost filter and privacy come for free. Profile fields ride along so the
-- client renders the list in one round trip (avatar_path resolves to a URL
-- client-side, same as friends).
create or replace function dm_threads()
returns table (
  partner_id uuid, username text, avatar_path text,
  last_body text, last_sender uuid, last_at timestamptz, unread bigint
)
language sql stable as $$
  with mine as (
    select m.*,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as partner
    from dm_messages m
  ),
  latest as (
    select distinct on (partner) partner, body, sender_id, created_at
    from mine order by partner, created_at desc
  ),
  unread as (
    select partner, count(*) as c
    from mine where recipient_id = auth.uid() and read_at is null
    group by partner
  )
  select l.partner, p.username, p.avatar_path,
         l.body, l.sender_id, l.created_at, coalesce(u.c, 0)
  from latest l
  join profiles p on p.id = l.partner
  left join unread u on u.partner = l.partner
  order by l.created_at desc;
$$;

-- ─── Push: “@handle sent you a message 💌” ───────────────────────────
-- Same _push_send/_push_handle plumbing as 0042/0077. Tag per-sender so a
-- burst of messages replaces the previous notification instead of stacking.
-- Ghosted senders never generate a push (the recipient can't see the
-- message, so a buzz would break the illusion).
create or replace function trg_push_dm()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if not is_suppressed(new.sender_id) then
    perform _push_send(new.recipient_id, '🦇 The Plush Crypt',
      _push_handle(new.sender_id) || ' sent you a message 💌', './', 'dm-' || new.sender_id::text);
  end if;
  return null;
end;
$$;

drop trigger if exists dm_messages_push on dm_messages;
create trigger dm_messages_push
  after insert on dm_messages
  for each row execute function trg_push_dm();

-- Confirmation.
select 'dm_messages ready — friends-only, block-aware, ghost-preserving; dm_threads() RPC + push trigger installed'
  as status;
