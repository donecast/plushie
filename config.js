window.SUPABASE_URL = 'https://ixymtbrvtysikhuitfta.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_QHMgOMOWHLTPhjW5S07Ryg_WqfaY0aR';

// Bump this date string whenever the Terms or Privacy text in index.html
// changes in a way users should re-acknowledge. The auth gate compares
// against consent_log and forces a re-accept screen if the user's most
// recent row predates this version.
window.TERMS_VERSION = '2026-06-10';

// Cloudflare Worker that proxies plushiedreadfuls.com's Shopify CDN
// images with CORS headers + Shopify ?width=N resizing. See
// worker/img-proxy.js for deploy instructions. Empty string disables
// the proxy and falls back to direct fetches (which may CORS-fail and
// leave the image hot-linked instead of snapshotted).
// Replace with the workers.dev URL Cloudflare gave you, or a custom
// hostname if you've bound one (e.g. https://img.plushcrypt.com).
window.IMG_PROXY_BASE = 'https://plush-crypt-img-proxy.scott-e08.workers.dev/';

// Cloudflare Worker that proxies the R2 photo + catalog buckets. See
// worker/r2-storage.js for deploy instructions. Empty string keeps
// the legacy Supabase Storage path active. When set, uploads route
// to R2 via this Worker and reads use the same base URL. No trailing
// slash. e.g. 'https://plush-crypt-r2.scott-e08.workers.dev'.
window.R2_BASE = '';

// VAPID public key for Web Push. The browser uses this as the
// applicationServerKey when subscribing; the matching PRIVATE key lives
// ONLY as a Supabase secret (VAPID_PRIVATE_KEY) used by the send-push
// edge function — never commit it. The public half is safe to ship.
// Empty string disables push subscribing (the app falls back to the
// fire-while-open local notifications).
window.VAPID_PUBLIC_KEY = 'BCHygdz0fJc1DLK872uF1PC_O430V9Tdm-maRD-gkppyffVIZcsY6C8mLwLz6XAq1tvKswC0XI6kI9jNF_6SjKI';

