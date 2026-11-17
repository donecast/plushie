# For Sale — live end-to-end harness

Runs the real buy/sell flow against the real Supabase project with **sandbox**
Stripe + EasyPost keys. Nothing here is stubbed. Do not run it once the live
keys are in (admin → For Sale → "Check payments & shipping" says TEST or LIVE).

Test accounts (created 2026-11-16, early-access via `market_testers`):
`e2e_seller`, `e2e_buyer`, and `e2e_admin` (admin only while testing — keep
`is_admin` off otherwise). Passwords live in `creds.json` (gitignored):

```json
{ "seller": { "email": "…", "password": "…" }, "buyer": { … }, "admin": { … } }
```

**Seller payouts:** Stripe's hosted onboarding shows a CAPTCHA, so it can't be
scripted. `e2e_seller` has an unfinished sandbox Stripe account; to run a sale,
temporarily swap its `market_sellers.stripe_account_id` (and set
`charges_enabled`/`payouts_enabled` true) with an onboarded sandbox seller's,
and swap back afterwards — or finish its onboarding once by hand from the app.

Run from this directory (`cd scripts/market-e2e`):

```sh
node flow.mjs 0 4000 3500      # list plushie #0 at $40, offer $35, accept, quote, checkout → checkout.url, order.id
node pay.mjs "$(cat checkout.url)"                    # pay with 4242…; 4000000000000259 opens a card dispute
node order.mjs                                        # the order row (status, label, tracking, payout)
node act.mjs buyer  '{"action":"confirm","orderId":"…"}'          # any market-checkout action, as buyer|seller|admin
node act.mjs seller '{"action":"refund","orderId":"…"}'
node act.mjs admin  '{"action":"health"}'
node ledger.mjs                                       # seller fee ledger + listings
node flow2.mjs <listingId> 2200                       # counter-offer path + a changed-mind second checkout
python3 -m http.server 8799 --bind 127.0.0.1 &        # (from the repo root) then:
node ui.mjs buyer '#trade-sale' 390 844               # the REAL app, signed in as a test account, on localhost
```

`state.json` holds the seller's collection rows `flow.mjs` lists from. EasyPost
test trackers walk to "delivered" by themselves in a few minutes. To exercise
the hourly job without waiting, run `select _market_release_tick();` in the
Supabase SQL editor (back-date `delivered_at` / `paid_at` / `reserved_until`
on a test order first to cross the 3-day, 5-day or 48-hour lines).

What passed on 2026-11-16 (sandbox): list → offer/counter → accept → live rates →
checkout → payment webhook → label → tracking webhooks → buyer confirm → payout
(with an owed fee withheld) · hourly auto-payout · problem report holds payout ·
seller cancel (refund + postage refund + fee owed) · admin refund after payout
(transfer reversed) · admin refund "seller at fault" · unpaid hold expiry ·
stale checkout page · every wrong-person / wrong-state call refused.
