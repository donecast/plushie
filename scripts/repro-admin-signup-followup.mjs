// Incomplete sign-ups: Resend sign-in email / Email them / Copy all emails
// against the REAL app parts with a stubbed data layer. Checks the rendered
// table, then clicks Resend and asserts the data call + re-render.
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
const exe = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott', isAdmin: true, canModerate: true };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window._calls = [];
  const rows = [
    { id: 'a1', email: 'never@example.com', created_at: '2026-11-03T00:56:56Z', last_sign_in_at: null, confirmed: false,
      confirmation_sent_at: '2026-11-03T00:56:56Z', last_followup_at: null, last_followup_kind: null, followup_count: 0 },
    { id: 'a2', email: 'bailed@example.com', created_at: '2026-06-25T00:00:20Z', last_sign_in_at: '2026-06-25T00:01:15Z', confirmed: true,
      confirmation_sent_at: '2026-06-25T00:00:20Z', last_followup_at: '2026-11-01T12:00:00Z', last_followup_kind: 'email', followup_count: 2 },
  ];
  window.data = {
    appSettings: {},
    async adminListUsers() { return []; },
    async adminListDisputes() { return []; }, async adminListCatalogPending() { return []; },
    async adminListPhotoSuggestions() { return []; }, async adminListReports() { return []; },
    async adminListDeletionRequests() { return []; },
    async adminListIncompleteSignups() { return rows.map((r) => ({ ...r })); },
    async adminResendSignupEmail(uid, email) {
      window._calls.push(['resend', uid, email]);
      const r = rows.find((x) => x.id === uid); r.last_followup_at = new Date().toISOString(); r.last_followup_kind = 'resend'; r.followup_count += 1;
    },
    async adminLogSignupFollowup(uid, kind) { window._calls.push(['log', uid, kind]); },
  };
  window.state = window.state || {};
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}
const result = await page.evaluate(async () => {
  if (!document.getElementById('admin-content')) { const d = document.createElement('div'); d.id = 'admin-content'; document.body.appendChild(d); }
  state.adminUsers = [];
  await loadAdminUsers();
  renderAdminUserList();
  const table = document.querySelector('.admin-incomplete-table');
  const headers = [...table.querySelectorAll('thead th')].map((t) => t.textContent);
  const row0 = [...table.querySelectorAll('tbody tr')[0].querySelectorAll('td')].map((td) => td.textContent.trim());
  const row1 = [...table.querySelectorAll('tbody tr')[1].querySelectorAll('td')].map((td) => td.textContent.trim());
  const mail = table.querySelector('tbody tr .admin-followup-mail');
  const copyBtn = document.querySelector('[data-admin-action="copy-incomplete-emails"]');
  // Click Resend on row 0 through the real delegated handler.
  const resendBtn = table.querySelector('tbody tr [data-admin-action="resend-signup-email"]');
  await onAdminClick({ target: resendBtn });
  const after = [...document.querySelector('.admin-incomplete-table tbody tr').querySelectorAll('td')].map((td) => td.textContent.trim());
  return { headers, row0, row1, mailHref: mail.getAttribute('href'), copyEmails: copyBtn?.dataset.emails, calls: window._calls, after };
});
await browser.close(); server.close();
const problems = [];
if (errors.length) problems.push('page errors: ' + errors.join(' | '));
if (result.headers.join(',') !== 'Email,Signed up,Status,Followed up,') problems.push(`headers: ${result.headers}`);
if (!/Never verified email/.test(result.row0[2]) || !/Last email sent: \d/.test(result.row0[2])) problems.push(`row0 status cell: ${result.row0[2]}`);
if (result.row0[3] !== 'Never') problems.push(`row0 followed-up: ${result.row0[3]}`);
if (!/^Emailed/.test(result.row1[3]) || !/×2/.test(result.row1[3])) problems.push(`row1 followed-up: ${result.row1[3]}`);
if (!/^mailto:never%40example\.com\?subject=.*&body=/.test(result.mailHref)) problems.push(`mailto: ${result.mailHref}`);
if (result.copyEmails !== 'never@example.com, bailed@example.com') problems.push(`copy emails: ${result.copyEmails}`);
if (JSON.stringify(result.calls) !== JSON.stringify([['resend', 'a1', 'never@example.com']])) problems.push(`calls: ${JSON.stringify(result.calls)}`);
if (!/^Re-sent sign-in email/.test(result.after[3])) problems.push(`after resend, followed-up cell: ${result.after[3]}`);
console.log(JSON.stringify(result, null, 2));
if (problems.length) { console.error('\nFAIL:\n' + problems.join('\n')); process.exit(1); }
console.log('\nPASS — incomplete sign-up follow-up UI renders and Resend wires through.');
