#!/usr/bin/env node
/**
 * One-shot migration: Supabase Storage → Cloudflare R2.
 *
 * Iterates every object in the 'photos', 'catalog', and 'social'
 * buckets on Supabase, downloads each via a signed URL, and re-uploads through
 * the deployed R2 Worker. Idempotent — re-running skips objects R2
 * already has at the same key.
 *
 * Supabase Storage is NOT deleted by this script. Verify R2 has
 * everything (eyeball, or compare counts), then delete from Supabase
 * later through their dashboard.
 *
 * ─── Run ─────────────────────────────────────────────────────────
 * Requires Node 18+ (built-in fetch).
 *
 *   1. Get your Supabase service role key from the dashboard →
 *      Project Settings → API → service_role. Treat like a password.
 *   2. Get a JWT that the Worker will accept. Easiest: sign in to
 *      plushcrypt.com, open DevTools → Application → Local Storage
 *      → sb-…-auth-token → copy the access_token field. Lives 1h.
 *      (For long migrations you can re-run periodically.)
 *   3. Run:
 *        export SUPABASE_URL='https://ixymtbrvtysikhuitfta.supabase.co'
 *        export SUPABASE_SERVICE_ROLE='eyJ…the long service role JWT…'
 *        export R2_BASE='https://plush-crypt-r2.scott-e08.workers.dev'
 *        export USER_JWT='eyJ…the access_token you copied above…'
 *        node worker/migrate-to-r2.mjs
 *
 *      Add `--dry-run` to list without copying.
 *
 * Output: progress per file. Final summary with counts.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const R2_BASE = (process.env.R2_BASE || '').replace(/\/$/, '');
const USER_JWT = process.env.USER_JWT;
const DRY = process.argv.includes('--dry-run');
const BUCKETS = ['photos', 'catalog', 'social'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !R2_BASE || !USER_JWT) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE, R2_BASE, USER_JWT.');
  process.exit(2);
}

const totals = { copied: 0, skipped: 0, failed: 0, total: 0 };

for (const bucket of BUCKETS) {
  console.log(`\n=== ${bucket} ===`);
  const keys = await listAll(bucket);
  totals.total += keys.length;
  console.log(`${keys.length} objects to consider.`);
  for (const key of keys) {
    process.stdout.write(`  ${bucket}/${key} … `);
    try {
      // Skip if R2 already has it at the same key.
      const head = await fetch(`${R2_BASE}/${bucket}/${key}`, { method: 'HEAD' });
      if (head.ok) { console.log('skip (already in R2)'); totals.skipped++; continue; }
      if (DRY)    { console.log('would copy');           totals.copied++; continue; }

      const signedUrl = await signed(bucket, key);
      const body = await fetch(signedUrl).then((r) => {
        if (!r.ok) throw new Error(`download ${r.status}`);
        return r.arrayBuffer();
      });
      const put = await fetch(`${R2_BASE}/${bucket}/${key}`, {
        method: 'PUT',
        body,
        headers: {
          'content-type': contentTypeFor(key),
          'authorization': `Bearer ${USER_JWT}`,
        },
      });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      console.log('ok');
      totals.copied++;
    } catch (err) {
      console.log('FAILED', err.message || err);
      totals.failed++;
    }
  }
}

console.log(`\nDone. ${totals.copied} copied · ${totals.skipped} skipped · ${totals.failed} failed · ${totals.total} total.`);
if (totals.failed > 0) process.exit(1);


async function listAll(bucket) {
  // Supabase Storage list is paged; walk directories. The 'photos'
  // bucket is one folder per collection_id; 'catalog' has flat
  // items/ + suggestions/ + pens/ prefixes.
  const out = [];
  const folders = await listFolder(bucket, '');
  for (const f of folders) {
    // f is either a file or a folder. Recurse into folders.
    if (f.id) {
      // file
      out.push(f.name);
    } else {
      const inner = await listFolder(bucket, f.name);
      for (const x of inner) {
        if (x.id) out.push(`${f.name}/${x.name}`);
        else {
          const deeper = await listFolder(bucket, `${f.name}/${x.name}`);
          for (const y of deeper) {
            if (y.id) out.push(`${f.name}/${x.name}/${y.name}`);
          }
        }
      }
    }
  }
  return out;
}

async function listFolder(bucket, prefix) {
  // POST {prefix, limit, offset, sortBy: {column, order}}
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE,
      'authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  if (!r.ok) throw new Error(`list ${bucket}/${prefix}: ${r.status}`);
  return await r.json();
}

async function signed(bucket, key) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${key}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE,
      'authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!r.ok) throw new Error(`sign ${r.status}`);
  const j = await r.json();
  // Supabase returns signedURL as '/object/sign/...'; the REST API lives
  // under '/storage/v1', so prepend it or the download 404s.
  return SUPABASE_URL + '/storage/v1' + j.signedURL;
}

function contentTypeFor(key) {
  const ext = key.toLowerCase().split('.').pop();
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  })[ext] || 'application/octet-stream';
}
