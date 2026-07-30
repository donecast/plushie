// Reproduce + verify the notification deep-link SCROLL race. openPostDeepLink
// scrolls to the target comment, but goToTab('home') runs an async tab-enter
// (await loadSocialData) that finishes LATER and ends with
// requestAnimationFrame(() => window.scrollTo(saved home scroll)) — clobbering
// our scroll so you land at the feed's old position, not the comment.
//
// This harness injects a tall real-markup feed (article.soc-post[data-post-id]
// with a div.soc-comment[data-comment-id] far down), stubs goToTab to fire the
// SAME delayed restore the real tab-enter does, then asserts where you end up.
// Against the buggy code the comment is off-screen; the fix centers it.
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
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false, isMyBlock: () => false };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  // Build a tall feed so scroll position is meaningful. Target comment c1 sits
  // ~4000px down inside post p1.
  const feed = document.getElementById('soc-feed');
  const spacer = (h, label) => `<div style="height:${h}px;background:#eee">${label || ''}</div>`;
  feed.innerHTML =
    spacer(1200, 'top posts') +
    '<article class="soc-post" data-post-id="p1" style="min-height:300px;background:#dde">' +
    spacer(2600, 'post p1 body') +
    '<div class="soc-comment" data-comment-id="c1" style="height:80px;background:#bcd">TARGET COMMENT</div>' +
    '</article>' +
    spacer(3000, 'more posts below');
  document.getElementById('social-view')?.classList.remove('hidden');
  feed.classList.remove('hidden');
  // In the real app the feed repaints from real data (nodes persist). Here the
  // stubbed socFeed is empty, so neutralize the repaint to keep our injected
  // nodes — the scroll race is about scroll, not render.
  window.rerenderSocialCurrent = () => {};
  window.renderSocial = () => {};

  // Faithful stand-in for the real header tab-enter tail: it awaits
  // loadSocialData (async), THEN restores the saved home scroll on the next
  // frame. We reproduce the DELAY (post-async) that makes it clobber our scroll.
  const SAVED_HOME_SCROLL = 200;   // where home was last scrolled — the "wrong place"
  window.goToTab = (tab) => {
    if (tab !== 'home') return true;
    setTimeout(() => {   // ~ async loadSocialData finishing
      requestAnimationFrame(() => {
        // Mirror the real home tab-enter guard: a pending deep-link owns scroll.
        if (state.tab === 'home' && state._pendingDeepLink) return;
        window.scrollTo({ top: SAVED_HOME_SCROLL, behavior: 'instant' });
      });
    }, 250);
    return true;
  };
  state.tab = 'home';

  window.scrollTo({ top: 0, behavior: 'instant' });
  openPostDeepLink('p1', 'c1');

  // Wait past the delayed restore AND the pump's ~2s hold, so we also confirm
  // it releases the deep-link and leaves the comment centered (not yanked back).
  await new Promise((r) => setTimeout(r, 3900));

  const c1 = document.querySelector('[data-comment-id="c1"]');
  const rect = c1.getBoundingClientRect();
  const viewportCenter = window.innerHeight / 2;
  const distanceFromCenter = Math.round(Math.abs((rect.top + rect.height / 2) - viewportCenter));
  return {
    scrollY: Math.round(window.scrollY),
    commentTopInViewport: Math.round(rect.top),
    distanceFromCenter,
    commentCentered: distanceFromCenter < 120,       // roughly centered
    commentOnScreen: rect.top >= 0 && rect.top < window.innerHeight,
    flashed: c1.classList.contains('notif-flash'),
    pendingCleared: !state._pendingDeepLink,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
