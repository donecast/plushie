# The Plush Crypt — project notes for Claude

A gothic-cute PWA for tracking a Plushie Dreadfuls collection, wish list,
trading, and a social layer. Vanilla JS (no build step / framework):
`index.html` + `app.js` + `data.js` + `styles.css`, a service worker
(`sw.js`), and IndexedDB. Backend is **Supabase** (auth via email magic
links, Postgres with RLS, Storage). Photos route through **Cloudflare
R2/Workers**; hosting is Cloudflare Pages + GitHub Pages from `main`
(custom domain `plushcrypt.com`). DB changes are hand-applied SQL in
`db/00NN_*.sql` (run in the Supabase SQL editor).

## ⚠️ Standing direction: we will ship native apps via Capacitor

We intend to launch **iOS + Android apps wrapping this web app with
[Capacitor](https://capacitorjs.com)** before long (not immediately —
think "once push is wired and retention shows up," with a possible
throwaway spike sooner). Keep every change Capacitor-friendly so the
eventual wrap is painless:

- **Stay a clean client-side web app.** No server-only rendering; the app
  must run fully inside a native webview loading static assets.
- **Use relative asset paths (`./foo`)**, not root-absolute (`/foo`).
  Root-absolute paths can break when served from `capacitor://localhost`.
  Note: the Tom mascot currently stores `/tom.jpg` in the DB — revisit
  that (and similar same-origin paths) before/at wrap time.
- **Keep notifications behind a thin abstraction.** Today they're local
  (Notification API / service worker, fire-while-open). Native needs real
  push via **APNs/FCM + a sender** (the parked Supabase edge function on a
  `friendships`/activity insert). Don't scatter `new Notification(...)`
  assumptions; funnel through the existing `fireLocalNotification`-style
  helpers so a Capacitor Push plugin can slot in.
- **Don't hardcode the web origin.** Auth magic-link redirects and any
  absolute URLs must tolerate a custom scheme / deep link (universal
  links) — Supabase + Capacitor works, but only if redirects aren't
  pinned to `https://plushcrypt.com`.
- **Prefer feature-detection + graceful fallback** for browser APIs that
  differ in a webview (web push, file pickers, share). Capacitor plugins
  (Camera, Share, Push) are the native path.
- **Mind store-review lag.** Once on the App Store (bundled), hotfixes
  wait for review — so keep the schema/data model from churning right
  before a release, and lean on OTA-able JS/CSS where possible.

## Fees / cost reference (for planning)
- Capacitor itself: free, MIT.
- Apple Developer Program: $99/yr **per developer account** (unlimited apps).
- Google Play: $25 one-time **per developer account** (unlimited apps).
- OTA live-updates: optional/paid if managed (Appflow), free if DIY (CI).

## Dev conventions
- Bump cache-buster query versions (`app.js?v=N`, `styles.css?v=N`,
  `data.js?v=N`) in `index.html` **and** the `CACHE` const in `sw.js`
  whenever those files change, so clients pick up new code.
- Work on a branch, open a draft PR to `main`, merge (squash) after the
  Cloudflare preview is green. Schema changes ship as a new
  `db/00NN_*.sql` the user applies in Supabase.
