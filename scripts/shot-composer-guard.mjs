// Screenshot the "Throw this away?" layer over the New Post composer.
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
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}
await page.evaluate(async () => {
  document.getElementById('boot-splash')?.remove();
  state.collection =[{ catalogId: 'c1', name: 'Jellybun', nickname: 'Jelly' }];
  wireSocialEvents();
  openComposer();
  const ta = document.getElementById('soc-compose-body');
  ta.value = 'Ten minutes of typing about everything we shipped this week…';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.screenshot({ path: '/tmp/composer-typed.png' });
await page.evaluate(() => document.querySelector('#social-modal .modal-close').click());
await page.waitForTimeout(100);
await page.screenshot({ path: '/tmp/composer-guard.png' });
console.log('wrote /tmp/composer-typed.png and /tmp/composer-guard.png');
await browser.close();
server.close();
