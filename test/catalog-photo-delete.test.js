'use strict';
// adminDeleteCatalogPhoto must delete the R2 FILE, not just the DB row —
// an admin rejecting a community shot ("revert to store photo") must not
// leave the file orphaned in the bucket. Loads the real data.js into a vm
// with a recording Supabase/fetch stub, same approach as harness.js.

const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const R2_BASE = 'https://r2.example.com';

// vm objects come from another realm (different Object prototype), which
// deepStrictEqual rejects — normalise through JSON before comparing.
const plain = (x) => JSON.parse(JSON.stringify(x));

// Builds a fresh data.js instance plus recorders for every outbound call.
function loadDataLayer({ photoRow, r2Ok = true } = {}) {
  const calls = { fetches: [], deletes: [], updates: [] };

  const sb = {
    auth: { async getSession() { return { data: { session: { access_token: 'test-jwt' } } }; } },
    from(table) {
      return {
        select() {
          return { eq() { return { async maybeSingle() { return { data: photoRow, error: null }; } }; } };
        },
        delete() {
          return { eq(col, val) { calls.deletes.push({ table, col, val }); return Promise.resolve({ error: null }); } };
        },
        update(payload) {
          const filters = {};
          const step = {
            eq(col, val) { filters[col] = val; return step; },
            then(resolve) { calls.updates.push({ table, payload, filters }); resolve({ error: null }); },
          };
          return step;
        },
      };
    },
  };

  const sandbox = {
    window: { R2_BASE, currentUser: { id: 'admin-1' } },
    sb,
    console,
    fetch(url, opts) {
      calls.fetches.push({ url, opts });
      return Promise.resolve({ ok: r2Ok, status: r2Ok ? 204 : 401 });
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'data.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'data.js' });
  return { data: sandbox.window.data, calls };
}

// ─── _r2PhotoLocations: which files does a row own? ──────────────────

test('path + worker URL for the same object dedupe to one location', () => {
  const { data } = loadDataLayer();
  const locs = data._r2PhotoLocations({
    image_path: 'web/depression-rabbit.jpg',
    image_url: `${R2_BASE}/catalog/web/depression-rabbit.jpg`,
    bucket: 'catalog',
  });
  assert.deepStrictEqual(plain(locs), [{ bucket: 'catalog', path: 'web/depression-rabbit.jpg' }]);
});

test('worker-URL-only row parses bucket/key (query string stripped)', () => {
  const { data } = loadDataLayer();
  const locs = data._r2PhotoLocations({
    image_path: null,
    image_url: `${R2_BASE}/catalog/community/adhd-bat-a.jpg?x=1`,
    bucket: null,
  });
  assert.deepStrictEqual(plain(locs), [{ bucket: 'catalog', path: 'community/adhd-bat-a.jpg' }]);
});

test('external hot-link owns no R2 file', () => {
  const { data } = loadDataLayer();
  const locs = data._r2PhotoLocations({
    image_path: null,
    image_url: 'https://media-dynamic.okendo.io/images/abc.jpg?d=1000x1000',
    bucket: null,
  });
  assert.deepStrictEqual(plain(locs), []);
});

test('path-only row defaults to the catalog bucket', () => {
  const { data } = loadDataLayer();
  const locs = data._r2PhotoLocations({ image_path: 'suggestions/x.jpg', image_url: null, bucket: null });
  assert.deepStrictEqual(plain(locs), [{ bucket: 'catalog', path: 'suggestions/x.jpg' }]);
});

// ─── adminDeleteCatalogPhoto: file first, row second, mirror cleared ──

const PIPELINE_ROW = {
  id: 'p1',
  bucket: 'catalog',
  image_path: 'web/depression-rabbit.jpg',
  image_url: `${R2_BASE}/catalog/web/depression-rabbit.jpg`,
  target_handle: 'plushie-dreadfuls-depression-rabbit',
  target_variant_id: null,
};

test('deletes the R2 object, then the row, then clears the cover mirror', async () => {
  const { data, calls } = loadDataLayer({ photoRow: PIPELINE_ROW });
  await data.adminDeleteCatalogPhoto('p1');

  assert.strictEqual(calls.fetches.length, 1);
  assert.strictEqual(calls.fetches[0].url, `${R2_BASE}/catalog/web/depression-rabbit.jpg`);
  assert.strictEqual(calls.fetches[0].opts.method, 'DELETE');
  assert.strictEqual(calls.fetches[0].opts.headers.authorization, 'Bearer test-jwt');

  assert.deepStrictEqual(plain(calls.deletes), [{ table: 'catalog_photos', col: 'id', val: 'p1' }]);

  assert.strictEqual(calls.updates.length, 1);
  const u = calls.updates[0];
  assert.strictEqual(u.table, 'catalog_overrides');
  assert.strictEqual(u.payload.image, null);
  assert.strictEqual(u.payload.image_credit, null);
  // Conditional: only the row whose cover IS this photo gets cleared.
  assert.strictEqual(u.filters.handle, 'plushie-dreadfuls-depression-rabbit');
  assert.strictEqual(u.filters.image, `${R2_BASE}/catalog/web/depression-rabbit.jpg`);
});

test('a failed R2 delete throws and leaves the row in place', async () => {
  const { data, calls } = loadDataLayer({ photoRow: PIPELINE_ROW, r2Ok: false });
  await assert.rejects(() => data.adminDeleteCatalogPhoto('p1'), /R2 delete failed \(401\)/);
  assert.strictEqual(calls.deletes.length, 0);
  assert.strictEqual(calls.updates.length, 0);
});

test('variant-targeted photo clears catalog_variant_covers instead', async () => {
  const row = { ...PIPELINE_ROW, target_variant_id: 987, target_handle: 'parent-handle' };
  const { data, calls } = loadDataLayer({ photoRow: row });
  await data.adminDeleteCatalogPhoto('p1');
  assert.strictEqual(calls.updates.length, 1);
  assert.strictEqual(calls.updates[0].table, 'catalog_variant_covers');
  assert.strictEqual(calls.updates[0].filters.variant_id, 987);
});

test('external hot-link photo deletes only the row (no R2 call)', async () => {
  const row = {
    id: 'p2', bucket: null, image_path: null,
    image_url: 'https://media-dynamic.okendo.io/images/abc.jpg',
    target_handle: 'some-handle', target_variant_id: null,
  };
  const { data, calls } = loadDataLayer({ photoRow: row });
  await data.adminDeleteCatalogPhoto('p2');
  assert.strictEqual(calls.fetches.length, 0);
  assert.deepStrictEqual(plain(calls.deletes), [{ table: 'catalog_photos', col: 'id', val: 'p2' }]);
  // The hot-link cover mirror still clears — the photo was rejected.
  assert.strictEqual(calls.updates.length, 1);
});

test('already-deleted row is a quiet no-op', async () => {
  const { data, calls } = loadDataLayer({ photoRow: null });
  await data.adminDeleteCatalogPhoto('gone');
  assert.strictEqual(calls.fetches.length, 0);
  assert.strictEqual(calls.deletes.length, 0);
});
