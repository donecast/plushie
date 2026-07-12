'use strict';
// Tier 1 — render smoke test.
//
// The load test (smoke.test.js) proves the code parses and defines its
// globals; this tier proves render() actually PAINTS. Using the harness's
// recording DOM, each test seeds `state`, calls the real render path, and
// asserts on the innerHTML the app wrote — so a runtime TypeError inside
// render()/renderCard()/renderFeed() (the classic "blank page, console
// error" failure) breaks CI instead of production. Assertions are loose on
// purpose: they check the seeded data shows up (and dangerous input stays
// escaped), not exact markup, so styling churn doesn't cause false failures.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.js');

// Every render path assumes a signed-in user (the auth gate guarantees it in
// production — e.g. renderFeed reads window.currentUser.username directly).
function loadForRender() {
  const app = loadApp({ dom: 'recording' });
  app.setGlobal('currentUser', {
    id: 'u-me', username: 'testcrypt', isAdmin: false, canModerate: false,
  });
  return app;
}

// Fixtures use the real field names (same shapes as units.test.js).
const CATALOG = [
  { id: 'c1', name: 'Rabbit in a Waistcoat', type: 'Plush', available: true, tags: [] },
  { id: 'c2', name: 'Skelly Tote', type: 'Accessory', available: false, tags: [] },
];
// Collection items get their category by joining to the catalog on catalogId
// (itemCategory) — without one they'd fall through to the 'other' sub-tab.
const COLLECTION_ITEM = {
  id: 'i1', name: 'Mopey Rabbit', catalogId: 'c1', quantity: 1,
  dateCollected: '2026-06-01', addedAt: 1, tags: [],
};

test('render() completes on every top-level tab without throwing', () => {
  const app = loadForRender();
  for (const tab of ['home', 'catalog', 'crypt', 'trade', 'admin']) {
    app.seedState({ tab });
    assert.doesNotThrow(() => app.call('render'), `render() threw on tab='${tab}'`);
  }
  // Crypt sub-views (wish list + pens checklist) run their own branches.
  for (const colSubTab of ['wishlist', 'pens']) {
    app.seedState({ tab: 'crypt', colSubTab });
    assert.doesNotThrow(() => app.call('render'), `render() threw on crypt/${colSubTab}`);
  }
});

test('render() shows only the active view', () => {
  const app = loadForRender();
  app.seedState({ tab: 'catalog' });
  app.call('render');
  const hidden = (id) => app.dom.registry.get(id).classList.contains('hidden');
  assert.equal(hidden('catalog-view'), false, 'catalog view should be visible');
  for (const id of ['collection-view', 'wishlist-view', 'trade-view', 'social-view', 'admin-view']) {
    assert.equal(hidden(id), true, `${id} should be hidden on the catalog tab`);
  }
});

test('catalog tab paints the seeded items into the grid', () => {
  const app = loadForRender();
  app.seedState({ tab: 'catalog', catalog: CATALOG });
  app.exec("state.ready.add('catalog')");
  app.call('render');
  const html = app.dom.html('catalog-grid');
  assert.match(html, /Rabbit in a Waistcoat/);
  assert.match(html, /Skelly Tote/);
});

test('sections show a loading placeholder until their first load lands', () => {
  const app = loadForRender();
  // state.ready is empty on a fresh boot — every section is still in flight.
  app.seedState({ tab: 'catalog' });
  app.call('render');
  assert.match(app.dom.html('catalog-grid'), /Summoning/, 'catalog should show loading, not empty');

  app.seedState({ tab: 'crypt', colSubTab: 'plushes' });
  app.call('render');
  assert.match(app.dom.html('collection-grid'), /Summoning/, 'collection should show loading, not empty');
});

test('collection grid paints the item and escapes hostile names', () => {
  const app = loadForRender();
  const evil = { ...COLLECTION_ITEM, id: 'i2', name: 'Evil <img src=x onerror=alert(1)> Bun' };
  app.seedState({ tab: 'crypt', colSubTab: 'plushes', collection: [COLLECTION_ITEM, evil], catalog: CATALOG });
  app.exec("state.ready.add('collection')");
  app.call('render');
  const html = app.dom.html('collection-grid');
  assert.match(html, /Mopey Rabbit/);
  assert.ok(!html.includes('<img src=x onerror='), 'item name must be HTML-escaped');
  assert.match(html, /&lt;img src=x onerror=/, 'escaped name should still be visible');
  // The count label reflects what's shown.
  assert.equal(app.dom.registry.get('count-label').textContent, '2 of 2 items');
});

