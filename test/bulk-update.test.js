'use strict';
// data.bulkUpdateCollection — the write path behind the bulk editor.
//
// This one is worth pinning down in a unit test rather than only through the
// UI, because two of its properties are invisible on screen until they bite:
//   • it must CHUNK (PostgREST puts `id=in.(…)` in the URL; a 600-item batch
//     would build a ~23KB URL and get rejected by a proxy, not by us), and
//   • it must report the row count the DATABASE gives back, not the number we
//     optimistically asked for — the caller uses the difference to decide
//     whether it can patch memory or has to re-read from the server.
//
// data.js is a plain global-scope script that reaches for a global `sb` at call
// time, so we can run it in a vm with a recording stub in place of Supabase.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'data.js'), 'utf8');

// Records every .from(table).update(cols).in(col, ids).select() chain.
function makeSb(respond) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, cols: null, ids: null };
      const chain = {
        update(cols) { call.cols = cols; return chain; },
        in(_col, ids) { call.ids = ids; return chain; },
        select() {
          calls.push(call);
          return Promise.resolve(respond(call, calls.length));
        },
      };
      return chain;
    },
  };
}

function loadData(sb) {
  const ctx = {
    console, window: {}, sb,
    idb: {}, toast() {}, setTimeout, clearTimeout, fetch: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // `const data = {…}` is lexical, so it never lands on the sandbox object —
  // but data.js publishes itself the same way the browser sees it.
  return ctx.window.data;
}

const ids = (n) => Array.from({ length: n }, (_, i) => `id-${i}`);
const okAll = (call) => ({ data: call.ids.map((id) => ({ id })), error: null });

test('bulk update maps only the fields it was given onto columns', async () => {
  const sb = makeSb(okAll);
  const data = loadData(sb);

  await data.bulkUpdateCollection(['a'], { acquiredHow: 'Purchased Secondhand' });
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].table, 'plushies');
  assert.equal(sb.calls[0].cols.acquired_how, 'Purchased Secondhand');
  assert.ok(!('date_collected' in sb.calls[0].cols), 'a blank date must not touch date_collected');
  assert.ok(sb.calls[0].cols.updated_at, 'updated_at should be stamped');

  await data.bulkUpdateCollection(['a'], { dateCollected: '2026-07-04' });
  assert.equal(sb.calls[1].cols.date_collected, '2026-07-04');
  assert.ok(!('acquired_how' in sb.calls[1].cols), 'a blank how must not touch acquired_how');

  await data.bulkUpdateCollection(['a'], { acquiredHow: 'Gift', dateCollected: '2026-07-04' });
  assert.equal(sb.calls[2].cols.acquired_how, 'Gift');
  assert.equal(sb.calls[2].cols.date_collected, '2026-07-04');
});

test('bulk update refuses a patch with nothing in it', async () => {
  const data = loadData(makeSb(okAll));
  await assert.rejects(() => data.bulkUpdateCollection(['a'], {}), /no fields to change/i);
});

test('bulk update chunks large selections (URL-length safety)', async () => {
  const sb = makeSb(okAll);
  const data = loadData(sb);

  const changed = await data.bulkUpdateCollection(ids(250), { acquiredHow: 'Mystery Bag' });

  assert.deepEqual(sb.calls.map((c) => c.ids.length), [100, 100, 50]);
  assert.equal(changed, 250, 'every chunk counts toward the total');
  // No id may be dropped or repeated across the chunks.
  const sent = sb.calls.flatMap((c) => c.ids);
  assert.equal(new Set(sent).size, 250);
});

test('bulk update reports the DB row count, not the count we asked for', async () => {
  // RLS (or a row deleted from another device) can silently drop items. The
  // caller compares this number against its selection to decide whether to
  // trust its in-memory copy — so an inflated count would produce a screen
  // that says something untrue.
  const sb = makeSb((call) => ({ data: call.ids.slice(0, 2).map((id) => ({ id })), error: null }));
  const data = loadData(sb);

  const changed = await data.bulkUpdateCollection(ids(10), { acquiredHow: 'Trade' });
  assert.equal(changed, 2);
});

test('bulk update fails loudly — no partial-success swallow', async () => {
  const sb = makeSb((call, n) => (n === 2
    ? { data: null, error: { message: 'permission denied for table plushies' } }
    : okAll(call)));
  const data = loadData(sb);

  // It rethrows Supabase's own error object (house style across data.js), so
  // assert on that rather than on an Error message.
  await assert.rejects(
    () => data.bulkUpdateCollection(ids(150), { acquiredHow: 'Contest' }),
    (err) => /permission denied/.test(err.message),
  );
  assert.equal(sb.calls.length, 2, 'it should stop at the failing chunk, not push on');
});
