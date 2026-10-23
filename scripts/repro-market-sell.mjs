// For Sale market, phase 1 (db/0106). Drives the real markup + app parts with
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
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
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
    marketTotals: (i, s) => { const f = Math.round(i * 5 / 100); return { buyerFee: f, sellerFee: f, buyerTotal: i + (s || 0) + f, sellerNet: i - f }; },
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
    marketPayCall: async (body) => { window._calls.push(['pay', body]); return window._payReply || { ok: true }; },
    marketReturnBase: () => location.origin + location.pathname,
    getFeedbackSummaryBatch: async () => ({}),
  };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const out = await page.evaluate(async () => {
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
  state.collection = [{ id: 'p1', name: 'Skelly Bun', catalogId: 'c-bun', catalogHandle: 'bun', quantity: 1,
    missingAccessories: [], damagedAccessories: [], visibility: 'friends', addedAt: Date.now() }];

  // ── Gate ──
  window._marketOn = false;
  o.gateOffNoSellBtn = !cardActionsHtml(state.collection[0], 'collection').includes('sell-item');
  state.tab = 'trade'; state.ready.add('trade'); state.tradeSubTab = 'sale';
  renderTrade();
  o.gateOffTabHidden = document.getElementById('subtab-sale-btn').classList.contains('hidden');
  o.gateOffFallsBackToBrowse = state.tradeSubTab === 'browse';
  window._marketOn = true;
  renderTrade();
  o.gateOnTabShown = !document.getElementById('subtab-sale-btn').classList.contains('hidden');
  o.gateOnSellBtn = cardActionsHtml(state.collection[0], 'collection').includes('data-action="sell-item"');
  return o;
});

// ── The real card click opens the sell modal ──
await page.evaluate(() => {
  const grid = document.createElement('div');
  grid.id = 'test-card-host';
  grid.innerHTML = `<div class="card-actions">${cardActionsHtml(state.collection[0], 'collection')}</div>`;
  grid.addEventListener('click', onCardClick);
  document.body.appendChild(grid);
});
await page.click('#test-card-host [data-action="sell-item"]');
await page.waitForTimeout(100);
// First time: the Seller Agreement comes first, and Accept needs the checkbox.
out.termsShownFirst = await page.isVisible('#seller-terms-modal') && !(await page.isVisible('#market-sell-modal'));
out.termsHasFeeRule = /owed whether or not you fulfill the order/.test(await page.textContent('#st-body'));
out.acceptDisabledUntilChecked = await page.isDisabled('#st-accept');
await page.locator('#seller-terms-modal .modal-card').screenshot({ path: '/tmp/seller-terms-modal.png' });
await page.check('#st-check');
await page.click('#st-accept');
await page.waitForTimeout(150);
out.termsAccepted = (await page.evaluate(() => window._calls)).some((c) => c[0] === 'acceptTerms');
out.sellModalOpens = await page.isVisible('#market-sell-modal') && !(await page.isVisible('#seller-terms-modal'));
out.sellModalName = await page.textContent('#ms-name');

await page.fill('#ms-price', '40');
out.feeText = await page.textContent('#ms-fees');
out.servicesShown = await page.locator('#ms-services [data-ms-service]').count();
await page.waitForSelector('#msf-name');               // no ship-from saved → form

// No weight yet → refused locally.
await page.click('#ms-save');
out.noWeightError = await page.textContent('#ms-error');
await page.fill('#ms-weight-lb', '1');
await page.fill('#ms-weight-oz', '4');
// Bad ship-from → refused locally.
await page.click('#ms-save');
out.noShipFromError = await page.textContent('#ms-error');
await page.fill('#msf-name', 'Red Rambler');
await page.fill('#msf-street1', '13 Hollow Rd');
await page.fill('#msf-city', 'Sleepy Hollow');
await page.fill('#msf-state', 'ny');
await page.fill('#msf-zip', '10591');
await page.check('#ms-services [data-ms-service="usps_priority"]');
await page.locator('#market-sell-modal .modal-card').screenshot({ path: '/tmp/market-sell-modal.png' });

// No photo yet → refused locally, nothing sent.
await page.click('#ms-save');
out.noPhotoError = await page.textContent('#ms-error');

await page.setInputFiles('#ms-photo-input', photoFile);
await page.waitForFunction(() => state.sellDraft?.photos.length === 1, null, { timeout: 5000 });
out.photoShown = await page.locator('#ms-photos img').count();

