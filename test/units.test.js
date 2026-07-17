'use strict';
// Tier 1 — unit tests for the pure logic.
//
// These target the gnarly, regression-prone heuristics: the catalog/lore
// parser's name + accessory cleanup, product categorisation, item status, and
// the search-query parser. They're the functions most likely to silently
// break when a regex is tweaked. Inputs are drawn from real Plushie Dreadfuls
// product shapes; expected outputs were verified against the live code.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.js');

const app = loadApp();
const call = (name, ...args) => app.call(name, ...args);

test('escapeHtml escapes the five HTML-significant characters', () => {
  assert.equal(call('escapeHtml', `<a href="x" id='y'>&`), '&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;');
  assert.equal(call('escapeHtml', null), '');
  assert.equal(call('escapeHtml', 42), '42');
});

test('formatDate renders a short, readable date and tolerates junk', () => {
  assert.equal(call('formatDate', '2026-06-22'), 'Jun 22, 2026');
  assert.equal(call('formatDate', ''), '');
  assert.equal(call('formatDate', 'not-a-date'), '');
});

test('cleanCatalogName strips the brand prefix and descriptive suffixes', () => {
  assert.equal(call('cleanCatalogName', 'Plushie Dreadfuls - Cheshie - Plush Cryptid Stuffed Animal'), 'Cheshie');
  assert.equal(call('cleanCatalogName', 'Plushie Dreadfuls Anxiety Plush Stuffed Animal'), 'Anxiety');
  // A name too short after stripping falls back to the pre-suffix form.
  assert.equal(call('cleanCatalogName', 'Plushie Dreadfuls - Ed'), 'Ed');
});

test('stripOutfitWord drops the redundant "Outfit" wording and tidies dashes', () => {
  assert.equal(call('stripOutfitWord', 'Mini Plush Outfit - Big Blue Bow'), 'Big Blue Bow');
  assert.equal(call('stripOutfitWord', 'Cloak Outfit'), 'Cloak');
  assert.equal(call('stripOutfitWord', 'Sweater'), 'Sweater');
});

test('sanitizeSocialHandle reduces URLs and @-prefixes to a bare handle', () => {
  assert.equal(call('sanitizeSocialHandle', 'https://instagram.com/spookykid/'), 'spookykid');
  assert.equal(call('sanitizeSocialHandle', '@NightOwl'), 'NightOwl');
  assert.equal(call('sanitizeSocialHandle', '  plushfan  '), 'plushfan');
  assert.equal(call('sanitizeSocialHandle', ''), '');
});

test('shopifyImageVariant inserts the size token before the extension', () => {
  assert.equal(
    call('shopifyImageVariant', 'https://cdn.shopify.com/x/cheshie.jpg?v=2', 400),
    'https://cdn.shopify.com/x/cheshie_400x.jpg?v=2',
  );
  assert.equal(call('shopifyImageVariant', '', 400), null);
});

test('proxyImageUrl only rewrites Shopify CDN URLs and only when a base is set', () => {
  // No proxy base configured -> pass-through.
  assert.equal(call('proxyImageUrl', 'https://cdn.shopify.com/x/a.jpg', 200), 'https://cdn.shopify.com/x/a.jpg');
  app.setGlobal('IMG_PROXY_BASE', 'https://img.example.com/');
  assert.equal(
    call('proxyImageUrl', 'https://cdn.shopify.com/x/a.jpg', 200),
    'https://img.example.com?url=' + encodeURIComponent('https://cdn.shopify.com/x/a.jpg') + '&size=200',
  );
  // Non-Shopify URLs are never routed through the catalog proxy.
  assert.equal(call('proxyImageUrl', 'https://example.org/u.jpg', 200), 'https://example.org/u.jpg');
  app.setGlobal('IMG_PROXY_BASE', '');
});

test('catalogCategory honours manual overrides, then type/name heuristics', () => {
  // Manual overrides win over the mislabelled Shopify product_type.
  assert.equal(call('catalogCategory', { id: '1', name: 'Tooth Scary', type: 'Keychain', tags: [] }), 'plush');
  assert.equal(call('catalogCategory', { id: '2', name: 'Gas Mask', type: 'Accessory', tags: [] }), 'clothing');
  // Plain heuristics.
  assert.equal(call('catalogCategory', { id: '3', name: 'Cheshie', type: 'Plush', tags: [] }), 'plush');
  assert.equal(call('catalogCategory', { id: '4', name: 'Bat Sticker', type: 'Sticker', tags: [] }), 'other');
  assert.equal(call('catalogCategory', { id: '5', name: 'Tote', type: 'Accessory', tags: [] }), 'accessory');
  assert.equal(call('catalogCategory', { id: '6', name: 'Mystery Pack', type: 'Plush', tags: [], isBundle: true }), 'bundle');
});

