'use strict';
// Tier 0 — release-hygiene guards.
//
// The Plush Crypt ships as a no-build static site behind a service worker, so
// "did the fix actually reach the user?" is not enforced by a compiler — it is
// enforced by hand-remembered conventions in CLAUDE.md. Every one of those
// conventions is a place a correct code change can ship as an INVISIBLE fix:
// the bytes changed on disk but the client keeps running the cached old copy
// because a cache-buster wasn't bumped. This project has been bitten by exactly
// that class of bug (a stale SW cache racing auth load; a migration shipped
// ahead of the code that reads it).
//
// These tests turn those manual checklist items into deterministic gates:
//   1. Every `app-*.js` shares one cache-buster version (they update as a set).
//   2. Every `?v=` asset referenced by index.html actually exists on disk.
//   3. The SW precache list is present, real, and query-string-free (a versioned
//      entry would 404 the addAll and block install entirely).
//   4. No root-absolute local asset paths (they break under capacitor://).
//   5. Migration numbers are unique (gaps are fine; collisions are not).
//   6. [git-aware] If a versioned asset's bytes changed vs the base branch, its
//      `?v=` — and the SW CACHE const — must have been bumped too.
//
// Checks 1–5 are static (no git, always run). Check 6 needs a base ref to diff
// against; when none is resolvable it skips loudly rather than failing, so the
// suite still runs in a bare checkout.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Pull every `./<file>?v=<N>` reference out of an index.html string into a
// { file: version } map. This is the single source of truth for "which files
// carry a cache-buster", so the rules below stay correct as assets are added.
function versionedAssets(html) {
  const map = {};
  for (const m of html.matchAll(/\.\/([\w.-]+)\?v=(\d+)/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

test('every app-*.js part shares one cache-buster version (they ship as a set)', () => {
  const assets = versionedAssets(read('index.html'));
  const parts = Object.entries(assets).filter(([f]) => /^app-.*\.js$/.test(f));
  assert.ok(parts.length >= 2, 'expected the split app-*.js parts to be referenced');
  const versions = [...new Set(parts.map(([, v]) => v))];
  assert.equal(
    versions.length, 1,
    `app-*.js parts drifted onto different versions: ${parts.map(([f, v]) => `${f}=${v}`).join(', ')}`,
  );
});

test('every versioned asset referenced by index.html exists on disk', () => {
  const assets = versionedAssets(read('index.html'));
  assert.ok(Object.keys(assets).length > 0, 'expected some ?v= assets in index.html');
  for (const file of Object.keys(assets)) {
    assert.ok(
      fs.existsSync(path.join(ROOT, file)),
      `index.html references ./${file}?v=… but the file does not exist`,
    );
  }
});

test('service worker precache list is real and query-string-free', () => {
  const sw = read('sw.js');
  const block = sw.match(/const ASSETS\s*=\s*\[([^\]]*)\]/);
  assert.ok(block, 'could not find the ASSETS = [ … ] precache list in sw.js');
  const entries = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(entries.length > 0, 'ASSETS list is empty');
  for (const entry of entries) {
    // A versioned entry (…?v=N) would 404 the addAll and block install; the SW
    // deliberately precaches only unversioned shell files and fetches the rest.
    assert.ok(!entry.includes('?'), `SW ASSETS must not carry a query string: '${entry}'`);
    // './' is the app root (served as index.html); every other entry is a file.
    if (entry === './' || entry === '.') continue;
    const rel = entry.replace(/^\.\//, '');
    assert.ok(
      fs.existsSync(path.join(ROOT, rel)),
      `SW precaches '${entry}' but the file does not exist — addAll would 404 and block install`,
    );
  }
});

test('index.html has no root-absolute local asset paths (Capacitor-safe)', () => {
  const html = read('index.html');
  // src/href="/foo" breaks when served from capacitor://localhost. Protocol-
  // relative ("//cdn…") and full URLs are fine; only a single leading slash to
  // a same-origin path is the hazard. Same-origin absolute paths (e.g. the DB's
  // /tom.jpg) are a known separate concern tracked in CLAUDE.md, not markup.
  const offenders = [...html.matchAll(/\b(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(
    offenders, [],
    `root-absolute asset paths break under capacitor://localhost — use ./relative: ${offenders.join(', ')}`,
  );
});

// Three number collisions already exist on main — two parallel branches each
// grabbed the same NNNN before this guard existed, and the migrations are long
// since applied in Supabase, so renumbering them now would only desync history.
// They are grandfathered here; ANY new collision must still fail the build.
const KNOWN_DUP_NUMBERS = new Set(['0034', '0042', '0066']);

test('migration numbers are unique (collisions, not gaps, are the bug)', () => {
  const nums = fs.readdirSync(path.join(ROOT, 'db'))
    .map((f) => f.match(/^(\d{4})_.*\.sql$/))
    .filter(Boolean)
    .map((m) => m[1]);
  assert.ok(nums.length > 0, 'expected db/00NN_*.sql migrations');
  const dupes = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))]
    .filter((n) => !KNOWN_DUP_NUMBERS.has(n));
  assert.deepEqual(
    dupes, [],
    `duplicate migration number(s) — two branches grabbed the same NNNN: ${dupes.join(', ')}`,
  );
});

test('script tags load in the load-bearing order (supports first, parts in sequence, app-social last)', () => {
  // The app-*.js parts share one global scope with no import/export, so the
  // <script> order in index.html IS the dependency graph. PARTS (from the test
  // harness) is the single source of truth for that order; app-social.js boots
  // the app and must stay last.
  const { PARTS } = require('./harness.js');
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="\.\/([^"?]+)/g)].map((m) => m[1]);
  const appParts = scripts.filter((s) => /^app-.*\.js$/.test(s));
  assert.deepEqual(appParts, PARTS, 'app-*.js script tags must match the harness PARTS order exactly');
  assert.equal(scripts[scripts.length - 1], 'app-social.js', 'app-social.js boots the app and must be the last script');
  // config/auth/db/data define the globals the parts read — all must precede
  // the first app part (a part loading first is a load-time ReferenceError).
  const firstPart = scripts.indexOf(appParts[0]);
  for (const support of ['config.js', 'auth.js', 'db.js', 'data.js']) {
    const idx = scripts.indexOf(support);
    assert.ok(idx !== -1 && idx < firstPart, `${support} must load before the first app-*.js part`);
  }
});

