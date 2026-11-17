import { signIn, rest } from './lib.mjs';
const s = await signIn('seller');
console.log('ledger', JSON.stringify((await rest(s, 'GET', 'market_seller_ledger?select=order_id,amount_cents,kind&order=id')).body));
console.log('listings', JSON.stringify((await rest(s, 'GET', 'market_listings?select=name,status,price_cents&order=created_at')).body));
