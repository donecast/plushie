// For Sale launch fixes (db/0112 contract). Unlike repro-market-sell/pay, this
// loads the REAL data.js on top of a stubbed Supabase client (`sb`), so the
// gate (market_allowed rpc), the edge-function error path and the admin
// writes are the shipping code — only the market reads are stubbed.
//   node scripts/repro-market-launch.mjs
// Covers: the server-driven gate for a non-admin (on / off / rpc failure),
// test-mode banner, load-failed + Retry, the Stripe return surviving a failed
// load, report-a-problem, label retry after 2 minutes, lapsed holds, withheld
// payouts, payouts-before-accept, friendly errors, notification landing,
// phone discoverability, and the admin tools.
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

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
await page.goto(`http://localhost:${port}/shell?mkt=paid`, { waitUntil: 'domcontentloaded' });

// ── Stubbed Supabase client + globals, then the real data.js ──
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'plaincollector', isAdmin: false };
  window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window._sb = [];            // every table call: [table, [method, args]…]
  window._rpc = [];           // every rpc: [fn, args]
  window._fn = [];            // every functions.invoke: [name, body]
  window._rpcReply = {};      // fn → { data, error } | Error
  window._fnReply = null;     // (name, body) → { data, error }
  const chain = (rec) => new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res) => res({ data: [], error: null });
      return (...args) => { rec.push([prop, args]); return chain(rec); };
    },
  });
  window.sb = {
    from: (table) => { const rec = [table]; window._sb.push(rec); return chain(rec); },
    rpc: async (fn, args) => {
      window._rpc.push([fn, args]);
      const r = window._rpcReply[fn];
      if (r instanceof Error) throw r;
      return r || { data: null, error: null };
    },
    functions: { invoke: async (name, { body }) => {
      window._fn.push([name, body]);
      return window._fnReply ? window._fnReply(name, body) : { data: { ok: true }, error: null };
    } },
  };
});
await page.addScriptTag({ url: `http://localhost:${port}/data.js` });
await page.evaluate(() => {
  // Market reads are stubbed (the queries themselves are checked in the Node
  // half below); everything else in `data` is real.
  window._fail = {};          // read name → Error to throw
  const read = (name, fn) => async (...a) => { if (window._fail[name]) throw window._fail[name]; return fn(...a); };
  Object.assign(data, {
    isBlocked: () => false,
    getMyShipFrom: async () => null,
    hasAcceptedSellerTerms: read('hasAcceptedSellerTerms', async () => true),
    getMySellerOwedCents: read('getMySellerOwedCents', async () => 0),
    socialPhotoUrl: async (p) => p,
    browseListings: read('browseListings', async () => window._browse || []),
    listMyListings: read('listMyListings', async () => window._mine || []),
    listMarketOffers: read('listMarketOffers', async () => window._offers || []),
    listMarketOrders: read('listMarketOrders', async () => window._orders || []),
    getMyPayouts: read('getMyPayouts', async () => window._payouts || { started: false, ready: false }),
    respondMarketOffer: async (...a) => { window._calls.push(['respond', ...a]); if (window._respondError) throw window._respondError; },
    makeMarketOffer: async (...a) => { window._calls.push(['offer', ...a]); },
    getFeedbackSummaryBatch: async () => ({}),
    adminListMarketOrders: async () => window._adminOrders || [],
    track: () => {},
  });
  window._calls = [];
  window._payCalls = () => window._fn.filter((c) => c[0] === 'market-checkout').map((c) => c[1]);
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const soon = new Date(Date.now() + 6 * 3600e3).toISOString();
const past = new Date(Date.now() - 6 * 3600e3).toISOString();
const out = {};

// ── 1. Setup + the gate, for a NON-admin ──
Object.assign(out, await page.evaluate(async () => {
  const o = {};
  try { wireEvents(); } catch (e) { o._wireEventsNote = e.message; }
  window.loadAll = async () => {};
  window.render = () => { if (state.tab === 'trade') renderTrade(); if (state.tab === 'admin') renderAdmin(); };
  window._toasts = []; window.toast = (m) => window._toasts.push(m);
  window._confirms = []; window._confirmAnswer = true;
  window.confirm = (t) => { window._confirms.push(t); return window._confirmAnswer; };
  // The Trade tab's click handler reloads trade data; only the market half matters here.
  window.loadTradeData = async () => { if (marketEnabled()) await loadMarketData(); };
  document.getElementById('boot-splash')?.remove();
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById('trade-view').classList.remove('hidden');
  state.catalog = [{ id: 'c-bun', handle: 'bun', name: 'Skelly Bun', type: 'Plush', price: 30, accessories: [], images: [], tags: [] }];
  state.collection = [{ id: 'p1', name: 'Skelly Bun', catalogId: 'c-bun', catalogHandle: 'bun', quantity: 1,
    missingAccessories: [], damagedAccessories: [], visibility: 'friends', addedAt: Date.now() }];
  state.tab = 'trade'; state.ready.add('trade');
  const entryPoints = () => {
    state.tradeSubTab = 'browse';
    renderTrade();
    const door = !!document.querySelector('#subtab-browse [data-action="mkt-open-sale"]');
    state.tradeSubTab = 'sale';
    renderTrade();
    return {
      tab: !document.getElementById('subtab-sale-btn').classList.contains('hidden'),
      sell: cardActionsHtml(state.collection[0], 'collection').includes('data-action="sell-item"'),
      door,
      stayedOnSale: state.tradeSubTab === 'sale',
    };
  };
  // Before the server has answered: closed.
  o.gateBeforeLoad = entryPoints();
  // Server says yes for this ordinary member.
  window._rpcReply.market_allowed = { data: true, error: null };
  await data.loadAppSettings();
  o.gateRpc = window._rpc.find((c) => c[0] === 'market_allowed');
  o.gateOn = entryPoints();
  // Server says no.
  window._rpcReply.market_allowed = { data: false, error: null };
  await data.loadAppSettings();
  o.gateOff = entryPoints();
  // …and an admin gets no client-side shortcut either.
  window.currentUser = { id: 'me', username: 'redrambler', isAdmin: true };
  await data.loadAppSettings();
  o.gateOffAdmin = entryPoints();
  window.currentUser = { id: 'me', username: 'plaincollector', isAdmin: false };
  // The rpc itself failing closes the market (fail closed).
  window._rpcReply.market_allowed = { data: null, error: { message: 'boom' } };
  await data.loadAppSettings();
  o.gateRpcError = entryPoints();
  // A '#trade-sale' notification can't open what isn't allowed.
  state.tradeSubTab = 'browse';
  goToTabFromNotification('trade-sale');
  await new Promise((r) => setTimeout(r, 50));
  o.gateOffHashStaysBrowse = state.tradeSubTab === 'browse';
  window._rpcReply.market_allowed = { data: true, error: null };
  await data.loadAppSettings();
  return o;
}));

// ── 2. Stripe return survives a failed load; load-failed + Retry; test banner ──
Object.assign(out, await page.evaluate(async () => {
  const o = {};
  window._fnReply = (name, body) => (body.action === 'config'
    ? { data: { testMode: window._testMode }, error: null } : { data: { ok: true }, error: null });
  window._testMode = false;
  window._fail.listMarketOrders = new Error('column market_orders.problem_note does not exist');
  state.tradeSubTab = 'browse';
  await loadMarketData();                       // page was opened with ?mkt=paid
  o.paidToastDespiteFailure = window._toasts.some((t) => /Paid/.test(t));
  o.urlCleaned = !location.search.includes('mkt=');
  o.landedOnSale = state.tab === 'trade' && state.tradeSubTab === 'sale' && state.saleFilter === 'offers';
  renderTrade();
  const sale = document.getElementById('subtab-sale');
  o.failText = sale.textContent.replace(/\s+/g, ' ').trim();
  o.failHasRetry = !!sale.querySelector('[data-action="mkt-retry"]');
  o.failNoFakeEmpty = !/Nothing for sale yet|No offers yet|Nothing listed yet/.test(sale.textContent);
  delete window._fail.listMarketOrders;
  return o;
}));
await page.click('#subtab-sale [data-action="mkt-retry"]');
await page.waitForSelector('#subtab-sale .trade-filters');
Object.assign(out, await page.evaluate(async () => {
  const o = {};
  o.retryRecovered = !document.querySelector('#subtab-sale [data-action="mkt-retry"]');
  o.bannerHiddenWhenLive = !document.querySelector('#subtab-sale .mkt-preview-banner');
  o.configAsked = window._payCalls().filter((b) => b.action === 'config').length;
  state.marketTestMode = null; window._testMode = true;
  await refreshMarket();
  o.bannerShownInTestMode = /test mode/.test(document.querySelector('#subtab-sale .mkt-preview-banner')?.textContent || '');
  state.marketTestMode = null; window._testMode = false;
  await refreshMarket();
  return o;
}));

// ── 3. Orders: report a problem, labels, lapsed holds, withheld payout ──
await page.evaluate(({ soon, past }) => {
  const listing = (id, extra = {}) => ({ name: 'Skelly Bun', priceCents: 4500, shippingCents: 0, shipServices: ['usps_ground'],
    status: 'sold', reservedOfferId: id, reservedUntil: soon, ...extra });
  const offer = (id, listingId, iBuy, extra = {}) => ({ id, listingId, buyerId: iBuy ? 'me' : `b-${id}`, buyerUsername: iBuy ? 'plaincollector' : 'batty',
    sellerId: iBuy ? `s-${id}` : 'me', sellerUsername: iBuy ? 'ghoulfriend' : 'plaincollector', fromRole: 'buyer', amountCents: 3000,
    status: 'accepted', expiresAt: soon, listing: listing(id), ...extra });
  window._offers = [
    offer('O-DEL', 'L1', true),                                   // I bought; delivered
    offer('O-SHIP', 'L2', true),                                  // I bought; shipped
    offer('O-PROB', 'L3', false),                                 // I sold; buyer reported a problem
    offer('O-WAIT', 'L4', false),                                 // I sold; paid 5 min ago, no label, no error
    offer('O-NEW', 'L5', false),                                  // I sold; paid just now, no label yet
    offer('O-ERR', 'L6', false),                                  // I sold; label error recorded
    offer('O-REL', 'L7', false),                                  // I sold; released with fees withheld
    offer('O-LAPB', 'L8', true, { listing: listing('O-LAPB', { status: 'reserved', reservedUntil: past }) }),   // my hold lapsed
    offer('O-LAPS', 'L9', false, { listing: listing('O-LAPS', { status: 'reserved', reservedUntil: past }) }),  // buyer's hold lapsed
    // A pending offer on my listing: my turn to accept.
    offer('O-PEND', 'L10', false, { status: 'pending', listing: listing('x', { status: 'active', reservedOfferId: null, reservedUntil: null }) }),
    // A seller's counter to me: my turn as the BUYER.
    offer('O-CTR', 'L11', true, { status: 'pending', fromRole: 'seller', listing: listing('x', { status: 'active', reservedOfferId: null, reservedUntil: null }) }),
  ];
  const order = (id, offerId, iBuy, status, extra = {}) => ({ id, offerId, buyerId: iBuy ? 'me' : 'b', sellerId: iBuy ? 's' : 'me', status,
    totalCents: 3660, sellerPayoutCents: 2850, sellerFeeCents: 150, shipService: 'usps_ground', ...extra });
  window._orders = [
    order('R-DEL', 'O-DEL', true, 'delivered', { carrier: 'USPS', tracking: '9400222', trackingStatus: 'delivered' }),
    order('R-SHIP', 'O-SHIP', true, 'shipped', { carrier: 'USPS', tracking: '9400333', trackingStatus: 'in_transit' }),
    order('R-PROB', 'O-PROB', false, 'delivered', { problemReportedAt: past, problemNote: 'box was empty' }),
    order('R-WAIT', 'O-WAIT', false, 'paid', { paidAt: new Date(Date.now() - 5 * 60e3).toISOString() }),
    order('R-NEW', 'O-NEW', false, 'paid', { paidAt: new Date().toISOString() }),
    order('R-ERR', 'O-ERR', false, 'paid', { paidAt: new Date().toISOString(), labelError: 'Insufficient postage balance' }),
    order('R-REL', 'O-REL', false, 'released', { payoutWithheldCents: 125 }),
  ];
  window._browse = [{ id: 'L8', sellerId: 's-O-LAPB', sellerUsername: 'ghoulfriend', catalogId: 'c-bun', name: 'Skelly Bun', priceCents: 4500,
    shippingCents: 0, shipServices: ['usps_ground'], status: 'reserved', reservedUntil: past, pdState: 'sold_out', photos: [] }];
  window._mine = [{ id: 'L9', sellerId: 'me', catalogId: 'c-bun', name: 'Skelly Bun', priceCents: 4500, shippingCents: 0, shipServices: ['usps_ground'],
    status: 'reserved', reservedUntil: past, reservedOfferId: 'O-LAPS', pdState: 'sold_out', photos: [] }];
  window._payouts = { started: true, ready: true };
}, { soon, past });
await page.evaluate(async () => { state.saleFilter = 'offers'; await refreshMarket(); setTradeSubTab('sale'); });
const card = (orderOrOfferSel) => page.locator('#subtab-sale .trade-card', { has: page.locator(orderOrOfferSel) });
const text = async (loc) => (await loc.textContent()).replace(/\s+/g, ' ').trim();
out.deliveredText = await text(card('[data-action="mkt-arrived"][data-id="R-DEL"]'));
out.shippedHasReport = await page.locator('[data-action="mkt-report-problem"][data-id="R-SHIP"]').count();
out.sellerProblemText = await text(page.locator('#subtab-sale .trade-card', { hasText: 'Problem reported' }).first());
out.waitText = await text(card('[data-action="mkt-label-retry"][data-id="R-WAIT"]'));
out.newHasRetry = await page.locator('[data-action="mkt-label-retry"][data-id="R-NEW"]').count();
out.errText = await text(card('[data-action="mkt-label-retry"][data-id="R-ERR"]'));
out.allText = await text(page.locator('#subtab-sale .trade-list'));
out.lapsedBuyerBtn = await page.locator('[data-action="mkt-reoffer"][data-listing="L8"]').count();

// Report a problem: too short → refused; backdrop can't lose the note; send.
await page.click('[data-action="mkt-report-problem"][data-id="R-DEL"]');
out.problemModalOpens = await page.isVisible('#market-problem-modal');
await page.locator('#mpr-note').pressSequentially('too short');
await page.click('#mpr-send');
out.problemShortError = await page.textContent('#mpr-error');
out.noCallWhenShort = await page.evaluate(() => window._payCalls().filter((b) => b.action === 'report_problem').length);
await page.locator('#mpr-note').pressSequentially(' — the tote bag was missing');
await page.locator('#market-problem-modal .modal-backdrop').click({ position: { x: 5, y: 5 } });
out.backdropKeepsNote = await page.isVisible('#market-problem-modal')
  && (await page.inputValue('#mpr-note')) === 'too short — the tote bag was missing';
// Cancel asks first; saying no keeps the note.
await page.evaluate(() => { window._confirmAnswer = false; window._confirms.length = 0; });
await page.click('#market-problem-modal .btn-ghost[data-close-mproblem]');
out.cancelAsksFirst = await page.evaluate(() => /Throw away/.test(window._confirms[0] || ''))
  && await page.isVisible('#market-problem-modal') && (await page.inputValue('#mpr-note')).length > 10;
await page.evaluate(() => { window._confirmAnswer = true; });
// A server refusal keeps the modal + the note.
await page.evaluate(() => {
  window._fnReply = (name, body) => (body.action === 'report_problem'
    ? { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status: 409, json: async () => ({ error: 'ORDER_STATE', message: 'This order has already been paid out.' }) } } }
    : { data: { ok: true }, error: null });
});
await page.click('#mpr-send');
await page.waitForFunction(() => /already been paid out/.test(document.getElementById('mpr-error').textContent));
out.refusalKeepsNote = await page.isVisible('#market-problem-modal') && (await page.inputValue('#mpr-note')).length > 10;
await page.evaluate(() => {
  window._fnReply = null;
  // What the server would now return for that order.
  window._orders.find((o) => o.id === 'R-DEL').problemReportedAt = new Date().toISOString();
});
await page.click('#mpr-send');
await page.waitForFunction(() => document.getElementById('market-problem-modal').classList.contains('hidden'));
out.problemCall = await page.evaluate(() => window._payCalls().filter((b) => b.action === 'report_problem').at(-1));
out.problemToast = await page.evaluate(() => window._toasts.at(-1));
out.afterReportText = await text(card('[data-action="mkt-arrived"][data-id="R-DEL"]'));
out.afterReportNoReportBtn = (await page.locator('[data-action="mkt-report-problem"][data-id="R-DEL"]').count()) === 0;

