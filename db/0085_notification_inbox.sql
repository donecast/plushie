-- ============================================================
-- Plushie tracker — migration 0085: notification inbox (delivery fallback)
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- ============================================================
--
-- Why: every push trigger routes through _push_send, which NO-OPS when the
-- recipient has no push subscription. Friend/trade/DM events happen to have
-- client-side fire-while-open fallbacks, but post events (comments, replies,
-- likes, mentions) had none — so a user without working web push (iOS Safari
-- outside the installed PWA, or pre-#176 clients) got "all notifications
-- except posts". Exactly Amber's report.
--
-- Fix: _push_send now ALWAYS queues the notification in a table first, then
-- attempts real push as before. The app polls the queue while open and
-- locally fires anything push didn't deliver — one uniform fallback for
-- every event, current and future, instead of a bespoke poller per feature.
-- (Also the future feed for an in-app notification bell: seen_at is ready.)

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '🦇 The Plush Crypt',
  body text not null,
  url  text not null default './',
  tag  text,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,   -- surfaced on a device (real push assumed, or fired locally)
  seen_at      timestamptz    -- reserved for a future in-app notification center
);
-- The poll: "my undelivered rows, oldest first".
create index if not exists notifications_undelivered_idx
  on notifications(user_id, created_at) where delivered_at is null;

alter table notifications enable row level security;
drop policy if exists notifications_read   on notifications;
drop policy if exists notifications_update on notifications;
-- Read your own; only triggers (security definer) write them.
create policy notifications_read on notifications for select to authenticated
  using (user_id = auth.uid());
-- You may flip your own delivery/seen stamps — nothing else.
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on notifications from authenticated;
grant update (delivered_at, seen_at) on notifications to authenticated;

-- ── _push_send: queue first, then push ─────────────────────────────────
create or replace function _push_send(
  target   uuid,
  p_title  text,
  p_body   text,
  p_url    text default './',
  p_tag    text default 'plush-push'
) returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url text;
  v_key text;
begin
  if target is null then return; end if;

  -- Queue unconditionally: the app's while-open poll delivers anything real
  -- push doesn't reach (no subscription, expired endpoint, unsupported
  -- browser). Opportunistic hygiene: this user's ancient rows go with it.
  delete from notifications where user_id = target and created_at < now() - interval '45 days';
  insert into notifications (user_id, title, body, url, tag)
  values (target, p_title, p_body, p_url, p_tag);

  -- No subscription on file → queue-only (the poll will deliver it).
  if not exists (select 1 from push_subscriptions where user_id = target) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url'   limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then
    return;  -- not configured yet; stay harmless
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := jsonb_build_object(
      'user_ids', jsonb_build_array(target),
      'title',    p_title,
      'body',     p_body,
      'url',      p_url,
      'tag',      p_tag
    )
  );
exception when others then
  -- A push must never break the actual social/trade write.
  raise warning 'push notify failed for %: %', target, sqlerrm;
end;
$$;

-- Confirmation.
select 'notification inbox live: _push_send queues every event; app-open poll delivers what push cannot' as status;
