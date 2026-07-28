// Screenshot the bulk editor (real markup + real CSS) at desktop and phone
// widths, so the layout is checked by eye and not just by assertions.
// Writes /tmp/bulk-edit-desktop.png and /tmp/bulk-edit-phone.png.
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
    document.getElementById('boot-splash')?.remove();   // the real one goes on boot
    try { wireEvents(); } catch {}
    const names = ['Anxiety Axolotl', 'Blue Plaid Love Rabbit', 'Cursed Corgi', 'Doomed Duck',
                   'Existential Eel', 'Forlorn Ferret', 'Grieving Goose', 'Haunted Hedgehog'];
    state.catalog = [];
    state.collection = names.map((n, i) => ({
      id: `p${i}`, name: n, catalogId: null, quantity: 1,
      acquiredHow: i % 3 === 0 ? 'Bought from Manufacturer' : null,
      dateCollected: i % 4 === 0 ? '2026-02-14' : null,
      missingAccessories: [], damagedAccessories: [], visibility: 'friends',
    }));
    openBulkEditor();
    // Tick a couple so the selected state is visible in the shot.
    ['p1', 'p2'].forEach((id) => {
      const cb = document.querySelector(`.bulk-check[data-bulk-id="${id}"]`);
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
  await page.screenshot({ path: `/tmp/bulk-edit-${name}.png`, fullPage: false });
  console.log(`wrote /tmp/bulk-edit-${name}.png`);
  await page.close();
}

await browser.close();
server.close();
