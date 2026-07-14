// Verify the 🔔 notification inbox against the real markup + app parts:
// badge count, panel contents, unseen highlighting, mark-seen on open,
// click-away close, and row-click navigation (tag → tab).
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  const HOUR = 3600e3;
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.__seenCalls = [];
  window.data = {
    appSettings: {},
    featureEnabled: () => false,
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
    listRecentNotifications: async () => [
      { id: 'n1', title: '🦇', body: '@wifeosaurus commented on your post: "so cute"', url: './', tag: 'post-comment', created_at: new Date(Date.now() - 2 * HOUR).toISOString(), seen_at: null },
      { id: 'n2', title: '🦇', body: 'Your trade with @redrambler shipped', url: './', tag: 'trade-9', created_at: new Date(Date.now() - 5 * HOUR).toISOString(), seen_at: null },
      { id: 'n3', title: '🦇', body: '@someone reacted 🖤 to your comment', url: './', tag: 'like-3', created_at: new Date(Date.now() - 30 * HOUR).toISOString(), seen_at: new Date().toISOString() },
    ],
    markNotificationsSeen: async (ids) => { window.__seenCalls.push(ids); },
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  state.tab = 'home';
  wireEvents();
  document.getElementById('notif-btn').classList.remove('hidden');

  // Boot-path badge refresh.
  await refreshNotifBell();
  const badge = document.getElementById('notif-badge');
  const badgeAfterBoot = { text: badge.textContent, hidden: badge.classList.contains('hidden') };

  // Open the bell.
  document.getElementById('notif-btn').click();
  await new Promise((r) => setTimeout(r, 150));
  const panel = document.getElementById('notif-panel');
  const rows = [...panel.querySelectorAll('.notif-row')];
  const opened = {
    panelVisible: !panel.classList.contains('hidden'),
    rowCount: rows.length,
    unseenHighlighted: rows.map((r) => r.classList.contains('notif-unseen')),
    firstRowText: rows[0]?.querySelector('.notif-row-body')?.textContent,
    firstRowWhen: rows[0]?.querySelector('.notif-row-when')?.textContent,
    badgeHiddenAfterOpen: badge.classList.contains('hidden'),
    markSeenCalledWith: window.__seenCalls,
  };

  // Click the trade notification row → should route toward the Trade tab.
  let routedTab = null;
  const origGoToTab = window.goToTab;
  window.goToTab = (t) => { routedTab = t; return true; };
  rows[1].click();
  await new Promise((r) => setTimeout(r, 50));
  window.goToTab = origGoToTab;
  const afterRowClick = { routedTab, panelClosed: panel.classList.contains('hidden') };

  // Re-open: previously-unseen rows should no longer be highlighted.
  document.getElementById('notif-btn').click();
  await new Promise((r) => setTimeout(r, 100));
  const secondOpen = [...panel.querySelectorAll('.notif-row')].map((r) => r.classList.contains('notif-unseen'));

  // Click-away closes.
  document.body.click();
  await new Promise((r) => setTimeout(r, 50));
  const clickAwayClosed = panel.classList.contains('hidden');

  return { badgeAfterBoot, opened, afterRowClick, secondOpen, clickAwayClosed };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
