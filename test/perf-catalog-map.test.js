'use strict';
// Guards the memoised catalog-by-id lookup (app-collection.js catalogById):
// it must return the right entry, miss cleanly, and — critically — rebuild
// when state.catalog is reassigned, since the whole point is to cache against
// the array identity. A stale cache here would show items under the wrong
// catalog entry after a live catalog refresh.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadApp } = require('./harness.js');

const app = loadApp();

function setCatalog(js) {
  vm.runInContext(`state.catalog = ${js};`, app.ctx);
}
const catalogById = (id) => app.call('catalogById', id);

test('catalogById returns the matching entry and misses cleanly', () => {
  setCatalog(`[{ id: 'a', name: 'Alpha', category: 'plush' }, { id: 'b', name: 'Beta', category: 'minis' }]`);
  assert.equal(catalogById('a').name, 'Alpha');
  assert.equal(catalogById('b').name, 'Beta');
  assert.equal(catalogById('nope'), undefined);
  assert.equal(catalogById(null), undefined);
  assert.equal(catalogById(undefined), undefined);
});

test('catalogById invalidates when state.catalog is reassigned', () => {
  setCatalog(`[{ id: 'a', name: 'Alpha' }]`);
  assert.equal(catalogById('a').name, 'Alpha');   // warms the cache

  // Reassign to a brand-new array (how app-catalog.js / app-core.js update it).
  setCatalog(`[{ id: 'a', name: 'Alpha II' }, { id: 'c', name: 'Gamma' }]`);
  assert.equal(catalogById('a').name, 'Alpha II', 'cache must rebuild on reassignment');
  assert.equal(catalogById('c').name, 'Gamma');
});