test('itemStatus precedence: retired > fyc(unmade) > coming soon > stock, with graduation exits', () => {
  const pitch = 'currently being considered for prototyping, sign up to be notified';
  assert.equal(call('itemStatus', { retired: true, available: true, tags: [], name: 'x' }), 'retired');
  assert.equal(call('itemStatus', { available: false, tags: ['coming soon'], name: 'x' }), 'coming_soon');
  // A genuine concept: not for sale, lone mockup, lore still pitches it as unmade.
  assert.equal(call('itemStatus', { available: false, tags: ['fyc'], bodyHtml: pitch, photoCount: 1, name: 'x' }), 'fyc');
  // Graduation exit — for sale wins over a stale fyc tag/lore.
  assert.equal(call('itemStatus', { available: true, tags: ['fyc'], bodyHtml: pitch, name: 'x' }), 'available');
  // Graduation exit — real photography (>=4 shots) wins even before it's buyable.
  assert.equal(call('itemStatus', { available: false, tags: ['fyc'], bodyHtml: pitch, photoCount: 5, name: 'x' }), 'sold_out');
  // FYC is tested before coming-soon: a concept mis-tagged "coming soon" stays hidden.
  assert.equal(call('itemStatus', { available: false, tags: ['coming soon'], bodyHtml: 'considered for a prototype, sign up to show your interest', photoCount: 1, name: 'x' }), 'fyc');
  // A real upcoming plush (coming-soon tag, real backstory lore) still reads coming_soon.
  assert.equal(call('itemStatus', { available: false, tags: ['coming soon'], bodyHtml: 'Meet Pumpkin, a real backstory.', photoCount: 3, name: 'x' }), 'coming_soon');
  // No lore loaded (cold-start snapshot) falls back to the Shopify tag.
  assert.equal(call('itemStatus', { available: false, tags: ['fyc'], name: 'x' }), 'fyc');
  assert.equal(call('itemStatus', { available: false, tags: [], name: 'x' }), 'sold_out');
  assert.equal(call('itemStatus', { available: true, tags: [], name: 'x' }), 'available');
});

test('normalizeShopifyProduct derives retired from the retired tag and sold-out "last chance"', () => {
  const sold = (tags) => ({ id: 1, title: 'X', handle: 'x', variants: [{ price: '45', available: false }], tags });
  const live = (tags) => ({ id: 2, title: 'Y', handle: 'y', variants: [{ price: '45', available: true }], tags });
  // PD's explicit 'retired' tag always wins, regardless of stock.
  assert.equal(call('normalizeShopifyProduct', live(['Retired'])).retired, true);
  // Sold-out + 'last chance' = retiring for good.
  assert.equal(call('normalizeShopifyProduct', sold(['last chance'])).retired, true);
  // Still-buyable 'last chance' is NOT retired (don't hide a purchasable item).
  assert.equal(call('normalizeShopifyProduct', live(['last chance'])).retired, false);
  // A restocking item (coming soon / TBA) never reads as retired, even if
  // it's momentarily sold out and tagged 'last chance'.
  assert.equal(call('normalizeShopifyProduct', sold(['last chance', 'coming soon'])).retired, false);
  assert.equal(call('normalizeShopifyProduct', sold(['last chance', 'TBA'])).retired, false);
  // Plain sold-out with no legacy signal stays out-of-stock, not retired.
  assert.equal(call('normalizeShopifyProduct', sold([])).retired, false);
});

