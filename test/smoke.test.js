'use strict';
// Tier 0 — load/smoke test.
//
// The cheapest, highest-value test for a global-scope app: prove the whole
// thing loads without a ReferenceError (a misspelled or missing global is
// otherwise a silent, runtime-only failure). Faithfully mimics the browser
// loading the script(s) in order in one shared global scope.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.js');

test('app source loads in order with no ReferenceError/TDZ at load', () => {
  assert.doesNotThrow(() => loadApp());
});

test('core cross-file functions are all defined on the shared global', () => {
  const app = loadApp();
  // Sampled across every concern so a missing global in any area is caught.
  const expected = [
    'cleanCatalogName', 'itemStatus', 'catalogCategory', 'normalizeAccessories',
    'escapeHtml', 'formatDate', 'parseQuery', 'splitOrGroups', 'parseSearch', 'matchesQuery',
    'render', 'renderCard', 'openModal', 'toast', 'wireEvents',
    'renderTrade', 'openAccountModal', 'wireLegalModal', 'renderAdmin',
    'openCatalogItemModal', 'boot', 'renderSocial', 'renderFeed',
  ];
  for (const fn of expected) {
    assert.equal(app.typeOf(fn), 'function', `${fn} should be a defined function`);
  }
});

test('pure helpers actually execute across the realm boundary', () => {
  const app = loadApp();
  assert.equal(app.call('escapeHtml', '<a>&"x"'), '&lt;a&gt;&amp;&quot;x&quot;');
  assert.equal(app.call('formatDate', '2026-06-22'), 'Jun 22, 2026');
});
