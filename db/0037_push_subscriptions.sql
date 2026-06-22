-- ============================================================
-- Web Push subscriptions (and, later, native FCM/APNs device tokens).
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
--
-- Design notes
-- ────────────
-- * One row per (user, endpoint). The browser's PushManager endpoint is
--   the natural key; re-subscribing on the same device upserts in place.
-- * `platform` keeps the table transport-agnostic so the eventual
--   Capacitor wrap can store 'ios'/'android' device tokens alongside the
--   'web' rows and the send-push function can fan out to whichever the
--   user has. Today everything is 'web'.
-- * p256dh + auth are the Web-Push encryption keys; they stay null for
--   native tokens (which carry no client-side key material).
-- * RLS: owners see/manage only their own rows. The send-push edge
--   function reads across users with the service role, which bypasses RLS.
-- ============================================================

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  platform     text not null default 'web',   -- 'web' | future: 'ios' | 'android'
  endpoint     text not null,                 -- push endpoint URL (or device token)
  p256dh       text,                          -- web push only
  auth         text,                          -- web push only
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists push_sub_select_own on push_subscriptions;
create policy push_sub_select_own on push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_sub_insert_own on push_subscriptions;
create policy push_sub_insert_own on push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_sub_update_own on push_subscriptions;
create policy push_sub_update_own on push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_sub_delete_own on push_subscriptions;
create policy push_sub_delete_own on push_subscriptions
  for delete using (auth.uid() = user_id);