test('expandVariants splits a collectible multi-variant product into per-variant sub-items', () => {
  const raw = {
    id: '111', title: 'Skelly Bun Flower Crown', handle: 'skelly-bun',
    product_type: 'Plush', tags: ['plush'],
    options: [{ name: 'Type', values: ['Purple', 'Peach', 'Skelly Bows'] }],
    variants: [
      { id: 1, title: 'Purple', price: '45', available: true,  featured_image: { src: 'https://cdn.shopify.com/x/p.jpg' } },
      { id: 2, title: 'Peach',  price: '45', available: false, featured_image: { src: 'https://cdn.shopify.com/x/q.jpg' } },
      { id: 3, title: 'Skelly Bows', price: '48', available: true, featured_image: { src: 'https://cdn.shopify.com/x/r.jpg' } },
    ],
  };
  const norm = call('normalizeShopifyProduct', raw);
  const out = call('expandVariants', [norm]);
  assert.equal(out.length, 4);                                   // 1 parent + 3 children
  const parent = out.find((i) => i.id === '111');
  assert.equal(parent.variantParent, true);
  assert.equal('_raw' in parent, false);                        // private stash stripped
  const kids = out.filter((i) => i.isVariant);
  assert.deepEqual(kids.map((k) => k.id), ['111::1', '111::2', '111::3']);
  assert.deepEqual(kids.map((k) => k.formLabel), ['Purple', 'Peach', 'Skelly Bows']);
  assert.deepEqual(kids.map((k) => k.available), [true, false, true]);
  assert.deepEqual(kids.map((k) => k.price), [45, 45, 48]);
  assert.deepEqual(kids.map((k) => k.image), ['https://cdn.shopify.com/x/p.jpg', 'https://cdn.shopify.com/x/q.jpg', 'https://cdn.shopify.com/x/r.jpg']);
  assert.equal(kids[0].parentId, '111');
  assert.equal(kids[0].parentHandle, 'skelly-bun');
});

test('expandVariants leaves single-variant and non-collectible-option products alone', () => {
  const single = call('normalizeShopifyProduct', {
    id: '1', title: 'Plain Rabbit', handle: 'plain', product_type: 'Plush', tags: [],
    options: [{ name: 'Title', values: ['Default Title'] }],
    variants: [{ id: 9, title: 'Default Title', price: '40', available: true }],
  });
  // 'Hang Tag' is a purchase choice, not a different plush.
  const hangtag = call('normalizeShopifyProduct', {
    id: '2', title: 'Emily', handle: 'emily', product_type: 'Plush', tags: [],
    options: [{ name: 'Hang Tag', values: ['Numbered', 'Numbered and Autographed'] }],
    variants: [
      { id: 21, title: 'Numbered', price: '60', available: false },
      { id: 22, title: 'Numbered and Autographed', price: '90', available: false },
    ],
  });
  const out = call('expandVariants', [single, hangtag]);
  assert.equal(out.length, 2);                                   // nothing expanded
  assert.equal(out.every((i) => !i.isVariant && !i.variantParent), true);
});

test('resolveCatalogItem backfills a feed variant from its umbrella parent', () => {
  const vm = require('node:vm');
  vm.runInContext(`
    state.catalog = [
      { id: 'p', name: 'Crown', handle: 'crown', variantParent: true, type: 'Plush',
        available: true, tags: ['plush', 'pink'], lore: 'A lore', symbolism: 'A sym',
        accessories: [{ name: 'Tote' }] },
      { id: 'p::1', name: 'Crown', handle: 'crown', isVariant: true, parentId: 'p',
        parentHandle: 'crown', formLabel: 'Purple', image: 'https://cdn.shopify.com/x/p.jpg',
        available: false, accessories: [] },
    ];
  `, app.ctx);
  const child = vm.runInContext(`state.catalog[1]`, app.ctx);
  const resolved = app.call('resolveCatalogItem', child);
  assert.equal(resolved.lore, 'A lore');                         // inherited
  assert.equal(resolved.symbolism, 'A sym');                     // inherited
  assert.equal(resolved.type, 'Plush');                          // inherited
  assert.deepEqual(resolved.tags, ['plush', 'pink']);            // inherited
  assert.deepEqual(resolved.accessories, [{ name: 'Tote' }]);    // inherited (child had none)
  assert.equal(resolved.available, false);                       // child's own value wins
  assert.equal(resolved.formLabel, 'Purple');                    // preserved
  assert.equal(resolved.parentShopifyHandle, 'crown');           // Buy points at parent
});

test('filteredCatalog hides the variant umbrella parent, shows its children', () => {
  const vm = require('node:vm');
  vm.runInContext(`
    state.collection = []; state.wishlist = [];
    state.query = ''; state.catalogFilter = 'all'; state.catalogTheme = 'all';
    state.catalogColor = 'all'; state.catalogUnowned = false; state.catalogOriginal = false;
    state.catalogSort = 'name_asc'; state.catalogStatuses = new Set();
    state.catalog = [
      { id: 'p', name: 'Crown', handle: 'crown', variantParent: true, available: true, tags: [] },
      { id: 'p::1', name: 'Crown', handle: 'crown', isVariant: true, parentId: 'p', parentHandle: 'crown', formLabel: 'Purple', available: true, tags: [] },
      { id: 'p::2', name: 'Crown', handle: 'crown', isVariant: true, parentId: 'p', parentHandle: 'crown', formLabel: 'Peach', available: true, tags: [] },
    ];
  `, app.ctx);
  const ids = app.call('filteredCatalog').map((i) => i.id).sort();
  assert.deepEqual(ids, ['p::1', 'p::2']);                       // parent excluded, children shown
});

