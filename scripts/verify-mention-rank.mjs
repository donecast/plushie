// Verifies the @mention friends-first ordering used by data.searchUsers
// (opts.rankByFriends). Replicates the exact comparator + trim so we can prove
// the ordering without a live Supabase. Coffin Buddy(0) < Inner(1) < friend(2)
// < stranger(3); ties break alphabetically.
import assert from 'node:assert';

const ranks = new Map([
  ['coffin', 0],   // Coffin Buddy
  ['inner', 1],    // Inner Circle
  ['pal', 2],      // regular friend
]);

// Prefix-matched candidate rows as Supabase would return them (arbitrary order).
const rows = [
  { id: 'zed',    username: 'aardvark_stranger' },
  { id: 'pal',    username: 'archer_pal' },
  { id: 'coffin', username: 'azzy_coffin' },
  { id: 'x1',     username: 'abby_stranger' },
  { id: 'inner',  username: 'aria_inner' },
  { id: 'x2',     username: 'ashley_stranger' },
];

const limit = 8;
const rankOf = (r) => (ranks.has(r.id) ? ranks.get(r.id) : 3);
const sorted = rows.slice().sort((a, b) => {
  const dr = rankOf(a) - rankOf(b);
  return dr || a.username.localeCompare(b.username);
}).slice(0, limit);

const order = sorted.map((r) => r.username);
console.log('ranked order:', order);

assert.deepStrictEqual(order, [
  'azzy_coffin',        // Coffin Buddy first
  'aria_inner',         // then Inner Circle
  'archer_pal',         // then regular friend
  'aardvark_stranger',  // strangers after, alphabetical among themselves
  'abby_stranger',
  'ashley_stranger',
]);

// Trim keeps the closest when there are more matches than the cap.
const many = Array.from({ length: 20 }, (_, i) => ({ id: 'n' + i, username: 'aa' + String(i).padStart(2, '0') }));
many.push({ id: 'coffin', username: 'azzz_last_alpha' }); // sorts last alphabetically but is closest
const trimmed = many.slice().sort((a, b) => {
  const dr = rankOf(a) - rankOf(b);
  return dr || a.username.localeCompare(b.username);
}).slice(0, limit);
assert.strictEqual(trimmed[0].username, 'azzz_last_alpha', 'closest friend survives the trim even when alphabetically last');
assert.strictEqual(trimmed.length, limit);

console.log('PASS: friends-first ordering + trim behave as intended');