// Lapsed hold, buyer: straight back to a new offer.
await page.click('[data-action="mkt-reoffer"][data-listing="L8"]');
out.reofferOpensOffer = await page.isVisible('#market-offer-modal');
await page.evaluate(() => closeMarketOfferModal());
// Lapsed hold, seller: the listing is editable again.
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="mine"]');
out.mineLapsedText = await text(page.locator('#subtab-sale .grid'));
out.mineLapsedEditable = (await page.locator('#subtab-sale [data-action="mkt-edit"][data-id="L9"]').count())
  + (await page.locator('#subtab-sale [data-action="mkt-remove"][data-id="L9"]').count());
// Shop: a lapsed-hold listing takes offers.
await page.click('#subtab-sale [data-action="mkt-filter"][data-filter="shop"]');
out.shopLapsedOffer = await page.locator('#subtab-sale [data-action="mkt-offer"][data-id="L8"]').count();

// ── 4. Payouts before accepting; friendly errors ──
await page.evaluate(async () => { window._payouts = { started: false, ready: false }; state.saleFilter = 'offers'; await refreshMarket(); });
await page.evaluate(() => { window._confirms.length = 0; window._confirmAnswer = false; window._calls.length = 0; });
await page.click('[data-action="mkt-accept"][data-id="O-PEND"]');
await page.waitForTimeout(100);
out.acceptBlockedPrompt = await page.evaluate(() => window._confirms[0]);
out.acceptBlockedNoRpc = await page.evaluate(() => window._calls.filter((c) => c[0] === 'respond').length === 0);
// Saying yes starts Stripe onboarding.
await page.evaluate((port) => {
  window._confirmAnswer = true; state.sellerTermsOk = true;
  window._fnReply = (name, body) => (body.action === 'payouts_setup'
    ? { data: { url: `http://localhost:${port}/shell#stripe-onboarding` }, error: null } : { data: { ok: true }, error: null });
}, port);
await page.click('[data-action="mkt-accept"][data-id="O-PEND"]');
await page.waitForFunction(() => location.hash === '#stripe-onboarding', null, { timeout: 5000 });
out.acceptYesStartsSetup = await page.evaluate(() => window._payCalls().at(-1));
// A buyer accepting a counter when the SELLER isn't ready: friendly toast.
await page.evaluate(() => {
  window._fnReply = null; window._toasts.length = 0;
  window._respondError = { message: 'MARKET_PAYOUTS_NOT_READY', code: 'P0001' };
});
await page.click('[data-action="mkt-accept"][data-id="O-CTR"]');
await page.waitForTimeout(150);
out.buyerPayoutsToast = await page.evaluate(() => window._toasts[0]);
await page.evaluate(() => { window._respondError = null; });
// Sell modal nudges payouts without blocking.
await page.evaluate(() => { openSellModal(state.collection[0], null); });
out.sellNudgeShown = await page.isVisible('#ms-payouts-nudge') && await page.isEnabled('#ms-save');
await page.evaluate(() => { closeSellModal(); state.myPayouts = { started: true, ready: true }; openSellModal(state.collection[0], null); });
out.sellNudgeHiddenWhenReady = !(await page.isVisible('#ms-payouts-nudge'));
await page.evaluate(() => closeSellModal());

