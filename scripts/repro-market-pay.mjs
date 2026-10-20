// For Sale market, phase 2 (db/0107 payments). Same harness as
// repro-market-sell.mjs (real markup + app parts, stubbed data layer). Drives the real markup + app parts with
// a stubbed data layer to prove the user path end-to-end in a browser:
//   gate hides/shows the entry points → "$ Sell" on a Crypt card → sell modal
//   (fees preview, real-photo upload, a PD-in-stock refusal shown in place,
//   then a successful listing) → For Sale tab (shop card, Make offer with the
//   over-asking guard, offer threads with Accept/Counter on my turn, a paused
//   listing telling the seller PD's price to meet).
// The live PD check + RLS/RPC rules are covered by test/market-rules.test.mjs
// and the SQL harness; this is the UI layer.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';

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

// A real (tiny, noisy) PNG for the photo picker.
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 3 + 1) + 1 + x * 3;
    raw[i] = (x * 7 + y * 3) & 255; raw[i + 1] = (x * y) & 255; raw[i + 2] = (y * 11) & 255;
  }
  const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const photoFile = path.join('/tmp', 'market-real-photo.png');
fs.writeFileSync(photoFile, png(64, 64));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
await page.goto(`http://localhost:${port}/shell?mkt=paid`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window._calls = [];
  window._marketOn = true;
  window._listingReplies = [];   // queued replies for marketListingCall
  window.data = {
    appSettings: {}, isBlocked: () => false,
    featureEnabled: (k) => (k === 'feature.market' ? window._marketOn : false),
    MARKET_FEES: { buyerPct: 5, sellerPct: 5 },
    marketFeeCents: (p, pct) => Math.round(p * pct / 100),
    uploadSocialPhoto: async () => { window._calls.push(['upload']); return `me/photo-${window._calls.length}.jpg`; },
    socialPhotoUrl: async (p) => p,
    marketListingCall: async (body) => {
      window._calls.push(['listing', body]);
      const r = window._listingReplies.shift();
      if (r instanceof Error) throw r;
      return r || { id: 'L-new' };
    },
    browseListings: async () => window._browse || [],
    listMyListings: async () => window._mine || [],
    listMarketOffers: async () => window._offers || [],
    makeMarketOffer: async (...a) => { window._calls.push(['offer', ...a]); },
    respondMarketOffer: async (...a) => { window._calls.push(['respond', ...a]); },
    withdrawMarketOffer: async (...a) => { window._calls.push(['withdraw', ...a]); },
    removeMarketListing: async (...a) => { window._calls.push(['remove', ...a]); },
    listMarketOrders: async () => window._orders || [],
    getMyPayouts: async () => window._payouts || { started: false, ready: false },
    marketPayCall: async (body) => { window._calls.push(['pay', body]); return window._payReply || { ok: true }; },
    marketReturnBase: () => location.origin + location.pathname,
    getFeedbackSummaryBatch: async () => ({}),
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}


const soon = new Date(Date.now() + 6 * 3600e3).toISOString();
const out = await page.evaluate(async (soon) => {
  const o = {};
  try { wireEvents(); } catch (e) { o._wireEventsNote = e.message; }
  window.loadAll = async () => {};
  window.render = () => { if (state.tab === 'trade') renderTrade(); };
  window._toasts = []; window.toast = (m) => window._toasts.push(m);
  window.confirm = () => true;
  document.getElementById('boot-splash')?.remove();
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById('trade-view').classList.remove('hidden');
  state.catalog = [{ id: 'c-bun', handle: 'bun', name: 'Skelly Bun', type: 'Plush', price: 30, accessories: [], images: [], tags: [] }];
  const listing = (id, extra = {}) => ({ name: 'Skelly Bun', priceCents: 4500, shippingCents: 600, status: 'reserved',
    reservedOfferId: id, reservedUntil: soon, ...extra });
  window._offers = [
    // I'm the buyer on an accepted, held deal (not paid yet).
    { id: 'OB', listingId: 'L1', buyerId: 'me', buyerUsername: 'redrambler', sellerId: 's1', sellerUsername: 'ghoulfriend',
      fromRole: 'seller', amountCents: 4000, status: 'accepted', expiresAt: soon, listing: listing('OB') },
    // I'm the seller; buyer paid → I must ship.
    { id: 'OS', listingId: 'L2', buyerId: 'b2', buyerUsername: 'batty', sellerId: 'me', sellerUsername: 'redrambler',
      fromRole: 'buyer', amountCents: 2000, status: 'accepted', expiresAt: soon, listing: listing('OS', { status: 'sold' }) },
    // I'm the buyer; seller shipped → I confirm.
    { id: 'OC', listingId: 'L3', buyerId: 'me', buyerUsername: 'redrambler', sellerId: 's3', sellerUsername: 'mothman',
      fromRole: 'buyer', amountCents: 3000, status: 'accepted', expiresAt: soon, listing: listing('OC', { status: 'sold' }) },
  ];
  window._orders = [
    { id: 'R-S', offerId: 'OS', listingId: 'L2', buyerId: 'b2', sellerId: 'me', status: 'paid', totalCents: 2700, sellerPayoutCents: 2500,
      shipTo: { name: 'Bat Ty', line1: '1 Crypt Ln', city: 'Salem', state: 'MA', postal_code: '01970', country: 'US' } },
    { id: 'R-C', offerId: 'OC', listingId: 'L3', buyerId: 'me', sellerId: 's3', status: 'shipped', totalCents: 3750, sellerPayoutCents: 3450,
      carrier: 'USPS', tracking: '9400111' },
  ];
  window._payouts = { started: false, ready: false };
  state.tab = 'trade'; state.ready.add('trade'); state.tradeSubTab = 'browse';
  await loadMarketData();          // consumes ?mkt=paid
  o.returnLanded = state.tradeSubTab === 'sale' && state.saleFilter === 'offers';
  o.returnToast = window._toasts.at(-1);
  o.urlCleaned = !location.search.includes('mkt=');
  setTradeSubTab('sale');
  updateTradeBadge();
  o.badge = document.getElementById('subtab-sale-badge')?.textContent;
  o.offersText = document.querySelector('#subtab-sale .trade-list').textContent.replace(/\s+/g, ' ');
  return o;
}, soon);

// Buyer pays: Pay button → checkout call with the offer + return base, then Stripe redirect.
await page.evaluate((port) => { window._payReply = { url: `http://localhost:${port}/shell#stripe-checkout` }; }, port);
await page.click('#subtab-sale [data-action="mkt-pay"]');
await page.waitForFunction(() => location.hash === '#stripe-checkout', null, { timeout: 5000 });
let calls = await page.evaluate(() => window._calls);
out.payCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];

