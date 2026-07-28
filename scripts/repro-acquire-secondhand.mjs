// Verify the "How acquired" split — Direct Purchase → Bought from Manufacturer
// / Purchased Secondhand — plus the legacy-value guard, against the REAL app
// parts + markup with a stubbed data layer.
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
  window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  const out = {};
  const sel = document.getElementById('f-acquired');
  const labels = () => [...sel.options].map((o) => o.textContent);
  const values = () => [...sel.options].map((o) => o.value);

  // ── The option list itself ──
  out.hasManufacturer = values().includes('Bought from Manufacturer');
  out.hasSecondhand = values().includes('Purchased Secondhand');
  out.noDirectPurchase = !values().includes('Direct Purchase');
  out.keepsOtherOptions = ['Mystery Bag', 'Oddful', 'Contest', 'Giveaway', 'Trade', 'Gift', 'Gift/Oddful']
    .every((v) => values().includes(v));

  state.catalog = [];
  const mk = (acquiredHow) => ({
    id: 'p1', name: 'Blue Plaid Love Rabbit', catalogId: null, quantity: 1,
    acquiredHow, missingAccessories: [], damagedAccessories: [], visibility: 'friends',
  });

  // ── A new-vocabulary value selects normally ──
  const fresh = mk('Purchased Secondhand');
  state.collection = [fresh];
  openModal('collection', fresh);
  out.secondhandSelected = sel.value === 'Purchased Secondhand';
  out.noLegacyOptionAdded = !sel.querySelector('option[data-legacy]');
  out.oddfulHiddenForSecondhand = document.getElementById('field-oddful').classList.contains('hidden');
  closeModal();

  // ── A legacy value survives the round-trip instead of blanking ──
  const legacy = mk('Direct Purchase');
  state.collection = [legacy];
  openModal('collection', legacy);
  // This is what submitForm reads back on save.
  out.legacyValueKept = sel.value === 'Direct Purchase';
  out.legacyOptionLabelled = labels().includes('Direct Purchase (old option)');
  out.legacyOptionMarked = sel.querySelectorAll('option[data-legacy]').length === 1;
  closeModal();
  out.legacyOptionDroppedOnClose = !sel.querySelector('option[data-legacy]');

  // ── Reopening on a known value doesn't accumulate legacy options ──
  openModal('collection', legacy);
  openModal('collection', legacy);
  out.legacyOptionNotDuplicated = sel.querySelectorAll('option[data-legacy]').length === 1;
  openModal('collection', fresh);
  out.legacyClearedForKnownValue = !sel.querySelector('option[data-legacy]');

  // ── An item with no acquired-how still lands on "Select…" ──
  const blank = mk(null);
  openModal('collection', blank);
  out.blankSelectsPlaceholder = sel.value === '';

  return out;
});

console.log(JSON.stringify(result, null, 2));
const checks = [
  ['"Bought from Manufacturer" option exists', result.hasManufacturer],
  ['"Purchased Secondhand" option exists', result.hasSecondhand],
  ['"Direct Purchase" no longer offered', result.noDirectPurchase],
  ['other acquire options untouched', result.keepsOtherOptions],
  ['Purchased Secondhand selects on open', result.secondhandSelected],
  ['no legacy option for a known value', result.noLegacyOptionAdded],
  ['oddful field hidden for Purchased Secondhand', result.oddfulHiddenForSecondhand],
  ['legacy "Direct Purchase" survives an edit', result.legacyValueKept],
  ['legacy option is labelled "(old option)"', result.legacyOptionLabelled],
  ['legacy option is marked data-legacy', result.legacyOptionMarked],
  ['legacy option dropped when the modal closes', result.legacyOptionDroppedOnClose],
  ['legacy option not duplicated on reopen', result.legacyOptionNotDuplicated],
  ['legacy option cleared for a known value', result.legacyClearedForKnownValue],
  ['no acquired-how shows the placeholder', result.blankSelectsPlaceholder],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
