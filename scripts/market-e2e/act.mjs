// act.mjs <who> <json body> [fn]
import { signIn, fn } from './lib.mjs';
const s = await signIn(process.argv[2]);
const r = await fn(s, process.argv[4] || 'market-checkout', JSON.parse(process.argv[3]));
console.log(r.status, JSON.stringify(r.body));