// Seller ships: empty fields refused locally, then the call carries both.
await page.click('#subtab-sale [data-action="mkt-ship"]');
out.shipEmptyToast = await page.evaluate(() => window._toasts.at(-1));
await page.fill('#mkt-carrier-R-S', 'USPS');
await page.fill('#mkt-tracking-R-S', '9400 1234');
await page.click('#subtab-sale [data-action="mkt-ship"]');
await page.waitForTimeout(150);
calls = await page.evaluate(() => window._calls);
out.shipCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];

// Buyer confirms arrival.
await page.click('#subtab-sale [data-action="mkt-arrived"]');
await page.waitForTimeout(150);
calls = await page.evaluate(() => window._calls);
out.confirmCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];

// My listings: payouts banner → setup call.
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="mine"]');
out.mineText = (await page.textContent('#subtab-sale')).replace(/\s+/g, ' ');
await page.evaluate((port) => { window._payReply = { url: `http://localhost:${port}/shell#stripe-onboarding` }; }, port);
await page.click('#subtab-sale [data-action="mkt-payouts"]');
await page.waitForFunction(() => location.hash === '#stripe-onboarding', null, { timeout: 5000 });
calls = await page.evaluate(() => window._calls);
out.payoutsCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];

// Ready sellers see the dashboard link instead.
await page.evaluate(async () => { window._payouts = { started: true, ready: true }; await refreshMarket(); });
out.readyBanner = await page.locator('#subtab-sale [data-action="mkt-payouts-dash"]').count();

await page.setViewportSize({ width: 390, height: 844 });
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="offers"]');
await page.screenshot({ path: '/tmp/market-pay-phone.png', fullPage: true });

console.log(JSON.stringify(out, null, 2));
const checks = [
  ['return from Stripe lands on For Sale → Offers', out.returnLanded],
  ['…with a paid toast', /Paid/.test(out.returnToast)],
  ['…and strips ?mkt from the URL', out.urlCleaned],
  ['badge counts pay + ship + confirm', out.badge === '3'],
  ['buyer sees Pay with the full total ($40 + $6 ship + $2 fee = $48)', /Pay \$48\.00/.test(out.offersText)],
  ['seller sees the ship-to address', /1 Crypt Ln/.test(out.offersText) && /Salem MA 01970/.test(out.offersText)],
  ['seller sees what they will be paid', /You’ll get \$25\.00/.test(out.offersText)],
  ['buyer sees tracking + It arrived', /USPS 9400111/.test(out.offersText) && /It arrived/.test(out.offersText)],
  ['Pay calls checkout with offer + return base', out.payCall?.action === 'checkout' && out.payCall?.offerId === 'OB' && /\/shell$/.test(out.payCall?.returnBase)],
  ['empty tracking refused locally', /carrier and tracking/.test(out.shipEmptyToast)],
  ['Mark shipped sends carrier + tracking', out.shipCall?.action === 'ship' && out.shipCall?.orderId === 'R-S' && out.shipCall?.carrier === 'USPS' && out.shipCall?.tracking === '9400 1234'],
  ['It arrived sends confirm', out.confirmCall?.action === 'confirm' && out.confirmCall?.orderId === 'R-C'],
  ['My listings shows Set up payouts', /Set up payouts to get paid/.test(out.mineText)],
  ['Set up payouts calls payouts_setup', out.payoutsCall?.action === 'payouts_setup'],
  ['ready seller sees the payouts dashboard link', out.readyBanner === 1],
  ['no page errors', pageErrors.length === 0],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
