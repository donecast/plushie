// "Whatever the message/comment limit is for text, we need to increase it by 50%."
//
// Comments/replies: 500 → 750. Direct messages: 2000 → 3000 (db/0105 moves the
// matching char_length check). A maxlength is enforced by the browser, not by
// our code, so this drives the REAL composers in a real Chrome and types past
// the OLD ceiling — asserting the attribute alone would pass even if some other
// handler clamped the value.
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

const COMMENT_MAX = 750;
const DM_MAX = 3000;

const POST = {
  id: 'p1', authorId: 'u2', authorName: 'wifeosaurus', authorAvatar: null,
  body: 'look at this bun', photoUrl: null, catalogId: null, plushName: null,
  visibility: 'public', createdAt: new Date(Date.UTC(2026, 7, 6, 1)).toISOString(),
  reactions: [], commentCount: 1, mine: false, canDelete: false, poll: null,
  comments: [{
    id: 'c1', authorId: 'me', authorName: 'scott', authorAvatar: null,
    body: 'a bun indeed', createdAt: new Date(Date.UTC(2026, 7, 6, 2)).toISOString(),
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
    addComment: async (postId, body) => { window.__sent.push({ kind: 'comment', postId, body }); },
    sendDm: async (uid, body) => { window.__sent.push({ kind: 'dm', uid, body }); return { id: 'm1' }; },
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

// ── Every comment-side composer carries the raised ceiling ──
out.commentMax = await page.evaluate((sel) => document.querySelector(sel).maxLength, COMMENT);
out.commentMaxRaised = out.commentMax === COMMENT_MAX;

// Typing past the OLD 500 must actually stick — the browser truncates at
// maxlength, so this is the check that would have failed before the change.
const longComment = 'x'.repeat(COMMENT_MAX + 25);
await page.fill(COMMENT, longComment);
const commentVal = await page.inputValue(COMMENT);
out.commentAcceptsNewCeiling = commentVal.length === COMMENT_MAX;
out.commentPastOldLimit = commentVal.length > 500;

// …and the whole 750 makes it out of the form, not just into the box.
await page.fill(COMMENT, 'y'.repeat(COMMENT_MAX));
await page.click('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) button[type="submit"]');
await page.waitForTimeout(50);
out.commentPublishedFullLength = await page.evaluate((n) => {
  const s = window.__sent.find((x) => x.kind === 'comment');
  return !!s && s.body.length === n;
}, COMMENT_MAX);

// ── Reply and edit boxes share the same default ──
out.replyMax = await page.evaluate(() => {
  state.socReplyTo = 'c1'; rerenderSocialCurrent();
  return document.querySelector('.soc-reply-form .soc-comment-input').maxLength;
});
out.editMax = await page.evaluate(() => {
  state.socReplyTo = null; state.socEditComment = 'c1'; rerenderSocialCurrent();
  return document.querySelector('.soc-comment-edit-form .soc-comment-input').maxLength;
});

// ── The DM composer gets the bigger ceiling ──
await page.evaluate(() => {
  state.socEditComment = null;
  state.socSubTab = 'messages';
  state.dmPartner = { id: 'u2', username: 'wifeosaurus', avatarUrl: null };
  state.dmThreads = [];
  document.getElementById('soc-messages')?.classList.remove('hidden');
  renderSocial();
});
await page.waitForSelector('#dm-input');
out.dmMax = await page.evaluate(() => document.getElementById('dm-input').maxLength);
out.dmMaxRaised = out.dmMax === DM_MAX;

const longDm = 'z'.repeat(DM_MAX + 25);
await page.fill('#dm-input', longDm);
const dmVal = await page.inputValue('#dm-input');
out.dmAcceptsNewCeiling = dmVal.length === DM_MAX;
out.dmPastOldLimit = dmVal.length > 2000;

await page.fill('#dm-input', 'w'.repeat(DM_MAX));
await page.click('.dm-compose button[type="submit"]');
await page.waitForTimeout(80);
out.dmSentFullLength = await page.evaluate((n) => {
  const s = window.__sent.find((x) => x.kind === 'dm');
  return !!s && s.body.length === n;
}, DM_MAX);

console.log(JSON.stringify(out, null, 2));
const checks = [
  [`comment box maxlength is ${COMMENT_MAX}`, out.commentMaxRaised],
  ['a comment longer than the old 500 survives typing', out.commentPastOldLimit && out.commentAcceptsNewCeiling],
  [`a full ${COMMENT_MAX}-char comment publishes intact`, out.commentPublishedFullLength],
  [`reply box maxlength is ${COMMENT_MAX}`, out.replyMax === COMMENT_MAX],
  [`edit box maxlength is ${COMMENT_MAX}`, out.editMax === COMMENT_MAX],
  [`DM box maxlength is ${DM_MAX}`, out.dmMaxRaised],
  ['a message longer than the old 2000 survives typing', out.dmPastOldLimit && out.dmAcceptsNewCeiling],
  [`a full ${DM_MAX}-char message sends intact`, out.dmSentFullLength],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
