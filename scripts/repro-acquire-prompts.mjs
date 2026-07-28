// The two one-time prompts that ride on the bulk editor:
//   1. "we moved your Direct Purchase items to Bought from Manufacturer — were
//      any secondhand?" (db/0103 marker), and
//   2. "these dates are the day you added them, not the day you got them".
// Driven against the REAL markup + app parts with a stubbed data layer.
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
  window._cleared = 0;
  window._bulkCalls = [];
  window.data = {
    appSettings: {}, featureEnabled: () => false, isBlocked: () => false,
    async bulkUpdateCollection(ids, patch) {
      window._bulkCalls.push({ ids: [...ids], patch: { ...patch } });
      return ids.length;
    },
    async clearAcquireBackfillFlags() {
      window._cleared++;
      return 3;
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
  window.loadAll = async () => {};
  const toasts = [];
  window.toast = (m) => toasts.push(m);
  window.confirm = () => true;

  const day = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();
  const mk = (o) => ({
    id: o.id, name: o.name, catalogId: null, quantity: 1,
    acquiredHow: o.how ?? null, dateCollected: o.when ?? null,
    addedAt: o.added ?? null, acquiredHowBackfilled: !!o.wasDirect,
    missingAccessories: [], damagedAccessories: [], visibility: 'friends',
  });

  state.catalog = [];
  state.collection = [
    // Auto-stamped: dated after the cutoff AND on the day it was added.
    mk({ id: 's1', name: 'Suspect One',   how: 'Gift', when: '2026-07-01', added: day(2026, 7, 1) }),
    mk({ id: 's2', name: 'Suspect Two',   how: 'Gift', when: '2026-07-02', added: day(2026, 7, 2) }),
    mk({ id: 's3', name: 'Suspect Three', how: 'Gift', when: '2026-07-03', added: day(2026, 7, 3) }),
    // Same-day but BEFORE the cutoff — an early user who meant it.
    mk({ id: 'ok1', name: 'Early Bird',   how: 'Gift', when: '2026-06-10', added: day(2026, 6, 10) }),
    // After the cutoff but hand-edited away from the added day.
    mk({ id: 'ok2', name: 'Hand Edited',  how: 'Gift', when: '2026-07-05', added: day(2026, 7, 1) }),
    // No date at all — missing, not wrong.
    mk({ id: 'ok3', name: 'No Date',      how: 'Gift', when: null,         added: day(2026, 7, 1) }),
    // Rows the Direct Purchase merge answered for the owner.
    mk({ id: 'd1', name: 'Merged One',   how: 'Bought from Manufacturer', when: '2026-01-02', added: day(2026, 1, 2), wasDirect: true }),
    mk({ id: 'd2', name: 'Merged Two',   how: 'Bought from Manufacturer', when: '2026-01-03', added: day(2026, 1, 3), wasDirect: true }),
    mk({ id: 'd3', name: 'Merged Three', how: 'Bought from Manufacturer', when: '2026-01-04', added: day(2026, 1, 4), wasDirect: true }),
    // Same method, but the owner chose it — must NOT be swept into the prompt.
    mk({ id: 'own', name: 'Owner Chose', how: 'Bought from Manufacturer', when: '2026-01-05', added: day(2026, 1, 5) }),
  ];

  // ── The auto-stamp rule ──
  const byId = (id) => state.collection.find((i) => i.id === id);
  out.cutoffConstant = DATE_AUTOFILL_CUTOFF === '2026-06-16';
  out.flagsAutoStamped   = ['s1', 's2', 's3'].every((id) => dateLooksAutoFilled(byId(id)));
  out.sparesPreCutoff    = !dateLooksAutoFilled(byId('ok1'));
  out.sparesHandEdited   = !dateLooksAutoFilled(byId('ok2'));
  out.sparesMissingDate  = !dateLooksAutoFilled(byId('ok3'));
  out.suspectCount = bulkSuspectDateCount() === 3;
  out.wasDirectCount = bulkWasDirectCount() === 3;
  out.ownerChoiceNotFlagged = !wasDirectPurchase(byId('own'));

  // ── Both prompts render in the grid ──
  state.tab = 'crypt';
  state.colSubTab = 'plushes';
  state.ready.add('collection');
  render();
  const grid = document.getElementById('collection-grid');
  out.promptRendered = !!grid.querySelector('[data-acquire-confirm]');
  out.promptCounts = /moved your 3 older items/.test(grid.textContent.replace(/\s+/g, ' '));
  out.dateNudgeRendered = !!grid.querySelector('[data-bulk-open="suspect-date"]');
  out.dateNudgeCounts = /3 items are dated the day you added them/.test(grid.textContent.replace(/\s+/g, ' '));

  // ── "Let me check them" opens the editor scoped to just those rows ──
  grid.querySelector('[data-bulk-open="was-direct"]').click();
  out.checkOpensEditor = !document.getElementById('bulk-modal').classList.contains('hidden');
  out.checkScoped = state.bulkScope === 'was-direct';
  const names = () => [...document.querySelectorAll('#bulk-list .bulk-name')].map((e) => e.textContent);
  out.listsOnlyMerged = JSON.stringify(names()) === JSON.stringify(['Merged One', 'Merged Three', 'Merged Two']);
  out.rowsCarryTheFlag =
    document.querySelectorAll('#bulk-list .bulk-flag').length === 3;
  // The scope only exists while there's something in it.
  out.scopeOptionPresent = !!document.querySelector('#bulk-scope option[value="was-direct"]');
  out.scopeOptionCounts = /\(3\)/.test(document.querySelector('#bulk-scope option[value="was-direct"]').textContent);

  // ── Answering one in bulk clears its marker ──
  const tick = (id) => {
    const cb = document.querySelector(`.bulk-check[data-bulk-id="${id}"]`);
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
  };
  tick('d1');
  document.getElementById('bulk-acquired').value = 'Purchased Secondhand';
  await applyBulkEdit();
  out.answerClearsMarker = byId('d1').acquiredHowBackfilled === false
    && byId('d1').acquiredHow === 'Purchased Secondhand';
  out.othersStillAsked = bulkWasDirectCount() === 2;
  closeBulkEditor();

  // ── The suspect-date scope shows the auto-stamps, marked ──
  openBulkEditor('suspect-date');
  out.suspectScopeLists = JSON.stringify(names()) ===
    JSON.stringify(['Suspect One', 'Suspect Three', 'Suspect Two']);
  out.suspectRowsMarked = document.querySelectorAll('#bulk-list .bulk-suspect').length === 3;
  closeBulkEditor();

  // ── "They were all bought new" retires the question for the rest ──
  render();
  document.getElementById('collection-grid').querySelector('[data-acquire-confirm]').click();
  await new Promise((r) => setTimeout(r, 0));
  out.confirmCalledServer = window._cleared === 1;
  out.confirmClearedLocally = bulkWasDirectCount() === 0;
  out.confirmToasted = /confirmed/i.test(toasts.at(-1) || '');
  render();
  out.promptGoneAfterConfirm = !document.getElementById('collection-grid').querySelector('[data-acquire-confirm]');
  openBulkEditor();
  out.scopeOptionGone = !document.querySelector('#bulk-scope option[value="was-direct"]');
  closeBulkEditor();

  out._toasts = toasts;
  return out;
});

