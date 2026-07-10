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
// Auth model (v2):
//   * Uploads + deletes + prefix-list require an Authorization:
//     Bearer <jwt> header, and we now VERIFY the JWT: its ES256
//     signature is checked against Supabase's public JWKS, and its
//     `exp` must be in the future and `sub` present. A forged or
//     expired token (the old presence-only check let `Bearer a.b.c`
//     through) is rejected. Only a genuinely signed-in account can
//     mutate. The public JWKS URL comes from env.SUPABASE_JWKS_URL
//     (see wrangler.jsonc) — no shared secret is needed because the
//     project signs asymmetrically (ES256 / P-256).
//   * social bucket writes/deletes/lists are additionally SCOPED to
//     the caller: the first path segment (the owner uuid) must equal
//     the token's `sub`, so one user cannot overwrite or delete
//     another user's avatar / post / trade photo.
//   * photos + catalog buckets are verified-auth only (any signed-in
//     user), not yet per-owner scoped — see TODO below. That is a
//     smaller, less-discoverable surface (collection UUIDs aren't
//     public) and needs a collection→owner / is_admin lookup to close.
//   * List (GET ...?list) requires a non-empty prefix, so a caller
//     can only enumerate inside a folder whose (UUID) id it already
//     knows — no blanket bucket listing.
//   * Reads (GET) are public. Random UUID paths are the access
//     control — same trust model the existing Supabase signed URLs
//     used with their 1-hour tokens.
//   * CORS allows any origin so plushcrypt.com and the preview URL
//     both work without a Worker redeploy.
//
// TODO (follow-up): scope `photos` (path is <collection_uuid>/…) and
// `catalog` (admin-only) once the Worker can map collection→owner and
// read is_admin — both need a Supabase lookup with a service key.
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

// ─── JWT verification (ES256 against Supabase's public JWKS) ─────────
// Cached at module scope so a warm isolate reuses the fetched keys.
const JWKS_TTL_MS = 60 * 60 * 1000; // refetch the key set hourly
let _jwks = { keys: null, at: 0 };

async function getJwks(env) {
  const now = Date.now();
  if (_jwks.keys && now - _jwks.at < JWKS_TTL_MS) return _jwks.keys;
  if (!env.SUPABASE_JWKS_URL) throw new Error('SUPABASE_JWKS_URL not configured');
  const resp = await fetch(env.SUPABASE_JWKS_URL, { cf: { cacheTtl: 3600 } });
  if (!resp.ok) throw new Error(`jwks fetch failed: ${resp.status}`);
  const body = await resp.json();
  _jwks = { keys: Array.isArray(body.keys) ? body.keys : [], at: now };
  return _jwks.keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Returns the verified claims object, or null if the token is missing,
// malformed, wrong-alg, unsigned-by-us, or expired. Never throws to the
// caller for a bad token — only a misconfigured Worker (no JWKS URL /
// unreachable JWKS) rejects loudly, which is what we want.
async function verifyToken(authz, env) {
  const m = /^bearer\s+(\S+)$/i.exec((authz || '').trim());
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch { return null; }
  if (header.alg !== 'ES256') return null;

  const keys = await getJwks(env);
  const jwk = keys.find((k) => k.kid === header.kid) || (keys.length === 1 ? keys[0] : null);
  if (!jwk) return null;

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key,
      b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  } catch { return null; }
  if (!ok) return null;

  if (!payload.sub) return null;
  if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

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

    // List keys under a prefix: GET /<bucket>/<prefix>?list → { keys }.
    // Auth-gated like mutations, and a non-empty prefix is required (the
    // path guard above already enforces it) so the random-UUID access
    // model isn't defeated by blanket bucket enumeration — a caller must
    // already know a folder id (itself a UUID) to list inside it.
    if (method === 'GET' && url.searchParams.has('list')) {
      const claims = await verifyToken(request.headers.get('authorization'), env);
      if (!claims) return text('auth required', 401);
      if (bucketName === 'social' && key.split('/')[0] !== claims.sub) {
        return text('forbidden', 403);
      }
      const keys = [];
      let cursor;
      do {
        const listing = await bucket.list({ prefix: key, cursor, limit: 1000 });
        for (const o of listing.objects) keys.push(o.key);
        cursor = listing.truncated ? listing.cursor : undefined;
      } while (cursor);
      return new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: { ...Object.fromEntries(corsHeaders()), 'content-type': 'application/json' },
      });
    }

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

    // Mutations require a VERIFIED token (ES256 signature + exp + sub).
    if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
      const claims = await verifyToken(request.headers.get('authorization'), env);
      if (!claims) return text('auth required', 401);
      // social bucket: caller may only touch their own <uuid>/ prefix.
      if (bucketName === 'social' && key.split('/')[0] !== claims.sub) {
        return text('forbidden', 403);
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

// Exposed for unit tests only. The Cloudflare Worker runtime uses `default`;
// these named exports are inert there.
export { verifyToken, getJwks, b64urlToBytes, _resetJwksCache };
function _resetJwksCache() { _jwks = { keys: null, at: 0 }; }
