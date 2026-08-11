// Scott: "Top 8 buns not saving. I tried to adjust mine and it unchecked Tom
// and gave me nothing."
//
// Root cause: openTop8Picker seeded "my current Top 8" from
// state.socProfile?.top8 || state._myTop8. socProfile survives switching from
// Home (where you just viewed a FRIEND's profile) to My Crypt, so the picker
// opened showing the friend's lineup: Tom's keep-box unchecked, none of your
// picks preselected — and Save then wrote that emptiness over your real Top 8.
// An empty/failed _myTop8 cache wiped it the same way.
//
// The property this repro pins down: the picker's starting lineup comes from
// the SERVER (data.getTopPlushes for MY id), never from whatever profile
// happens to be lingering in state — and if that load fails, the picker
// refuses to open rather than offering a Save that would wipe the lineup.
// Bonus: re-saving keeps the saved order instead of scrambling it into
// collection-grid order.
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
await page.evaluate(() => {
  document.getElementById('boot-splash')?.remove();
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.__setCalls = [];
  window.__toasts = [];
  window.__failLoad = false;
  // My REAL saved Top 8 as the server holds it: Bun B first, then Bun A, then
  // Tom riding along. (Grid/collection order is A, B, C — deliberately
  // different from the saved order so order-scrambling shows up.)
  const SERVER_TOP8 = [
    { position: 1, plushName: 'Bun B', catalogId: 'c2', photoPath: null, photoUrl: null },
    { position: 2, plushName: 'Bun A', catalogId: 'c1', photoPath: null, photoUrl: null },
    { position: 3, plushName: 'Tom', catalogId: 'd3adc0de-0000-4000-8000-000000000001', photoPath: '/tom.jpg', photoUrl: '/tom.jpg' },
  ];
  window.data = {
    appSettings: {}, featureEnabled: () => false, track: () => {},
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false, isGhosted: () => false,
    TOM_TOP: { plushName: 'Tom', catalogId: 'd3adc0de-0000-4000-8000-000000000001', photoPath: '/tom.jpg' },
    getTopPlushes: async (uid) => {
      if (window.__failLoad) throw new Error('network sadness');
      return uid === 'me' ? SERVER_TOP8.map((t) => ({ ...t })) : [];
    },
    setTopPlushes: async (entries, opts) => { window.__setCalls.push({ entries, opts }); },
    getSocialProfile: async (uid) => ({ id: uid, username: uid === 'me' ? 'scott' : 'pal', bio: '', socialLinks: {}, avatarUrl: null, displayName: null, defaultItemVisibility: 'inner' }),
    listUserPosts: async () => [],
    listRelics: async () => [],
    friendshipWith: async () => 'none',
    getUserVault: async () => [],
    listMyGifts: async () => [],
    socialPhotoUrl: async () => null,
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const out = await page.evaluate(async () => {
  const o = {};
  try { wireSocialEvents(); } catch (e) { o._wireNote = e.message; }
  window.toast = (m) => window.__toasts.push(m);
  const settle = () => new Promise((r) => setTimeout(r, 80));

  state.catalog = [
    { id: 'c1', name: 'Bun A', type: 'plush', image: null },
    { id: 'c2', name: 'Bun B', type: 'plush', image: null },
    { id: 'c3', name: 'Bun C', type: 'plush', image: null },
  ];
  state.collection = [
    { id: 'i1', name: 'Bun A', catalogId: 'c1' },
    { id: 'i2', name: 'Bun B', catalogId: 'c2' },
    { id: 'i3', name: 'Bun C', catalogId: 'c3' },
  ];

  // The trap: I viewed a friend's (Tom-less) profile on Home, then came to My
  // Crypt. socProfile is still THEIR data; my own cache is empty (say, a failed
  // refresh). The picker must ignore both and ask the server for MY lineup.
  state.socProfile = { profile: { id: 'friend', username: 'pal' }, isMe: false, top8: [{ position: 1, plushName: 'Their Own Bun', catalogId: 'zz' }], posts: [], relics: [] };
  state._myTop8 = [];

  await openTop8Picker();
  await settle();
  const card = document.getElementById('social-modal-card');
  const pickedNames = () => [...card.querySelectorAll('.soc-pick.picked')].map((b) => b.dataset.name);
  const rankOf = (name) => [...card.querySelectorAll('.soc-pick')].find((b) => b.dataset.name === name)?.querySelector('.soc-pick-rank')?.textContent;

  o.tomStaysChecked = !!document.getElementById('soc-keep-tom')?.checked;
  o.myPicksPreselected = pickedNames().includes('Bun A') && pickedNames().includes('Bun B');
  o.friendsBunsAbsent = ![...card.querySelectorAll('.soc-pick')].some((b) => b.dataset.name === 'Their Own Bun');
  o.savedOrderKept = rankOf('Bun B') === '#1' && rankOf('Bun A') === '#2';

  // Add Bun C — a new pick appends after the saved ones.
  [...card.querySelectorAll('.soc-pick')].find((b) => b.dataset.name === 'Bun C').click();
  await settle();
  o.newPickAppends = rankOf('Bun C') === '#3';

  // Save. The server must receive my adjusted lineup in order, Tom kept.
  card.querySelector('[data-soc-action="save-top8"]').click();
  await settle();
  const call = window.__setCalls[0];
  o.saveSentAdjustedLineup = !!call && JSON.stringify(call.entries.map((e) => e.plushName)) === JSON.stringify(['Bun B', 'Bun A', 'Bun C']);
  o.saveKeepsTom = !!call && call.opts?.keepTom === true;

  // ── If the current lineup can't be loaded, the picker must refuse to open —
  // an empty picker with a live Save button is a wipe waiting to happen.
  closeSocialModal();
  window.__setCalls = []; window.__toasts = []; window.__failLoad = true;
  await openTop8Picker();
  await settle();
  o.failRefusesToOpen = document.getElementById('social-modal').classList.contains('hidden')
    || !document.getElementById('social-modal-card').querySelector('[data-soc-action="save-top8"]');
  o.failSaysSo = window.__toasts.length > 0;
  o.failNeverSaves = window.__setCalls.length === 0;
  window.__failLoad = false;

  return o;
});

console.log(JSON.stringify(out, null, 2));
const checks = [
  ['Tom stays checked (my lineup, not the stale profile\'s)', out.tomStaysChecked],
  ['my saved picks come preselected', out.myPicksPreselected],
  ['the lingering friend profile leaks nothing into the grid', out.friendsBunsAbsent],
  ['re-opening keeps my saved order, not collection order', out.savedOrderKept],
  ['a new pick appends after the saved ones', out.newPickAppends],
  ['Save sends the adjusted lineup in order', out.saveSentAdjustedLineup],
  ['…with Tom kept', out.saveKeepsTom],
  ['a failed lineup load refuses to open the picker', out.failRefusesToOpen],
  ['…and says so', out.failSaysSo],
  ['…and never reaches the server with a wipe', out.failNeverSaves],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
