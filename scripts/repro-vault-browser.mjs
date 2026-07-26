// Verify the vault browser renders on another collector's profile against the
// REAL app parts + markup, with a stubbed data layer.
//
// Checks:
//  A) Viewing SOMEONE ELSE → a "Crypt" section renders one tile per visible
//     plush, showing nickname-wins names and a zoomable photo.
//  B) Viewing YOURSELF → no Crypt section (My Crypt is the place for that).
//  C) Empty vault → the section still appears with an empty note (not tiles).
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.data = {
    appSettings: {}, featureEnabled: () => false,
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  const el = document.getElementById('soc-feed') || document.createElement('div');
  el.id = 'soc-feed';
  document.body.appendChild(el);

  const vault = [
    { id: 'p1', name: 'Anxiety Rabbit', nickname: 'Sir Fluffs', photo: 'http://x/1.jpg', catalogId: 'c1' },
    { id: 'p2', name: 'Grief Rabbit', nickname: null, photo: null, catalogId: 'c2' },
  ];
  const profileOther = { id: 'other', username: 'amber', avatarUrl: null, socialLinks: {} };

  // A) someone else's profile, with a vault
  renderProfileInto(el, { profile: profileOther, isMe: false, friendship: 'friends', vault });
  const heads = [...el.querySelectorAll('.soc-section-head')].map((h) => h.textContent.trim());
  const cryptHead = heads.find((h) => h.startsWith('Crypt'));
  const tiles = [...el.querySelectorAll('.soc-vault-tile')];
  const names = tiles.map((t) => t.querySelector('.soc-vault-name')?.textContent);
  const firstZoomable = tiles[0]?.querySelector('.soc-vault-photo')?.getAttribute('data-soc-action');
  const otherResult = {
    hasCryptSection: !!cryptHead,
    countInHead: cryptHead || '',
    tileCount: tiles.length,
    names,
    firstZoomable,
  };

  // B) my own profile — no Crypt section
  renderProfileInto(el, { profile: { id: 'me', username: 'redrambler', socialLinks: {} }, isMe: true, vault });
  const meHasCrypt = [...el.querySelectorAll('.soc-section-head')].some((h) => h.textContent.trim().startsWith('Crypt'));

  // C) empty vault on someone else's profile
  renderProfileInto(el, { profile: profileOther, isMe: false, friendship: 'none', vault: [] });
  const emptyHasSection = [...el.querySelectorAll('.soc-section-head')].some((h) => h.textContent.trim().startsWith('Crypt'));
  const emptyHasTiles = el.querySelectorAll('.soc-vault-tile').length > 0;
  const emptyNote = !!el.querySelector('.soc-section .empty-note');

  return { otherResult, meHasCrypt, emptyHasSection, emptyHasTiles, emptyNote };
});

console.log(JSON.stringify(result, null, 2));

const r = result;
const checks = [
  ['A: Crypt section renders on another profile', r.otherResult.hasCryptSection],
  ['A: count badge (2) in the header', r.otherResult.countInHead.includes('2')],
  ['A: one tile per plush (2)', r.otherResult.tileCount === 2],
  ['A: nickname wins over name', r.otherResult.names[0] === 'Sir Fluffs'],
  ['A: falls back to catalog name when no nickname', r.otherResult.names[1] === 'Grief Rabbit'],
  ['A: photo tile is zoomable', r.otherResult.firstZoomable === 'zoom-top8'],
  ['B: own profile shows NO Crypt section', r.meHasCrypt === false],
  ['C: empty vault still shows the section', r.emptyHasSection === true],
  ['C: empty vault shows no tiles', r.emptyHasTiles === false],
  ['C: empty vault shows an empty note', r.emptyNote === true],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
