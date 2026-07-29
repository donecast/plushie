// @ydkj: "it would be neat if there was a way to preview how your profile looks
// to the public."
//
// The load-bearing property is that the preview is SERVER truth: db/0104's
// visibility_ladder decides what each tier sees, next to the real can_see_item
// rule. So this repro asserts the client asks the RPC per tier and renders
// exactly what came back — never filtering state.collection itself, which would
// be a second source of truth drifting toward "your stuff is more private than
// it is". The ladder's own behaviour is checked in SQL, not here.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  document.getElementById('boot-splash')?.remove();
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.__tierCalls = [];
  window.__fail = false;
  // Stand in for db/0104: return what a server honouring the ladder would.
  const BY_TIER = {
    public: [{ id: 'i1', name: 'Public Plush', visibility: 'public' }],
    friends: [{ id: 'i1', name: 'Public Plush', visibility: 'public' },
              { id: 'i2', name: 'Coven Plush', visibility: 'friends' }],
    inner: [{ id: 'i1', name: 'Public Plush', visibility: 'public' },
            { id: 'i2', name: 'Coven Plush', visibility: 'friends' },
            { id: 'i3', name: 'Castle Plush', visibility: 'inner' }],
    coffin_buddies: [{ id: 'i1', name: 'Public Plush', visibility: 'public' },
                     { id: 'i2', name: 'Coven Plush', visibility: 'friends' },
                     { id: 'i3', name: 'Castle Plush', visibility: 'inner' },
                     { id: 'i4', name: 'Buddy Plush', visibility: 'coffin_buddies' }],
  };
  window.data = {
    appSettings: {}, featureEnabled: () => false, isBlocked: () => false,
    isMyBlock: () => false, isUnblockable: () => false, isGhosted: () => false,
    previewMyProfileAs: async (tier) => {
      window.__tierCalls.push(tier);
      if (window.__fail) throw new Error('rpc exploded');
      return {
        items: (BY_TIER[tier] || []).map((i) => ({ ...i, catalogId: null, quantity: 1, photo: null })),
        posts: tier === 'public' ? [] : [{ id: 'p1', authorId: 'me', authorName: 'redrambler',
          body: 'a friends-only post', createdAt: new Date().toISOString(), reactions: [],
          comments: [], commentCount: 0, mine: true, visibility: 'friends' }],
      };
    },
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const out = await page.evaluate(async () => {
  const o = {};
  try { wireSocialEvents(); } catch (e) { o._wireNote = e.message; }
  window.toast = () => {};
  // Five items owned; four are visible to somebody, one is Only-me.
  state.collection = [
    { id: 'i1', name: 'Public Plush', visibility: 'public' },
    { id: 'i2', name: 'Coven Plush', visibility: 'friends' },
    { id: 'i3', name: 'Castle Plush', visibility: 'inner' },
    { id: 'i4', name: 'Buddy Plush', visibility: 'coffin_buddies' },
    { id: 'i5', name: 'Secret Plush', visibility: 'private' },
  ];
  state._myTop8 = []; state._myRelics = []; state._myPosts = [];
  state._myBio = 'gothic-cute enjoyer';

  // ── The entry point sits on my own profile, next to Edit ──
  const el = document.createElement('div');
  renderProfileInto(el, { profile: { id: 'me', username: 'redrambler' }, isMe: true });
  o.entryPointOnMyProfile = !!el.querySelector('[data-soc-action="preview-profile"]');

  // ── Opens on Public, asks the server for that tier ──
  await openProfilePreview();
  o.askedServerForPublic = JSON.stringify(window.__tierCalls) === JSON.stringify(['public']);
  const card = document.getElementById('social-modal-card');
  o.modalOpen = !document.getElementById('social-modal').classList.contains('hidden');
  o.headlineNamesTier = /Seen as: .*Public/.test(card.querySelector('h2').textContent);
  const vaultNames = () => [...card.querySelectorAll('.soc-preview-body .soc-vault-item-name, .soc-preview-body .vault-name, .soc-preview-body .soc-vault-name')].map((n) => n.textContent.trim());
  o.publicShowsOnlyPublic = card.querySelector('.soc-preview-body').textContent.includes('Public Plush')
    && !card.querySelector('.soc-preview-body').textContent.includes('Coven Plush');
  o.summaryCountsHidden = /1 of your 5 items/.test(card.textContent) && /4[\s\S]{0,20}hidden/.test(card.textContent);

  // ── The visitor's-eye view: no edit or relationship buttons ──
  const body = card.querySelector('.soc-preview-body');
  o.noEditButtons = !body.querySelector('[data-soc-action="edit-profile"]')
    && !body.querySelector('[data-soc-action="edit-top8"]')
    && !body.querySelector('[data-soc-action="preview-profile"]');
  o.noRelationshipButtons = !body.querySelector('[data-soc-action="add-friend"]')
    && !body.querySelector('[data-soc-action="block-user"]')
    && !body.querySelector('[data-soc-action="report-user"]');
  o.showsTheCrypt = /Crypt/.test(body.textContent);   // hidden in the normal isMe view
  o.showsMyBio = body.textContent.includes('gothic-cute enjoyer');

  // ── Switching tier re-asks the server rather than filtering locally ──
  card.querySelector('[data-soc-action="preview-tier"][data-tier="coffin_buddies"]').click();
  await new Promise((r) => setTimeout(r, 60));
  o.askedServerPerTier = JSON.stringify(window.__tierCalls) === JSON.stringify(['public', 'coffin_buddies']);
  const body2 = document.getElementById('social-modal-card').querySelector('.soc-preview-body');
  o.buddySeesMore = ['Public Plush', 'Coven Plush', 'Castle Plush', 'Buddy Plush']
    .every((n) => body2.textContent.includes(n));
  o.buddyStillNotPrivate = !body2.textContent.includes('Secret Plush');
  o.activeChipMoved = document.querySelector('[data-soc-action="preview-tier"][data-tier="coffin_buddies"]').classList.contains('active');
  o.postsFollowTier = body2.textContent.includes('a friends-only post');

  // ── An unknown tier can't widen the preview ──
  window.__tierCalls = [];
  await openProfilePreview('nonsense');
  o.unknownTierFallsBackToPublic = JSON.stringify(window.__tierCalls) === JSON.stringify(['public']);

  // ── If the server can't answer, say so — do NOT draw an empty profile ──
  window.__fail = true;
  await openProfilePreview('friends');
  const failCard = document.getElementById('social-modal-card');
  o.failSaysSo = /Couldn't load the preview/.test(failCard.textContent);
  o.failShowsNoFakeProfile = !failCard.querySelector('.soc-preview-body');
  window.__fail = false;

  return o;
});

console.log(JSON.stringify(out, null, 2));
const checks = [
  ['"Preview as…" sits on my own profile', out.entryPointOnMyProfile],
  ['opens on Public and asks the server', out.askedServerForPublic],
  ['the modal opens', out.modalOpen],
  ['headline names the tier', out.headlineNamesTier],
  ['Public sees only public items', out.publicShowsOnlyPublic],
  ['summary counts what stays hidden', out.summaryCountsHidden],
  ['no edit buttons in a visitor view', out.noEditButtons],
  ['no friend/block/report buttons either', out.noRelationshipButtons],
  ['the Crypt section shows (it is hidden on your own view)', out.showsTheCrypt],
  ['your bio shows as they would see it', out.showsMyBio],
  ['switching tier re-asks the server', out.askedServerPerTier],
  ['a Coffin Buddy sees the wider set', out.buddySeesMore],
  ['…but never your Only-me items', out.buddyStillNotPrivate],
  ['the active chip follows the tier', out.activeChipMoved],
  ['posts follow the tier too', out.postsFollowTier],
  ['an unknown tier falls back to Public', out.unknownTierFallsBackToPublic],
  ['a failed load says so', out.failSaysSo],
  ['…instead of drawing an empty profile', out.failShowsNoFakeProfile],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
