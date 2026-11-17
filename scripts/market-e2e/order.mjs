import fs from 'node:fs';
import { signIn, rest } from './lib.mjs';
const b = await signIn(process.argv[3] || 'buyer');
const id = process.argv[2] || fs.readFileSync('order.id', 'utf8').trim();
const o = (await rest(b, 'GET', `market_orders?select=*&id=eq.${id}`)).body[0];
const keep = ['status', 'total_cents', 'seller_payout_cents', 'payout_withheld_cents', 'stripe_payment_intent', 'stripe_charge_id', 'stripe_transfer_id', 'label_url', 'label_error', 'tracking_carrier', 'tracking_number', 'tracking_status', 'easypost_tracker_id', 'paid_at', 'shipped_at', 'delivered_at', 'buyer_confirmed_at', 'released_at', 'refunded_at', 'problem_reported_at', 'problem_note', 'problem_resolved_at', 'label_refunded'];
console.log(JSON.stringify(Object.fromEntries(keep.filter((k) => o[k] != null).map((k) => [k, o[k]])), null, 1));
const l = (await rest(b, 'GET', `market_listings?select=status,reserved_offer_id&id=eq.${o.listing_id}`)).body[0];
console.log('listing', JSON.stringify(l));
