// @nini: "would be nice if we can press enter to change line in comment. I kept
// forgetting and accidentally publishing my unfinished comment."
//
// The composers were single-line <input>s inside <form>s, so the browser
// submitted them on Enter for free. They're <textarea>s now. This drives REAL
// key events (page.keyboard, not synthetic dispatch) against the real markup +
// app parts, because the whole behaviour lives in browser form semantics — a
// dispatched KeyboardEvent would never have submitted anything and would prove
// nothing.
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

const POST = {
  id: 'p1', authorId: 'u2', authorName: 'wifeosaurus', authorAvatar: null,
  body: 'look at this bun', photoUrl: null, catalogId: null, plushName: null,
  visibility: 'public', createdAt: new Date(Date.UTC(2026, 6, 27, 1)).toISOString(),
  reactions: [], commentCount: 1, mine: false, canDelete: false, poll: null,
  comments: [{
    id: 'c1', authorId: 'me', authorName: 'scott', authorAvatar: null,
    body: 'first line\nsecond line', createdAt: new Date(Date.UTC(2026, 6, 27, 2)).toISOString(),
    reactions: [], replies: [], mine: true, canDelete: true, canEdit: true, photoUrl: null,
  }],
};

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
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
    // Record instead of writing — "did this publish?" is the whole question.
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

const out = {};
const COMMENT = '.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) .soc-comment-input';

// ── Every inline composer is a textarea now (that's what kills implicit submit) ──
out.composersAreTextareas = await page.evaluate(() => {
  const tags = [...document.querySelectorAll('.soc-comment-input')].map((e) => e.tagName);
  return tags.length > 0 && tags.every((t) => t === 'TEXTAREA');
});
out.keepsDraftKey = await page.evaluate(() =>
  !!document.querySelector('.soc-comment-input[data-draft-key]'));
out.keepsMaxLength = await page.evaluate(() =>
  document.querySelector('.soc-comment-input').maxLength === 500);

// ── The actual complaint: Enter must NOT publish ──
await page.click(COMMENT);
await page.keyboard.type('first line');
await page.keyboard.press('Enter');
await page.keyboard.type('second line');
const val = await page.inputValue(COMMENT);
out.enterMakesNewline = val === 'first line\nsecond line';
out.enterDidNotPublish = (await page.evaluate(() => window.__sent.length)) === 0;
out.textStillThere = val.includes('first line') && val.includes('second line');

// ── It grew to fit ──
out.grewWithContent = await page.evaluate(() => {
  const el = document.querySelector('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) .soc-comment-input');
  return el.getBoundingClientRect().height > 44;   // taller than the one-line pill
});

// ── Ctrl+Enter sends, for people who'd rather not reach for the mouse ──
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(50);
out.ctrlEnterPublished = await page.evaluate(() => window.__sent.length === 1);
out.publishedBothLines = await page.evaluate(() =>
  window.__sent[0]?.body === 'first line\nsecond line');

// ── …and the button still works, which is now the primary way ──
await page.evaluate(() => { window.__sent = []; });
await page.click(COMMENT);
await page.keyboard.type('sent with the button');
await page.click('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) button[type="submit"]');
await page.waitForTimeout(50);
out.buttonPublished = await page.evaluate(() =>
  window.__sent.length === 1 && window.__sent[0].body === 'sent with the button');

// ── A multi-line comment has to READ as multi-line, or the feature is a lie ──
out.commentTextPreWrap = await page.evaluate(() => {
  const el = document.querySelector('.soc-comment-text');
  return el && getComputedStyle(el).whiteSpace === 'pre-wrap';
});
out.commentShowsBothLines = await page.evaluate(() => {
  const el = document.querySelector('.soc-comment-text');
  return !!el && el.getBoundingClientRect().height > 24;
});
out.dmBubblePreWrap = await page.evaluate(() => {
  // No DM thread is open here, so check the rule itself rather than an element.
  const probe = document.createElement('div');
  probe.className = 'dm-bubble';
  document.body.appendChild(probe);
  const ws = getComputedStyle(probe).whiteSpace;
  probe.remove();
  return ws === 'pre-wrap';
});

// ── Reply and edit boxes behave the same way ──
await page.evaluate(() => { state.socReplyTo = 'c1'; rerenderSocialCurrent(); });
await page.click('.soc-reply-form .soc-comment-input');
await page.keyboard.type('reply line one');
await page.keyboard.press('Enter');
await page.keyboard.type('reply line two');
out.replyEnterNewline = (await page.inputValue('.soc-reply-form .soc-comment-input')) === 'reply line one\nreply line two';
out.replyDidNotPublish = (await page.evaluate(() => window.__sent.length)) === 1;   // still just the button one

await page.evaluate(() => { state.socReplyTo = null; state.socEditComment = 'c1'; rerenderSocialCurrent(); });
const editBox = '.soc-comment-edit-form .soc-comment-input';
out.editKeptExistingNewline = (await page.inputValue(editBox)) === 'first line\nsecond line';
await page.click(editBox);
await page.keyboard.press('Control+End');   // End alone stops at the end of the LINE
await page.keyboard.press('Enter');
await page.keyboard.type('third line');
out.editEnterNewline = (await page.inputValue(editBox)).endsWith('\nthird line');

console.log(JSON.stringify(out, null, 2));
const checks = [
  ['every inline composer is a textarea', out.composersAreTextareas],
  ['draft key survives the swap', out.keepsDraftKey],
  ['maxlength survives the swap', out.keepsMaxLength],
  ['Enter inserts a newline', out.enterMakesNewline],
  ['Enter does NOT publish', out.enterDidNotPublish],
  ['the half-written text is still there', out.textStillThere],
  ['the box grows with the text', out.grewWithContent],
  ['Ctrl+Enter publishes', out.ctrlEnterPublished],
  ['…with both lines intact', out.publishedBothLines],
  ['the Post button publishes', out.buttonPublished],
  ['comment text renders line breaks', out.commentTextPreWrap],
  ['…and takes more than one line', out.commentShowsBothLines],
  ['DM bubbles render line breaks', out.dmBubblePreWrap],
  ['reply box: Enter is a newline', out.replyEnterNewline],
  ['reply box: Enter does not publish', out.replyDidNotPublish],
  ['edit box loads existing line breaks', out.editKeptExistingNewline],
  ['edit box: Enter is a newline', out.editEnterNewline],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
