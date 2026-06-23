-- ============================================================
-- Phase: Push — first real server-side trigger.
-- Fan a Web Push out to a closed app when a friendship event
-- happens. Paste into the Supabase SQL Editor and run. Idempotent.
--
-- This is the FIRST automatic caller of the send-push edge function
-- (everything before it was the manual sendSelfTestPush console helper).
--
-- ─── REQUIRED CONFIG (one-time, or push stays silent) ──────────────
-- _push_send() reads TWO secrets from Supabase **Vault**
-- (Dashboard → Project Settings → Vault — NOT the Edge Function
-- "secrets" tab, which is a different store the DB cannot read):
--
--   project_url    = https://ixymtbrvtysikhuitfta.supabase.co
--   send_push_key  = the SAME live **sb_secret_…** key you set as the
--                    send-push function's SEND_PUSH_KEY secret. send-push
--                    authorizes a trusted server caller by matching the
--                    Bearer against SEND_PUSH_KEY (see SERVER_KEYS in
--                    supabase/functions/send-push/index.ts), so the two
--                    MUST be byte-identical. NOT a sb_publishable_… key;
--                    NOT the legacy service_role JWT (the deployed function
--                    matches SEND_PUSH_KEY, and the injected legacy key may
--                    not equal the one shown in the dashboard).
--
-- To add them via SQL (keeps the value out of any chat transcript):
--   select vault.create_secret('https://ixymtbrvtysikhuitfta.supabase.co', 'project_url');
--   select vault.create_secret('sb_secret_…same as SEND_PUSH_KEY…', 'send_push_key');
--
-- If a secret of that name already exists, update it instead:
--   select vault.update_secret(id, 'sb_secret_…') from vault.secrets where name = 'send_push_key';
--
-- If push never fires, the missing secret is almost always the cause:
-- _push_send() returns quietly when either secret is absent.
-- ============================================================

create extension if not exists pg_net;

-- '@handle' for a user, or '@someone' if the profile/username is gone.
create or replace function _push_handle(uid uuid)
returns text language sql stable security definer
set search_path to 'public' as $$
  select '@' || coalesce((select username::text from profiles where id = uid), 'someone');
$$;

-- Fire-and-forget a single Web Push to one user via the send-push edge
-- function. Best-effort: a missing subscription, missing Vault secret,
-- or HTTP error is swallowed (warning only) so it can never break the
-- transaction that triggered it.
create or replace function _push_send(
  target  uuid,
  p_title text,
  p_body  text,
  p_url   text default './',
  p_tag   text default 'plush-push'
) returns void language plpgsql security definer
set search_path to 'public', 'vault', 'net' as $$
declare
  v_url text;
  v_key text;
begin
  if target is null then return; end if;

  -- No device subscribed → nothing to send.
  if not exists (select 1 from push_subscriptions where user_id = target) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url'   limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'send_push_key' limit 1;
  if v_url is null or v_key is null then
    return;   -- not configured yet (see header) — stay silent
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
  raise warning 'push notify failed for %: %', target, sqlerrm;
end;
$$;

-- On a new friend request, ping the addressee; on an accept, ping the
-- original requester. Skip if the two are blocked either way.
create or replace function trg_push_friendship()
returns trigger language plpgsql security definer
set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if not blocked_between(new.requester_id, new.addressee_id) then
      perform _push_send(
        new.addressee_id, '🦇 The Plush Crypt',
        _push_handle(new.requester_id) || ' sent you a friend request 🦇',
        './', 'friend-request');
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    if not blocked_between(new.requester_id, new.addressee_id) then
      perform _push_send(
        new.requester_id, '🦇 The Plush Crypt',
        _push_handle(new.addressee_id) || ' accepted your friend request 🦇',
        './', 'friend-accept');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists push_friendship on friendships;
create trigger push_friendship
  after insert or update on friendships
  for each row execute function trg_push_friendship();
