// Verify the wishlist "Out of Stock" badge actually LEAVES THE SCREEN when
// the live catalog refresh lands — without the user touching anything.
//
// The field bug (Amber + Scott, 2026-07-22): refreshCatalogLive() updated
// state.catalog but only repainted the Catalog tab. Someone parked on the
// Wish List kept the boot render — painted from the baked catalog.json
// snapshot, whose stock flags can be months stale — so restocked plushes
// stayed badged "Out of Stock" until a manual tab flip.
//
// Drives the real app parts + real markup end-to-end:
//   1. Boot render on the Wish List with a stale (sold-out) catalog → badge on.
//   2. refreshCatalogLive() against a stubbed live Shopify feed (in stock)
//      → badge gone + Buy button back, with no tab switch.
//   3. The visibilitychange resume nudge re-fetches when the catalog is old.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  if (rel === '' || rel === 'shell') {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
    return;
  }
  try {
    const body = fs.readFileSync(path.join(ROOT, rel));
    const type = rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.data = {
    appSettings: {},
    featureEnabled: () => false,
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
    listCatalogEvents: async () => [],
    listApprovedCatalogItems: async () => [],
    listCatalogOverrides: async () => [],
    listVariantCovers: async () => [],
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  // ── 1. Boot state: parked on the Wish List, catalog from a stale snapshot
  //       that still says the plush is sold out.
  state.tab = 'crypt';
  state.colSubTab = 'wishlist';
  state.pensOwned = new Map();
  state.collection = [];
  state.wishlist = [{
    id: 'w1', catalogId: '101', name: 'Neapolitan Rabbit',
    url: 'https://plushiedreadfuls.com/products/neapolitan', outOfStock: true,
  }];
  state.ready.add('collection');
  state.catalog = [{
    id: '101', type: 'plush', handle: 'neapolitan',
    name: 'Plushie Dreadfuls - Neapolitan Rabbit - Plush Stuffed Animal',
    available: false, retired: false, tags: [],
  }];
  render();
  const grid = () => document.getElementById('wishlist-grid').innerHTML;
  const badgeBefore = /badge-oos/.test(grid());
  const buyBefore = /btn-buy/.test(grid());

  // ── 2. The live feed says it restocked. Stub fetch for the Shopify URL
  //       (raw product shape — refreshCatalogLive normalizes it) and let the
  //       refresh run exactly as it does from the 30-min tick / boot.
  let liveFetches = 0;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    if (String(url).includes('plushiedreadfuls.com/products.json')) {
      liveFetches++;
      const products = String(url).includes('page=1') ? [{
        id: 101, title: 'Plushie Dreadfuls - Neapolitan Rabbit - Plush Stuffed Animal',
        handle: 'neapolitan', product_type: 'plush', body_html: '', tags: [],
        created_at: '2026-05-01T00:00:00Z', published_at: '2026-05-01T00:00:00Z',
        images: [], options: [], variants: [{ id: 1, title: 'Default Title', price: '39.99', available: true }],
      }] : [];
      return new Response(JSON.stringify({ products }), { status: 200 });
    }
    return realFetch(url, opts);
  };
  const refreshed = await refreshCatalogLive();
  const badgeAfter = /badge-oos/.test(grid());
  const buyAfter = /btn-buy/.test(grid());

  // ── 3. Resume nudge: catalog is "old" → coming back to the foreground
  //       refetches immediately (no waiting out the 30-min interval).
  scheduleCatalogRefresh();
  window._lastLiveCatalogAt = Date.now() - 6 * 60 * 1000;   // older than the 5-min gate
  const fetchesBeforeResume = liveFetches;
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 50));
  const resumeRefetched = liveFetches > fetchesBeforeResume;
  // A fresh catalog must NOT refetch on every app switch.
  const fetchesBeforeFresh = liveFetches;
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 50));
  const freshSkipped = liveFetches === fetchesBeforeFresh;

  return { badgeBefore, buyBefore, refreshed, badgeAfter, buyAfter, resumeRefetched, freshSkipped };
});
console.log(JSON.stringify(result, null, 2));

const expect = {
  badgeBefore: true,  buyBefore: false,   // stale snapshot paints OOS
  refreshed: true,
  badgeAfter: false,  buyAfter: true,     // live refresh repaints the wishlist in place
  resumeRefetched: true, freshSkipped: true,
};
const pass = Object.entries(expect).every(([k, v]) => result[k] === v);
console.log(pass ? '\n✅ PASS — live refresh repaints the wishlist in place' : '\n❌ FAIL — mismatch vs expected');

await browser.close();
server.close();
process.exit(pass ? 0 : 1);
