// Amber's bug: type a reply on a post, click away for a few seconds, come
// back — the text was gone. The feed is rebuilt from HTML strings on every
// refresh, which wiped the unsent box. Verifies the sticky-draft fix against
// the real markup + app parts: comment box, reply box, comment edit, and the
// DM composer (whose 8s poll re-render ate text the same way), plus caret
// retention on a repaint mid-typing and survival across a full reload.
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

const POST = {
  id: 'p1', authorId: 'u2', authorName: 'wifeosaurus', authorAvatar: null,
  body: 'look at this bun', photoUrl: null, catalogId: null, plushName: null,
  visibility: 'public', createdAt: new Date(Date.UTC(2026, 6, 27, 1)).toISOString(),
  reactions: [], commentCount: 1, mine: false, canDelete: false, poll: null,
  comments: [{
    id: 'c1', authorId: 'me', authorName: 'scott', authorAvatar: null,
    body: 'my own comment', createdAt: new Date(Date.UTC(2026, 6, 27, 2)).toISOString(),
    reactions: [], replies: [], mine: true, canDelete: true, canEdit: true, photoUrl: null,
  }],
};

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const boot = async () => {
  await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
  await page.evaluate((POST) => {
    document.getElementById('boot-splash')?.remove();
    window.currentUser = { id: 'me', username: 'scott' };
    window.runAuthGate = async () => {};
    window.removeBootSplash = () => {};
    window.idb = { getMeta: async () => null, setMeta: async () => {} };
    window.__POST = POST;
    window.data = {
      appSettings: {}, featureEnabled: () => false,
      isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
      listDmThreads: async () => [],
      listDmMessages: async () => window.__dmMsgs,
      markDmRead: async () => {},
      addComment: async () => {},
      listPosts: async () => [POST],
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
    // The harness doesn't run the tab router, so unhide the social view
    // (and its ancestors) the way goToTab('home') would.
    for (let el = document.getElementById('soc-feed'); el; el = el.parentElement) {
      el.classList?.remove('hidden');
    }
    renderSocial();
  });
};

await boot();

const out = {};
const sel = {
  comment: '.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form) .soc-comment-input',
  reply: '.soc-reply-form .soc-comment-input',
  edit: '.soc-comment-edit-form .soc-comment-input',
};

// 1. Type a top-level comment, then force the repaint that used to eat it.
await page.click(sel.comment);
await page.keyboard.type('this is the comment I was writing');
out.commentTyped = await page.inputValue(sel.comment) === 'this is the comment I was writing';
await page.evaluate(() => rerenderSocialCurrent());
out.commentSurvivesRepaint = await page.inputValue(sel.comment) === 'this is the comment I was writing';
// Caret stayed in the box (this is what "came back and kept typing" needs).
out.commentKeptFocus = await page.evaluate(() => document.activeElement?.dataset?.draftKey === 'c:p1:');
await page.keyboard.type('!');
out.canKeepTyping = await page.inputValue(sel.comment) === 'this is the comment I was writing!';

// 2. Amber's exact scenario: open a reply box, type, tab away, come back.
await page.evaluate(() => { state.socReplyTo = 'c1'; rerenderSocialCurrent(); });
await page.click(sel.reply);
await page.keyboard.type('replying to my own comment');
const bg = await browser.newPage();          // steal focus to another tab
await bg.goto('about:blank');
await new Promise((r) => setTimeout(r, 5000)); // "just clicked off for 5 seconds"
await bg.close();
await page.bringToFront();
await page.evaluate(() => rerenderSocialCurrent());   // the refresh on return
out.replySurvivesTabAway = await page.inputValue(sel.reply) === 'replying to my own comment';

// 3. Comment edit: text survives a repaint, and Cancel is what discards it.
await page.evaluate(() => { state.socReplyTo = null; state.socEditComment = 'c1'; rerenderSocialCurrent(); });
await page.fill(sel.edit, 'my own comment, revised');
await page.evaluate(() => rerenderSocialCurrent());
out.editSurvivesRepaint = await page.inputValue(sel.edit) === 'my own comment, revised';
await page.click('[data-soc-action="cancel-edit-comment"]');
await page.evaluate(() => { state.socEditComment = 'c1'; rerenderSocialCurrent(); });
out.cancelDiscardsEdit = await page.inputValue(sel.edit) === 'my own comment';
await page.evaluate(() => { state.socEditComment = null; rerenderSocialCurrent(); });

// 4. DM composer vs the 8s poll (the poll re-render used to wipe it).
await page.evaluate(() => {
  window.__dmMsgs = [{ id: 'm1', mine: false, body: 'hi', createdAt: new Date(Date.UTC(2026, 6, 27, 3)).toISOString(), readAt: null }];
  state.socSubTab = 'messages';
  state.dmPartner = { id: 'u2', username: 'wifeosaurus', avatarUrl: null };
  state.dmMessages = window.__dmMsgs;
  renderSocial();
});
await page.click('#dm-input');
await page.keyboard.type('half a message');
await page.evaluate(async () => {
  // A new message lands mid-typing → refreshDmView() repaints the thread.
  window.__dmMsgs = [...window.__dmMsgs, { id: 'm2', mine: false, body: 'you there?', createdAt: new Date(Date.UTC(2026, 6, 27, 4)).toISOString(), readAt: null }];
  await refreshDmView();
});
out.dmSurvivesPoll = await page.inputValue('#dm-input') === 'half a message';
out.dmKeptFocus = await page.evaluate(() => document.activeElement?.id === 'dm-input');

// 5. Survives a full reload (localStorage), and sending clears the draft.
await boot();
out.commentSurvivesReload = await page.inputValue(sel.comment) === 'this is the comment I was writing!';
await page.evaluate(async () => {
  const form = document.querySelector('.soc-comment-form:not(.soc-reply-form):not(.soc-comment-edit-form)');
  window.loadSocialData = async () => {};
  await submitCommentForm(form);
});
out.sendClearsDraft = await page.evaluate(() =>
  !JSON.parse(localStorage.getItem('soc_drafts_me') || '{}')['c:p1:']);
await boot();
out.sentCommentDoesNotComeBack = await page.inputValue(sel.comment) === '';

console.log(JSON.stringify(out, null, 2));
const failures = Object.entries(out).filter(([, v]) => v !== true);
console.log(failures.length ? `FAIL: ${failures.map(([k]) => k).join(', ')}` : 'ALL PASS');
await browser.close();
server.close();
process.exit(failures.length ? 1 : 0);
