// Screenshot the blocked-notifications rescue panel in the real Settings modal,
// light and dark, so the copy and styling can be eyeballed rather than assumed.
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
// Tall enough that the whole Notifications section fits without the modal's own
// scroll container clipping the element screenshot.
const page = await browser.newPage({ viewport: { width: 760, height: 1500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.__meta = { notify_enabled: false, notify_off_reason: 'blocked' };
  window.idb = {
    getMeta: async (k) => (k in window.__meta ? window.__meta[k] : null),
    setMeta: async (k, v) => { window.__meta[k] = v; },
  };
  window.data = { appSettings: {}, featureEnabled: () => false, track: () => {} };
  window.__perm = 'denied';
  window.Notification = function () {};
  Object.defineProperty(window.Notification, 'permission', { get: () => window.__perm });
  window.Notification.requestPermission = async () => window.__perm;
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

// The panel lives inside the Settings modal, which starts hidden. The boot
// splash is a full-screen overlay that never lifts here (auth is stubbed out),
// so drop it or every screenshot is just the bat.
await page.evaluate(() => {
  document.getElementById('boot-splash')?.remove();
  document.getElementById('settings-modal').classList.remove('hidden');
});

for (const theme of ['light', 'dark']) {
  await page.evaluate(async (t) => {
    document.documentElement.setAttribute('data-theme', t);
    await updateNotifyButton();
  }, theme);
  const panel = await page.$('#acct-notify-blocked');
  const section = (await panel.evaluateHandle((el) => el.closest('.account-section'))).asElement();
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await section.screenshot({ path: `/tmp/notif-blocked-${theme}.png` });
  console.log(`wrote /tmp/notif-blocked-${theme}.png`);
}

await browser.close();
server.close();
