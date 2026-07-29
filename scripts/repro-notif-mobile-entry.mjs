// @ydkj: "it would be neat if we had a notifications center in the app instead
// of just relying on pop-ups on our phone."
//
// There already was one — a 🔔 dropdown hanging off a header icon, which on a
// phone was the ONLY way in (and our own discoverability rule says a header
// icon must never be the only entry point). This verifies the phone entry:
// a bottom-nav Alerts tab that routes to the same bell, and a panel that
// behaves like a surface instead of a 340px dropdown.
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

const ROWS = [
  { id: 'n1', title: 'x', body: '@wifeosaurus commented on your post', excerpt: 'omg so cute',
    url: null, tag: 'comment-1', created_at: new Date().toISOString(), seen_at: null,
    actor_id: 'u2', kind: 'comment', post_id: 'p1', comment_id: 'c1' },
  { id: 'n2', title: 'x', body: 'A trade offer arrived', excerpt: null,
    url: null, tag: 'trade-9', created_at: new Date().toISOString(), seen_at: null,
    actor_id: null, kind: 'trade', post_id: null, comment_id: null },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
// A phone, because that's where the entry point was missing.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate((ROWS) => {
  document.getElementById('boot-splash')?.remove();
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.__seen = [];
  window.data = {
    appSettings: {}, featureEnabled: () => false, isBlocked: () => false,
    listRecentNotifications: async () => ROWS.map((r) => ({ ...r })),
    markNotificationsSeen: async (ids) => { window.__seen.push(ids); },
    _resolveProfiles: async () => new Map(),
  };
}, ROWS);
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}
await page.evaluate(() => {
  state.tab = 'home';
  wireEvents();
  document.getElementById('notif-btn').classList.remove('hidden');
});

const out = {};
const TAB = '.bottom-tab[data-tab="notifs"]';

// ── The entry point exists where a phone user will find it ──
out.tabExists = await page.locator(TAB).count() === 1;
out.tabVisible = await page.locator(TAB).isVisible();
out.tabLabelled = (await page.locator(`${TAB} .bn-label`).textContent()).trim() === 'Alerts';
out.headerBellStillThere = await page.locator('#notif-btn').count() === 1;

// ── Seven tabs still fit on a 390px phone ──
out.navDoesNotOverflow = await page.evaluate(() => {
  const nav = document.querySelector('.bottom-nav');
  return nav.scrollWidth <= nav.clientWidth + 1;
});
out.labelsDoNotWrap = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('.bottom-tab .bn-label')];
  // One line each: a wrapped label would be roughly double height.
  return labels.every((l) => l.getBoundingClientRect().height < 20);
});

// ── The badge lands on both the bell and the tab ──
await page.evaluate(() => refreshNotifBell());
out.bothBadgesCount = await page.evaluate(() => {
  const a = document.getElementById('notif-badge');
  const b = document.getElementById('bn-notif-badge');
  return a.textContent === '2' && b.textContent === '2'
    && !a.classList.contains('hidden') && !b.classList.contains('hidden');
});

// ── Tapping the tab opens the inbox — and it STAYS open ──
// (the tap bubbles to the click-away listener; without a guard the panel
// would close in the same gesture that opened it)
await page.click(TAB);
await page.waitForTimeout(150);
out.tabOpensPanel = await page.evaluate(() =>
  !document.getElementById('notif-panel').classList.contains('hidden'));
out.panelHasRows = await page.locator('#notif-panel .notif-row').count() === 2;

