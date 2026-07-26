// Verify the "second uniquely-named copy" behavior in the REAL addFromCatalog
// (app-ui.js), booted with the real app parts and a stubbed data layer.
//
// Rules under test:
//  A) Interactive "Have" (customize:true) on a catalog item you own where a
//     copy is NICKNAMED → adds a fresh separate record + opens the naming modal.
//  B) Interactive "Have" where NO copy is nicknamed → bumps quantity (1 row).
//  C) Bulk / non-interactive (customize:false) → always bumps quantity, even
//     when a copy is nicknamed (bundle picker / admin must never pop modals).
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
  window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  // ── Stub the data layer with an in-memory collection store keyed by id ──
  const store = new Map();
  window.data.put = async (kind, rec) => { store.set(rec.id, { ...rec }); };
  window.loadAll = async () => { state.collection = [...store.values()]; };
  window.render = () => {};
  const toasts = [];
  window.toast = (m) => toasts.push(m);
  let modalOpens = 0;
  window.openModal = () => { modalOpens++; };
  window.hideEl = () => {};

  state.collection = [];
  state.catalog = [
    { id: 'c1', name: 'Anxiety Rabbit', handle: 'anxiety', image: null, available: true },
    { id: 'c2', name: 'Grief Rabbit',   handle: 'grief',   image: null, available: true },
    { id: 'c3', name: 'Bundle Bun',     handle: 'bundle',  image: null, available: true },
  ];

  const owned = (cid) => state.collection.filter((x) => x.catalogId === cid);
  const snap = () => owned('c1').map((x) => ({ nickname: x.nickname ?? null, qty: x.quantity || 1 }));

  // ── A) named copy → second interactive Have makes a NEW record ──
  await addFromCatalog('c1', 'collection', { customize: true });   // copy #1
  const afterFirst = { rows: owned('c1').length, modalOpens };
  // simulate the user naming copy #1 in the modal
  owned('c1')[0].nickname = 'Sir Fluffs';
  store.set(owned('c1')[0].id, owned('c1')[0]);
  await addFromCatalog('c1', 'collection', { customize: true });   // copy #2 (should be a new row)
  const afterNamedSecond = { rows: owned('c1').length, modalOpens, c1: snap() };

  // ── B) unnamed → interactive Have bumps quantity (1 row) ──
  modalOpens = 0;
  await addFromCatalog('c2', 'collection', { customize: true });   // copy #1 (unnamed)
  await addFromCatalog('c2', 'collection', { customize: true });   // should bump qty, no new row
  const unnamed = { rows: owned('c2').length, qty: (owned('c2')[0]?.quantity || 1), modalOpensOnBump: modalOpens - 1 };

  // ── C) bulk (customize:false) never splits, even when a copy is named ──
  await addFromCatalog('c3', 'collection');                        // copy #1
  owned('c3')[0].nickname = 'Named Bundle';                        // name it
  store.set(owned('c3')[0].id, owned('c3')[0]);
  await addFromCatalog('c3', 'collection');                        // bulk add — must bump qty, not split
  const bulk = { rows: owned('c3').length, qty: (owned('c3')[0]?.quantity || 1) };

  return { afterFirst, afterNamedSecond, unnamed, bulk, toasts };
});

console.log(JSON.stringify(result, null, 2));

// ── Assertions ──
const a = result;
const checks = [
  ['A: first Have creates 1 row + opens modal', a.afterFirst.rows === 1 && a.afterFirst.modalOpens === 1],
  ['A: second Have on NAMED copy makes 2 rows', a.afterNamedSecond.rows === 2],
  ['A: naming modal opened again for copy #2', a.afterNamedSecond.modalOpens === 2],
  ['A: both c1 rows are quantity 1 (not a bump)', a.afterNamedSecond.c1.every((r) => r.qty === 1)],
  ['B: unnamed second Have stays 1 row', a.unnamed.rows === 1],
  ['B: unnamed second Have bumps qty to 2', a.unnamed.qty === 2],
  ['B: quantity bump opens no modal', a.unnamed.modalOpensOnBump === 0],
  ['C: bulk add of a NAMED item stays 1 row', a.bulk.rows === 1],
  ['C: bulk add bumps qty to 2', a.bulk.qty === 2],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