// Error mapping, through the real data.marketPayCall.
out.errors = await page.evaluate(async () => {
  const httpErr = (status, body) => ({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } } });
  const cases = {
    STRIPE: httpErr(502, { error: 'STRIPE', message: 'No such transfer: tr_123; request-id req_abc' }),
    SHIPPING_5xx: httpErr(502, { error: 'SHIPPING', message: 'EasyPost 500: upstream' }),
    SHIPPING_4xx: httpErr(400, { error: 'SHIPPING', message: "That shipping option isn't available — get rates again." }),
    SERVER: httpErr(500, { error: 'SERVER', message: "TypeError: Cannot read properties of undefined (reading 'id')" }),
    DB: httpErr(500, { error: 'DB', message: 'duplicate key value violates unique constraint "market_orders_one_live_per_offer"' }),
    GATE: httpErr(500, { error: 'GATE', message: 'function market_allowed(uuid) does not exist' }),
    NO_STRIPE_KEY: httpErr(503, { error: 'NO_STRIPE_KEY', message: "Payments aren't configured (STRIPE_SECRET_KEY missing)." }),
    NO_EASYPOST_KEY: httpErr(503, { error: 'NO_EASYPOST_KEY', message: "Shipping isn't configured (EASYPOST_API_KEY missing)." }),
    MARKET_NOT_ENABLED: httpErr(403, { error: 'MARKET_NOT_ENABLED', message: "The market isn't open to your account yet." }),
    NETWORK: { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') } },
    ADDRESS: httpErr(400, { error: 'ADDRESS', message: "We couldn't verify that address: street not found" }),
  };
  const res = {};
  const logged = []; const origErr = console.error; console.error = (...a) => { logged.push(a.map(String).join(' ')); };
  for (const [k, reply] of Object.entries(cases)) {
    window._fnReply = () => reply;
    try { await data.marketPayCall({ action: 'x' }); res[k] = 'NO THROW'; }
    catch (err) { res[k] = marketErrorText(err); }
  }
  for (const code of ['MARKET_OFFER_NOT_FOUND', 'MARKET_BAD_ACTION', 'MARKET_PAYOUTS_NOT_READY', 'MARKET_NOT_ENABLED']) {
    res[`rpc_${code}`] = marketErrorText({ message: code, code: 'P0001' });
  }
  console.error = origErr;
  res._rawLogged = logged.some((l) => /No such transfer: tr_123/.test(l));
  window._fnReply = null;
  return res;
});

