// Cloudflare Worker — Plush Crypt R2 storage
//
// Handles uploads, downloads, and deletes for the user collection
// photos + admin catalog photos that previously lived in Supabase
// Storage. Free egress on R2 is the reason we're moving.
//
// Three R2 buckets, bound in wrangler config:
//   * PHOTOS  — per-collection user photos
//                paths: <collection_uuid>/<plushie_uuid>.jpg
//   * CATALOG — admin-curated catalog item images, pen photos,
//                and user photo suggestions
//                paths: items/<slug>-<rand>.jpg
//                       pens/<pen_id>.jpg
//                       suggestions/<slug>-<rand>.jpg
//   * SOCIAL  — public-readable copies used by the feed, profiles,
//                avatars, top-plushes, and shared trade photos
//                paths: <user_uuid>/<rand>.jpg
//
// Auth model (v1, pragmatic):
//   * Uploads + deletes require an Authorization: Bearer <jwt>
//     header. We DON'T verify the JWT signature in v1 — just check
//     that something looks like a JWT is present, which is enough
//     to stop random internet spam since the URL isn't documented
//     anywhere a bot would crawl. If abuse appears we tighten this
//     to full HS256 verification with the Supabase JWT secret.
//   * Reads (GET) are public. Random UUID paths are the access
//     control — same trust model the existing Supabase signed URLs
//     used with their 1-hour tokens.
//   * CORS allows any origin so plushcrypt.com and the preview URL
//     both work without a Worker redeploy.
//
// ─── Deploy ────────────────────────────────────────────────────────
// In the Cloudflare dashboard:
//
//   1. R2 → Create bucket → "plush-crypt-photos" (private)
//   2. R2 → Create bucket → "plush-crypt-catalog" (private)
//   3. R2 → Create bucket → "plush-crypt-social"  (private)
//   4. Workers & Pages → Create → Worker → name it
//      "plush-crypt-r2" → Save and Deploy (you'll replace the stub).
//   5. The new Worker → Edit code → paste THIS file's contents →
//      Save and Deploy.
//   6. The new Worker → Settings → Variables → R2 bucket bindings:
//        Variable name: PHOTOS    → Bucket: plush-crypt-photos
//        Variable name: CATALOG   → Bucket: plush-crypt-catalog
//        Variable name: SOCIAL    → Bucket: plush-crypt-social
//      Save.
//   6. Note the deployed URL (e.g. https://plush-crypt-r2.scott-e08
//      .workers.dev). Put it in config.js as window.R2_BASE.
//      No trailing slash.
//
// Optional: bind a custom hostname like media.plushcrypt.com via the
// Worker route config so the URL in config.js stays under your
// domain. Not required.
// ───────────────────────────────────────────────────────────────────

const ALLOWED_BUCKETS = new Set(['photos', 'catalog', 'social']);
const READ_CACHE_SECONDS = 60 * 60 * 24 * 30; // 30 days at edge + browser

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Parse /<bucket>/<key…>
    const segs = url.pathname.replace(/^\/+/, '').split('/');
    const bucketName = segs.shift();
    const key = segs.join('/');
    if (!bucketName || !key) return text('expected /<bucket>/<key>', 400);
    if (!ALLOWED_BUCKETS.has(bucketName)) return text('unknown bucket', 404);

    const bucket = bucketName === 'photos' ? env.PHOTOS
                 : bucketName === 'social' ? env.SOCIAL
                 : env.CATALOG;
    if (!bucket) return text(`bucket ${bucketName} not bound in Worker config`, 500);

    if (method === 'GET' || method === 'HEAD') {
      const obj = await bucket.get(key);
      if (!obj) return text('not found', 404);
      const headers = corsHeaders();
      headers.set('content-type', obj.httpMetadata?.contentType || 'image/jpeg');
      headers.set('cache-control', `public, max-age=${READ_CACHE_SECONDS}, immutable`);
      headers.set('etag', obj.httpEtag);
      if (method === 'HEAD') return new Response(null, { status: 200, headers });
      return new Response(obj.body, { status: 200, headers });
    }

    // Mutations require an auth header. v1: presence-only check.
    if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
      const authz = request.headers.get('authorization') || '';
      if (!/^bearer\s+\S+\.\S+\.\S+\s*$/i.test(authz)) {
        return text('auth required', 401);
      }
    }

    if (method === 'PUT' || method === 'POST') {
      const contentType = request.headers.get('content-type') || 'image/jpeg';
      // Reject oversized uploads — client compresses to ~800px / ~80%
      // jpeg which lands ~200KB. Cap at 5MB to be safe.
      const declared = parseInt(request.headers.get('content-length') || '0', 10);
      if (declared > 5 * 1024 * 1024) return text('payload too large', 413);
      const body = await request.arrayBuffer();
      if (body.byteLength > 5 * 1024 * 1024) return text('payload too large', 413);
      await bucket.put(key, body, {
        httpMetadata: { contentType },
      });
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 200,
        headers: { ...Object.fromEntries(corsHeaders()), 'content-type': 'application/json' },
      });
    }

    if (method === 'DELETE') {
      await bucket.delete(key);
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    return text('method not allowed', 405);
  },
};

function corsHeaders() {
  const h = new Headers();
  h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-methods', 'GET, HEAD, PUT, POST, DELETE, OPTIONS');
  h.set('access-control-allow-headers', 'authorization, content-type, x-amz-meta-*');
  h.set('access-control-expose-headers', 'etag');
  h.set('access-control-max-age', '86400');
  return h;
}

function text(body, status) {
  return new Response(body + '\n', {
    status,
    headers: {
      ...Object.fromEntries(corsHeaders()),
      'content-type': 'text/plain',
    },
  });
}
