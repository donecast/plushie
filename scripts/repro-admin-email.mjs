// Verify the admin Users table renders the new Email column against the real
// app parts: header cell, a mailto link for a user with an email, and an em
// dash for a user missing one. Also checks buildUsersCsv includes the email.
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott', isAdmin: true, canModerate: true };
  window.data = { appSettings: {} };
  window.state = window.state || {};
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  if (!document.getElementById('admin-content')) {
    const d = document.createElement('div');
    d.id = 'admin-content';
    document.body.appendChild(d);
  }
  state.adminUsers = [
    { id: 'me', username: 'scott', email: 'scott@donecast.com', full_name: 'Scott', is_admin: true,
      created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-07-01T00:00:00Z',
      collection_count: 3, wishlist_count: 1, for_trade_count: 0,
      feedback: { good_count: 0, meh_count: 0, bad_count: 0, total_count: 0 } },
    { id: 'u2', username: 'noemail', email: null, full_name: null, is_admin: false,
      created_at: '2026-02-02T00:00:00Z', last_seen_at: null,
      collection_count: 0, wishlist_count: 0, for_trade_count: 0,
      feedback: { good_count: 0, meh_count: 0, bad_count: 0, total_count: 0 } },
  ];
  state.adminIncompleteSignups = [
    { id: 'a1', email: 'never@example.com', created_at: '2026-07-08T07:43:37Z', last_sign_in_at: null, confirmed: false },
    { id: 'a2', email: 'bailed@example.com', created_at: '2026-06-25T00:00:20Z', last_sign_in_at: '2026-06-25T00:01:15Z', confirmed: true },
  ];
  renderAdminUserList();
  const html = document.getElementById('admin-content').innerHTML;
  const headers = [...document.querySelectorAll('#admin-content thead th')].map((t) => t.textContent);
  const mailto = document.querySelector('#admin-content .admin-email a');
  const csv = buildUsersCsv(state.adminUsers).split('\r\n');
  const tables = document.querySelectorAll('#admin-content table.admin-table');
  const incompleteTable = tables[tables.length - 1];
  const incompleteRows = [...incompleteTable.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent));
  const incompleteDeleteBtns = [...incompleteTable.querySelectorAll(
    'tbody tr [data-admin-action="delete-incomplete-signup"]')].map((b) => b.dataset.uid);
  return {
    headers,
    mailtoHref: mailto?.getAttribute('href') || null,
    mailtoText: mailto?.textContent || null,
    emailColsPerRow: [...document.querySelectorAll('#admin-content table.admin-table')[0].querySelectorAll('tbody tr')]
      .map((tr) => tr.querySelector('.admin-email')?.textContent),
    csvHeader: csv[0],
    csvRow1: csv[1],
    hasIncompleteHeading: /Incomplete sign-ups/.test(html),
    incompleteHeaders: [...incompleteTable.querySelectorAll('thead th')].map((t) => t.textContent),
    incompleteRows,
    incompleteDeleteBtns,
  };
});
await browser.close();
server.close();

const problems = [];
if (!result.headers.includes('Email')) problems.push(`missing Email header; got ${JSON.stringify(result.headers)}`);
if (result.mailtoHref !== 'mailto:scott@donecast.com') problems.push(`bad mailto href: ${result.mailtoHref}`);
if (result.mailtoText !== 'scott@donecast.com') problems.push(`bad mailto text: ${result.mailtoText}`);
if (result.emailColsPerRow[1] !== '—') problems.push(`missing-email row should show em dash; got ${JSON.stringify(result.emailColsPerRow)}`);
if (!/^Username,Email,/.test(result.csvHeader)) problems.push(`csv header: ${result.csvHeader}`);
if (!result.csvRow1.includes('scott@donecast.com')) problems.push(`csv row missing email: ${result.csvRow1}`);
if (!result.hasIncompleteHeading) problems.push('missing "Incomplete sign-ups" heading');
if (result.incompleteHeaders.join(',') !== 'Email,Signed up,Last sign-in,Status,') problems.push(`incomplete headers: ${result.incompleteHeaders}`);
if (result.incompleteRows.length !== 2) problems.push(`expected 2 incomplete rows; got ${result.incompleteRows.length}`);
if (result.incompleteRows[0]?.[3] !== 'Never verified email') problems.push(`row0 status: ${result.incompleteRows[0]?.[3]}`);
if (result.incompleteRows[1]?.[3] !== 'Signed in, never chose a username') problems.push(`row1 status: ${result.incompleteRows[1]?.[3]}`);
if (result.incompleteDeleteBtns.join(',') !== 'a1,a2') problems.push(`expected a Delete button per incomplete row wired to its uid; got ${JSON.stringify(result.incompleteDeleteBtns)}`);

console.log(JSON.stringify(result, null, 2));
if (problems.length) { console.error('\nFAIL:\n' + problems.join('\n')); process.exit(1); }
console.log('\nPASS — Email column + Incomplete sign-ups section render correctly, CSV includes email.');
