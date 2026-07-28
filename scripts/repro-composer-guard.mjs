// Verify the unsaved-work guard on the New Post composer against the real
// markup + app parts. Covers: empty composer still closes on a backdrop tap,
// a typed composer survives a backdrop tap, Cancel/× ask before discarding,
// "Keep editing" keeps every character, "Discard" closes, the draft autosaves
// to localStorage and comes back on reopen, and posting clears it.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.__created = [];
  window.data = {
    appSettings: {},
    featureEnabled: () => false,
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
    createPost: async (p) => { window.__created.push(p); },
    listPosts: async () => [],
    loadSocialData: async () => {},
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const LONG = 'Here is the long update post I spent ten minutes writing. '.repeat(6);

const result = await page.evaluate(async (LONG) => {
  const out = {};
  const tick = () => new Promise((r) => setTimeout(r, 30));
  state.collection = [{ catalogId: 'c1', name: 'Jellybun', nickname: 'Jelly' }];
  wireSocialEvents();
  const modal = document.getElementById('social-modal');
  const backdrop = modal.querySelector('.modal-backdrop');
  const isOpen = () => !modal.classList.contains('hidden');
  const bodyEl = () => document.getElementById('soc-compose-body');
  const guard = () => modal.querySelector('.soc-discard');

  // 1. Empty composer: a backdrop tap still just closes it.
  openComposer();
  await tick();
  out.opensEmpty = isOpen() && bodyEl()?.value === '';
  backdrop.click();
  await tick();
  out.emptyClosesOnBackdrop = !isOpen();

  // 2. Typed composer: backdrop tap must NOT close it, and must not prompt.
  openComposer();
  await tick();
  const ta = bodyEl();
  ta.value = LONG;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  backdrop.click();
  await tick();
  out.typedSurvivesBackdrop = isOpen() && bodyEl().value === LONG;
  out.backdropShowedNoGuard = !guard();

  // 3. A stray click on the card itself is harmless too.
  document.getElementById('social-modal-card').click();
  await tick();
  out.survivesCardClick = isOpen() && bodyEl().value === LONG;

  // 4. Cancel asks first — and "Keep editing" keeps every character.
  modal.querySelector('[data-close-social].btn-ghost').click();
  await tick();
  out.cancelShowsGuard = !!guard();
  guard().querySelector('[data-soc-discard="keep"]').click();
  await tick();
  out.keepEditingKeepsText = isOpen() && bodyEl().value === LONG && !guard();

  // 5. The × asks too.
  modal.querySelector('.modal-close').click();
  await tick();
  out.closeXShowsGuard = !!guard();
  // Clicking beside the little card does nothing (no accidental dismissal).
  guard().click();
  await tick();
  out.guardIgnoresStrayClick = !!guard() && isOpen();

  // 6. Draft autosaved while typing.
  out.draftSaved = JSON.parse(localStorage.getItem(`soc_draft_post_me`) || 'null')?.body === LONG;

  // 7. Discard closes for real.
  guard().querySelector('[data-soc-discard="discard"]').click();
  await tick();
  out.discardCloses = !isOpen() && !guard();
  out.discardClearsDraft = localStorage.getItem('soc_draft_post_me') === null;

  // 8. Draft restore: type, close the hard way (simulate a crash by hiding
  //    the modal without going through the guard), reopen.
  openComposer();
  await tick();
  const ta2 = bodyEl();
  ta2.value = 'half-written thoughts about buns';
  ta2.dispatchEvent(new Event('input', { bubbles: true }));
  document.getElementById('soc-compose-vis').value = 'friends';
  document.getElementById('soc-compose-vis').dispatchEvent(new Event('change', { bubbles: true }));
  closeSocialModal();                       // as if the tab was closed
  openComposer();
  await tick();
  out.draftRestored = bodyEl().value === 'half-written thoughts about buns';
  out.draftRestoredVis = document.getElementById('soc-compose-vis').value === 'friends';
  // A restored draft is armed immediately — backdrop still can't eat it.
  backdrop.click();
  await tick();
  out.restoredDraftArmed = isOpen();

  // 9. Posting clears the draft and closes.
  await submitComposer({ preventDefault() {} });
  await tick();
  out.posted = window.__created.length === 1 && window.__created[0].body === 'half-written thoughts about buns';
  out.postClosed = !isOpen();
  out.postClearedDraft = localStorage.getItem('soc_draft_post_me') === null;

  // 10. Non-composer modals are guarded the same way but still close clean
  //     when untouched (e.g. the styled confirm dialog).
  openSocialModal('<button class="modal-close" data-close-social>×</button><p>nothing to lose</p>');
  await tick();
  backdrop.click();
  await tick();
  out.untouchedModalClosesOnBackdrop = !isOpen();

  return out;
}, LONG);

// ── Generic guard: the item editor (#modal) gets the same backdrop
//    protection, driven by REAL keystrokes (isTrusted) via Playwright.
await page.evaluate(() => {
  document.getElementById('boot-splash')?.remove();
  window.data.featureEnabled = () => false;
  state.collection = [{ id: 'i1', name: 'Jellybun', catalogId: '', meaning: '', nickname: '' }];
  wireEvents();
  openModal('collection', state.collection[0]);
});
await page.waitForTimeout(120);
const itemModal = await page.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
// Untouched, prefilled editor still dismisses on a backdrop tap.
await page.click('#modal .modal-backdrop', { position: { x: 5, y: 5 } });
const untouchedClosed = await page.evaluate(() => document.getElementById('modal').classList.contains('hidden'));
await page.evaluate(() => openModal('collection', state.collection[0]));
await page.waitForTimeout(80);
await page.click('#f-meaning');
await page.keyboard.type('the one my mum gave me');
await page.click('#modal .modal-backdrop', { position: { x: 5, y: 5 } });
await page.waitForTimeout(60);
const typedState = await page.evaluate(() => ({
  open: !document.getElementById('modal').classList.contains('hidden'),
  text: document.getElementById('f-meaning').value,
}));
// Escape is guarded too.
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
const afterEscape = await page.evaluate(() => !document.getElementById('modal').classList.contains('hidden'));
// Clear it out and the backdrop works again (nothing left to lose).
await page.fill('#f-meaning', '');
await page.click('#modal .modal-backdrop', { position: { x: 5, y: 5 } });
await page.waitForTimeout(60);
const clearedCloses = await page.evaluate(() => document.getElementById('modal').classList.contains('hidden'));

Object.assign(result, {
  itemModalOpens: itemModal,
  itemUntouchedClosesOnBackdrop: untouchedClosed,
  itemTypedSurvivesBackdrop: typedState.open && typedState.text === 'the one my mum gave me',
  itemTypedSurvivesEscape: afterEscape,
  itemClearedClosesOnBackdrop: clearedCloses,
});

console.log(JSON.stringify(result, null, 2));
const failures = Object.entries(result).filter(([, v]) => v !== true);
console.log(failures.length ? `FAIL: ${failures.map(([k]) => k).join(', ')}` : 'ALL PASS');
await browser.close();
server.close();
process.exit(failures.length ? 1 : 0);
