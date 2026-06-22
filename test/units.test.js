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

test('parseQuery splits positive/negative bare tokens and quoted phrases', () => {
  assert.deepEqual(call('parseQuery', '"big bad" -wolf cat'), [
    { neg: false, text: 'big bad' },
    { neg: true, text: 'wolf' },
    { neg: false, text: 'cat' },
  ]);
  assert.deepEqual(call('parseQuery', '-"coming soon"'), [{ neg: true, text: 'coming soon' }]);
});

test('matchesQuery requires every positive term and excludes negatives', () => {
  const item = { name: 'Cheshire Cat', nickname: 'Boo', meaning: 'mischief' };
  assert.equal(call('matchesQuery', item, 'cat'), true);
  assert.equal(call('matchesQuery', item, 'boo mischief'), true);   // searches nickname + meaning
  assert.equal(call('matchesQuery', item, '-cat'), false);          // negative excludes
  assert.equal(call('matchesQuery', item, 'dragon'), false);        // missing positive
  assert.equal(call('matchesQuery', item, ''), true);               // empty query matches all
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
