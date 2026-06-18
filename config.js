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

