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

test('itemStatus reflects the lifecycle precedence (retired > coming soon > fyc > stock)', () => {
  assert.equal(call('itemStatus', { retired: true, available: true, tags: [], name: 'x' }), 'retired');
  assert.equal(call('itemStatus', { available: false, tags: ['coming soon'], name: 'x' }), 'coming_soon');
  assert.equal(call('itemStatus', { available: true, tags: ['fyc'], name: 'x' }), 'fyc');
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

test('filteredCatalog hides FYC by default, shows it only when the FYC filter is on', () => {
  const vm = require('node:vm');
  const setup = (statusArr) => vm.runInContext(`
    state.collection = []; state.wishlist = [];
    state.query = ''; state.catalogFilter = 'all'; state.catalogTheme = 'all';
    state.catalogColor = 'all'; state.catalogUnowned = false; state.catalogOriginal = false;
    state.catalogSort = 'name_asc';
    state.catalogStatuses = new Set(${JSON.stringify(statusArr)});
    state.catalog = [
      { id: 'a', name: 'Normal Plush',  available: true, tags: [] },
      { id: 'b', name: 'Concept Plush', available: true, tags: ['fyc'] },
    ];
  `, app.ctx);
  const ids = () => app.call('filteredCatalog').map((i) => i.id).sort();

  setup([]);            assert.deepEqual(ids(), ['a']);        // default feed: FYC hidden
  setup(['available']); assert.deepEqual(ids(), ['a']);        // other filter: FYC still hidden
  setup(['fyc']);       assert.deepEqual(ids(), ['b']);        // FYC filter on: only FYC shows
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