test('renderCatalogCard shows the variant form-label as text after the name, not a photo badge', () => {
  const variant = { id: 'p::1', name: 'Crown', handle: 'crown', isVariant: true,
    parentId: 'x', parentHandle: 'crown', formLabel: 'Purple', available: true, tags: [],
    image: 'https://cdn.shopify.com/x/p.jpg' };
  const html = app.call('renderCatalogCard', variant, new Map(), new Map());
  // The variant reads only as the gold form-label text after the name; it is no
  // longer badged on the photo (badge-form removed).
  assert.equal(/badge-form/.test(html), false);
  assert.equal(/card-form-label/.test(html), true);
  assert.equal(/Purple/.test(html), true);
});

test('isLoyaltyReward flags reward-only items (case-insensitive, exact tag)', () => {
  assert.equal(call('isLoyaltyReward', { tags: ['Fairy Tale Plushies', 'Loyalty Reward'], name: 'x' }), true);
  assert.equal(call('isLoyaltyReward', { tags: ['loyalty reward'], name: 'x' }), true);
  assert.equal(call('isLoyaltyReward', { tags: ['Plush'], name: 'x' }), false);
  assert.equal(call('isLoyaltyReward', { tags: [], name: 'x' }), false);
  assert.equal(call('isLoyaltyReward', { name: 'x' }), false);
  // Reward items arrive as available:false, so they still read as sold_out
  // at the status layer — the green "Rewards" badge is a render-time swap.
  assert.equal(call('itemStatus', { available: false, tags: ['Loyalty Reward'], name: 'x' }), 'sold_out');
});

test('renderCatalogMeta omits the dollar price for loyalty rewards (not for sale)', () => {
  const reward = { id: 'r', name: 'Reward Plush', price: 250, tags: ['Loyalty Reward'], createdAt: '2025-03-13' };
  const normal = { id: 'n', name: 'Regular Plush', price: 40, tags: ['Plush'], createdAt: '2025-03-13' };
  assert.equal(/\$250/.test(call('renderCatalogMeta', reward)), false);
  assert.equal(/\$40/.test(call('renderCatalogMeta', normal)), true);
});

test('renderCatalogCard hides the Buy button for retired items', () => {
  const owned = new Map(), wished = new Map();
  const retired   = { id: 'r', name: 'Old Plush', handle: 'old', available: false, retired: true, tags: [] };
  const available = { id: 'v', name: 'New Plush', handle: 'new', available: true, retired: false, tags: [] };
  assert.equal(/btn-buy/.test(app.call('renderCatalogCard', retired, owned, wished)), false);
  assert.equal(/btn-buy/.test(app.call('renderCatalogCard', available, owned, wished)), true);
});

test('filteredCatalog: FYC hidden by default, shown under the FYC filter or a direct search', () => {
  const vm = require('node:vm');
  const setup = (statusArr, query = '') => vm.runInContext(`
    state.collection = []; state.wishlist = [];
    state.catQuery = ${JSON.stringify(query)}; state.catalogFilter = 'all'; state.catalogTheme = 'all';
    state.catalogColor = 'all'; state.catalogUnowned = false; state.catalogOriginal = false;
    state.catalogSort = 'name_asc';
    state.catalogStatuses = new Set(${JSON.stringify(statusArr)});
    state.catalog = [
      { id: 'a', name: 'Normal Plush',  available: true, tags: [] },
      { id: 'b', name: 'Concept Plush', available: false, tags: ['fyc'],
        bodyHtml: 'currently being considered for prototyping, sign up to be notified', photoCount: 1 },
    ];
  `, app.ctx);
  const ids = () => app.call('filteredCatalog').map((i) => i.id).sort();

  setup([]);                       assert.deepEqual(ids(), ['a']);   // default feed: FYC hidden
  setup(['available']);            assert.deepEqual(ids(), ['a']);   // other filter: FYC still hidden
  setup(['fyc']);                  assert.deepEqual(ids(), ['b']);   // FYC filter on: only FYC shows
  setup([], 'concept');            assert.deepEqual(ids(), ['b']);   // direct search, no status: FYC surfaces by name
  setup(['available'], 'concept'); assert.deepEqual(ids(), []);      // search + non-FYC status filter: FYC stays hidden
});