console.log(JSON.stringify(result, null, 2));
const checks = [
  ['cutoff constant is June 16 2026', result.cutoffConstant],
  ['flags dates stamped on the added day', result.flagsAutoStamped],
  ['spares same-day dates before the cutoff', result.sparesPreCutoff],
  ['spares dates edited away from the added day', result.sparesHandEdited],
  ['spares items with no date', result.sparesMissingDate],
  ['counts the auto-stamped dates', result.suspectCount],
  ['counts the merged Direct Purchase rows', result.wasDirectCount],
  ['owner-chosen method is not flagged', result.ownerChoiceNotFlagged],
  ['Direct Purchase prompt renders', result.promptRendered],
  ['prompt names the real count', result.promptCounts],
  ['date nudge renders', result.dateNudgeRendered],
  ['date nudge names the real count', result.dateNudgeCounts],
  ['"let me check" opens the editor', result.checkOpensEditor],
  ['…scoped to the merged rows', result.checkScoped],
  ['…listing only those rows', result.listsOnlyMerged],
  ['merged rows carry a visible flag', result.rowsCarryTheFlag],
  ['scope option appears with a count', result.scopeOptionPresent && result.scopeOptionCounts],
  ['answering in bulk clears that row\'s marker', result.answerClearsMarker],
  ['the unanswered rows keep asking', result.othersStillAsked],
  ['suspect-date scope lists the auto-stamps', result.suspectScopeLists],
  ['…and marks them on screen', result.suspectRowsMarked],
  ['"all bought new" hits the server once', result.confirmCalledServer],
  ['…clears the markers locally', result.confirmClearedLocally],
  ['…and says so', result.confirmToasted],
  ['prompt is gone afterwards', result.promptGoneAfterConfirm],
  ['scope option disappears with it', result.scopeOptionGone],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