test('every local asset in index.html is covered by the SW strategy (?v= or precached)', () => {
  // The SW serves versioned files (?v=N) from its fetch handler and precaches
  // the unversioned shell in ASSETS. A local asset with neither is invisible
  // to cache invalidation: it can go stale with no way to bust it.
  const html = read('index.html');
  const sw = read('sw.js');
  const precached = new Set(
    [...sw.match(/const ASSETS\s*=\s*\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)]
      .map((m) => m[1].replace(/^\.\//, '')),
  );
  const locals = [...html.matchAll(/\b(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
  const uncovered = [...new Set(locals)]
    .filter((ref) => !ref.includes('?v='))
    .filter((ref) => !precached.has(ref));
  assert.deepEqual(
    uncovered, [],
    `local asset(s) with no cache-bust and no SW precache entry — they can go stale forever: ${uncovered.join(', ')}`,
  );
});

// ── git-aware bump guard ────────────────────────────────────────────────────
// Resolve a base commit to diff the working tree against. Prefer an explicit
// override, then origin/main, then main. Returns null if nothing resolves (bare
// checkout / no history) so the test skips instead of failing.
function gitBase() {
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  for (const ref of [process.env.HYGIENE_BASE, 'origin/main', 'main'].filter(Boolean)) {
    try {
      git(`rev-parse --verify ${ref}^{commit}`);
      return git(`merge-base HEAD ${ref}`);
    } catch { /* try next candidate */ }
  }
  return null;
}

test('changed versioned assets got their ?v= and the SW CACHE bumped', (t) => {
  const base = gitBase();
  if (!base) {
    t.skip('no base ref (origin/main | main | $HYGIENE_BASE) resolvable — cannot diff for version bumps');
    return;
  }
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

  // Files that differ between the base commit and the current working tree.
  const changed = new Set(git(`diff --name-only ${base}`).split('\n').filter(Boolean));
  if (changed.size === 0) return; // on base itself / no divergence — nothing to check.

  const nowHtml = read('index.html');
  let baseHtml = '';
  try { baseHtml = git(`show ${base}:index.html`); } catch { /* index.html is new */ }
  const nowV = versionedAssets(nowHtml);
  const baseV = versionedAssets(baseHtml);

  // Rule A: any versioned asset whose bytes changed must have a bumped ?v=.
  const stale = [];
  let anyVersionedChanged = false;
  for (const file of Object.keys(nowV)) {
    if (!changed.has(file)) continue;
    anyVersionedChanged = true;
    // A brand-new file (absent at base) has no prior version to bump past.
    if (baseV[file] !== undefined && baseV[file] === nowV[file]) {
      stale.push(`${file} (still v=${nowV[file]})`);
    }
  }
  assert.deepEqual(
    stale, [],
    `changed but not cache-busted — clients will run the stale copy. Bump ?v= in index.html for: ${stale.join(', ')}`,
  );

  // Rule B: if any versioned asset changed, the SW CACHE const must be bumped
  // too, or the service worker keeps serving the old shell from its cache.
  if (anyVersionedChanged) {
    const cacheOf = (sw) => (sw.match(/const CACHE\s*=\s*'([^']+)'/) || [])[1];
    const nowCache = cacheOf(read('sw.js'));
    let baseCache;
    try { baseCache = cacheOf(git(`show ${base}:sw.js`)); } catch { baseCache = undefined; }
    if (baseCache !== undefined) {
      assert.notEqual(
        nowCache, baseCache,
        `versioned assets changed but sw.js CACHE is still '${nowCache}' — bump it so the SW drops the stale cache`,
      );
    }
  }
});
