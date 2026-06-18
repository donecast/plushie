// Cloudflare Worker — img-proxy
//
// Fetches a single image from Plushie Dreadfuls' Shopify CDN, returns it
// with the CORS headers the browser needs to actually do anything with
// the bytes (read into a canvas, snapshot to Supabase Storage, etc.).
//
// Why this exists: when a user clicks "Own" on a catalog item, the client
// tries to snapshot the product photo so the card stays good forever even
// if upstream rotates the URL (the Overthinking Bunny problem — same SKU,
// new image, every existing collection now shows the wrong plushie). The
// snapshot path requires fetching the image bytes from JS, which requires
// CORS, which the Shopify CDN doesn't reliably grant. This proxy adds it.
//
// The Worker is locked to cdn.shopify.com so it can't be abused as a
// general HTTP proxy. The image is requested with Shopify's `?width=` URL
// parameter to keep our bandwidth bill sane (the original product images
// are often 2-3 MB; the resized ones are 60-200 KB), and edge-cached at
// Cloudflare for a week so a popular plushie's image is served from the
// edge most of the time without re-hitting Shopify.
//
// ─── Deploy ────────────────────────────────────────────────────────────
// Two options:
//
//   1. Cloudflare dashboard → Workers & Pages → Create → Worker, name it
//      "plush-crypt-img-proxy", paste this file into the editor, Save and
//      Deploy. Note the URL — something like
//      plush-crypt-img-proxy.<your-subdomain>.workers.dev — and put it in
//      config.js as window.IMG_PROXY_BASE.
//
//   2. From the repo root with wrangler installed:
//        npx wrangler init --type=javascript img-proxy
//        cp worker/img-proxy.js img-proxy/src/index.js
//        cd img-proxy && npx wrangler deploy
//
// Either way: no secrets, no env vars, no DB. Stateless and free under the
// 100k requests/day Workers free tier.
//
// Optional: bind a custom hostname like img.plushcrypt.com via the Worker
// route config so the URL in config.js stays nice. Not required.
// ───────────────────────────────────────────────────────────────────────

const ALLOWED_HOST = 'cdn.shopify.com';
const DEFAULT_WIDTH = 1000;     // px — what we'll ask Shopify to resize to
const MAX_WIDTH = 2000;         // hard cap so a caller can't ask for 8K
const EDGE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days at the CF edge
const BROWSER_TTL_SECONDS = 60 * 60 * 24;  // 1 day in the user's browser

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // CORS preflight — not strictly needed for GET image requests but
    // some clients are paranoid.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const target = url.searchParams.get('url');
    if (!target) return text('missing url param', 400);

    let parsed;
    try { parsed = new URL(target); }
    catch { return text('bad url', 400); }

    if (parsed.host !== ALLOWED_HOST) {
      return text(`only ${ALLOWED_HOST} is allowed`, 403);
    }

    // Honor an explicit ?size= override, otherwise default. Cap so a
    // caller can't drain our bandwidth asking for huge images.
    const wantedSize = parseInt(url.searchParams.get('size'), 10);
    const size = Number.isFinite(wantedSize)
      ? Math.min(Math.max(wantedSize, 64), MAX_WIDTH)
      : DEFAULT_WIDTH;

    // Shopify supports both ?width=X (modern, lossless aspect) and the
    // {original}_NNNxNNN.png filename mangling (legacy). The query-param
    // form works for every URL shape they serve, so we use it
    // exclusively. Strip any existing width that might be smaller.
    parsed.searchParams.set('width', String(size));

    const upstream = await fetch(parsed.toString(), {
      cf: {
        cacheTtl: EDGE_TTL_SECONDS,
        cacheEverything: true,
      },
    });

    if (!upstream.ok) {
      return text(`upstream ${upstream.status}`, upstream.status);
    }

    // Stream the body through; just rewrite the headers we care about.
    const headers = corsHeaders();
    headers.set('content-type', upstream.headers.get('content-type') || 'image/jpeg');
    const len = upstream.headers.get('content-length');
    if (len) headers.set('content-length', len);
    headers.set('cache-control', `public, max-age=${BROWSER_TTL_SECONDS}, immutable`);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};

function corsHeaders() {
  const h = new Headers();
  h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  h.set('cross-origin-resource-policy', 'cross-origin');
  h.set('timing-allow-origin', '*');
  return h;
}

function text(body, status) {
  return new Response(body + '\n', {
    status,
    headers: { 'content-type': 'text/plain', ...Object.fromEntries(corsHeaders()) },
  });
}
