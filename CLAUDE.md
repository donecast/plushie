# The Plush Crypt — project notes for Claude

A gothic-cute PWA for tracking a Plushie Dreadfuls collection, wish list,
trading, and a social layer. Vanilla JS (no build step / framework):
`index.html` + `app.js` + `data.js` + `styles.css`, a service worker
(`sw.js`), and IndexedDB. Backend is **Supabase** (auth via email magic
links, Postgres with RLS, Storage). Photos route through **Cloudflare
R2/Workers**; hosting is Cloudflare Pages + GitHub Pages from `main`
(custom domain `plushcrypt.com`; GitHub repo is **`donecast/Plush-Crypt`** —
the old `donecast/plushie` name still redirects). DB changes are hand-applied
SQL in `db/00NN_*.sql` (run in the Supabase SQL editor).

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
- Schema changes ship as a new `db/00NN_*.sql` the user applies in Supabase.
- **Update the public Change Log** when a change is user-facing. It lives
  in `index.html` under `data-legal-section="changelog"` (footer → Change
  Log), newest day first. Add today's date as a new `.changelog-day` if it
  isn't there yet, bullet the new feature(s) in plain, non-internal
  language, and end the day with a `.changelog-fixes` line ("Misc bug
  fixes." — or "Fixed N…" only if we actually track a count). For a
  feature that's gated/not yet public, mark its `<li class="changelog-gated">`
  so it stays insider-only (blue, visible just to admins + the
  `ALWAYS_GRANTED_USERNAMES` allowlist). Pure refactors / infra / docs
  don't need an entry.

## Branch & PR workflow
- **One task = one branch**, cut fresh from the latest `origin/main`
  (`git fetch origin && git switch -c <short-descriptive-name> origin/main`).
  Don't reuse or pin a branch across unrelated tasks.
- **Before starting, check for in-flight work** (`gh pr list --state open`,
  plus recently-pushed `claude/*` branches). If something already covers the
  task, build on it or ask — never open a duplicate or force-push a branch
  another session is on.
- Push with `git push -u origin <branch>`; open the PR to `main` as
  ready-for-review (not draft).
- **Squash-merge once CI is green** (Cloudflare Pages + Workers Builds) —
  gate only if the user says so. Head branches auto-delete on merge, so no
  manual branch cleanup is needed.
- Never commit directly to `main`; never force-push `main`.
