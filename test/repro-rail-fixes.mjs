// Verify the two rail fixes against the real markup + real app parts:
// 1) Boot order: rail identity shows 0 buns while the catalog is empty, and
//    the post-catalog render() (the fix) repaints it with the true count.
// 2) Stirrings: each entry carries a compact date; entries older than 10
//    days age out of the ticker.
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
    featureEnabled: (k) => k === 'feature.side_rails',
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
    listCatalogEvents: async () => [],
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  const DAY = 24 * 3600e3;
  state.tab = 'home';
  state.pensOwned = new Map();
  state.collection = [
    { id: 'i1', catalogId: 'c1', name: 'Anxiety Rabbit' },
    { id: 'i2', catalogId: 'c2', name: 'Mini Grief Rabbit' },
    { id: 'i3', catalogId: 'c3', name: 'Rabbit Hair Clip' },  // accessory ≠ bun
  ];
  state._stirrings = [
    { id: 's1', kind: 'restocked', handle: 'fresh-bun', name: 'Fresh Bun', created_at: new Date(Date.now() - 2 * DAY).toISOString() },
    { id: 's2', kind: 'sold_out', handle: 'stale-bun', name: 'Stale Bun', created_at: new Date(Date.now() - 12 * DAY).toISOString() },
  ];

  // Boot-order replay: flags applied + first paint while the catalog is empty…
  applyFeatureFlags();
  render();
  const before = document.querySelector('.rail-id-stat')?.textContent;

  // …then the catalog lands and the fixed .then() calls render() on any tab.
  state.catalog = [
    { id: 'c1', type: 'plush', name: 'Anxiety Rabbit - Plush Stuffed Animal' },
    { id: 'c2', type: 'toy', name: 'Mini Grief Rabbit Mini Plush', tags: [] },
    { id: 'c3', type: 'hair clip', name: 'Rabbit Hair Clip' },
  ];
  render();
  const after = document.querySelector('.rail-id-stat')?.textContent;

  const stirRows = [...document.querySelectorAll('.rail-stir')];
  return {
    bunsBeforeCatalog: before,
    bunsAfterCatalog: after,
    stirringsShown: stirRows.map((r) => r.querySelector('.rail-stir-name')?.textContent),
    stirringsKindLine: stirRows.map((r) => r.querySelector('.rail-stir-kind')?.textContent),
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
