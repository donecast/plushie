// Screenshot the two crypt-grid prompts (Direct Purchase question + the
// auto-stamped-dates nudge) with real markup and real CSS.
// Writes /tmp/acquire-prompt-desktop.png and /tmp/acquire-prompt-phone.png.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  if (rel === '' || rel === 'shell') {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return;
  }
  try {
    const body = fs.readFileSync(path.join(ROOT, rel));
    const type = rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': type }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.currentUser = { id: 'me', username: 'redrambler' };
    window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
    window.idb = { getMeta: async () => null, setMeta: async () => {} };
    window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false };
  });
  for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                   'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
    await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
  }
  await page.evaluate(() => {
    document.getElementById('boot-splash')?.remove();
    try { wireEvents(); } catch {}
    const day = (m, d) => new Date(2026, m - 1, d, 12).getTime();
    state.catalog = [];
    state.collection = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `d${i}`, name: `Merged Plush ${i}`, catalogId: null, quantity: 1,
        acquiredHow: 'Bought from Manufacturer', dateCollected: '2026-01-04',
        addedAt: day(1, 4), acquiredHowBackfilled: true,
        missingAccessories: [], damagedAccessories: [], visibility: 'friends',
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`, name: `Auto Dated ${i}`, catalogId: null, quantity: 1,
        acquiredHow: 'Gift', dateCollected: '2026-07-02', addedAt: day(7, 2),
        missingAccessories: [], damagedAccessories: [], visibility: 'friends',
      })),
    ];
    state.tab = 'crypt';
    state.colSubTab = 'plushes';
    state.ready.add('collection');
    render();
  });
  await page.screenshot({ path: `/tmp/acquire-prompt-${name}.png`, fullPage: false });
  console.log(`wrote /tmp/acquire-prompt-${name}.png`);
  await page.close();
}

await browser.close();
server.close();
