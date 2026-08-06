// "Allow people to 'pull down' the comment box so they can see everything they
// are typing at once" — plus the auto-grow ceiling going 132 → 198px.
//
// Three things have to hold, and only a real browser can show them:
//   1. typing a long comment grows the box to the NEW ceiling, not the old one;
//   2. a mouse drag on the browser's native resize corner pulls it past that
//      ceiling (the CSS max-height that used to block it is gone);
//   3. the dragged height survives a repaint — the feed rebuilds these boxes
//      from HTML constantly, which is what would snap a drag back.
// Touch gets its own path (onComposerGripDown) because iOS/Android don't let a
// finger drive the native corner at all.
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

const AUTO_CEILING = 198;   // COMPOSER_MAX_HEIGHT
const OLD_CEILING = 132;

const POST = {
  id: 'p1', authorId: 'u2', authorName: 'wifeosaurus', authorAvatar: null,
  body: 'look at this bun', photoUrl: null, catalogId: null, plushName: null,
  visibility: 'public', createdAt: new Date(Date.UTC(2026, 7, 6, 1)).toISOString(),
  reactions: [], commentCount: 0, mine: false, canDelete: false, poll: null, comments: [],
};

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, hasTouch: true });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate((POST) => {
  document.getElementById('boot-splash')?.remove();
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.__POST = POST;
  window.__sent = [];
  window.data = {
    appSettings: {}, featureEnabled: () => false,
    isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
    listDmThreads: async () => [], listDmMessages: async () => [], markDmRead: async () => {},
    listPosts: async () => [POST],
    addComment: async (postId, body) => { window.__sent.push({ postId, body }); },
  };
}, POST);
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}
await page.evaluate(() => {
  state.tab = 'home';
  state.socSubTab = 'feed';
  state.socFeed = [window.__POST];
  state.socExpandedComments = new Set(['p1']);
  state.ready.add('social');
  wireSocialEvents();
  for (let el = document.getElementById('soc-feed'); el; el = el.parentElement) el.classList?.remove('hidden');
  renderSocial();
});

const BOX = '.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) .soc-comment-input';
const h = () => page.evaluate((s) => Math.round(document.querySelector(s).offsetHeight), BOX);
const out = {};

// ── 1. Auto-grow now stops at the raised ceiling ──
out.pillHeight = await h();
await page.click(BOX);
await page.keyboard.type('line one');
for (let i = 2; i <= 14; i++) { await page.keyboard.press('Enter'); await page.keyboard.type(`line ${i}`); }
await page.waitForTimeout(60);
out.grownHeight = await h();
out.hitsNewCeiling = out.grownHeight === AUTO_CEILING;
out.tallerThanOldCap = out.grownHeight > OLD_CEILING;
// …and the CSS no longer clamps it, which is what would silently cap a drag.
out.noCssMaxHeight = await page.evaluate((s) =>
  getComputedStyle(document.querySelector(s)).maxHeight === 'none', BOX);
out.resizeIsVertical = await page.evaluate((s) =>
  getComputedStyle(document.querySelector(s)).resize === 'vertical', BOX);

// ── 2. Drag the native corner with a real mouse, past the ceiling ──
const corner = await page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { x: r.right - 4, y: r.bottom - 4 };
}, BOX);
await page.mouse.move(corner.x, corner.y);
await page.mouse.down();
await page.mouse.move(corner.x, corner.y + 160, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(80);
out.draggedHeight = await h();
out.dragPulledItOpen = out.draggedHeight > AUTO_CEILING + 100;

// ── 3. A repaint must not snap the drag back ──
await page.evaluate(() => rerenderSocialCurrent());
await page.waitForTimeout(80);
out.afterRepaint = await h();
out.dragSurvivesRepaint = Math.abs(out.afterRepaint - out.draggedHeight) <= 2;

// …and typing more doesn't yank it back to the auto height either.
await page.click(BOX);
await page.keyboard.type('!');
await page.waitForTimeout(60);
out.afterMoreTyping = await h();
out.dragSurvivesTyping = Math.abs(out.afterMoreTyping - out.draggedHeight) <= 2;

// ── 4. Touch: the finger path, since the native corner ignores touch ──
await page.evaluate(() => {
  const box = document.querySelector('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) .soc-comment-input');
  const r = box.getBoundingClientRect();
  const at = (type, y) => box.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, pointerType: 'touch', bubbles: true, cancelable: true,
    clientX: r.right - 8, clientY: y,
  }));
  window.__touchStart = Math.round(box.offsetHeight);
  at('pointerdown', r.bottom - 8);
  at('pointermove', r.bottom - 8 + 90);
  at('pointerup', r.bottom - 8 + 90);
});
await page.waitForTimeout(60);
out.afterTouchDrag = await h();
out.touchDragWorks = out.afterTouchDrag - out.afterMoreTyping >= 80;

// A touch anywhere ELSE in the box must still just place the caret.
await page.evaluate(() => {
  const box = document.querySelector('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) .soc-comment-input');
  const r = box.getBoundingClientRect();
  const at = (type, y) => box.dispatchEvent(new PointerEvent(type, {
    pointerId: 8, pointerType: 'touch', bubbles: true, cancelable: true,
    clientX: r.left + 30, clientY: y,
  }));
  at('pointerdown', r.top + 20);
  at('pointermove', r.top + 20 + 90);
  at('pointerup', r.top + 20 + 90);
});
await page.waitForTimeout(60);
out.afterNonGripTouch = await h();
out.nonGripTouchIsInert = out.afterNonGripTouch === out.afterTouchDrag;

// ── 5. Sending clears the drag — the next comment starts as a pill again ──
await page.click('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) button[type="submit"]');
await page.waitForTimeout(80);
out.afterSend = await h();
out.resetsAfterSend = out.afterSend <= out.pillHeight + 2;

console.log(JSON.stringify(out, null, 2));
const checks = [
  [`auto-grow stops at ${AUTO_CEILING}px, not ${OLD_CEILING}`, out.hitsNewCeiling && out.tallerThanOldCap],
  ['no CSS max-height left to clamp a drag', out.noCssMaxHeight],
  ['the box advertises a vertical resize handle', out.resizeIsVertical],
  ['dragging the corner pulls it well past the ceiling', out.dragPulledItOpen],
  ['a feed repaint keeps the dragged height', out.dragSurvivesRepaint],
  ['typing more keeps the dragged height', out.dragSurvivesTyping],
  ['a touch drag on the grip resizes it too', out.touchDragWorks],
  ['a touch elsewhere in the box does NOT resize', out.nonGripTouchIsInert],
  ['sending resets the box to a pill', out.resetsAfterSend],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
