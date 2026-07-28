// Verify the 🔔 notification inbox against the real markup + app parts, now
// with the Facebook-style upgrade: rich rows (actor avatar + excerpt), and
// deep-link navigation (a content row jumps to + highlights the exact post).
// Covers: badge count, panel contents, excerpt/avatar rendering, unseen
// highlight, mark-seen on open, click-away close, tag→tab routing for
// non-content rows, deep-link dispatch for content rows, hash parsing, and
// the scroll+flash seek against a real post node.
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
    // The bell resolves actor avatars through this batch helper.
    _resolveProfiles: async (ids) => new Map(ids.map((id) => [id, { id, username: id, avatarUrl: `http://x/${id}.png` }])),
    listRecentNotifications: async () => [
      // Content event: has actor + post/comment + excerpt → deep-links.
      { id: 'n1', title: '🦇', body: '@wifeosaurus commented on your post 🦇', url: './#post-p1_c_c1', tag: 'comment-p1',
        actor_id: 'wifeosaurus', kind: 'comment', post_id: 'p1', comment_id: 'c1', excerpt: 'so cute I could cry 🥺',
        created_at: new Date(Date.now() - 2 * HOUR).toISOString(), seen_at: null },
      // Non-content event: routes to a tab by tag, no excerpt.
      { id: 'n2', title: '🦇', body: 'Your trade with @redrambler shipped', url: './', tag: 'trade-9',
        actor_id: null, kind: null, post_id: null, comment_id: null, excerpt: null,
        created_at: new Date(Date.now() - 5 * HOUR).toISOString(), seen_at: null },
      { id: 'n3', title: '🦇', body: '@someone reacted 🖤 to your comment 🦇', url: './#post-p2', tag: 'comment-p2',
        actor_id: 'someone', kind: 'reaction', post_id: 'p2', comment_id: null, excerpt: null,
        created_at: new Date(Date.now() - 30 * HOUR).toISOString(), seen_at: new Date().toISOString() },
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
    firstRowText: rows[0]?.querySelector('.notif-row-body')?.textContent?.trim(),
    firstRowExcerpt: rows[0]?.querySelector('.notif-row-excerpt')?.textContent?.trim(),
    firstRowHasAvatar: !!rows[0]?.querySelector('.notif-avatar'),
    firstRowAvatarSrc: rows[0]?.querySelector('.notif-avatar img')?.getAttribute('src'),
    secondRowHasExcerpt: !!rows[1]?.querySelector('.notif-row-excerpt'),
    badgeHiddenAfterOpen: badge.classList.contains('hidden'),
    markSeenCalledWith: window.__seenCalls,
  };

  // Spy on the deep-link + tab dispatchers.
  let deepLinkCall = null, routedTab = null;
  const origOpen = window.openPostDeepLink, origGoTo = window.goToTab;
  window.openPostDeepLink = (p, c) => { deepLinkCall = { p, c }; };
  window.goToTab = (t) => { routedTab = t; return true; };

  // Content row (comment) → deep-links to its post+comment.
  rows[0].click();
  await new Promise((r) => setTimeout(r, 30));
  const afterContentClick = { deepLinkCall, panelClosed: panel.classList.contains('hidden') };

  // Non-content row (trade) → routes to the Trade tab, no deep-link.
  deepLinkCall = null; routedTab = null;
  document.getElementById('notif-btn').click();               // reopen
  await new Promise((r) => setTimeout(r, 60));
  [...panel.querySelectorAll('.notif-row')][1].click();
  await new Promise((r) => setTimeout(r, 30));
  const afterTradeClick = { routedTab, deepLinkCall };

  // Hash parsing + handleNotificationHash dispatch.
  const parsed = {
    comment: parseNotifDeepLink('#post-p1_c_c1'),
    postOnly: parseNotifDeepLink('#post-p2'),
    plainTab: parseNotifDeepLink('#trade'),
  };
  deepLinkCall = null;
  location.hash = '#post-abc_c_def';
  handleNotificationHash();
  const afterHash = { deepLinkCall, hashCleared: location.hash === '' };

  window.openPostDeepLink = origOpen; window.goToTab = origGoTo;

  // Real seek+flash: inject a post + comment node into the feed, stub the
  // navigation so it survives, and confirm the exact comment gets flashed
  // and scrolled into view.
  let scrolledEl = null;
  const feed = document.getElementById('soc-feed');
  feed.innerHTML = '<article class="soc-post" data-post-id="p1">'
    + '<div class="soc-comment" data-comment-id="c1">target</div></article>';
  const target = feed.querySelector('[data-comment-id="c1"]');
  target.scrollIntoView = () => { scrolledEl = 'c1'; };
  const gt = window.goToTab, rr = window.rerenderSocialCurrent;
  window.goToTab = () => true; window.rerenderSocialCurrent = () => {};
  openPostDeepLink('p1', 'c1');
  await new Promise((r) => setTimeout(r, 120));
  const seek = { scrolledEl, flashed: target.classList.contains('notif-flash'), expandedHasP1: state.socExpandedComments.has('p1') };
  window.goToTab = gt; window.rerenderSocialCurrent = rr;

  // Click-away closes.
  document.getElementById('notif-btn').click();
  await new Promise((r) => setTimeout(r, 40));
  document.body.click();
  await new Promise((r) => setTimeout(r, 40));
  const clickAwayClosed = panel.classList.contains('hidden');

  return { badgeAfterBoot, opened, afterContentClick, afterTradeClick, parsed, afterHash, seek, clickAwayClosed };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
