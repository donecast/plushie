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
   supabase secrets set SEND_PUSH_KEY=sb_secret_...     # a LIVE Supabase secret key
   ```

   `SUPABASE_URL` is injected automatically. `SEND_PUSH_KEY` is the
   privileged key for RLS-bypassing reads and for authenticating trusted
   server callers; the function falls back to the auto-injected legacy
   `SUPABASE_SERVICE_ROLE_KEY` only until `SEND_PUSH_KEY` is set. The DB
   push trigger (below) must present this SAME `sb_secret_` value.

4. **Deploy** (the function does its own auth, so skip the gateway JWT
   check — this also lets the non-JWT `sb_secret_` key through as a Bearer):

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

## Sending to others (server callers)

A trusted server caller (DB trigger or restock cron) calls with
`SEND_PUSH_KEY` (the `sb_secret_` key) as the Bearer token and a `user_ids`
array:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $SEND_PUSH_KEY" \
  -H "apikey: $SEND_PUSH_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_ids":["..."],"title":"Restock!","body":"Your wishlist item is back","url":"./"}'
```

Admins can also pass `user_ids` with their normal user token.

### Live trigger: friend requests

`db/0041_friend_push_trigger.sql` is the first real server caller. On a new
friend request (and on accept) it calls this function via `pg_net`. It reads
the Bearer from a **Vault** secret named `send_push_key`, which must hold the
**same** live `sb_secret_` value as the `SEND_PUSH_KEY` function secret:

```sql
select vault.update_secret(
  (select id from vault.secrets where name='send_push_key'),
  'sb_secret_...same as SEND_PUSH_KEY...');
```

If push goes silent, mismatched/rotated keys between these two stores is the
usual cause.