// PD has it in stock → server refuses; message shown in place, modal stays.
await page.evaluate(() => {
  const e = new Error('Plushie Dreadfuls is selling this right now ($30.00), so it can\'t be listed.');
  e.code = 'PD_IN_STOCK';
  window._listingReplies.push(e);
});
await page.click('#ms-save');
await page.waitForFunction(() => !document.getElementById('ms-error').classList.contains('hidden') && /selling this right now/.test(document.getElementById('ms-error').textContent), null, { timeout: 5000 });
out.pdRefusalShown = await page.textContent('#ms-error');
out.modalStillOpenAfterRefusal = await page.isVisible('#market-sell-modal');

// Retry succeeds — and the photo is not uploaded a second time.
await page.click('#ms-save');
await page.waitForFunction(() => document.getElementById('market-sell-modal').classList.contains('hidden'), null, { timeout: 5000 });
const calls = await page.evaluate(() => window._calls);
out.uploadsTotal = calls.filter((c) => c[0] === 'upload').length;
const lastListing = calls.filter((c) => c[0] === 'listing').at(-1)?.[1];
out.createBody = lastListing;
out.shipFromCall = calls.filter((c) => c[0] === 'shipFrom').at(-1)?.[1];
out.listingCalls = calls.filter((c) => c[0] === 'listing').length;   // refusal + success only

// ── For Sale tab ──
await page.evaluate(async () => {
  const soon = new Date(Date.now() + 3600e3).toISOString();
  window._browse = [{
    id: 'L1', sellerId: 'seller1', sellerUsername: 'ghoulfriend', catalogId: 'c-bun', name: 'Skelly Bun',
    priceCents: 4500, shippingCents: 0, shipServices: ['usps_ground', 'usps_priority'], notes: 'Tag attached', extras: [{ name: 'Bag', included: true }],
    status: 'active', pdState: 'sold_out', pdPriceCents: 3000, photos: [{ url: 'me/x.jpg' }], photo: 'me/x.jpg',
  }];
  window._mine = [{
    id: 'L9', sellerId: 'me', catalogId: 'c-bun', name: 'Skelly Bun', priceCents: 5000, shippingCents: 0, shipServices: ['usps_ground'],
    status: 'paused', pauseReason: 'pd_restocked', pdState: 'in_stock_capped', pdPriceCents: 3000, photos: [],
  }];
  window._offers = [{
    id: 'O1', listingId: 'L9', buyerId: 'buyer1', buyerUsername: 'batty', sellerId: 'me', sellerUsername: 'redrambler',
    fromRole: 'buyer', amountCents: 4000, message: 'Would you take 40?', status: 'pending', expiresAt: soon,
    listing: { name: 'Skelly Bun', priceCents: 5000, shippingCents: 0, status: 'paused' },
  }];
  state.saleFilter = 'shop';
  state.tab = 'trade';
  await loadMarketData();
  setTradeSubTab('sale');
  updateTradeBadge();
});
out.saleBadge = await page.textContent('#subtab-sale-badge');
out.shopCardText = (await page.textContent('#subtab-sale .trade-offer-row')).replace(/\s+/g, ' ').trim();

// Make offer through the real Trade-tab click dispatcher.
await page.click('#subtab-sale [data-action="mkt-offer"]');
out.offerModalOpens = await page.isVisible('#market-offer-modal');
await page.fill('#mo-amount', '50');
await page.click('#mo-send');
out.overAskError = await page.textContent('#mo-error');
await page.fill('#mo-amount', '38.50');
out.offerHint = await page.textContent('#mo-hint');
await page.click('#mo-send');
await page.waitForFunction(() => document.getElementById('market-offer-modal').classList.contains('hidden'), null, { timeout: 5000 });
out.offerCall = (await page.evaluate(() => window._calls)).filter((c) => c[0] === 'offer').at(-1);
out.landedOnOffers = await page.evaluate(() => state.saleFilter);

// Offers view: my turn → Accept / Counter / Decline; accepting calls the RPC.
out.offersViewText = (await page.textContent('#subtab-sale .trade-list')).replace(/\s+/g, ' ').trim();
out.hasAccept = await page.locator('#subtab-sale [data-action="mkt-accept"]').count();
await page.click('#subtab-sale [data-action="mkt-accept"]');
await page.waitForTimeout(100);
out.acceptCall = (await page.evaluate(() => window._calls)).filter((c) => c[0] === 'respond').at(-1);

// My listings: the paused one names PD's price to meet.
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="mine"]');
out.mineText = (await page.textContent('#subtab-sale .grid')).replace(/\s+/g, ' ').trim();