// Checkout: HOLD_ENDED closes the modal and says so in a toast (not in the closed modal).
await page.evaluate(async ({ soon }) => {
  window._offers.push({ id: 'O-PAY', listingId: 'L20', buyerId: 'me', buyerUsername: 'plaincollector', sellerId: 's9', sellerUsername: 'mothman',
    fromRole: 'seller', amountCents: 4000, status: 'accepted', expiresAt: soon,
    listing: { name: 'Skelly Bun', priceCents: 4500, shippingCents: 0, shipServices: ['usps_ground'], status: 'reserved', reservedOfferId: 'O-PAY', reservedUntil: soon } });
  window._payouts = { started: true, ready: true };
  await refreshMarket();
  window._toasts.length = 0;
  window._fnReply = (name, body) => {
    if (body.action === 'quote') return { data: { shipmentId: 'shp_1', options: [{ rateId: 'rate_g', key: 'usps_ground', label: 'USPS Ground Advantage', cents: 510, days: 4 }] }, error: null };
    if (body.action === 'checkout') return { data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status: window._checkoutStatus, json: async () => window._checkoutBody } } };
    return { data: { ok: true }, error: null };
  };
  window._checkoutStatus = 502; window._checkoutBody = { error: 'STRIPE', message: 'Stripe 500 api_error' };
}, { soon });
await page.click('#subtab-sale [data-action="mkt-pay"][data-id="O-PAY"]');
out.usOnlyNote = await text(page.locator('#market-pay-modal .mp-us-only'));
await page.fill('#mp-name', 'Red Rambler'); await page.fill('#mp-street1', '13 Hollow Rd');
await page.fill('#mp-city', 'Sleepy Hollow'); await page.fill('#mp-state', 'ny'); await page.fill('#mp-zip', '10591');
await page.click('#mp-rates');
await page.waitForSelector('#mp-options [data-mp-rate]');
await page.click('#mp-pay');
await page.waitForFunction(() => !document.getElementById('mp-error').classList.contains('hidden'));
out.checkoutStripeError = await page.textContent('#mp-error');
out.checkoutModalStaysOnStripeError = await page.isVisible('#market-pay-modal');
await page.evaluate(() => { window._checkoutStatus = 409; window._checkoutBody = { error: 'HOLD_ENDED', message: 'The 48-hour hold on this deal has ended.' }; });
await page.click('#mp-pay');
await page.waitForFunction(() => document.getElementById('market-pay-modal').classList.contains('hidden'));
out.holdEndedToast = await page.evaluate(() => window._toasts.at(-1));
await page.evaluate(() => { window._fnReply = null; });

