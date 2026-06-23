# send-push — Web Push sender

Server side of the push layer. Reads `push_subscriptions` and delivers an
encrypted Web Push message that reaches the user even when the app is
closed. Reused (with new transports) by the eventual Capacitor app.

## One-time setup

1. **Apply the schema** — run `db/0037_push_subscriptions.sql` in the
   Supabase SQL editor.

2. **Set the public key** — `window.VAPID_PUBLIC_KEY` in `config.js` is
   already populated. The browser uses it as the `applicationServerKey`.

3. **Set the secrets** (the private key is NOT in the repo — it was handed
   over in chat when the keypair was generated):

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=BCHygdz0fJc1DLK872uF1PC_O430V9Tdm-maRD-gkppyffVIZcsY6C8mLwLz6XAq1tvKswC0XI6kI9jNF_6SjKI
   supabase secrets set VAPID_PRIVATE_KEY=<the private key from chat>
   supabase secrets set VAPID_SUBJECT=mailto:Scott@thebsgcompany.com
   supabase secrets set SEND_PUSH_KEY=sb_secret_...   # new Supabase secret key (Settings → API Keys)
   ```

   `SUPABASE_URL` is injected automatically. `SEND_PUSH_KEY` is the privileged
   key used for RLS-bypassing reads and to authenticate trusted server callers
   (the push DB triggers / restock cron). It replaces the deprecated
   service-role key; if `SEND_PUSH_KEY` is unset the function falls back to the
   auto-injected `SUPABASE_SERVICE_ROLE_KEY` so nothing breaks mid-switch.

   The **same** `sb_secret_...` value must also be stored in Vault as
   `send_push_key` (see `db/0041_push_event_triggers.sql`) so the triggers
   present a token the function trusts.

4. **Deploy** with the gateway JWT check off (the function does its own auth,
   and the `sb_secret_` key isn't a JWT so the gateway would otherwise reject
   it):

   ```sh
   supabase functions deploy send-push --no-verify-jwt
   ```

## Verify

In the browser console while signed in, with reminders enabled (so this
device has a subscription):

```js
await sendSelfTestPush();
```

You should get a notification even with the tab backgrounded. Close the
PWA entirely (installed to Home Screen on iOS) and re-run to confirm
closed-app delivery.

## Sending to others (social/trade alerts, future drop alerts)

A trusted server caller (the push DB triggers in
`db/0041_push_event_triggers.sql`, or a restock cron) calls with
`SEND_PUSH_KEY` as the Bearer token and a `user_ids` array:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $SEND_PUSH_KEY" \
  -H "apikey: $SEND_PUSH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_ids":["..."],"title":"Restock!","body":"Your wishlist item is back","url":"./"}'
```

Admins can also pass `user_ids` with their normal user token.
