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
    marketTotals: (i, s) => { const f = Math.round(i * 5 / 100); const sf = Math.min(i, Math.max(100, f)); return { buyerFee: f, sellerFee: sf, buyerTotal: i + (s || 0) + f, sellerNet: i - sf }; },
    SHIP_SERVICES: [{ key: 'usps_ground', label: 'USPS Ground Advantage' }, { key: 'usps_priority', label: 'USPS Priority Mail' }, { key: 'usps_express', label: 'USPS Priority Mail Express' }, { key: 'fedex_ground', label: 'FedEx Ground' }],
    PARCEL_PRESETS: [{ key: 'mailer', label: 'Poly mailer (10×13)' }, { key: 'small', label: 'Small box (8×6×4)' }],
    shipServiceLabel: (k) => ({ usps_ground: 'USPS Ground Advantage', usps_priority: 'USPS Priority Mail' }[k] || k),
    getMyShipFrom: async () => window._shipFrom ?? null,
    hasAcceptedSellerTerms: async () => !!window._termsOk,
    acceptSellerTerms: async () => { window._calls.push(['acceptTerms']); window._termsOk = true; },
    getMySellerOwedCents: async () => window._owed || 0,
    saveMyShipFrom: async (a) => { window._calls.push(['shipFrom', a]); },
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
    marketPayCall: async (body) => { window._calls.push(['pay', body]); const r = window._payReply; return typeof r === 'function' ? r(body) : (r || { ok: true }); },
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
  const listing = (id, extra = {}) => ({ name: 'Skelly Bun', priceCents: 4500, shippingCents: 0, shipServices: ['usps_ground', 'usps_priority'], status: 'reserved',
    reservedOfferId: id, reservedUntil: soon, ...extra });
  window._offers = [
    // I'm the buyer on an accepted, held deal (not paid yet).
    { id: 'OB', listingId: 'L1', buyerId: 'me', buyerUsername: 'redrambler', sellerId: 's1', sellerUsername: 'ghoulfriend',
      fromRole: 'seller', amountCents: 4000, status: 'accepted', expiresAt: soon, listing: listing('OB') },
    // I'm the seller; buyer paid → I must ship.
    { id: 'OS', listingId: 'L2', buyerId: 'b2', buyerUsername: 'batty', sellerId: 'me', sellerUsername: 'redrambler',
      fromRole: 'buyer', amountCents: 2000, status: 'accepted', expiresAt: soon, listing: listing('OS', { status: 'sold' }) },
    // I'm the seller on a second paid deal whose label purchase failed.
    { id: 'OS2', listingId: 'L4', buyerId: 'b4', buyerUsername: 'ghast', sellerId: 'me', sellerUsername: 'redrambler',
      fromRole: 'buyer', amountCents: 1500, status: 'accepted', expiresAt: soon, listing: listing('OS2', { status: 'sold' }) },
    // I'm the buyer; it was delivered → I can pay the seller now.
    { id: 'OC', listingId: 'L3', buyerId: 'me', buyerUsername: 'redrambler', sellerId: 's3', sellerUsername: 'mothman',
      fromRole: 'buyer', amountCents: 3000, status: 'accepted', expiresAt: soon, listing: listing('OC', { status: 'sold' }) },
  ];
  window._orders = [
    { id: 'R-S', offerId: 'OS', listingId: 'L2', buyerId: 'b2', sellerId: 'me', status: 'paid', totalCents: 2610, sellerPayoutCents: 1900,
      shipService: 'usps_ground', labelUrl: 'https://easypost.example/label.png', carrier: 'USPS', tracking: '9400111', trackingStatus: 'pre_transit' },
    { id: 'R-S2', offerId: 'OS2', listingId: 'L4', buyerId: 'b4', sellerId: 'me', status: 'paid', totalCents: 2085, sellerPayoutCents: 1425,
      shipService: 'usps_ground', labelError: 'rate expired' },
    { id: 'R-C', offerId: 'OC', listingId: 'L3', buyerId: 'me', sellerId: 's3', status: 'delivered', totalCents: 3660, sellerPayoutCents: 2850,
      shipService: 'usps_priority', carrier: 'USPS', tracking: '9400222', trackingStatus: 'delivered' },
  ];
  window._payouts = { started: false, ready: false };
  window._owed = 125;
  window._termsOk = true;
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

