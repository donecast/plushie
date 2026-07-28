// Drive the REAL bulk editor (real index.html markup + the real app-*.js parts)
// in headless Chrome against a stubbed data layer. Covers the flow a collector
// with hundreds of plushes actually walks: open it, filter, tick, apply, and
// the guards that stop an empty or half-understood apply.
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
  // Recording stub for the write path (its own unit tests live in
  // test/bulk-update.test.js — here we only care what the UI sends).
  window._bulkCalls = [];
  window._reloads = 0;
  window.data = {
    appSettings: {}, featureEnabled: () => false, isBlocked: () => false,
    async bulkUpdateCollection(ids, patch) {
      window._bulkCalls.push({ ids: [...ids], patch: { ...patch } });
      return window._bulkResult === undefined ? ids.length : window._bulkResult;
    },
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  const out = {};
  try { wireEvents(); } catch (e) { out._wireEventsNote = e.message; }
  // loadAll() is the "re-read the truth" path; count it instead of running it.
  window.loadAll = async () => { window._reloads++; };
  const toasts = [];
  window.toast = (m) => toasts.push(m);
  window.confirm = () => true;

  const mk = (id, name, acquiredHow, dateCollected) => ({
    id, name, catalogId: null, quantity: 1, acquiredHow, dateCollected,
    missingAccessories: [], damagedAccessories: [], visibility: 'friends',
  });
  state.catalog = [];
  state.collection = [
    mk('a', 'Anxiety Axolotl', null, null),
    mk('b', 'Blue Plaid Love Rabbit', 'Gift', null),
    mk('c', 'Cursed Corgi', null, '2026-01-05'),
    mk('d', 'Doomed Duck', 'Mystery Bag', '2026-02-02'),
  ];

  // ── Entry points ──
  out.toolbarButton = !!document.getElementById('col-bulk');
  out.missingCount = bulkMissingCount();          // a, b, c — d is complete

  // ── Open ──
  openBulkEditor();
  out.modalOpen = !document.getElementById('bulk-modal').classList.contains('hidden');
  out.scopeDefaultsToMissing = document.getElementById('bulk-scope').value === 'missing';
  const rowNames = () => [...document.querySelectorAll('#bulk-list .bulk-row .bulk-name')].map((e) => e.textContent);
  out.listsOnlyIncomplete = JSON.stringify(rowNames()) ===
    JSON.stringify(['Anxiety Axolotl', 'Blue Plaid Love Rabbit', 'Cursed Corgi']);
  out.sortedByName = JSON.stringify(rowNames()) === JSON.stringify([...rowNames()].sort());

  // Options mirror the single-item form, plus a leave-unchanged default.
  const bulkOpts = [...document.getElementById('bulk-acquired').options].map((o) => o.value);
  const formOpts = [...document.getElementById('f-acquired').options].map((o) => o.value).filter(Boolean);
  out.optionsMirrorForm = JSON.stringify(bulkOpts) === JSON.stringify(['', ...formOpts]);
  out.defaultsToLeaveUnchanged = document.getElementById('bulk-acquired').value === '';

  // ── Guards before anything is selected ──
  await applyBulkEdit();
  out.noSelectionBlocked = window._bulkCalls.length === 0 && /tick some items/i.test(toasts.at(-1) || '');
  out.applyDisabledWhenEmpty = document.getElementById('bulk-apply').disabled === true;

  // ── Tick two rows ──
  const check = (id) => {
    const cb = document.querySelector(`.bulk-check[data-bulk-id="${id}"]`);
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  };
  check('a'); check('c');
  out.selectionTracked = state.bulkSel.size === 2;
  out.applyLabelCounts = document.getElementById('bulk-apply').textContent === 'Apply to 2 items';

  // Nothing to apply yet — a selection alone must not write.
  await applyBulkEdit();
  out.noFieldsBlocked = window._bulkCalls.length === 0 && /how acquired.*or a date/i.test(toasts.at(-1) || '');

  // ── Selection survives re-rendering under a different filter ──
  state.bulkQuery = 'axolotl';
  renderBulkList();
  out.filteredDown = document.querySelectorAll('#bulk-list .bulk-row').length === 1;
  out.selectionSurvivesFilter = state.bulkSel.size === 2;
  state.bulkQuery = '';
  renderBulkList();
  out.stillCheckedAfterFilter =
    document.querySelector('.bulk-check[data-bulk-id="c"]').checked === true;

  // ── Apply just a date: the "how" must be left alone ──
  document.getElementById('bulk-date').value = '2026-03-09';
  await applyBulkEdit();
  const call = window._bulkCalls.at(-1);
  out.sentSelectedIds = JSON.stringify([...call.ids].sort()) === JSON.stringify(['a', 'c']);
  out.sentOnlyDate = JSON.stringify(call.patch) === JSON.stringify({ dateCollected: '2026-03-09' });
  out.localItemsPatched =
    state.collection.find((i) => i.id === 'a').dateCollected === '2026-03-09' &&
    state.collection.find((i) => i.id === 'c').dateCollected === '2026-03-09';
  out.untouchedItemUntouched = state.collection.find((i) => i.id === 'b').dateCollected === null;
  out.acquiredHowUntouched = state.collection.find((i) => i.id === 'a').acquiredHow === null;
  out.selectionClearedAfterApply = state.bulkSel.size === 0;
  out.toldHowMany = /updated 2 items/i.test(toasts.at(-1) || '');
  out.noReloadOnCleanApply = window._reloads === 0;

  // ── Apply a how: it lands, and the row now reads it back ──
  check('a');
  document.getElementById('bulk-date').value = '';
  document.getElementById('bulk-acquired').value = 'Purchased Secondhand';
  await applyBulkEdit();
  out.sentOnlyHow = JSON.stringify(window._bulkCalls.at(-1).patch) ===
    JSON.stringify({ acquiredHow: 'Purchased Secondhand' });
  out.howLandedLocally = state.collection.find((i) => i.id === 'a').acquiredHow === 'Purchased Secondhand';

  // ── Short count from the DB → re-read instead of showing a hopeful screen ──
  check('b');
  window._bulkResult = 0;                       // pretend RLS dropped it
  document.getElementById('bulk-acquired').value = 'Gift';
  await applyBulkEdit();
  out.mismatchTriggersReload = window._reloads === 1;
  out.mismatchToldTheTruth = /updated 0 of 1/i.test(toasts.at(-1) || '');
  window._bulkResult = undefined;

  // ── Select-all applies to what's SHOWN, not the whole crypt ──
  state.bulkQuery = 'duck';                     // "Doomed Duck" only
  state.bulkScope = 'all';
  renderBulkList();
  bulkSelectVisible(true);
  out.selectAllScopedToFilter = state.bulkSel.size === 1 && state.bulkSel.has('d');
  bulkSelectVisible(false);
  out.clearSelectionWorks = state.bulkSel.size === 0;

  // ── Close drops the selection ──
  bulkSelectVisible(true);
  closeBulkEditor();
  out.closedClears = document.getElementById('bulk-modal').classList.contains('hidden')
    && state.bulkSel.size === 0;
  // A stray backdrop tap must not throw the work away (#208 stance).
  out.backdropInert = !document.querySelector('#bulk-modal .modal-backdrop[data-close-bulk]');

  // ── The in-grid nudge: the discoverable entry point on a phone, where the
  // filter row is easy to miss. Drive the REAL render() to prove it's there
  // and that tapping it opens the editor through the delegated handler.
  closeBulkEditor();
  // Reset to a known board — the applies above deliberately changed some rows.
  // Three with no method, which is what the missing-how nudge nags about.
  state.collection = [
    mk('a', 'Anxiety Axolotl', null, null),
    mk('b', 'Blue Plaid Love Rabbit', 'Gift', null),
    mk('c', 'Cursed Corgi', null, '2026-01-05'),
    mk('d', 'Doomed Duck', 'Mystery Bag', '2026-02-02'),
    mk('e', 'Existential Eel', null, '2026-01-09'),
  ];
  state.tab = 'crypt';
  state.colSubTab = 'plushes';
  state.ready.add('collection');
  try {
    render();
    const grid = document.getElementById('collection-grid');
    out.nudgeRendered = !!grid.querySelector('[data-bulk-open]');
    out.nudgeCountsItems = /3 items don't say how you got them/.test(grid.textContent);
    grid.querySelector('[data-bulk-open]')?.click();
    out.nudgeOpensEditor = !document.getElementById('bulk-modal').classList.contains('hidden');
    // The nudge names its own scope, so the editor opens already filtered.
    out.nudgeSetsScope = state.bulkScope === 'missing-how';
    closeBulkEditor();
    // With nothing missing there's nothing to nag about.
    const saved = state.collection;
    state.collection = saved.map((i) => ({ ...i, acquiredHow: 'Gift', dateCollected: '2026-01-01' }));
    render();
    out.nudgeHiddenWhenComplete = !document.getElementById('collection-grid').querySelector('[data-bulk-open]');
    state.collection = saved;
  } catch (e) {
    out._renderNote = e.message;
  }

  out._toasts = toasts;
  return out;
});

