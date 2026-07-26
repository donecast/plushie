// Verify the pending-gifts tray now renders at the TOP of My Crypt (the crypt
// masthead) and NOT in the footer — the fix for "recipient opened the app but
// there was nothing visible to accept the gift" (it was buried in the footer).
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
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  state._myBio = ''; state._myAvatarUrl = null; state._mySocialLinks = {};
  state._myTop8 = []; state._myRelics = []; state._myPosts = []; state.myBlocks = [];
  state.gifts = [
    { id: 'g1', direction: 'in', status: 'pending', otherUsername: 'thegamersdome',
      plushName: 'Blue Plaid Love Rabbit', message: 'Happy Birthday Amber!!!' },
  ];

  renderCryptMasthead();
  renderCryptFooter();

  const masthead = document.getElementById('crypt-masthead');
  const footer = document.getElementById('crypt-footer');
  return {
    mastheadHasTray: !!masthead.querySelector('.gift-row'),
    mastheadHasAccept: !!masthead.querySelector('[data-soc-action="gift-accept"][data-gift-id="g1"]'),
    mastheadShowsMessage: masthead.innerHTML.includes('Happy Birthday Amber'),
    trayIsFirstInMasthead: masthead.firstElementChild?.classList.contains('soc-requests-callout') || false,
    footerHasTray: !!footer.querySelector('.gift-row'),
  };
});

console.log(JSON.stringify(result, null, 2));
const checks = [
  ['tray renders in the masthead (top of My Crypt)', result.mastheadHasTray],
  ['Accept button wired to the gift id', result.mastheadHasAccept],
  ['the gift note is shown', result.mastheadShowsMessage],
  ['tray is the FIRST thing in the masthead (above identity)', result.trayIsFirstInMasthead],
  ['tray is NO LONGER in the footer', result.footerHasTray === false],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