// Buyer checks out: modal → address → live rates → pick → Stripe.
await page.evaluate((port) => {
  window._payReply = (body) => body.action === 'quote'
    ? { shipmentId: 'shp_1', options: [
        { rateId: 'rate_g', key: 'usps_ground', label: 'USPS Ground Advantage', cents: 510, days: 4 },
        { rateId: 'rate_p', key: 'usps_priority', label: 'USPS Priority Mail', cents: 985, days: 2 }] }
    : body.action === 'checkout' ? { url: `http://localhost:${port}/shell#stripe-checkout` } : { ok: true };
}, port);
await page.click('#subtab-sale [data-action="mkt-pay"]');
out.payModalOpens = await page.isVisible('#market-pay-modal');
out.payDisabledBeforeRates = await page.isDisabled('#mp-pay');
await page.click('#mp-rates');
out.badAddressError = await page.textContent('#mp-error');
await page.fill('#mp-name', 'Red Rambler');
await page.fill('#mp-street1', '13 Hollow Rd');
await page.fill('#mp-city', 'Sleepy Hollow');
await page.fill('#mp-state', 'ny');
await page.fill('#mp-zip', '10591');
await page.click('#mp-rates');
await page.waitForSelector('#mp-options [data-mp-rate]');
let calls = await page.evaluate(() => window._calls);
out.quoteCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];
out.optionsText = (await page.textContent('#mp-options')).replace(/\s+/g, ' ');
out.payLabelCheapest = await page.textContent('#mp-pay');
await page.check('#mp-options [data-mp-rate="rate_p"]');
out.payLabelPriority = await page.textContent('#mp-pay');
await page.locator('#market-pay-modal .modal-card').screenshot({ path: '/tmp/market-checkout-modal.png' });
// Editing the address throws the rates away.
await page.fill('#mp-zip', '10592');
out.ratesClearedOnEdit = (await page.locator('#mp-options [data-mp-rate]').count()) === 0 && await page.isDisabled('#mp-pay');
await page.fill('#mp-zip', '10591');
await page.click('#mp-rates');
await page.waitForSelector('#mp-options [data-mp-rate]');
await page.check('#mp-options [data-mp-rate="rate_p"]');
await page.click('#mp-pay');
await page.waitForFunction(() => location.hash === '#stripe-checkout', null, { timeout: 5000 });
calls = await page.evaluate(() => window._calls);
out.payCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];
await page.evaluate(() => closeMarketPayModal());

// Seller cancel: the confirm names the seller fee that still applies.
await page.evaluate(() => {
  window._orders.find((o) => o.id === 'R-S').sellerFeeCents = 100;
  window._confirmText = null;
  window.confirm = (t) => { window._confirmText = t; return false; };
});
await page.click('#subtab-sale [data-action="mkt-refund"][data-id="R-S"]');
out.refundConfirm = await page.evaluate(() => window._confirmText);
await page.evaluate(() => { window.confirm = () => true; });

// Seller whose label failed retries it.
await page.click('#subtab-sale [data-action="mkt-label-retry"]');
await page.waitForTimeout(150);
calls = await page.evaluate(() => window._calls);
out.retryCall = calls.filter((c) => c[0] === 'pay').at(-1)?.[1];

// Buyer of a delivered order pays the seller early.
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
  ['badge counts pay + 2 to ship + confirm', out.badge === '4'],
  ['buyer sees Checkout with price + fee + shipping services', /Checkout/.test(out.offersText) && /\$40\.00 \+ \$2\.00 buyer fee \+ shipping \(USPS Ground Advantage · USPS Priority Mail\)/.test(out.offersText)],
  ['seller with a label sees Print shipping label', /Print shipping label/.test(out.offersText)],
  ['seller sees payout (item − fee, shipping excluded)', /You’ll get \$19\.00 3 days after it’s delivered/.test(out.offersText)],
  ['seller with a failed label sees Try again', /Try the label again/.test(out.offersText)],
  ['buyer of a delivered order sees tracking + pay-now button', /USPS 9400222/.test(out.offersText) && /All good — pay the seller/.test(out.offersText)],
  ['Checkout opens the modal with Pay disabled', out.payModalOpens && out.payDisabledBeforeRates],
  ['incomplete address refused locally', /name, street and city/.test(out.badAddressError)],
  ['quote sends offer + cleaned address', out.quoteCall?.action === 'quote' && out.quoteCall?.offerId === 'OB' && out.quoteCall?.address?.state === 'NY' && out.quoteCall?.address?.zip === '10591'],
  ['rates listed cheapest first with prices', /USPS Ground Advantage.*\$5\.10.*USPS Priority Mail.*\$9\.85/.test(out.optionsText)],
  ['cheapest preselected: Pay $47.10 ($40 + $5.10 + $2)', /Pay \$47\.10/.test(out.payLabelCheapest)],
  ['picking Priority updates Pay to $51.85', /Pay \$51\.85/.test(out.payLabelPriority)],
  ['editing the address clears the rates', out.ratesClearedOnEdit],
  ['Pay sends shipment + chosen rate + return base', out.payCall?.action === 'checkout' && out.payCall?.shipmentId === 'shp_1' && out.payCall?.rateId === 'rate_p' && /\/shell$/.test(out.payCall?.returnBase)],
  ['label retry calls label_retry', out.retryCall?.action === 'label_retry' && out.retryCall?.orderId === 'R-S2'],
  ['pay-now sends confirm', out.confirmCall?.action === 'confirm' && out.confirmCall?.orderId === 'R-C'],
  ['My listings shows Set up payouts', /Set up payouts to get paid/.test(out.mineText)],
  ['My listings shows seller fees owed', /You owe \$1\.25 in seller fees/.test(out.mineText)],
  ['seller cancel warns the $1.00 seller fee still applies; buyer refunded in full', /refund the buyer in full/.test(out.refundConfirm || '') && /\$1\.00 seller fee still applies/.test(out.refundConfirm || '')],
  ['Set up payouts calls payouts_setup', out.payoutsCall?.action === 'payouts_setup'],
  ['ready seller sees the payouts dashboard link', out.readyBanner === 1],
  ['no page errors', pageErrors.length === 0],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