// ── It reads as a surface, not a header dropdown ──
const box = await page.evaluate(() => {
  const p = document.getElementById('notif-panel');
  const cs = getComputedStyle(p);
  const r = p.getBoundingClientRect();
  const navTop = document.querySelector('.bottom-nav').getBoundingClientRect().top;
  return { position: cs.position, width: r.width, bottom: r.bottom, navTop, viewport: window.innerWidth };
});
out.panelIsFixedSheet = box.position === 'fixed';
out.panelUsesTheWidth = box.width > box.viewport * 0.85;
out.panelClearsBottomNav = box.bottom <= box.navTop + 1;
// The load-bearing one. "Not hidden" is not "on screen": the panel used to live
// inside <header>, whose backdrop-filter makes it the containing block for
// fixed children — so it laid out against the header and sat off-screen above
// the fold while every other assertion here still passed.
out.panelIsActuallyOnScreen = await page.evaluate(() => {
  const r = document.getElementById('notif-panel').getBoundingClientRect();
  return r.top >= 0 && r.left >= 0 && r.width > 0 && r.height > 0
    && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
});

// ── Opening = seen, on both badges ──
out.markedSeen = await page.evaluate(() => window.__seen.length === 1 && window.__seen[0].length === 2);
out.bothBadgesCleared = await page.evaluate(() => {
  const a = document.getElementById('notif-badge');
  const b = document.getElementById('bn-notif-badge');
  return a.classList.contains('hidden') && b.classList.contains('hidden');
});

// ── Tapping elsewhere still closes it ──
await page.click('body', { position: { x: 200, y: 120 } });
await page.waitForTimeout(80);
out.clickAwayStillCloses = await page.evaluate(() =>
  document.getElementById('notif-panel').classList.contains('hidden'));

// ── And the header bell still works on its own ──
await page.evaluate(() => document.getElementById('notif-btn').click());
await page.waitForTimeout(120);
out.headerBellStillOpens = await page.evaluate(() =>
  !document.getElementById('notif-panel').classList.contains('hidden'));

// ── Desktop: still a popover anchored under the bell, still on screen ──
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => {
  document.getElementById('notif-panel').classList.add('hidden');
  document.getElementById('notif-btn').click();
});
await page.waitForTimeout(120);
out.desktopAnchoredToBell = await page.evaluate(() => {
  const p = document.getElementById('notif-panel').getBoundingClientRect();
  const b = document.getElementById('notif-btn').getBoundingClientRect();
  return p.top > b.bottom - 1 && p.top < b.bottom + 24     // hangs just under it
    && Math.abs(p.right - b.right) < 40                    // roughly right-aligned
    && p.top >= 0 && p.bottom <= window.innerHeight;       // and on screen
});
out.desktopKeepsPopoverWidth = await page.evaluate(() =>
  Math.abs(document.getElementById('notif-panel').getBoundingClientRect().width - 340) < 2);

console.log(JSON.stringify(out, null, 2));
const checks = [
  ['bottom nav has an Alerts tab', out.tabExists],
  ['…visible on a phone', out.tabVisible],
  ['…labelled "Alerts"', out.tabLabelled],
  ['header bell is still there', out.headerBellStillThere],
  ['seven tabs fit without overflow', out.navDoesNotOverflow],
  ['…and no label wraps', out.labelsDoNotWrap],
  ['unseen count shows on bell AND tab', out.bothBadgesCount],
  ['tapping the tab opens the inbox', out.tabOpensPanel],
  ['…with the notifications in it', out.panelHasRows],
  ['…and it stays open (click-away guard)', out.tabOpensPanel],
  ['panel is a fixed sheet on a phone', out.panelIsFixedSheet],
  ['…using the screen width', out.panelUsesTheWidth],
  ['…sitting above the bottom bar', out.panelClearsBottomNav],
  ['…and genuinely on screen, not just un-hidden', out.panelIsActuallyOnScreen],
  ['opening marks everything seen', out.markedSeen],
  ['…and clears both badges', out.bothBadgesCleared],
  ['tapping away still closes it', out.clickAwayStillCloses],
  ['the header bell still opens it', out.headerBellStillOpens],
  ['desktop: still anchored under the bell, on screen', out.desktopAnchoredToBell],
  ['desktop: still a 340px popover', out.desktopKeepsPopoverWidth],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