test('parseQuery splits positive/negative bare tokens and quoted phrases', () => {
  assert.deepEqual(call('parseQuery', '"big bad" -wolf cat'), [
    { neg: false, text: 'big bad' },
    { neg: true, text: 'wolf' },
    { neg: false, text: 'cat' },
  ]);
  assert.deepEqual(call('parseQuery', '-"coming soon"'), [{ neg: true, text: 'coming soon' }]);
  assert.deepEqual(call('parseQuery', 'foo & bar'), [           // '&' is an AND separator
    { neg: false, text: 'foo' },
    { neg: false, text: 'bar' },
  ]);
});

test('splitOrGroups splits on top-level commas but not inside quotes', () => {
  assert.deepEqual(call('splitOrGroups', 'tote, bag'), ['tote', 'bag']);
  assert.deepEqual(call('splitOrGroups', '-tote & -bag'), ['-tote & -bag']);  // no comma → one group
  assert.deepEqual(call('splitOrGroups', '"a, b", c'), ['"a, b"', 'c']);      // comma in phrase kept
  assert.deepEqual(call('splitOrGroups', 'a, , b'), ['a', 'b']);              // empty groups dropped
});

test('matchesQuery requires every positive term and excludes negatives', () => {
  const item = { name: 'Cheshire Cat', nickname: 'Boo', meaning: 'mischief' };
  assert.equal(call('matchesQuery', item, 'cat'), true);
  assert.equal(call('matchesQuery', item, 'boo mischief'), true);   // searches nickname + meaning
  assert.equal(call('matchesQuery', item, '-cat'), false);          // negative excludes
  assert.equal(call('matchesQuery', item, 'dragon'), false);        // missing positive
  assert.equal(call('matchesQuery', item, ''), true);               // empty query matches all
});

test('matchesQuery supports & (AND) and , (OR) operators', () => {
  const item = { name: 'Cheshire Cat', nickname: 'Boo', meaning: 'mischief' };
  assert.equal(call('matchesQuery', item, 'cat & boo'), true);      // both present
  assert.equal(call('matchesQuery', item, 'cat & dragon'), false);  // one missing → AND fails
  assert.equal(call('matchesQuery', item, 'dragon, cat'), true);    // OR: second group matches
  assert.equal(call('matchesQuery', item, 'dragon, wolf'), false);  // neither group matches
  assert.equal(call('matchesQuery', item, '-cat, boo'), true);      // OR: second group matches
  // A plush missing both a tote and a bag — the user's example, via either form.
  const noBag = { name: 'Sad Ghost', nickname: '', meaning: 'comes with nothing' };
  assert.equal(call('matchesQuery', noBag, '-tote & -bag'), true);
});

test('canonicalizeAccessoryName trims prose, clauses and size tails, keeps real counts', () => {
  assert.equal(call('canonicalizeAccessoryName', '2x Baby Opossums that attach to her face'), '2× Baby Opossums');
  assert.equal(call('canonicalizeAccessoryName', 'Comes with a Tote Bag - measures 38cm'), 'Tote Bag');
  assert.equal(call('canonicalizeAccessoryName', 'Envelope for your Love Letters'), 'Envelope');
});

test('accessoryKey strips the quantity prefix and lowercases (stable match key)', () => {
  assert.equal(call('accessoryKey', '2× Tiny Worry Bunnies'), 'tiny worry bunnies');
  assert.equal(call('accessoryKey', 'Tote Bag'), 'tote bag');
});

test('normalizeAccessories drops features/specs and merges duplicate phrasings', () => {
  const out = call('normalizeAccessories', [
    'Sturdy Cotton Tote Bag',
    'Anxiety Rabbit Tote Bag',   // same physical tote, different phrasing -> merged away
    'Poseable arms',             // a feature, not an item -> dropped
    'measures 38cm',             // a spec -> dropped
    '2x Baby Opossums',
  ]);
  assert.deepEqual(out, [
    { name: 'Sturdy Cotton Tote Bag', key: 'sturdy cotton tote bag' },
    { name: '2× Baby Opossums', key: 'baby opossums' },
  ]);
  assert.deepEqual(call('normalizeAccessories', null), []);
});

