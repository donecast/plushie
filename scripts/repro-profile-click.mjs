// Repro: does tapping a name/avatar in a feed post visibly open the profile?
// Loads the REAL index.html markup + the real app-*.js parts in a real
// Chrome, stubbing only the auth gate and the `data` layer. Then renders a
// tall fake feed, scrolls mid-feed, clicks a post author, and reports what
// the user would actually see (state + scroll position + what's in view).
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

// Tiny static server so relative fetches (styles.css etc.) resolve.
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  if (rel === '' || rel === 'shell') {
    // Real markup, scripts stripped — the test injects its own stack.
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
    return;
  }
  const p = path.join(ROOT, rel);
  try {
    const body = fs.readFileSync(p);
    const type = p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });

// Stubs the app parts expect at load/boot time.
await page.evaluate(() => {
  const me = { id: 'me', username: 'scott', isAdmin: false };
  const other = { id: 'u2', username: 'wifeosaurus' };
  window.currentUser = me;
  window.runAuthGate = async () => {};       // never boots — we drive manually
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  const posts = Array.from({ length: 8 }, (_, i) => ({
    id: 'p' + i, authorId: other.id, authorName: other.username, authorAvatar: null,
    body: `Post number ${i} — lorem gothic ipsum, a long enough body to take vertical space in the feed so the page scrolls.`,
    visibility: 'public', createdAt: new Date(Date.now() - i * 3600e3).toISOString(),
    reactions: [], comments: [], mine: false,
  }));
  window.__posts = posts;
  window.data = {
    appSettings: {}, collectionId: 'c1',
    featureEnabled: () => false,
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
    getSocialProfile: async (uid) => ({ id: uid, username: 'wifeosaurus', bio: 'hi', avatarUrl: null, socialLinks: {}, displayName: null }),
    listUserPosts: async () => posts.slice(0, 3),
    getTopPlushes: async () => [],
    friendshipWith: async () => 'friends',
    listRelics: async () => [],
    socialPhotoUrl: async () => null,
    listMessageThreads: async () => [],
  };
});

// Load the real app parts (skip config/auth/db/data — stubbed above).
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  // Minimal manual boot: home tab + the fake feed, real wiring.
  state.tab = 'home';
  state.socFeed = window.__posts;
  state.ready.add('social');
  state.ready.add('collection');
  wireSocialEvents();
  document.getElementById('social-view').classList.remove('hidden');
  renderSocial();

  // Scroll partway down the feed, like a user browsing.
  window.scrollTo(0, 1200);
  await new Promise((r) => setTimeout(r, 50));
  const scrollBefore = window.scrollY;

  // Tap the author name on the 4th post.
  const link = document.querySelectorAll('.soc-post .soc-userlink')[3];
  link.click();
  await new Promise((r) => setTimeout(r, 300));

  const profileHead = document.querySelector('.soc-profile-head, .soc-profile');
  const backBtn = document.querySelector('[data-soc-action="close-profile"]');
  const headRect = (backBtn || profileHead)?.getBoundingClientRect?.() || null;
  const opened = {
    scrollBefore,
    scrollAfter: window.scrollY,
    profileOpened: !!state.socProfile,
    profileDomPresent: !!(profileHead || backBtn),
    profileHeaderInViewport: headRect ? headRect.top >= 0 && headRect.top < window.innerHeight : null,
  };

  // ← Back to feed: should restore the pre-tap scroll position.
  backBtn?.click();
  await new Promise((r) => setTimeout(r, 100));
  return {
    ...opened,
    backToFeed: !state.socProfile,
    feedScrollRestored: Math.abs(window.scrollY - scrollBefore) < 5,
    scrollAfterBack: window.scrollY,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();
