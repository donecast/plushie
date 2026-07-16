// Verify the wishlist "Out of Stock" badge tracks the LIVE catalog, not the
// stale per-row snapshot. Bug: a restocked plush (live catalog available=true)
// kept showing "Out of Stock" because the badge read the add-time snapshot.
// Drives the real app parts (itemOutOfStock + cardBadgesHtml).
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
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  // Live catalog: c1 restocked (available), c2 still sold out.
  state.catalog = [
    { id: 'c1', type: 'plush', name: 'Mint Kintsugi Love Rabbit', available: true },
    { id: 'c2', type: 'plush', name: 'Tourette Rabbit', available: false },
  ];

  // Both wish rows carry the SAME stale snapshot from when they were added
  // out of stock — outOfStock: true. The live catalog is what should win.
  const restocked = { id: 'w1', catalogId: 'c1', name: 'Mint Kintsugi Love Rabbit', url: 'https://x/y', outOfStock: true };
  const stillOOS  = { id: 'w2', catalogId: 'c2', name: 'Tourette Rabbit', url: 'https://x/z', outOfStock: true };
  const offCatalog = { id: 'w3', catalogId: null, name: 'Some Off-Catalog Plush', url: 'https://x/o', outOfStock: true };

  const badge = (it) => /badge-oos/.test(cardBadgesHtml(it, 'wishlist'));
  const buyBtn = (it) => /btn-buy/.test(cardActionsHtml(it, 'wishlist'));

  return {
    restocked_isOOS: itemOutOfStock(restocked),      // expect false (live=available)
    restocked_hasBadge: badge(restocked),            // expect false
    restocked_hasBuy: buyBtn(restocked),             // expect true (buyable again)
    stillOOS_isOOS: itemOutOfStock(stillOOS),        // expect true (live=sold out)
    stillOOS_hasBadge: badge(stillOOS),              // expect true
    stillOOS_hasBuy: buyBtn(stillOOS),               // expect false
    offCatalog_isOOS: itemOutOfStock(offCatalog),    // expect true (falls back to snapshot)
    offCatalog_hasBadge: badge(offCatalog),          // expect true
  };
});
console.log(JSON.stringify(result, null, 2));

const expect = {
  restocked_isOOS: false, restocked_hasBadge: false, restocked_hasBuy: true,
  stillOOS_isOOS: true, stillOOS_hasBadge: true, stillOOS_hasBuy: false,
  offCatalog_isOOS: true, offCatalog_hasBadge: true,
};
const pass = Object.entries(expect).every(([k, v]) => result[k] === v);
console.log(pass ? '\n✅ PASS — badge tracks live catalog' : '\n❌ FAIL — mismatch vs expected');

await browser.close();
server.close();
process.exit(pass ? 0 : 1);