test('hasFullLastName requires at least two letters (a bare initial fails)', () => {
  assert.equal(call('hasFullLastName', 'Smith'), true);
  assert.equal(call('hasFullLastName', 'Ng'), true);
  assert.equal(call('hasFullLastName', 'S'), false);
  assert.equal(call('hasFullLastName', 'S.'), false);
  assert.equal(call('hasFullLastName', ''), false);
  assert.equal(call('hasFullLastName', null), false);
  assert.equal(call('hasFullLastName', "O'Brien"), true);
});

test('formatDisplayName honours the visibility choice (mirrors public_display_name)', () => {
  assert.equal(call('formatDisplayName', 'Scott', 'Miller', 'full'), 'Scott Miller');
  assert.equal(call('formatDisplayName', 'Scott', 'Miller', 'first_initial'), 'Scott M.');
  assert.equal(call('formatDisplayName', 'Scott', 'Miller', 'hidden'), '');
  // No last name: initial mode and full mode both fall back to first only.
  assert.equal(call('formatDisplayName', 'Scott', '', 'first_initial'), 'Scott');
  assert.equal(call('formatDisplayName', 'Scott', '', 'full'), 'Scott');
  // No first name: nothing to show.
  assert.equal(call('formatDisplayName', '', 'Miller', 'full'), '');
  assert.equal(call('formatDisplayName', '  Scott ', ' miller ', 'first_initial'), 'Scott M.');
});