// ── 5. Notifications land on For Sale; phone discoverability ──
Object.assign(out, await page.evaluate(async () => {
  const o = {};
  const settle = () => new Promise((r) => setTimeout(r, 80));
  o.turnCount = marketTurnCount();
  state.tab = 'home'; state.tradeSubTab = 'browse'; state.saleFilter = 'shop';
  o.navOk = goToTabFromNotification('trade');
  await settle();
  o.notifLandsOnSale = state.tab === 'trade' && state.tradeSubTab === 'sale' && state.saleFilter === 'offers';
  // A plain tap on the Trade tab still lands on Browse.
  document.querySelector('header .tabs .tab[data-tab="trade"]').click();
  await settle();
  o.plainTapLandsOnBrowse = state.tradeSubTab === 'browse';
  // Nothing waiting → a trade notification stays on Browse; '#trade-sale' still opens For Sale.
  const keepOffers = window._offers, keepOrders = window._orders;
  window._offers = []; window._orders = [];
  goToTabFromNotification('trade'); await settle();
  o.notifNoTurnStaysBrowse = state.tradeSubTab === 'browse';
  goToTabFromNotification('trade-sale'); await settle();
  o.hashSaleOpensSale = state.tradeSubTab === 'sale';
  window._offers = keepOffers; window._orders = keepOrders;
  await refreshMarket();
  return o;
}));
await page.setViewportSize({ width: 375, height: 800 });
Object.assign(out, await page.evaluate(() => {
  const o = {};
  document.querySelector('.app-shell')?.classList.remove('hidden');
  setTradeSubTab('browse');
  const btn = document.getElementById('subtab-sale-btn').getBoundingClientRect();
  o.phoneSubtabRight = Math.round(btn.right);
  o.phoneSubtabFullyVisible = btn.left >= 0 && btn.right <= window.innerWidth && btn.width > 0;
  const door = document.querySelector('#subtab-browse [data-action="mkt-open-sale"]');
  const dr = door?.getBoundingClientRect();
  o.phoneDoorVisible = !!dr && dr.width > 0 && dr.left >= 0 && dr.right <= window.innerWidth;
  o.phoneDoorText = door?.textContent.replace(/\s+/g, ' ').trim();
  return o;
}));
await page.screenshot({ path: '/tmp/market-launch-phone-browse.png' });
if (out.phoneDoorVisible) {
  await page.click('#subtab-browse [data-action="mkt-open-sale"]');
  out.phoneDoorOpensSale = await page.evaluate(() => state.tradeSubTab === 'sale');
}
await page.screenshot({ path: '/tmp/market-launch-phone-sale.png', fullPage: true });
await page.setViewportSize({ width: 1400, height: 900 });

// ── 6. Admin tools ──
await page.evaluate(({ past }) => {
  window.currentUser = { id: 'me', username: 'boss', isAdmin: true, canModerate: true };
  const base = { buyerId: 'b1', sellerId: 's1', buyerUsername: 'batty', sellerUsername: 'ghoulfriend', itemName: 'Skelly Bun',
    itemCents: 3000, shippingCents: 510, buyerFeeCents: 150, sellerFeeCents: 150, totalCents: 3660, sellerPayoutCents: 3360 };
  const day = (n) => new Date(Date.now() - n * 86400e3).toISOString();
  window._adminOrders = [   // newest first, as the server returns them
    { ...base, id: 'A-NEW', status: 'awaiting_payment', createdAt: day(0) },
    { ...base, id: 'A-PAID', status: 'paid', createdAt: day(1), labelUrl: 'https://label' },
    { ...base, id: 'A-LABEL', status: 'paid', createdAt: day(2), labelError: 'Insufficient postage balance' },
    { ...base, id: 'A-SHIP', status: 'shipped', createdAt: day(3), carrier: 'USPS', tracking: '9400111', trackingStatus: 'in_transit' },
    { ...base, id: 'A-PROB', status: 'delivered', createdAt: day(4), problemReportedAt: past, problemNote: 'Arrived with a torn ear <b>', carrier: 'USPS', tracking: '9400222' },
    { ...base, id: 'A-REL', status: 'released', createdAt: day(5), payoutWithheldCents: 125 },
    { ...base, id: 'A-DISP', status: 'disputed', createdAt: day(6) },
    { ...base, id: 'A-REF', status: 'refunded', createdAt: day(7) },
  ];
  state.adminUsers = [{ id: 'u7', username: 'mothman', email: 'm@example.com', created_at: past, is_admin: false }];
  state.adminIncompleteSignups = [];
  state.adminMarketOrders = window._adminOrders;
  state.adminUserView = null;
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  document.getElementById('admin-view').classList.remove('hidden');
  state.tab = 'admin';
  window._confirms.length = 0; window._confirmAnswer = true; window._toasts.length = 0;
  renderAdmin();
}, { past });
out.adminToolText = await text(page.locator('.admin-market'));
// On/off switch: confirm, then the app_settings write.
await page.evaluate(() => { window._confirmAnswer = false; window._sb.length = 0; });
await page.click('[data-admin-action="market-toggle-open"]');
await page.waitForTimeout(80);
out.toggleConfirm = await page.evaluate(() => window._confirms.at(-1));
out.toggleDeclinedNoWrite = await page.evaluate(() => window._sb.filter((r) => r[0] === 'app_settings').length === 0);
await page.evaluate(() => { window._confirmAnswer = true; });
await page.click('[data-admin-action="market-toggle-open"]');
await page.waitForFunction(() => /OPEN TO EVERYONE/.test(document.querySelector('.admin-market')?.textContent || ''));
out.toggleWrite = await page.evaluate(() => {
  const rec = window._sb.find((r) => r[0] === 'app_settings');
  const up = rec?.find((c) => Array.isArray(c) && c[0] === 'upsert');
  return up ? { key: up[1][0].key, value: up[1][0].value } : null;
});
out.toggleButtonNowCloses = await text(page.locator('[data-admin-action="market-toggle-open"]'));
// Health check.
await page.evaluate(() => {
  window._fnReply = (name, body) => (body.action === 'health'
    ? { data: { stripe: { ok: true, mode: 'test' }, easypost: { ok: false, mode: 'live', message: 'Unauthorized key' }, webhook: { ok: true } }, error: null }
    : { data: { ok: true }, error: null });
});
await page.click('[data-admin-action="market-health"]');
await page.waitForSelector('.admin-health-list');
out.healthCall = await page.evaluate(() => window._payCalls().at(-1));
out.healthText = await text(page.locator('.admin-health-list'));
await page.evaluate(() => { window._fnReply = null; });
// Orders table.
await page.click('[data-admin-action="market-orders"]');
await page.waitForSelector('.admin-market-table tbody tr');
out.orderRowIds = await page.$$eval('.admin-market-table tbody tr', (rows) => rows.map((r) => r.dataset.orderId));
out.attentionRows = await page.$$eval('.admin-market-table tbody tr.admin-market-attention', (rows) => rows.map((r) => r.dataset.orderId));
out.probRowText = await text(page.locator('tr[data-order-id="A-PROB"]'));
out.probNoteEscaped = (await page.locator('tr[data-order-id="A-PROB"] b').count()) === 0;
out.labelRowText = await text(page.locator('tr[data-order-id="A-LABEL"]'));
out.relRowText = await text(page.locator('tr[data-order-id="A-REL"]'));
await page.locator('#admin-queue-modal .modal-card').screenshot({ path: '/tmp/market-launch-admin-orders.png' });
const lastPay = () => page.evaluate(() => window._payCalls().at(-1));
const act = async (sel) => { await page.click(sel); await page.waitForTimeout(120); return lastPay(); };
await page.evaluate(() => { window._confirms.length = 0; });
out.releaseCall = await act('tr[data-order-id="A-PROB"] [data-admin-action="market-release"]');
out.releaseConfirm = await page.evaluate(() => window._confirms.at(-1));
out.refundPlainCall = await act('tr[data-order-id="A-SHIP"] [data-admin-action="market-refund"]');
await page.check('tr[data-order-id="A-REL"] [data-market-fault]');
out.refundFaultCall = await act('tr[data-order-id="A-REL"] [data-admin-action="market-refund"]');
out.refundFaultConfirm = await page.evaluate(() => window._confirms.at(-1));
out.labelRetryCall = await act('tr[data-order-id="A-LABEL"] [data-admin-action="market-label-retry"]');
out.paidWithLabelHasNoRetry = (await page.locator('tr[data-order-id="A-PAID"] [data-admin-action="market-label-retry"]').count()) === 0;
const before = await page.evaluate(() => window._payCalls().length);
await page.click('tr[data-order-id="A-PAID"] [data-admin-action="market-ship"]');
await page.waitForTimeout(80);
out.shipNeedsTracking = (await page.evaluate(() => window._payCalls().length)) === before;
await page.fill('tr[data-order-id="A-PAID"] [data-market-carrier]', 'USPS');
await page.fill('tr[data-order-id="A-PAID"] [data-market-tracking]', ' 9400999 ');
out.shipCall = await act('tr[data-order-id="A-PAID"] [data-admin-action="market-ship"]');
out.noActionsOnRefunded = (await page.locator('tr[data-order-id="A-REF"] [data-admin-action]').count()) === 0;
// A declined confirm sends nothing.
await page.evaluate(() => { window._confirmAnswer = false; });
const n1 = await page.evaluate(() => window._payCalls().length);
await page.click('tr[data-order-id="A-SHIP"] [data-admin-action="market-refund"]');
await page.waitForTimeout(80);
out.refundDeclinedSendsNothing = (await page.evaluate(() => window._payCalls().length)) === n1;
await page.evaluate(() => { window._confirmAnswer = true; });
// A failing action is shown, with the server's reason.
await page.evaluate(() => {
  window._toasts.length = 0;
  window._fnReply = () => ({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 409, json: async () => ({ error: 'ORDER_STATE', message: "This order can't be released right now." }) } } });
});
await page.click('tr[data-order-id="A-SHIP"] [data-admin-action="market-release"]');
await page.waitForTimeout(120);
out.adminFailToast = await page.evaluate(() => window._toasts.at(-1));
await page.evaluate(() => { window._fnReply = null; });
// Status filter.
await page.selectOption('#admin-market-filter', 'attention');
out.filterAttention = await page.$$eval('.admin-market-table tbody tr', (rows) => rows.map((r) => r.dataset.orderId));
await page.selectOption('#admin-market-filter', 'refunded');
out.filterRefunded = await page.$$eval('.admin-market-table tbody tr', (rows) => rows.map((r) => r.dataset.orderId));
await page.evaluate(() => hideEl('admin-queue-modal'));