console.log(JSON.stringify(result, null, 2));
const checks = [
  ['toolbar has a Bulk edit button', result.toolbarButton],
  ['counts items missing how/when', result.missingCount === 3],
  ['modal opens', result.modalOpen],
  ['opens on "missing how or when"', result.scopeDefaultsToMissing],
  ['lists only incomplete items', result.listsOnlyIncomplete],
  ['list is name-sorted', result.sortedByName],
  ['options mirror the edit form + leave-unchanged', result.optionsMirrorForm],
  ['defaults to leave-unchanged', result.defaultsToLeaveUnchanged],
  ['apply with no selection is blocked', result.noSelectionBlocked],
  ['Apply is disabled with nothing ticked', result.applyDisabledWhenEmpty],
  ['ticking tracks the selection', result.selectionTracked],
  ['Apply button counts the selection', result.applyLabelCounts],
  ['apply with no fields filled is blocked', result.noFieldsBlocked],
  ['search narrows the list', result.filteredDown],
  ['selection survives filtering', result.selectionSurvivesFilter],
  ['boxes stay ticked after re-render', result.stillCheckedAfterFilter],
  ['sends exactly the selected ids', result.sentSelectedIds],
  ['a blank "how" is not sent', result.sentOnlyDate],
  ['selected items updated in memory', result.localItemsPatched],
  ['unselected item untouched', result.untouchedItemUntouched],
  ['blank field left the other column alone', result.acquiredHowUntouched],
  ['selection clears after applying', result.selectionClearedAfterApply],
  ['toast reports the real count', result.toldHowMany],
  ['clean apply skips the re-read', result.noReloadOnCleanApply],
  ['a blank date is not sent', result.sentOnlyHow],
  ['how lands in memory', result.howLandedLocally],
  ['short DB count triggers a re-read', result.mismatchTriggersReload],
  ['short DB count is reported honestly', result.mismatchToldTheTruth],
  ['select-all covers only what is shown', result.selectAllScopedToFilter],
  ['clear selection empties it', result.clearSelectionWorks],
  ['closing clears the selection', result.closedClears],
  ['backdrop tap cannot discard the work', result.backdropInert],
  ['grid nudges about incomplete items', result.nudgeRendered],
  ['nudge names the real count', result.nudgeCountsItems],
  ['tapping the nudge opens the editor', result.nudgeOpensEditor],
  ['the nudge scopes the editor to its own complaint', result.nudgeSetsScope],
  ['no nudge when nothing is missing', result.nudgeHiddenWhenComplete],
];
if (result._renderNote) console.log('[render note]', result._renderNote);
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