test('buildUsersCsv emits a header + one RFC-4180 row per user, dates as YYYY-MM-DD', () => {
  const csv = call('buildUsersCsv', [
    { username: 'alex', email: 'alex@example.com', full_name: 'Alex Morgan', created_at: '2026-01-15T10:00:00Z',
      last_seen_at: '2026-06-20T08:30:00Z', collection_count: 12, wishlist_count: 3,
      for_trade_count: 1, feedback: { good_count: 5, meh_count: 0, bad_count: 1, total_count: 6 } },
    // Name with a comma must be quoted; missing email/dates/feedback tolerated.
    { username: 'bee', full_name: 'Bee, Jr.', created_at: null, last_seen_at: null,
      collection_count: 0, wishlist_count: 0, for_trade_count: 0 },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Username,Email,Name,Joined,Last seen,Collection,Wishlist,For trade,Good,Meh,Bad,Total feedback');
  assert.equal(lines[1], 'alex,alex@example.com,Alex Morgan,2026-01-15,2026-06-20,12,3,1,5,0,1,6');
  assert.equal(lines[2], 'bee,,"Bee, Jr.",,,0,0,0,0,0,0,0');
  assert.equal(call('buildUsersCsv', []), 'Username,Email,Name,Joined,Last seen,Collection,Wishlist,For trade,Good,Meh,Bad,Total feedback');
});

test('sortCatalog treats a hand-entered releaseYear as Jan 1, sorting customs among their year-mates', () => {
  // Shopify items have full createdAt timestamps; a custom carries only a
  // releaseYear but a created_at of "just now" (when it was keyed in).
  const items = [
    { id: 'shop-2020', name: 'B 2020', createdAt: '2020-06-01T00:00:00Z' },
    { id: 'shop-2024', name: 'A 2024', createdAt: '2024-06-01T00:00:00Z' },
    { id: 'custom-2018', name: 'C custom', createdAt: '2026-06-25T00:00:00Z', releaseYear: 2018 },
  ];
  // Newest first: 2024 shop, 2020 shop, then the 2018 custom (NOT first, even
  // though it was created_at "today") — it sorts by its listed year.
  assert.deepEqual(call('sortCatalog', items, 'newest').map((x) => x.id),
    ['shop-2024', 'shop-2020', 'custom-2018']);
  // Oldest first: the 2018 custom now leads.
  assert.deepEqual(call('sortCatalog', items, 'oldest').map((x) => x.id),
    ['custom-2018', 'shop-2020', 'shop-2024']);
});

test('compactViewAllowed gates the dense list to non-phone widths', () => {
  // Phone width → matchMedia('(max-width: 768px)') matches → compact disallowed.
  app.setGlobal('matchMedia', (q) => ({ matches: /max-width:\s*768px/.test(q) }));
  assert.equal(call('compactViewAllowed'), false);
  // Desktop width → the phone media query does not match → compact allowed.
  app.setGlobal('matchMedia', () => ({ matches: false }));
  assert.equal(call('compactViewAllowed'), true);
});

test('a handle cover skips variant children; a per-variant cover lands only on its own child', () => {
  const vm = require('node:vm');
  const result = vm.runInContext(`
    (function () {
      const norm = normalizeShopifyProduct({
        id: '500', title: 'Jellybun', handle: 'jellybun', product_type: 'Plush', tags: ['plush'],
        options: [{ name: 'Color', values: ['Blue', 'Orange'] }],
        variants: [
          { id: 10, title: 'Blue',   price: '40', available: true, featured_image: { src: 'https://cdn.shopify.com/blue.jpg' } },
          { id: 11, title: 'Orange', price: '40', available: true, featured_image: { src: 'https://cdn.shopify.com/orange.jpg' } },
        ],
      });
      const rows = expandVariants([norm]);
      // A handle-level cover must paint ONLY the hidden parent, never the kids.
      applyCatalogOverrides(rows, [{ handle: 'jellybun', image: 'https://r2/HANDLE.jpg', image_credit: '@x' }]);
      // A per-variant cover lands only on its own child (Orange = variant 11).
      applyVariantCovers(rows, [{ variant_id: '11', image: 'https://r2/ORANGE.jpg', image_credit: '@amber' }]);
      const by = {}; rows.forEach((r) => { by[r.id] = r; });
      return {
        parentImage: by['500'].image,
        blueImage: by['500::10'].image,   blueCredit: by['500::10'].imageCredit || null,
        orangeImage: by['500::11'].image, orangeCredit: by['500::11'].imageCredit || null,
        blueVariantId: by['500::10'].variantId, orangeVariantId: by['500::11'].variantId,
      };
    })()
  `, app.ctx);
  assert.equal(result.parentImage, 'https://r2/HANDLE.jpg');        // handle cover → parent only
  assert.equal(result.blueImage, 'https://cdn.shopify.com/blue.jpg'); // Blue untouched (its store photo)
  assert.equal(result.blueCredit, null);                            // no handle paint, no variant cover
  assert.equal(result.orangeImage, 'https://r2/ORANGE.jpg');        // Orange got ONLY its per-variant cover
  assert.equal(result.orangeCredit, '@amber');
  assert.equal(result.blueVariantId, '10');                         // variant id tagged for keying
  assert.equal(result.orangeVariantId, '11');
});

test('catalog detail: suggest-a-picture button on every item, EXTRA-highlighted only when store-only', () => {
  const vm = require('node:vm');
  app.setGlobal('currentUser', { isAdmin: true });   // makes canSuggestPhotos true
  vm.runInContext(`
    window.currentUser = { isAdmin: true };
    state.collection = []; state.wishlist = [];
    state.catalog = [
      { id: 's1', name: 'Store Only Plush', handle: 'store-only', type: 'plush',
        image: 'https://cdn.shopify.com/x.jpg', tags: ['plush'], available: true },
      { id: 'c1', name: 'Community Plush', handle: 'covered', type: 'plush',
        image: 'https://r2.dev/y.jpg', imageCredit: '@amber', tags: ['plush'], available: true },
      { id: 'v1::2', name: 'Variant Plush', handle: 'variant', type: 'plush', isVariant: true,
        variantId: '2', image: 'https://cdn.shopify.com/z.jpg', tags: ['plush'], available: true },
    ];
  `, app.ctx);
  const storeOnly = app.call('catalogDetailBodyHtml', 's1');
  const community = app.call('catalogDetailBodyHtml', 'c1');
  const variant   = app.call('catalogDetailBodyHtml', 'v1::2');
  // Store-only item: suggest button present AND hot AND the highlighted CTA strip.
  assert.match(storeOnly, /data-action="cat-suggest-photo"/);
  assert.match(storeOnly, /btn-suggest-hot/);
  assert.match(storeOnly, /cd-storeonly-cta/);
  // Community-covered item: plain suggest button, NOT hot, no CTA strip.
  assert.match(community, /data-action="cat-suggest-photo"/);
  assert.doesNotMatch(community, /btn-suggest-hot/);
  assert.doesNotMatch(community, /cd-storeonly-cta/);
  // Variant: no suggest affordance at all (no row to attach a suggestion to).
  assert.doesNotMatch(variant, /cat-suggest-photo/);
});

test('photo-suggestion review row: three actions, store-only note, and gallery comparison with cover dedup', () => {
  // Store-only target: shows the "only the shop photo" note and all three actions.
  const storeOnlyRow = {
    id: 'sug1', image: 'https://r2.dev/suggested.jpg', submitted_by_username: 'amber',
    submitted_at: '2026-06-29T00:00:00Z', notes: 'whole bunny, white bg',
    _ctx: { name: 'Anxiety Rabbit', coverUrl: 'https://cdn.shopify.com/x.jpg',
            coverLabel: 'Shop photo — store-only', storeOnly: true, existing: [] },
  };
  const a = call('renderPendingPhotoRow', storeOnlyRow);
  assert.match(a, /data-admin-action="approve-photo-suggestion"/);
  assert.match(a, /data-admin-action="keep-photo-suggestion"/);
  assert.match(a, /data-admin-action="reject-photo-suggestion"/);
  assert.match(a, /Already on this item/);
  assert.match(a, /only the shop photo so far/);
  assert.match(a, /Suggested/);                       // ribbon
  assert.match(a, /@amber/);

  // Has a community cover + a 'B' gallery shot: the cover (slot A, same url) is
  // de-duped from the strip, 'B' is shown, and there's no store-only note.
  const coveredRow = {
    id: 'sug2', image: 'https://r2.dev/s2.jpg', submitted_by_username: 'bob',
    submitted_at: '2026-06-29T00:00:00Z', notes: null,
    _ctx: { name: 'Love Rabbit', coverUrl: 'https://r2.dev/cover.jpg', coverLabel: 'Cover · @amber',
            storeOnly: false, existing: [ { url: 'https://r2.dev/cover.jpg', slot: 'A' }, { url: 'https://r2.dev/b.jpg', slot: 'B' } ] },
  };
  const b = call('renderPendingPhotoRow', coveredRow);
  assert.match(b, /<span>Picture B<\/span>/);          // B gallery shot shown
  assert.doesNotMatch(b, /<span>Picture A<\/span>/);   // cover (slot A, same url) deduped out of the strip
  assert.doesNotMatch(b, /only the shop photo/);
});

test('catalog card: hot "Suggest a picture" on store-only items, none on community-covered', () => {
  const vm = require('node:vm');
  const res = vm.runInContext(`
    window.currentUser = { isAdmin: true };
    state.catalog = []; state.collection = []; state.wishlist = [];
    const empty = new Set();
    JSON.stringify({
      store: renderCatalogCard({ id:'s1', name:'Store Plush', handle:'store', type:'plush',
        image:'https://cdn.shopify.com/x.jpg', tags:['plush'], available:true }, empty, empty),
      comm: renderCatalogCard({ id:'c1', name:'Community Plush', handle:'comm', type:'plush',
        image:'https://r2.dev/y.jpg', imageCredit:'@amber', tags:['plush'], available:true }, empty, empty),
      noimg: renderCatalogCard({ id:'n1', name:'No Image Plush', handle:'noimg', type:'plush',
        image:null, tags:['plush'], available:true }, empty, empty),
    })
  `, app.ctx);
  const { store, comm, noimg } = JSON.parse(res);
  assert.match(store, /data-action="cat-suggest-photo"/);   // store-only → button shows
  assert.match(store, /btn-suggest-hot/);                   // …and it's hot
  assert.doesNotMatch(comm, /cat-suggest-photo/);           // real community photo → no nag
  assert.match(noimg, /data-action="cat-suggest-photo"/);   // no image → button shows
});

test('photo-less offerings are gated out of trading (db/0082 mirror)', () => {
  const app = loadApp();
  assert.equal(app.call('offeringNeedsPhotos', { photos: [] }), true);
  assert.equal(app.call('offeringNeedsPhotos', {}), true);
  assert.equal(app.call('offeringNeedsPhotos', { photos: [{ url: 'x' }] }), false);

  // Browse card: no proof photos → inert "Awaiting photos" CTA, no quick-trade.
  const vm = require('node:vm');
  const res = vm.runInContext(`
    window.currentUser = { id: 'me' };
    state.catalog = []; state.colView = 'cards';
    JSON.stringify({
      bare: renderOfferingCard({ id:'t1', ownerId:'u1', name:'Gingerdread Rabbit',
        available:1, reserved:0, quantity:1, photos: [] }),
      proofed: renderOfferingCard({ id:'t2', ownerId:'u1', name:'Tornado Rabbit',
        available:1, reserved:0, quantity:1, photos: [{ id:'p1', url:'https://r2.dev/p.jpg' }] }),
    })
  `, app.ctx);
  const { bare, proofed } = JSON.parse(res);
  assert.match(bare, /Awaiting photos/);
  assert.doesNotMatch(bare, /data-action="quick-trade"/);
  assert.match(proofed, /data-action="quick-trade"/);
  assert.doesNotMatch(proofed, /Awaiting photos/);
});
