// @nini: "Is there way to display duplicate in the collection? I can't seem to
// find how to add two of the same item in my collection."
//
// Both ways of owning two already worked — a quantity on one row, or separate
// nicknamed rows — but neither was labelled, and "Duplicates only" silently
// ignored the nicknamed kind. This drives the real markup + app parts to prove
// the affordances now say what they do, and that the filter counts both kinds.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window._puts = [];
  window.data = {
    appSettings: {}, featureEnabled: () => false, isBlocked: () => false,
    put: async (kind, record) => { window._puts.push({ kind, record: { ...record } }); },
    setItemVisibility: async () => {}, setPresent: async () => {},
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  const out = {};
  try { wireEvents(); } catch (e) { out._wireEventsNote = e.message; }
  window.loadAll = async () => {};
  const toasts = []; window.toast = (m) => toasts.push(m);

  const catItem = (id, name) => ({
    id, handle: `h-${id}`, name, type: 'Plush', status: 'available',
    price: null, images: [], tags: [], accessories: [],
  });
  state.catalog = [catItem('c-rabbit', 'Blue Plaid Love Rabbit'), catItem('c-axolotl', 'Anxiety Axolotl')];

  const colItem = (o) => ({
    id: o.id, name: o.name, catalogId: o.cid ?? null, quantity: o.qty ?? 1,
    nickname: o.nick ?? null, acquiredHow: null, dateCollected: null,
    missingAccessories: [], damagedAccessories: [], visibility: 'friends',
    addedAt: Date.now(),
  });
  state.collection = [
    // Two nicknamed rows of the SAME catalog item — a duplicate, quantity 1 each.
    colItem({ id: 'r1', name: 'Blue Plaid Love Rabbit', cid: 'c-rabbit', nick: 'Bun' }),
    colItem({ id: 'r2', name: 'Blue Plaid Love Rabbit', cid: 'c-rabbit', nick: 'Other Bun' }),
    // One row that simply counts 3 — also a duplicate.
    colItem({ id: 'ax', name: 'Anxiety Axolotl', cid: 'c-axolotl', qty: 3 }),
    // A single, and a custom off-catalog row (can't be matched up at all).
    colItem({ id: 'solo', name: 'Doomed Duck', cid: 'c-duck' }),
    colItem({ id: 'cust', name: 'Hand-knit cardigan' }),
  ];

  // ── The catalog affordance: same button, honest label ──
  const owned = new Map([['c-rabbit', 1], ['c-axolotl', 1]]);
  const ownedHtml = renderCatalogCard(state.catalog[0], owned, new Map());
  const freshHtml = renderCatalogCard(catItem('c-new', 'Something New'), new Map(), new Map());
  out.ownedSaysAddAnother = ownedHtml.includes('＋ Add another');
  out.ownedKeepsSameAction = /data-action="cat-have" data-cid="c-rabbit"/.test(ownedHtml);
  out.unownedStillSaysHave = freshHtml.includes('🖤 Have') && !freshHtml.includes('Add another');
  out.ownedButtonExplains = /Record another copy/.test(ownedHtml);

  // ── The card stepper says what the + is for ──
  const cardHtml = cardActionsHtml(state.collection[2], 'collection');
  out.stepperLabelled = /Another copy of this plush/.test(cardHtml);
  out.stepperTitleExplains = /tap \+ for another copy/.test(cardHtml);

  // ── "Duplicates only" counts BOTH kinds of duplicate ──
  out.namedCopiesAreDupes = ownsMoreThanOne(state.collection[0]) && ownsMoreThanOne(state.collection[1]);
  out.quantityIsADupe = ownsMoreThanOne(state.collection[2]);
  out.singleIsNot = !ownsMoreThanOne(state.collection[3]);
  out.customIsNot = !ownsMoreThanOne(state.collection[4]);
  state.tab = 'crypt'; state.colSubTab = 'plushes'; state.colDupes = true;
  const shown = filteredCollection().map((i) => i.id).sort();
  out.filterShowsBoth = JSON.stringify(shown) === JSON.stringify(['ax', 'r1', 'r2']);
  state.colDupes = false;

  // ── The edit modal now carries the count ──
  openModal('collection', state.collection[2]);
  out.modalHasQty = !!document.getElementById('f-qty');
  out.modalQtyPopulated = document.getElementById('f-qty').value === '3';
  out.modalQtyExplains = /Own two of the same plush/.test(document.getElementById('field-qty').textContent);

  // Saving a new count persists it…
  document.getElementById('f-qty').value = '5';
  await submitForm(new Event('submit'));
  out.savedNewQty = window._puts.at(-1)?.record.quantity === 5;

  // …a blank box must not wipe the count…
  openModal('collection', state.collection[2]);
  document.getElementById('f-qty').value = '';
  await submitForm(new Event('submit'));
  out.blankKeepsExisting = window._puts.at(-1)?.record.quantity === 3;

  // …and nonsense is clamped, never saved as 0.
  openModal('collection', state.collection[2]);
  document.getElementById('f-qty').value = '0';
  await submitForm(new Event('submit'));
  out.zeroClampedToOne = window._puts.at(-1)?.record.quantity === 1;
  openModal('collection', state.collection[2]);
  document.getElementById('f-qty').value = '9999';
  await submitForm(new Event('submit'));
  out.hugeClamped = window._puts.at(-1)?.record.quantity === 99;
  closeModal();

  out._toasts = toasts;
  return out;
});

console.log(JSON.stringify(result, null, 2));
const checks = [
  ['owned catalog card says "＋ Add another"', result.ownedSaysAddAnother],
  ['…wired to the same action as before', result.ownedKeepsSameAction],
  ['…and explains what it will do', result.ownedButtonExplains],
  ['unowned card still says "🖤 Have"', result.unownedStillSaysHave],
  ['card stepper + is labelled "another copy"', result.stepperLabelled],
  ['stepper tooltip explains duplicates', result.stepperTitleExplains],
  ['nicknamed copies count as duplicates', result.namedCopiesAreDupes],
  ['a quantity > 1 counts as a duplicate', result.quantityIsADupe],
  ['a single does not', result.singleIsNot],
  ['an off-catalog row does not', result.customIsNot],
  ['"Duplicates only" shows both kinds', result.filterShowsBoth],
  ['edit modal has a quantity field', result.modalHasQty],
  ['…populated from the item', result.modalQtyPopulated],
  ['…with a hint about naming copies apart', result.modalQtyExplains],
  ['saving a new count persists it', result.savedNewQty],
  ['a blank box keeps the old count', result.blankKeepsExisting],
  ['0 is clamped to 1', result.zeroClampedToOne],
  ['an absurd number is clamped to 99', result.hugeClamped],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
