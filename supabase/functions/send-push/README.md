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
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

4. **Deploy**:

   ```sh
   supabase functions deploy send-push
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

## Sending to others (future drop alerts)

A trusted server caller (DB trigger or restock cron) calls with the
service-role key as the Bearer token and a `user_ids` array:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_ids":["..."],"title":"Restock!","body":"Your wishlist item is back","url":"./"}'
```

Admins can also pass `user_ids` with their normal user token.
