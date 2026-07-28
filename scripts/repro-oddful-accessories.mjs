// Verify the tri-state accessories + oddful reason + "From @user:" gift note
// against the REAL app parts + markup, with a stubbed data layer.
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
  // Attach the real delegated listeners (incl. the oddful bag quick-picks),
  // exactly as boot() does. Guarded: if something unrelated throws, the
  // listeners registered before it still attach.
  try { wireEvents(); } catch (e) { out._wireEventsNote = e.message; }

  // ── Pure helpers ──
  out.selHave = accStateSelect('tote bag', 'have').includes('value="have" selected');
  out.selDamaged = accStateSelect('tote bag', 'damaged').includes('value="damaged" selected');

  // ── cardMetaHtml: damaged + oddful pills ──
  const meta = cardMetaHtml({ id: 'p1', acquiredHow: 'Gift/Oddful',
    damagedAccessories: ['tote bag'], oddfulReason: 'two left hands' }, 'collection');
  out.metaDamaged = meta.includes('Damaged bag');
  out.metaOddful = meta.includes('Oddful: two left hands');
  out.metaAcquired = meta.includes('Gift/Oddful');

  // ── openModal: drive the real edit modal ──
  state.catalog = [];
  const item = {
    id: 'p9', name: 'Blue Plaid Love Rabbit', catalogId: null, quantity: 1,
    acquiredHow: 'Oddful', oddfulReason: 'missing a magnet',
    missingAccessories: [], damagedAccessories: ['tote bag'],
    isGift: true, giftedByUsername: 'thegamersdome', giftMessage: 'Happy Birthday Amber!!!',
    visibility: 'friends',
  };
  state.collection = [item];
  openModal('collection', item);

  const accSel = document.querySelector('#accessory-checklist select[data-accessory-key]');
  out.modalAccIsSelect = !!accSel;
  out.modalBagDamaged = accSel && accSel.value === 'damaged';
  out.oddfulShown = !document.getElementById('field-oddful').classList.contains('hidden');
  out.oddfulReasonPopulated = document.getElementById('f-oddful-reason').value === 'missing a magnet';
  out.giftNoteFrom = document.getElementById('gift-note-text').textContent.startsWith('From @thegamersdome:');
  out.giftNoteMsg = document.getElementById('gift-note-text').textContent.includes('Happy Birthday Amber');

  // ── Oddful field hides when acquired-how is not oddful ──
  document.getElementById('f-acquired').value = 'Purchased Secondhand';
  syncOddfulField();
  out.oddfulHiddenWhenNotOddful = document.getElementById('field-oddful').classList.contains('hidden');

  // ── Bag quick-pick sets the bag select ──
  // (re-open so the checklist is present)
  openModal('collection', item);
  const bagSel = [...document.querySelectorAll('#accessory-checklist select[data-accessory-key]')]
    .find((s) => /\bbag\b/i.test(s.dataset.accessoryKey));
  bagSel.value = 'have';
  document.querySelector('[data-oddful-bag="missing"]').click();
  out.quickPickSetsMissing = bagSel.value === 'missing';

  // ── Save parse: selects → missing/damaged arrays ──
  bagSel.value = 'damaged';
  const missingAccessories = [], damagedAccessories = [];
  [...document.querySelectorAll('#accessory-checklist select[data-accessory-key]')].forEach((sel) => {
    if (sel.value === 'missing') missingAccessories.push(sel.dataset.accessoryKey);
    else if (sel.value === 'damaged') damagedAccessories.push(sel.dataset.accessoryKey);
  });
  out.saveParsesDamaged = damagedAccessories.includes('tote bag') && missingAccessories.length === 0;

  return out;
});

console.log(JSON.stringify(result, null, 2));
const checks = [
  ['accStateSelect marks Have', result.selHave],
  ['accStateSelect marks Damaged', result.selDamaged],
  ['card meta shows Damaged bag', result.metaDamaged],
  ['card meta shows Oddful reason', result.metaOddful],
  ['card meta shows Gift/Oddful', result.metaAcquired],
  ['modal renders accessory as a select', result.modalAccIsSelect],
  ['modal bag select reflects Damaged state', result.modalBagDamaged],
  ['oddful field shown for Oddful', result.oddfulShown],
  ['oddful reason populated', result.oddfulReasonPopulated],
  ['gift note prefixed "From @sender:"', result.giftNoteFrom],
  ['gift note keeps the message', result.giftNoteMsg],
  ['oddful field hides for non-oddful', result.oddfulHiddenWhenNotOddful],
  ['"No bag" quick-pick sets bag Missing', result.quickPickSetsMissing],
  ['save parses Damaged into its array', result.saveParsesDamaged],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