// Phone width: the shop card still fits.
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="shop"]');
out.phoneOverflow = await page.evaluate(() => {
  const el = document.querySelector('#subtab-sale .trade-offer-row');
  return el ? el.scrollWidth > el.clientWidth + 1 : 'missing';
});
await page.screenshot({ path: '/tmp/market-shop-phone.png', fullPage: false });

console.log(JSON.stringify(out, null, 2));
const checks = [
  ['gate off: no $ Sell button on cards', out.gateOffNoSellBtn],
  ['gate off: For Sale sub-tab hidden', out.gateOffTabHidden],
  ['gate off: a stale sale sub-tab falls back to Browse', out.gateOffFallsBackToBrowse],
  ['gate on: For Sale sub-tab shown', out.gateOnTabShown],
  ['gate on: $ Sell button on a catalog card', out.gateOnSellBtn],
  ['first Sell shows the Seller Agreement first', out.termsShownFirst],
  ['…which states the seller fee is owed either way', out.termsHasFeeRule],
  ['…Accept is disabled until the box is checked', out.acceptDisabledUntilChecked],
  ['…accepting records it, then the sell modal opens', out.termsAccepted && out.sellModalOpens],
  ['…named for the item', out.sellModalName === 'Skelly Bun'],
  ['fee preview: fee on price only, shipping separate (buyer $42.00 + shipping, seller nets $38.00)', /Buyer pays \$42\.00/.test(out.feeText) && /\+ shipping/.test(out.feeText) && /You get \$38\.00/.test(out.feeText)],
  ['all 4 shipping services offered as checkboxes', out.servicesShown === 4],
  ['no weight → local error', /weight/.test(out.noWeightError)],
  ['incomplete ship-from → local error', /Ship-from address/.test(out.noShipFromError)],
  ['ship-from saved (state upper-cased) before listing', out.shipFromCall?.state === 'NY' && out.shipFromCall?.zip === '10591' && out.shipFromCall?.name === 'Red Rambler'],
  ['no photo → local error, nothing sent', /photo/i.test(out.noPhotoError) && out.listingCalls === 2],
  ['picked photo shows in the grid', out.photoShown === 1],
  ['PD-in-stock refusal shown in the modal', /selling this right now/.test(out.pdRefusalShown)],
  ['…and the modal stays open', out.modalStillOpenAfterRefusal],
  ['retry does not re-upload the photo', out.uploadsTotal === 1],
  ['create call carries plushie + cents + photo', out.createBody?.action === 'create' && out.createBody?.plushieId === 'p1'
    && out.createBody?.priceCents === 4000 && out.createBody?.photoPaths?.length === 1
    && out.createBody?.parcel?.preset === 'mailer' && out.createBody?.parcel?.weightOz === 20
    && JSON.stringify(out.createBody?.services) === JSON.stringify(['usps_ground', 'usps_priority'])
    && !('shippingCents' in (out.createBody || {}))],
  ['badge counts the offer awaiting me', out.saleBadge === '1'],
  ['shop card shows price, shipping-at-checkout + services, PD state, seller', /\$45\.00/.test(out.shopCardText) && /shipping at checkout/.test(out.shopCardText)
    && /Ships USPS Ground Advantage · USPS Priority Mail/.test(out.shopCardText)
    && /Sold out at Plushie Dreadfuls/.test(out.shopCardText) && /ghoulfriend/.test(out.shopCardText)],
  ['Make offer opens the offer modal', out.offerModalOpens],
  ['offer over asking is refused locally', /over the asking price/.test(out.overAskError)],
  ['offer hint shows price + 5% fee, plus shipping at checkout', /\$40\.43/.test(out.offerHint) && /plus shipping/.test(out.offerHint)],
  ['offer RPC called with cents', JSON.stringify(out.offerCall) === JSON.stringify(['offer', 'L1', 3850, null])],
  ['after sending, lands on Offers', out.landedOnOffers === 'offers'],
  ['offers view shows the incoming $40 offer', /They offered \$40\.00/.test(out.offersViewText) && /Your turn/.test(out.offersViewText)],
  ['Accept button present on my turn', out.hasAccept === 1],
  ['accept calls the RPC', JSON.stringify(out.acceptCall) === JSON.stringify(['respond', 'O1', 'accept'])],
  ['paused listing names PD’s $30.00 cap', /Paused/.test(out.mineText) && /\$30\.00 or lower/.test(out.mineText)],
  ['phone: shop card does not overflow', out.phoneOverflow === false],
  ['no page errors', pageErrors.length === 0],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