// Per-user early access.
await page.evaluate(() => {
  window._sb.length = 0;
  data.adminUserSnapshot = async () => ({ plushies: [], wishlist: [], tradeItems: [], trades: [], blocks: [], moderation: {}, feedback: {} });
  data.isMarketTester = async (uid) => { window._calls.push(['isTester', uid]); return false; };
  const real = data.setMarketTester;
  data.setMarketTester = async (uid, on) => { window._calls.push(['setTester', uid, on]); return real(uid, on); };
});
await page.click('[data-admin-action="open"][data-uid="u7"]');
try {
  await page.waitForSelector('[data-admin-toggle="market-tester"]', { timeout: 4000 });
  out.testerToggleOff = !(await page.isChecked('[data-admin-toggle="market-tester"]'));
  await page.check('[data-admin-toggle="market-tester"]');
  await page.waitForFunction(() => document.querySelector('[data-admin-toggle="market-tester"]')?.checked && /Early access/.test(document.querySelector('[data-admin-toggle="market-tester"]').closest('label').textContent));
  out.testerCall = await page.evaluate(() => window._calls.filter((c) => c[0] === 'setTester').at(-1));
  out.testerWrite = await page.evaluate(() => {
    const rec = window._sb.find((r) => r[0] === 'market_testers');
    const up = rec?.find((c) => Array.isArray(c) && c[0] === 'upsert');
    return up ? up[1][0] : null;
  });
  await page.uncheck('[data-admin-toggle="market-tester"]');
  await page.waitForTimeout(120);
  out.testerDelete = await page.evaluate(() => {
    const rec = window._sb.filter((r) => r[0] === 'market_testers').at(-1);
    return rec ? rec.slice(1).map((c) => [c[0], ...c[1]]) : null;
  });
} catch (e) { out.testerError = e.message; out.adminContent = (await page.textContent('#admin-content')).slice(0, 300); }

await browser.close();
server.close();

