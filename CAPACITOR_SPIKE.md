# Capacitor spike — native wrap readiness

**Status: throwaway spike. Verdict — wrap-readiness is HIGH.** No
architectural blockers found. The web app is already well-prepared to run
inside a native webview. The remaining work is (1) a native push transport
in the `send-push` backend and (2) platform builds, both of which need a
Mac / device / credentials and so are out of reach of this Linux spike.
This doc is the de-risked runbook so that work is execution, not discovery.

Nothing here ships to the live web app: `capacitor.config.json`,
`scripts/build-www.sh`, and the `@capacitor/*` devDeps are inert unless you
run the CLI. `www/`, `node_modules/`, `ios/`, `android/` are git-ignored.

---

## What the spike stood up

- **`capacitor.config.json`** — `appId: com.plushcrypt.app`, `webDir: www`,
  Android served over `https://localhost` (secure-context, matches iOS
  `capacitor://` semantics), PushNotifications presentation options.
- **`scripts/build-www.sh`** (`npm run build:www`) — assembles the shippable
  static app into `www/` (a filtered copy; no build step). Excludes
  migrations, tests, workers, node_modules, native projects.
- **`npm run cap:sync`** — `build:www` then `cap sync`.
- devDeps: `@capacitor/core`, `@capacitor/cli`, `@capacitor/push-notifications`.

### Verified in this spike (on Linux)
- `npx cap doctor` accepts the config (Capacitor 8.4.1).
- `npm run build:www` produces a **22-file, self-contained** bundle — every
  local asset `index.html` references resolves inside `www/`.
- No architectural edits to the app were needed to get here.

### NOT possible on Linux (needs macOS / device / credentials)
- `npx cap add ios` + an Xcode build + a real device for an **APNs** token.
- `npx cap add android` build (needs Android SDK/JDK) + an **FCM** token.
- Any real on-device push delivery test.

---

## Findings (the audit)

### 1. Magic-link auth under `capacitor://localhost` — NOT a blocker ✅
The classic Capacitor gotcha is that a Supabase magic link redirects to the
web origin, which under the wrap is `capacitor://localhost` (iOS) /
`https://localhost` (Android) — a link that won't open in a browser or
deep-link back without extra universal-link config.

**We already have the escape hatch.** `auth.js` supports the OTP **code**
flow — `verifyOtp({ email, token, type: 'email' })` (auth.js:32–39, wired to
a 6-digit-code UI at auth.js:382–404). In the native wrap, drive sign-in
through *that*: enter email → type the 6-digit code from the email →
`verifyOtp`. **No redirect, no deep link, no universal-link setup required.**
`sendMagicLink` uses `window.location.origin` dynamically (auth.js:24), so it
isn't pinned to `plushcrypt.com` — but for native, prefer the code path and
you sidestep the redirect entirely. (Deep-linked magic links remain a
*possible later polish* via `@capacitor/app` `appUrlOpen` + a custom scheme,
not a requirement.)

### 2. Push transport — ready to extend, backend work remains ⚙️
The abstraction is already in place, exactly as intended:
- `push_subscriptions` (db/0037) is transport-agnostic — a `platform` column
  (`'web'` today; `'ios'`/`'android'` reserved) and `endpoint` doubles as a
  device token; `p256dh`/`auth` stay null for native.
- Web subscribe/unsubscribe funnels through `ensurePushSubscription` /
  `disablePushSubscription` (app-ui.js) — the seam a Capacitor Push plugin
  slots into.

**Native path to build (on a Mac, with credentials):**
1. `@capacitor/push-notifications`: `register()`, and on the
   `registration` event upsert a `push_subscriptions` row with
   `platform: 'ios'|'android'`, `endpoint: <device token>`.
2. Add a native branch to the **`send-push` edge function**: for non-`web`
   rows, deliver via **APNs** (iOS) / **FCM** (Android) instead of Web-Push
   VAPID. This is the real remaining backend work — it needs an APNs key
   (Apple Developer) and an FCM server key (Firebase), so it can't be built
   or tested from this environment.
3. Funnel the tapped-notification navigation (today the SW `notificationclick`
   → `goToTab`) through the plugin's `pushNotificationActionPerformed` event.

Note: the **web service worker (`sw.js`) push path is replaced, not reused**,
under native — SWs don't reliably control a Capacitor page. The native plugin
is the transport; keep `fireLocalNotification` as the while-open fallback.

### 3. Asset paths — one item to revisit at wrap time, low risk ⚠️
Audit is otherwise clean: **no root-absolute `src`/`href` in `index.html`,
no root-absolute `url()` in CSS** — the app already uses `./` throughout.

The one same-origin absolute is the seeded Tom mascot:
`data.TOM_TOP.photoPath = '/tom.jpg'` (data.js:3313), passed through as-is by
`socialPhotoUrl` (data.js:2803, which treats a leading `/` as "serve
directly"). Under `capacitor://localhost/` this resolves to the bundle root
where `tom.jpg` lives, so it **likely just works** — but it's worth
confirming on-device and, if we want to be safe, moving to a relative form.
**Deliberately not changed in this spike:** flipping it to `./tom.jpg`
requires also updating the `startsWith('/')` guard in `socialPhotoUrl`, which
is a live social-photo code path that deserves real device testing, not a
blind edit. Revisit at true wrap time (this is the item CLAUDE.md already
flags).

### 4. Hardcoded web origin — clear ✅
No runtime code pins `https://plushcrypt.com`. The only matches are comments
and the img-proxy hostname *example* in `config.js`. Auth redirect,
Supabase, and R2/worker bases are all configured, not hardcoded to the web
origin.

---

## Runbook — taking it to a real device (on a Mac)

```bash
npm install
npm run build:www              # assemble www/
npx cap add ios                # and/or: npx cap add android
npm run cap:sync               # build www + copy into native projects
npx cap open ios               # opens Xcode (needs macOS)
```

Then, in order of what actually gates a launch:
1. **Auth:** wire the sign-in UI to prefer the OTP-code path in the wrap
   (already supported — see finding #1). Confirm a full sign-in on device.
2. **Push:** add `@capacitor/push-notifications`, register + upsert the token
   (finding #2, step 1). Confirm a token lands in `push_subscriptions` with
   `platform: 'ios'`.
3. **Backend push:** extend `send-push` with the APNs/FCM branch (finding #2,
   step 2). This needs the Apple/Firebase credentials — the one genuinely
   external dependency.
4. Confirm `/tom.jpg` renders on device; relativize if not (finding #3).
5. Store setup: Apple Developer ($99/yr), Google Play ($25 one-time).

**Bottom line:** the web side is wrap-ready today. The critical path to a
working native beta is push credentials + the `send-push` native branch —
everything else is standard `cap add` / Xcode mechanics.
