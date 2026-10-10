// Stirrings (catalog change feed) was desktop-rail only; on a phone the rail is
// hidden so insiders couldn't see it. Verifies the Home card at phone width and
// that it stays hidden on wide layouts (where the rail already shows it).
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
const now = new Date().toISOString();
const EVENTS = [
  { id: 'e1', kind: 'added', handle: 'jellybun', name: 'Jellybun', created_at: now },
  { id: 'e2', kind: 'restocked', handle: 'taurus', name: 'Taurus', created_at: now },
  { id: 'e3', kind: 'added', handle: 'concept-x', name: 'Concept X', created_at: now },
];
const CATALOG = [
  { handle: 'jellybun', name: 'Jellybun', available: true },
  { handle: 'taurus', name: 'Taurus', available: true },
  { handle: 'concept-x', name: 'Concept X', available: false, tags: ['fyc'] },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const out = {};
for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1400, height: 900 }]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
  await page.evaluate(() => {
    document.getElementById('boot-splash')?.remove();
    window.currentUser = { id: 'me', username: 'redrambler' };
    window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
    window.idb = { getMeta: async () => null, setMeta: async () => {} };
    window.data = { appSettings: {}, featureEnabled: () => true, isBlocked: () => false };
  });
  for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                   'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
    await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
  }
  await page.evaluate(([EVENTS, CATALOG]) => {
    document.body.classList.add('rails-on');
    state.tab = 'home'; state.socSubTab = 'feed';
    state.catalog = CATALOG; state._stirrings = EVENTS;
    state.ready.add('social');
    document.getElementById('social-view').classList.remove('hidden');
    renderSocial();
  }, [EVENTS, CATALOG]);
  const card = page.locator('#home-stirrings');
  out[`${label}.visible`] = await card.isVisible();
  out[`${label}.rows`] = await page.locator('#home-stirrings .rail-stir').count();
  out[`${label}.hasInDevelopment`] = (await card.textContent()).includes('In Development');
  if (label === 'phone') {
    out['phone.onScreen'] = await page.evaluate(() => {
      const r = document.getElementById('home-stirrings').getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= innerWidth;
    });
  }
  await page.close();
}
await browser.close(); server.close();
console.log(out);
const ok = out['phone.visible'] && out['phone.rows'] === 3 && out['phone.hasInDevelopment'] && out['phone.onScreen']
  && !out['desktop.visible'];
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