// ── Node half: the real data.js queries (no browser needed) ──
const vm = await import('node:vm');
const q = { tables: [] };
{
  const chain = (rec, rows) => new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res) => res({ data: rows, error: null });
      return (...args) => { rec.calls.push([prop, ...args]); return chain(rec, rows); };
    },
  });
  const rowsFor = {
    market_orders: [
      { id: 'mine-buy', buyer_id: 'me', seller_id: 'x', status: 'paid', created_at: '2026-11-02' },
      { id: 'not-mine', buyer_id: 'a', seller_id: 'b', status: 'paid', created_at: '2026-11-01' },   // RLS lets an admin see it
    ],
    market_offers: [
      { id: 'o-mine', buyer_id: 'me', created_at: '2026-11-02', listing: { seller_id: 'x' } },
      { id: 'o-other', buyer_id: 'a', created_at: '2026-11-03', listing: { seller_id: 'b' } },
      { id: 'o-sell', buyer_id: 'c', created_at: '2026-11-04', listing: { seller_id: 'me' } },
    ],
    market_sellers: null,
    profiles: [],
  };
  const ctx = {
    window: { currentUser: { id: 'me', username: 'boss', isAdmin: true } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console,
    sb: { from: (t) => { const rec = { table: t, calls: [] }; q.tables.push(rec); return chain(rec, rowsFor[t] ?? []); } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8') + ';globalThis.data = data;', ctx);
  const d = ctx.data;
  q.orders = (await d.listMarketOrders()).map((o) => o.id);
  q.ordersOr = q.tables.find((r) => r.table === 'market_orders').calls.find((c) => c[0] === 'or')?.[1];
  q.ordersCols = q.tables.find((r) => r.table === 'market_orders').calls.find((c) => c[0] === 'select')?.[1];
  q.offers = (await d.listMarketOffers()).map((o) => o.id);
  q.offerFilters = q.tables.filter((r) => r.table === 'market_offers').map((r) => r.calls.find((c) => c[0] === 'eq').slice(1).join('='));
  const payoutsWith = async (row) => { rowsFor.market_sellers = row; return (await d.getMyPayouts()).ready; };
  q.payoutsOnly = await payoutsWith({ charges_enabled: false, payouts_enabled: true, details_submitted: true });
  q.payoutsBoth = await payoutsWith({ charges_enabled: true, payouts_enabled: true, details_submitted: true });
}

console.log(JSON.stringify({ ...out, q: { ...q, tables: undefined } }, null, 2));
const E = out.errors || {};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const allOff = (g) => g && !g.tab && !g.sell && !g.door && !g.stayedOnSale;
const checks = [
  ['gate: closed before the server answers', allOff(out.gateBeforeLoad)],
  ['gate: asks rpc market_allowed with my own uid', same(out.gateRpc, ['market_allowed', { p_uid: 'me' }])],
  ['gate: NON-admin with marketAllowed=true sees For Sale (sub-tab, $ Sell, Browse doorway)', out.gateOn?.tab && out.gateOn?.sell && out.gateOn?.door && out.gateOn?.stayedOnSale],
  ['gate: marketAllowed=false hides every entry point', allOff(out.gateOff)],
  ['gate: no client-side admin/allowlist shortcut when the server says no', allOff(out.gateOffAdmin)],
  ['gate: rpc failure fails closed', allOff(out.gateRpcError)],
  ['gate: #trade-sale cannot open a closed market', out.gateOffHashStaysBrowse],
  ['Stripe return: "Paid" toast shown even though the reads then failed', out.paidToastDespiteFailure && out.urlCleaned && out.landedOnSale],
  ['load failure: says it could not load, with the reason', /For Sale couldn’t load/.test(out.failText)],
  ['load failure: Try again button', out.failHasRetry],
  ['load failure: no fake empty states', out.failNoFakeEmpty],
  ['Try again recovers the view', out.retryRecovered],
  ['config asked once (action: config)', out.configAsked === 1],
  ['test-mode banner hidden when testMode=false', out.bannerHiddenWhenLive],
  ['test-mode banner shown when testMode=true', out.bannerShownInTestMode],
  ['buyer, delivered: All good + Report a problem', /All good — pay the seller/.test(out.deliveredText) && /Report a problem/.test(out.deliveredText)],
  ['buyer, shipped: Report a problem offered', out.shippedHasReport === 1],
  ['report modal opens; short note refused locally, nothing sent', out.problemModalOpens && /at least 10 characters/.test(out.problemShortError) && out.noCallWhenShort === 0],
  ['backdrop tap keeps the modal and the typed note', out.backdropKeepsNote],
  ['Cancel asks before discarding; "no" keeps the note', out.cancelAsksFirst],
  ['server refusal shown in the modal, note kept', out.refusalKeepsNote],
  ['report sends { action: report_problem, orderId, note }', same(out.problemCall, { action: 'report_problem', orderId: 'R-DEL', note: 'too short — the tote bag was missing' })],
  ['…and confirms in a toast', /payout is paused/.test(out.problemToast || '')],
  ['after reporting, buyer sees "Problem reported — payout is paused…" and can still pay the seller', /Problem reported — payout is paused while we look into it/.test(out.afterReportText) && /All good — pay the seller/.test(out.afterReportText) && out.afterReportNoReportBtn],
  ['seller sees the same paused notice (and no payout promise)', /Problem reported — payout is paused while we look into it/.test(out.sellerProblemText) && !/You’re paid/.test(out.sellerProblemText)],
  ['seller: no label 5 min after payment → Try the label again', /taking longer than it should/.test(out.waitText) && /Try the label again/.test(out.waitText)],
  ['seller: just paid, no label → still "Getting your label…"', out.newHasRetry === 0 && /Getting your label…/.test(out.allText)],
  ['seller: label error text is shown', /We couldn't buy the label yet: Insufficient postage balance/.test(out.errText)],
  ['released: payout shown net of withheld fees ($28.50 − $1.25 = $27.25)', /\$27\.25 sent to your payouts/.test(out.allText) && /minus \$1\.25 in seller fees you owed/.test(out.allText)],
  ['lapsed hold, buyer: told the hold ended + Make a new offer', /hold ended before it was paid/.test(out.allText) && out.lapsedBuyerBtn === 1 && out.reofferOpensOffer],
  ['lapsed hold, seller: told the deal is off, listing live again', /hold ended before the buyer paid/.test(out.allText)],
  ['lapsed hold, seller: listing is editable/removable', out.mineLapsedEditable === 2 && /Live again/.test(out.mineLapsedText)],
  ['lapsed hold: shop card takes offers', out.shopLapsedOffer === 1],
  ['seller without payouts: Accept shows the payouts prompt, no RPC', /set up payouts/i.test(out.acceptBlockedPrompt || '') && out.acceptBlockedNoRpc],
  ['…and "yes" starts payouts_setup', out.acceptYesStartsSetup?.action === 'payouts_setup'],
  ['buyer accepting when the seller is not ready: friendly toast', /seller hasn't finished setting up payouts/.test(out.buyerPayoutsToast || '')],
  ['sell modal nudges payouts but does not block listing', out.sellNudgeShown && out.sellNudgeHiddenWhenReady],
  ['checkout says US addresses only', /US addresses only for now/.test(out.usOnlyNote || '')],
  ['error STRIPE → plain language', /payment service had a problem/.test(E.STRIPE)],
  ['error SHIPPING (5xx) → plain language; (4xx) keeps the server guidance', /shipping service had a problem/.test(E.SHIPPING_5xx) && /get rates again/.test(E.SHIPPING_4xx)],
  ['errors SERVER / DB / GATE → plain language', /on our end/.test(E.SERVER) && /couldn't save or load/.test(E.DB) && /check your access/.test(E.GATE)],
  ['errors NO_STRIPE_KEY / NO_EASYPOST_KEY → plain language', /Payments aren't available/.test(E.NO_STRIPE_KEY) && /Shipping isn't available/.test(E.NO_EASYPOST_KEY)],
  ['network failure → plain language', /couldn't reach the server/.test(E.NETWORK)],
  ['MARKET_* rpc codes → plain language', /offer is gone/.test(E.rpc_MARKET_OFFER_NOT_FOUND) && /can't be done/.test(E.rpc_MARKET_BAD_ACTION) && /payouts/.test(E.rpc_MARKET_PAYOUTS_NOT_READY) && /isn't open to your account/.test(E.rpc_MARKET_NOT_ENABLED) && /isn't open to your account/.test(E.MARKET_NOT_ENABLED)],
  ['already-friendly server messages pass through (ADDRESS)', /couldn't verify that address: street not found/.test(E.ADDRESS)],
  ['raw server message is logged to the console', E._rawLogged === true],
  ['checkout STRIPE failure: friendly text in the open modal', /payment service had a problem/.test(out.checkoutStripeError || '') && out.checkoutModalStaysOnStripeError],
  ['checkout HOLD_ENDED: modal closes and a toast says why', /48-hour hold on this deal has ended/.test(out.holdEndedToast || '')],
  ['notification → Trade lands on For Sale → Offers when something awaits me', out.turnCount > 0 && out.navOk && out.notifLandsOnSale],
  ['plain Trade tap still lands on Browse', out.plainTapLandsOnBrowse],
  ['notification with nothing waiting stays on Browse; #trade-sale opens For Sale', out.notifNoTurnStaysBrowse && out.hashSaleOpensSale],
  ['phone 375px: a content-level For Sale entry is on screen in Trade', out.phoneDoorVisible || out.phoneSubtabFullyVisible],
  ['phone 375px: the Browse doorway opens For Sale', out.phoneDoorOpensSale === true],
  ['admin: For Sale tool shows the switch, health and orders + attention count', /Early access only/.test(out.adminToolText) && /3 need attention/.test(out.adminToolText) && /Open For Sale to everyone/.test(out.adminToolText)],
  ['admin switch: confirm first; declining writes nothing', /Open For Sale to EVERY member/.test(out.toggleConfirm || '') && out.toggleDeclinedNoWrite],
  ['admin switch: writes app_settings feature.market = true', same(out.toggleWrite, { key: 'feature.market', value: true })],
  ['admin switch: then offers to close it', /Close For Sale/.test(out.toggleButtonNowCloses || '')],
  ['admin health: calls { action: health }', same(out.healthCall, { action: 'health' })],
  ['admin health: shows Stripe TEST ok, EasyPost LIVE failed + reason, webhooks ok', /Stripe \(payments\) TEST — OK/.test(out.healthText) && /EasyPost \(shipping labels\) LIVE — FAILED: Unauthorized key/.test(out.healthText) && /Webhooks — OK/.test(out.healthText)],
  ['admin orders: all 8 orders, needs-attention first then newest first', same(out.orderRowIds, ['A-LABEL', 'A-PROB', 'A-DISP', 'A-NEW', 'A-PAID', 'A-SHIP', 'A-REL', 'A-REF'])],
  ['admin orders: problem / label error / disputed highlighted', same(out.attentionRows, ['A-LABEL', 'A-PROB', 'A-DISP'])],
  ['admin orders: row shows users, item, amounts, tracking, problem note (escaped)', /@batty → @ghoulfriend/.test(out.probRowText) && /Skelly Bun/.test(out.probRowText) && /Buyer paid \$36\.60/.test(out.probRowText) && /USPS 9400222/.test(out.probRowText) && /Arrived with a torn ear <b>/.test(out.probRowText) && out.probNoteEscaped && /Needs attention/.test(out.probRowText)],
  ['admin orders: label error text shown', /Label error: Insufficient postage balance/.test(out.labelRowText)],
  ['admin orders: withheld fees shown on a released order', /−\$1\.25 withheld/.test(out.relRowText)],
  ['admin Pay seller now → { action: release, orderId } after a confirm', same(out.releaseCall, { action: 'release', orderId: 'A-PROB' }) && /closes the buyer’s problem report/.test(out.releaseConfirm || '')],
  ['admin Refund → { action: refund, orderId, sellerAtFault: false }', same(out.refundPlainCall, { action: 'refund', orderId: 'A-SHIP', sellerAtFault: false })],
  ['admin Refund with "seller at fault" on a released order → sellerAtFault: true, confirm says so', same(out.refundFaultCall, { action: 'refund', orderId: 'A-REL', sellerAtFault: true }) && /ALREADY been paid/.test(out.refundFaultConfirm || '') && /still charged their \$1\.50 seller fee/.test(out.refundFaultConfirm || '')],
  ['admin Retry label → { action: label_retry, orderId } (only when there is no label)', same(out.labelRetryCall, { action: 'label_retry', orderId: 'A-LABEL' }) && out.paidWithLabelHasNoRetry],
  ['admin Mark shipped needs carrier + tracking', out.shipNeedsTracking],
  ['admin Mark shipped → { action: ship, orderId, carrier, tracking }', same(out.shipCall, { action: 'ship', orderId: 'A-PAID', carrier: 'USPS', tracking: '9400999' })],
  ['admin: no actions on a refunded order; a declined confirm sends nothing', out.noActionsOnRefunded && out.refundDeclinedSendsNothing],
  ['admin: a failed action shows the server reason', /Release failed: This order can't be released right now\. \(ORDER_STATE\)/.test(out.adminFailToast || '')],
  ['admin orders: status filter (needs attention / refunded)', same(out.filterAttention, ['A-LABEL', 'A-PROB', 'A-DISP']) && same(out.filterRefunded, ['A-REF'])],
  ['admin user page: For Sale early access toggle, off by default', out.testerToggleOff === true],
  ['…turning it on upserts market_testers { user_id, granted_by }', same(out.testerCall, ['setTester', 'u7', true]) && same(out.testerWrite, { user_id: 'u7', granted_by: 'me' })],
  ['…turning it off deletes the row', same(out.testerDelete, [['delete'], ['eq', 'user_id', 'u7']])],
  ['data: my orders are filtered to buyer/seller = me (admin sees only their own)', same(q.orders, ['mine-buy']) && q.ordersOr === 'buyer_id.eq.me,seller_id.eq.me'],
  ['data: orders select the new problem/withheld columns', /problem_reported_at, problem_note, problem_resolved_at, payout_withheld_cents/.test(q.ordersCols || '')],
  ['data: my offers are only ones I buy or sell in, newest first', same(q.offers, ['o-sell', 'o-mine']) && same(q.offerFilters, ['buyer_id=me', 'listing.seller_id=me'])],
  ['data: payouts ready needs charges_enabled AND payouts_enabled', q.payoutsOnly === false && q.payoutsBoth === true],
  ['no page errors', pageErrors.length === 0],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
process.exit(ok ? 0 : 1);
