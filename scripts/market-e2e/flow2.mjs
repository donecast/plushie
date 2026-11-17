// flow2.mjs <listingId> <offerCents> — counter-offer path on an existing listing: buyer offers low, seller counters, buyer accepts → checkout url.
import fs from 'node:fs';
import { signIn, rest, fn } from './lib.mjs';
const [listingId, amt] = process.argv.slice(2);
const s = await signIn('seller'), b = await signIn('buyer');
const must = (k, r) => { if (r.status >= 300) { console.log('FAIL', k, r.status, JSON.stringify(r.body)); process.exit(1); } return r.body; };
const o1 = must('offer', await rest(b, 'POST', 'rpc/market_make_offer', { p_listing: listingId, p_amount: Number(amt) - 300 }));
const o2 = must('counter', await rest(s, 'POST', 'rpc/market_respond_offer', { p_offer: o1, p_action: 'counter', p_counter: Number(amt), p_message: 'meet me here' }));
console.log('seller accepting own counter →', (await rest(s, 'POST', 'rpc/market_respond_offer', { p_offer: o2, p_action: 'accept' })).body.message);
must('buyer accepts counter', await rest(b, 'POST', 'rpc/market_respond_offer', { p_offer: o2, p_action: 'accept' }));
const quote = must('quote', await fn(b, 'market-checkout', { action: 'quote', offerId: o2, address: { name: 'E2E Buyer', street1: '1 Salem Green', city: 'Salem', state: 'MA', zip: '01970' } }));
// Change of mind on shipping: two checkouts, the first page must die.
const c1 = must('checkout1', await fn(b, 'market-checkout', { action: 'checkout', offerId: o2, shipmentId: quote.shipmentId, rateId: quote.options[1].rateId, returnBase: 'http://localhost:8799/' }));
const co = must('checkout2', await fn(b, 'market-checkout', { action: 'checkout', offerId: o2, shipmentId: quote.shipmentId, rateId: quote.options[0].rateId, returnBase: 'http://localhost:8799/' }));
console.log('same order reused:', c1.orderId === co.orderId);
fs.writeFileSync('checkout.url', co.url); fs.writeFileSync('checkout-stale.url', c1.url); fs.writeFileSync('order.id', co.orderId);
console.log(co.orderId);