test('wishlist sub-tab paints wished items', () => {
  const app = loadForRender();
  const wish = { id: 'w1', name: 'Taurus the Bull', category: 'plush', addedAt: 1, tags: [] };
  app.seedState({ tab: 'crypt', colSubTab: 'wishlist', wishlist: [wish] });
  app.exec("state.ready.add('collection')");   // wishlist loads with the collection
  app.call('render');
  assert.match(app.dom.html('wishlist-grid'), /Taurus the Bull/);
});

test('home feed paints a seeded post with author and escaped body', () => {
  const app = loadForRender();
  const post = {
    id: 'p1', authorId: 'u-amber', authorName: 'redrambler', authorAvatar: null,
    visibility: 'public', createdAt: '2026-06-01T00:00:00Z',
    body: 'New rabbit day! <script>alert(1)</script>',
    reactions: [], comments: [],
  };
  app.seedState({ tab: 'home', socSubTab: 'feed', socFeed: [post] });
  app.exec("state.ready.add('social')");
  app.call('render');
  const html = app.dom.html('soc-feed');
  assert.match(html, /@redrambler/);
  assert.match(html, /New rabbit day!/);
  assert.ok(!html.includes('<script>'), 'post body must be HTML-escaped');
});

test('empty-but-loaded feed shows the quiet-crypt note, not a spinner', () => {
  const app = loadForRender();
  app.seedState({ tab: 'home', socSubTab: 'feed', socFeed: [] });
  app.exec("state.ready.add('social')");
  app.call('render');
  const html = app.dom.html('soc-feed');
  assert.match(html, /The crypt is quiet/);
  assert.ok(!html.includes('Summoning'), 'loaded-empty feed should not show the loading placeholder');
});

test('messages: thread list and conversation paint, bodies escaped', () => {
  const app = loadForRender();

  // Thread list: one unread conversation.
  app.seedState({
    tab: 'home', socSubTab: 'messages', dmPartner: null,
    dmThreads: [{ partnerId: 'u-amber', username: 'redrambler', avatarUrl: null,
                  lastBody: 'Is the <b>Gingerdread</b> still available?', lastFromMe: false,
                  lastAt: '2026-07-11T00:00:00Z', unread: 2 }],
  });
  app.exec("state.ready.add('social')");
  app.call('render');
  let html = app.dom.html('soc-messages');
  assert.match(html, /@redrambler/);
  assert.match(html, /data-soc-action="open-dm"/);
  assert.ok(!html.includes('<b>Gingerdread</b>'), 'thread preview must be HTML-escaped');

  // Open conversation: bubbles for both sides, composer present, escaping holds.
  app.seedState({
    dmPartner: { id: 'u-amber', username: 'redrambler', avatarUrl: null },
    dmMessages: [
      { id: 'm1', mine: false, body: 'Trade you a <script>pen</script>?', createdAt: '2026-07-11T00:00:00Z', readAt: null },
      { id: 'm2', mine: true, body: 'Deal!', createdAt: '2026-07-11T00:01:00Z', readAt: null },
    ],
  });
  app.call('render');
  html = app.dom.html('soc-messages');
  assert.match(html, /dm-theirs/);
  assert.match(html, /dm-mine/);
  assert.match(html, /Deal!/);
  assert.ok(!html.includes('<script>'), 'message body must be HTML-escaped');
  assert.match(html, /data-soc-action="submit-dm"/);
  assert.match(html, /data-soc-action="dm-back"/);

  // The in-view poll timer must not outlive the test.
  app.exec('clearInterval(window._dmTimer); window._dmTimer = null;');
});

test('messages: friend rows and friend profiles offer a Message button', () => {
  const app = loadForRender();
  app.seedState({
    tab: 'home', socSubTab: 'friends',
    socFriends: [{ userId: 'u-amber', username: 'redrambler', avatarUrl: null, isInner: false, isCoffinBuddy: false }],
    socRequests: [], socSearch: [],
  });
  app.exec("state.ready.add('social')");
  app.call('render');
  const html = app.dom.html('soc-friends');
  assert.match(html, /data-soc-action="open-dm" data-uid="u-amber" data-name="redrambler"/);
});
