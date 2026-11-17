// flow.mjs <plushieIndex> <priceCents> <offerCents> [serviceIndex] — list → offer → accept → quote → checkout; prints url.
import fs from 'node:fs';
import { signIn, rest, fn } from './lib.mjs';
const [idx, price, offerAmt, svc = 0] = process.argv.slice(2).map(Number);
const st = JSON.parse(fs.readFileSync('state.json'));
const s = await signIn('seller'), b = await signIn('buyer');
const must = (k, r) => { if (r.status >= 300) { console.log('FAIL', k, r.status, JSON.stringify(r.body)); process.exit(1); } return r.body; };
const p = st.plushies[idx];
const listing = must('create', await fn(s, 'market-listing', { action: 'create', plushieId: p.id, priceCents: price, parcel: { preset: 'small', weightOz: 14 }, services: ['usps_ground', 'usps_priority'], notes: 'E2E test listing — not a real item', photoPaths: [`${s.user.id}/e2e-placeholder.jpg`] }));
const offerId = must('offer', await rest(b, 'POST', 'rpc/market_make_offer', { p_listing: listing.id, p_amount: offerAmt }));
must('accept', await rest(s, 'POST', 'rpc/market_respond_offer', { p_offer: offerId, p_action: 'accept' }));
const quote = must('quote', await fn(b, 'market-checkout', { action: 'quote', offerId, address: { name: 'E2E Buyer', street1: '1 Salem Green', city: 'Salem', state: 'MA', zip: '01970' } }));
const co = must('checkout', await fn(b, 'market-checkout', { action: 'checkout', offerId, shipmentId: quote.shipmentId, rateId: quote.options[svc].rateId, returnBase: 'http://localhost:8799/' }));
fs.writeFileSync('checkout.url', co.url); fs.writeFileSync('order.id', co.orderId);
console.log(JSON.stringify({ listingId: listing.id, offerId, orderId: co.orderId, shipmentId: quote.shipmentId, rates: quote.options.map((o) => o.rateId) }));
