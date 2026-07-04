// ════════════════════════════════════════════════════════════════════
// app-core.js — part 1 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: State, image compression, blob-URL management, and initial data load.
// ════════════════════════════════════════════════════════════════════

// ─── State ────────────────────────────────────────────────────────────
const state = {
  tab: 'home',                // landing tab — 'home' (feed) | 'catalog' | 'crypt' | 'trade' | 'admin'
  colSubTab: 'plushes',       // My Crypt sub-tab: 'plushes' | 'minis' | 'accessories' | 'other' | 'pens' | 'wishlist'
  filter: 'all',              // collection: all | active | retired
  colCategory: 'all',         // legacy category chip (superseded by sub-tabs; kept inert)
  colDupes: false,            // collection: only quantity > 1
  colNoBag: false,            // collection: only missing bag
  colSort: 'acquired_desc',
  arranging: false,           // actively in drag-to-reorder mode (the ↕ Arrange toggle).
                              // Separate from colSort==='manual': the custom order can be
                              // *shown* without the drag grips being live.
  colView: 'compact',         // collection layout: 'cards' (roomy) | 'compact' (dense list).
                              // Defaults to compact — the dense list is the better daily driver.
  wishCategory: 'all',
  wishInStock: false,
  wishSort: 'added_desc',
  wishView: 'compact',        // wishlist layout: 'cards' | 'compact' (mirrors colView)
  wishArranging: false,       // wishlist drag-to-reorder mode (mirrors `arranging`)
  catalogFilter: 'all',       // catalog category: all | plush | accessory | other
  catalogStatuses: new Set(), // empty = any; otherwise OR of: available/sold_out/coming_soon/retired/fyc
  catalogUnowned: false,      // toggle: hide ones already in collection
  catalogOriginal: false,     // toggle: only show items tagged 'original' (early forms / OG versions)
  catalogTheme: 'all',        // tag value to require; 'all' = no constraint
  catalogColor: 'all',        // color tag substring match; 'all' = no constraint
  catalogSort: 'newest',      // newest | oldest | name_asc | name_desc | price_asc | price_desc
  // Search is per-section: a query typed on the collection doesn't bleed into
  // the catalog or wish list, and each remembers its own text. (Replaces the
  // old single `query`.)
  colQuery: '',
  catQuery: '',
  wishQuery: '',
  editingId: null,
  railDetailId: null,         // collection/wishlist item shown in the right-rail master-detail
  railCatalogId: null,        // catalog item shown in the right-rail master-detail (richer detail)
  // Which sections have completed their first data load this session
  // ('collection' | 'catalog' | 'trade' | 'social'). Until a section is in
  // here we show a "Summoning…" loading placeholder instead of its empty
  // state — so a refresh reads as "loading", not "your data vanished". A
  // section is added once it has *attempted* a load (success OR handled
  // failure), so a genuine empty still shows its real empty-state.
  ready: new Set(),
  collection: [],
  wishlist: [],
  catalog: [],                // loaded from catalog.json
  pensOwned: new Map(),       // id → count (omitted = 0)
  pensMeta: [],               // catalog of pens (id, line, name, image_path, image URL) — loaded from DB
  blobUrls: new Map(),

  // ─── Trade state ──────────────────────────────────────────────────
  tradeSubTab: 'browse',      // 'browse' | 'trades' | 'items'
  myTradeItems: [],
  tradeBrowse: [],
  trades: [],
  myFeedback: { good_count: 0, meh_count: 0, bad_count: 0, net_score: 0, total_count: 0 },
  partnerFeedback: new Map(), // userId → summary (cache shared by rep badges + ship-first banner)
  myFeedbackByTrade: {},      // tradeId → trade_feedback row (for the edit-within-7-days flow)
  tradeFilter: 'open',        // My Trades filter pill: open | pending | active | past
  offerDraft: null,           // { recipientId, recipientUsername, recipientItems, myItems, parentTradeId? }
  feedbackDraft: null,        // { tradeId, rateeId, ratings: { communication, shipping, accuracy }, mode: 'new'|'edit' }

  // ─── Admin state ──────────────────────────────────────────────────
  adminUsers: [],             // list of all profiles + feedback
  adminUserView: null,        // { user, snapshot } when drilled into a user
  adminPendingCatalog: [],    // pending catalog_items waiting for admin review
  adminPendingPhotos: [],     // pending photo suggestions waiting for admin review
  adminOpenDisputes: [],      // trades with dispute_open = true (admin review queue)
  adminOpenReports: [],       // open content_reports (admin review queue)
  reportTarget: null,         // { targetType, targetId, ownerId, name } for the report modal
  suggestPhotoTarget: null,   // { id, kind } for the suggest-photo modal
  disputeDraft: null,         // { tradeId, mode: 'open' | 'add' } when filing a dispute statement
  bundlePicker: null,         // { bundleId, matches } when the bundle component picker is open
  catalogItemModalMode: 'admin', // 'admin' | 'user' — drives the Add Catalog Item modal copy + UI
  catalogItemPicked: null,    // { photoPath } when admin picked an image from a user's collection
  catalogMerge: null,         // { duplicateId, winnerId } for the admin merge tool

  // ─── Social state ─────────────────────────────────────────────────
  socSubTab: 'feed',          // 'feed' | 'friends' | 'me'
  socFeed: [],                // hydrated post view-objects
  socFriends: [],             // accepted friends [{userId, username, avatarUrl, isInner}]
  socRequests: [],            // incoming pending friend requests
  socSearch: [],              // user search results
  socSearchQuery: '',
  socProfile: null,           // { profile, posts, top8, friendship } when viewing someone
  socExpandedComments: new Set(), // postIds whose comment box/list is expanded
  socReplyTo: null,               // comment id currently being replied to
  socEditComment: null,           // comment id currently being edited
  socComposeVis: 'public',    // visibility selected in the composer (default: Public)
  socComposePhoto: null,      // pending compressed Blob for a new post
  socPendingCount: 0,         // incoming friend requests — drives the tab badge
};

// ─── Tiny DOM show/hide helpers ────────────────────────────────────────
// The app toggles visibility with the `.hidden` class everywhere — modals,
// error rows, empty states, sub-sections. These two one-liners replace the
// repeated `document.getElementById(id).classList.remove/add('hidden')`. The
// optional chaining makes a missing element a no-op (strictly safer than the
// old bare `.classList` calls, and matches the sites that already used `?.`).
function showEl(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideEl(id) { document.getElementById(id)?.classList.add('hidden'); }

// Compact list view is a desktop-only density option. On phones it's too
// cramped to be worthwhile, so we ignore a saved 'compact' preference there and
// always fall back to roomy cards (the #col-view / #wish-view toggle is hidden
// on phones too). Single source of truth for the "is this a phone" line — keep
// it in sync with the toggle-hiding rule in styles.css (@media max-width:768px).
const PHONE_MEDIA = '(max-width: 768px)';
function compactViewAllowed() {
  return !window.matchMedia(PHONE_MEDIA).matches;
}

// Themed visibility tiers. The DB enum is public|friends|inner|coffin_buddies;
// these are the gothic-cute labels the UI shows. Rename here to re-theme.
// Nesting: Public ⊇ Coven ⊇ Castle Crew ('inner') ⊇ Coffin Buddies.
const VIS_META = {
  public:         { label: 'Public',         glyph: '🌍', hint: 'Anyone with an account' },
  friends:        { label: 'Coven',          glyph: '🦇', hint: 'Your accepted friends' },
  inner:          { label: 'Castle Crew',    glyph: '🏰', hint: 'Friends in your Castle Crew' },
  coffin_buddies: { label: 'Coffin Buddies', glyph: '⚰️', hint: 'Your innermost Coffin Buddies' },
};
// Per-item visibility (item 11): the post tiers plus a private "Only me".
const ITEM_VIS_META = {
  ...VIS_META,
  private: { label: 'Only me', glyph: '🔒', hint: 'Just you' },
};

const PRODUCT_URL_BASE = 'https://plushiedreadfuls.com/products/';

// Social links (item 1): collectors enter just a username/handle per network;
// we derive the full profile URL. Order here = display order. `url(handle)`
// builds the link from a sanitized handle (leading @ already stripped).
const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', glyph: '📷', eg: 'spookyplush',              url: (h) => `https://instagram.com/${h}` },
  { key: 'tiktok',    label: 'TikTok',    glyph: '🎵', eg: 'spookyplush',              url: (h) => `https://www.tiktok.com/@${h}` },
  { key: 'x',         label: 'X',         glyph: '✖️', eg: 'spookyplush',              url: (h) => `https://x.com/${h}` },
  { key: 'bluesky',   label: 'BlueSky',   glyph: '🦋', eg: 'spookyplush.bsky.social',  url: (h) => `https://bsky.app/profile/${h}` },
  { key: 'youtube',   label: 'YouTube',   glyph: '▶️', eg: 'spookyplush',              url: (h) => `https://www.youtube.com/@${h}` },
  { key: 'facebook',  label: 'Facebook',  glyph: '📘', eg: 'spooky.plush',             url: (h) => `https://facebook.com/${h}` },
  { key: 'linkedin',  label: 'LinkedIn',  glyph: '💼', eg: 'spooky-plush',             url: (h) => `https://www.linkedin.com/in/${h}` },
];

// Normalize whatever the user typed into a bare handle: trim, drop a leading
// '@', and if they pasted a full URL keep just the last meaningful path piece.
function sanitizeSocialHandle(raw) {
  let h = (raw || '').trim();
  if (!h) return '';
  if (/^https?:\/\//i.test(h)) {
    try {
      const parts = new URL(h).pathname.split('/').filter(Boolean);
      h = parts.length ? parts[parts.length - 1] : '';
    } catch { /* fall through with the raw string */ }
  }
  return h.replace(/^@+/, '').trim();
}

// Hardcoded fallback list. Renders if state.pensMeta hasn't loaded
// yet (offline launch, slow network); otherwise the DB-backed
// state.pensMeta wins via the activePens() getter below — which
// carries image URLs.
const PENS = [
  { line: 'Plushie Dreadfuls', id: 'pd-bpd',         name: 'Borderline Personality Disorder' },
  { line: 'Plushie Dreadfuls', id: 'pd-ptsd',        name: 'PTSD' },
  { line: 'Plushie Dreadfuls', id: 'pd-nb',          name: 'Non-Binary' },
  { line: 'Plushie Dreadfuls', id: 'pd-love',        name: 'Love' },
  { line: 'Plushie Dreadfuls', id: 'pd-autism',      name: 'Autism' },
  { line: 'Plushie Dreadfuls', id: 'pd-dissociation',name: 'Dissociation' },
  { line: 'Plushie Dreadfuls', id: 'pd-depression',  name: 'Depression' },
  { line: 'Plushie Dreadfuls', id: 'pd-gd',          name: 'Gender Dysphoria' },
  { line: 'Plushie Dreadfuls', id: 'pd-anxiety',     name: 'Anxiety' },
  { line: 'Plushie Dreadfuls', id: 'pd-adhd',        name: 'ADHD' },
  { line: 'Plushie Dreadfuls', id: 'pd-ouchie',      name: 'Ouchie' },
  { line: 'Plushie Dreadfuls', id: 'pd-numb',        name: 'Numb' },
  { line: 'Plushie Dreadfuls', id: 'pd-bone',        name: 'Bone Organ Izer' },
  { line: 'Victorian McGee',   id: 'vm-alice',       name: 'Alice' },
  { line: 'Victorian McGee',   id: 'vm-wr',          name: 'White Rabbit' },
  { line: 'Victorian McGee',   id: 'vm-cc',          name: 'Cheshire Cat' },
  { line: 'Victorian McGee',   id: 'vm-mt',          name: 'Mock Turtle' },
  { line: 'Victorian McGee',   id: 'vm-dor',         name: 'Dormouse' },
  { line: 'Victorian McGee',   id: 'vm-rrh',         name: 'Red Riding Hood' },
  { line: 'Victorian McGee',   id: 'vm-hyst',        name: 'Hysteria' },
];

// Resolves to the DB-backed pen catalog when loaded (includes image
// URLs); falls back to the hardcoded list before the first load.
function activePens() {
  return (state.pensMeta && state.pensMeta.length) ? state.pensMeta : PENS;
}

// Drop the redundant standalone word "Outfit" from a display name. Many
// Plushie Dreadfuls clothing items are named "… Cloak Outfit" / "Plush
// Outfit - Pink Kimono"; the word adds nothing in the UI. Applied site-wide
// to every place a name is shown (catalog, collection, closet, attached
// accessories, modals). Tidies up the spacing/dashes it leaves behind.
function stripOutfitWord(name) {
  let n = String(name || '');
  // Drop the "Mini Plush Outfit" / "Plush Outfit" product-line wording (often
  // followed by a dash): "Mini Plush Outfit - Big Blue Bow" → "Big Blue Bow".
  n = n.replace(/\b(mini\s+)?plush\s+outfit\b\s*[-–—:]?\s*/gi, ' ');
  // Drop any remaining standalone "Outfit" / "Outfits".
  n = n.replace(/\bOutfits?\b/gi, ' ');
  n = n.replace(/\s{2,}/g, ' ').trim();
  n = n.replace(/\s+([-–—])\s+/g, ' $1 ');     // normalise spacing around dashes
  n = n.replace(/^[\s-–—:]+|[\s-–—:]+$/g, '').trim();   // drop dangling dashes
  return n || String(name || '').trim();
}

function cleanCatalogName(name) {
  const afterPrefix = name.replace(/^Plushie Dreadfuls\s*-?\s*/i, '').trim() || name;
  let n = afterPrefix;
  // Trailing descriptive type suffixes that just repeat "this is a plushie."
  n = n.replace(/\s*-?\s*Plush\s+(Rabbit\s+)?Stuffed\s+(Cryptid\s+)?Animals?$/i, '').trim();
  n = n.replace(/\s*-?\s*Stuffed\s+Plush\s+Animals?$/i, '').trim();
  n = n.replace(/\s*-?\s*Plush\s+Cryptid\s+Stuffed\s+Animals?$/i, '').trim();
  n = n.replace(/\s*-?\s*(Mini\s+)?Plush\s+Keychain(\s+Accessor(?:y|ies))?$/i, '').trim();
  n = n.replace(/\s*-\s*$/, '').trim();
  n = n.length >= 3 ? n : afterPrefix;
  return stripOutfitWord(n);
}

function shopifyImageVariant(url, size) {
  if (!url) return null;
  // The _<size>x trick only works on Shopify's CDN. Any other URL — an
  // R2-hosted community photo (catalog_photos Picture A), a signed
  // Storage URL, etc. — must pass through untouched; mangling its
  // extension just yields a 404. Callers fall back to the original URL,
  // so returning it unchanged is the right no-op.
  if (!/^https:\/\/cdn\.shopify\.com\//.test(url)) return url;
  // Shopify CDN: insert _<size>x before extension, e.g. .jpg → _400x.jpg
  return url.replace(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i, `_${size}x.$1$2`);
}

// Wrap a Shopify CDN URL with the image-proxy Worker if one is
// configured (config.js → IMG_PROXY_BASE). Returns the original URL
// when no proxy is set, which means addFromCatalog will hot-link on
// CORS failure (the legacy behavior). Pass the URL untouched if it
// isn't a Shopify CDN URL — user-uploaded photos, etc., shouldn't
// route through the catalog proxy.
function proxyImageUrl(url, size) {
  if (!url) return null;
  const base = (window.IMG_PROXY_BASE || '').replace(/\/$/, '');
  if (!base) return url;
  if (!/^https:\/\/cdn\.shopify\.com\//.test(url)) return url;
  const q = '?url=' + encodeURIComponent(url) + (size ? '&size=' + size : '');
  return base + q;
}

function isCharm(item) {
  const tags = (item.tags || []).map((t) => t.toLowerCase());
  return tags.includes('bag charm') || tags.includes('bagcharm');
}

// Build a visible "you have these filters on" strip below the chip row.
// Each active filter shows as a removable pill — gives immediate feedback
// that filters are real and lets the user clear them one at a time.
function renderActiveFilters(shownCount) {
  const bar = document.getElementById('active-filters');
  // Exclude umbrella variant-parents — they're hidden from the grid, so the
  // "N of M products" denominator should count the browsable rows only.
  const total = state.catalog.filter((c) => !c.variantParent).length;
  if (total === 0) {
    bar.innerHTML = '<span class="active-count">Loading catalog…</span>';
    return;
  }
  const pills = [];
  if (state.catalogFilter !== 'all') {
    pills.push(`<button class="active-pill" data-clear="filter">Category: ${escapeHtml(state.catalogFilter)} ×</button>`);
  }
  for (const s of state.catalogStatuses) {
    pills.push(`<button class="active-pill" data-clear="status:${s}">${escapeHtml(s.replace('_',' '))} ×</button>`);
  }
  if (state.catalogUnowned)  pills.push(`<button class="active-pill" data-clear="unowned">Unowned ×</button>`);
  if (state.catalogOriginal) pills.push(`<button class="active-pill" data-clear="original">Original forms ×</button>`);
  if (state.catalogTheme && state.catalogTheme !== 'all') {
    pills.push(`<button class="active-pill" data-clear="theme">Theme: ${escapeHtml(state.catalogTheme)} ×</button>`);
  }
  if (state.catalogColor && state.catalogColor !== 'all') {
    pills.push(`<button class="active-pill" data-clear="color">Color: ${escapeHtml(state.catalogColor)} ×</button>`);
  }
  if (state.catQuery) {
    pills.push(`<button class="active-pill" data-clear="query">"${escapeHtml(state.catQuery)}" ×</button>`);
  }
  const countText = `<span class="active-count">${shownCount} of ${total} products</span>`;
  const clearAll = pills.length > 0
    ? `<button class="active-clear-all" data-clear="all">Clear filters</button>`
    : '';
  bar.innerHTML = countText + pills.join('') + clearAll;
}

// Reset every filter for one tab back to defaults. Called by the per-tab
// 'Clear filters' button in the toolbar.
function clearTabFilters(tab) {
  if (tab === 'catalog') {
    state.catalogFilter = 'all';
    state.catalogStatuses = new Set();
    state.catalogUnowned = false;
    state.catalogOriginal = false;
    state.catalogTheme = 'all';
    state.catalogColor = 'all';
    state.catalogSort = 'newest';
    state.catQuery = '';
    syncCatalogChips();
  } else if (tab === 'collection') {
    state.filter = 'all';
    state.colCategory = 'all';
    state.colDupes = false;
    state.colNoBag = false;
    state.colSort = 'acquired_desc';
    state.arranging = false;
    state.colQuery = '';
    syncCollectionChips();
  } else if (tab === 'wishlist') {
    state.wishCategory = 'all';
    state.wishInStock = false;
    state.wishSort = 'added_desc';
    state.wishArranging = false;
    state.wishQuery = '';
    syncWishlistChips();
  }
  // Clearing only touches the active section's search now.
  const s = document.getElementById('search');
  if (s) s.value = '';
  render();
}

function clearFilter(key) {
  if (key === 'all') {
    state.catalogFilter = 'all';
    state.catalogStatuses = new Set();
    state.catalogUnowned = false;
    state.catalogOriginal = false;
    state.catalogTheme = 'all';
    state.catalogColor = 'all';
    state.catQuery = '';
    document.getElementById('search').value = '';
    const themeEl = document.getElementById('cat-theme');
    if (themeEl) themeEl.value = 'all';
    const colorEl = document.getElementById('cat-color');
    if (colorEl) colorEl.value = 'all';
  } else if (key === 'filter') {
    state.catalogFilter = 'all';
  } else if (key.startsWith('status:')) {
    state.catalogStatuses.delete(key.slice(7));
  } else if (key === 'unowned') {
    state.catalogUnowned = false;
  } else if (key === 'original') {
    state.catalogOriginal = false;
  } else if (key === 'theme') {
    state.catalogTheme = 'all';
    const themeEl = document.getElementById('cat-theme');
    if (themeEl) themeEl.value = 'all';
  } else if (key === 'color') {
    state.catalogColor = 'all';
    const colorEl = document.getElementById('cat-color');
    if (colorEl) colorEl.value = 'all';
  } else if (key === 'query') {
    state.catQuery = '';
    document.getElementById('search').value = '';
  }
  syncCatalogChips();
  render();
}

function setMultiSummary(detailsEl, labels) {
  const el = detailsEl?.querySelector('.filter-summary');
  if (!el) return;
  el.textContent = labels.length === 0 ? (el.dataset.empty || 'Any') : labels.join(', ');
}

function syncCollectionChips() {
  const stateEl = document.getElementById('col-state');
  if (stateEl) stateEl.value = state.filter;
  const catEl = document.getElementById('col-cat');
  if (catEl) catEl.value = state.colCategory;
  const dupes = document.querySelector('#col-extras input[data-col-toggle="dupes"]');
  const nobag = document.querySelector('#col-extras input[data-col-toggle="nobag"]');
  if (dupes) dupes.checked = state.colDupes;
  if (nobag) nobag.checked = state.colNoBag;
  const labels = [];
  if (state.colDupes) labels.push('Duplicates');
  if (state.colNoBag) labels.push('Missing accessories');
  setMultiSummary(document.getElementById('col-extras'), labels);
  const sortEl = document.getElementById('col-sort');
  if (sortEl) sortEl.value = state.colSort;
  const viewEl = document.getElementById('col-view');
  if (viewEl) viewEl.value = state.colView;
  // The Arrange toggle lights up only while you're actively arranging (item 20).
  const arrangeBtn = document.getElementById('col-arrange');
  if (arrangeBtn) {
    const on = state.arranging;
    arrangeBtn.classList.toggle('active', on);
    arrangeBtn.textContent = on ? '✓ Done arranging' : '↕ Arrange';
  }
}

function syncWishlistChips() {
  const catEl = document.getElementById('wish-cat');
  if (catEl) catEl.value = state.wishCategory;
  const instock = document.querySelector('#wish-extras input[data-wish-toggle="instock"]');
  if (instock) instock.checked = state.wishInStock;
  setMultiSummary(document.getElementById('wish-extras'), state.wishInStock ? ['In stock'] : []);
  const sortEl = document.getElementById('wish-sort');
  if (sortEl) sortEl.value = state.wishSort;
  const viewEl = document.getElementById('wish-view');
  if (viewEl) viewEl.value = state.wishView;
  const arrangeBtn = document.getElementById('wish-arrange');
  if (arrangeBtn) {
    const on = state.wishArranging;
    arrangeBtn.classList.toggle('active', on);
    arrangeBtn.textContent = on ? '✓ Done arranging' : '↕ Arrange';
  }
}

// Single source of truth: state.catalogFilter, state.catalogStatuses,
// state.catalogUnowned, state.catalogCharmOnly, theme, color, sort.
function syncCatalogChips() {
  const catEl = document.getElementById('cat-category-sel');
  if (catEl) catEl.value = state.catalogFilter;
  document.querySelectorAll('#cat-status-multi input[data-cat-status]').forEach((c) => {
    c.checked = state.catalogStatuses.has(c.dataset.catStatus);
  });
  const STATUS_LABELS = { available: 'Available', sold_out: 'Sold Out', coming_soon: 'Coming Soon', fyc: 'FYC', retired: 'Retired' };
  setMultiSummary(
    document.getElementById('cat-status-multi'),
    [...state.catalogStatuses].map((s) => STATUS_LABELS[s] || s),
  );
  document.querySelectorAll('#cat-extras input[data-cat-toggle]').forEach((c) => {
    if (c.dataset.catToggle === 'unowned') c.checked = !!state.catalogUnowned;
    else if (c.dataset.catToggle === 'original') c.checked = !!state.catalogOriginal;
  });
  const exLabels = [];
  if (state.catalogUnowned) exLabels.push('Unowned');
  if (state.catalogOriginal) exLabels.push('Original forms');
  setMultiSummary(document.getElementById('cat-extras'), exLabels);
  const themeEl = document.getElementById('cat-theme');
  if (themeEl) themeEl.value = state.catalogTheme;
  const colorEl = document.getElementById('cat-color');
  if (colorEl) colorEl.value = state.catalogColor;
  const sortEl = document.getElementById('cat-sort');
  if (sortEl) sortEl.value = state.catalogSort;
}

// Catalog products that aren't plushies. Only the truly off-topic types are
// excluded outright — everything else stays browseable; the "Other" category
// chip on the catalog tab is where stickers, ita bags, ipad cases, jewelry,
// and other plushie-adjacent merchandise live.
const NON_PLUSHIE_TYPES = new Set([
  'pen',                                                  // handled by the Pens tab
  'gift card',
]);
// These types are shop merch, but they're still on the storefront and people
// may want to browse them — route them to the 'other' category instead of
// the default plush/accessory buckets.
const OTHER_CATEGORY_TYPES = new Set([
  'sticker', 'pin', 'lanyard',
  'home decoration', 'mouse pad', 'notepad', 'ipad case', 'phone grip',
  'shopping bag', 'gym bag', 'ita bag', 'crossbody bag', 'leather wallet',
  'shirts', 'shirts & tops', 'sweater', 'hat', 'sleep mask', 'clothing',
  'jewelry', 'jewelry sets', 'necklace', 'necklaces', 'earring', 'bracelet', 'coin',
  'makeup', 'game', 'skull', 'head tube',
  'car accessory',
]);
const NON_PLUSHIE_NAME = /\b(standee|acrylic|trading card|enamel)\b/i;

function isPlushieCollectible(item) {
  const type = (item.type || '').toLowerCase();
  if (NON_PLUSHIE_TYPES.has(type)) return false;
  return true;
}

function isMiniPlushie(item) {
  // A manual category override is authoritative — it must win over the
  // tag/type heuristic everywhere, including the "Mini" badge. Otherwise an
  // item like Tooth Scary (pinned to 'plush') would still flash a Mini badge
  // because it's a keychain-typed plushie.
  const ov = categoryOverride(item);
  if (ov) return ov === 'mini';
  const tags = (item.tags || []).map((t) => t.toLowerCase());
  const name = item.name.toLowerCase();
  const type = (item.type || '').toLowerCase();
  // Mini-plush keychains: explicitly tagged mini, or keychain-type plushies.
  if (type === 'keychain' && (tags.includes('plush') || tags.includes('plushie') || name.includes('plush'))) return true;
  if (tags.includes('mini') && (tags.includes('plush') || tags.includes('plushie'))) return true;
  // "Mini" in a plush's name means mini-scale by definition — PD doesn't always
  // add the 'mini' tag (e.g. Mini Worry Bunnies, Mini Scruffy Bumps). Gated to
  // plush/toy types and not-clothing so mini-scale garments ("Mini Plush Outfit
  // …", accessory-typed) and DIY "Plush Accessory" notions stay out of the
  // mini-plush bucket. Word-bounded so it can't match inside another word.
  if (/\bmini\b/.test(name)
      && (type === 'plush' || type === 'toy' || type === 'stuffed toy')
      && !catalogIsClothing(item)) return true;
  return false;
}

// Manual category overrides. Plushie Dreadfuls regularly mislabels products
// in Shopify (wrong product_type), so a handful need pinning by hand. Checked
// before any type/tag heuristic so the override always wins.
const CATEGORY_OVERRIDES = [
  // "Tooth Scary" is labeled a Keychain but it's a full-size plush.
  { test: (it) => /\btooth scary\b/i.test(it.name || ''), category: 'plush' },
  // The Lucky Poop is typed 'Plush Accessory' but it's a standalone bun:
  // the regular size is charm-sized (a mini), the XL is full-size (a plush).
  { test: (it) => String(it.id) === '8991250350312', category: 'mini' },
  { test: (it) => String(it.id) === '9031367786728', category: 'plush' },
  // Masks (gas mask, plague mask) are worn ON a plush — they're closet
  // clothing, not standalone buns. Pin them to 'clothing' so they sort into
  // the closet and get a "Worn by" assignment instead of a plush card.
  { test: (it) => /\b(gas|plague)\s*-?\s*mask\b/i.test(it.name || ''), category: 'clothing' },
];
function categoryOverride(item) {
  // An admin's per-item DB override (from the Edit-details overlay) wins over the
  // hardcoded list below.
  if (item && item.categoryOverrideTag) return item.categoryOverrideTag;
  for (const o of CATEGORY_OVERRIDES) if (o.test(item)) return o.category;
  return null;
}

// The six user-facing buckets — the single category vocabulary shown in the
// filter chips, the catalog-override editor, and the custom-item editor. Kept
// here so catalogCategory() can trust an admin's explicit pick verbatim.
const CATALOG_CATEGORY_VALUES = new Set(['plush', 'mini', 'clothing', 'accessory', 'bundle', 'other']);

function catalogCategory(item) {
  const ov = categoryOverride(item);
  if (ov) return ov;
  const t = (item.type || '').toLowerCase();
  // Hand-entered ("custom") catalog items don't have a Shopify product_type —
  // the editor's Category picker writes the canonical vocabulary straight into
  // `type`, so trust it verbatim rather than running the Shopify-oriented
  // name/tag heuristics below. This makes "what the admin picks" === "what the
  // user sees" for custom items, with no keyword guesswork.
  if (item.isCustom && CATALOG_CATEGORY_VALUES.has(t)) return t;
  if (NON_PLUSHIE_NAME.test(item.name || '')) return 'other';     // standees, etc. tagged as 'plush'
  if (OTHER_CATEGORY_TYPES.has(t)) return 'other';                // store merch
  // Bundles are their own category — they aren't physically a single
  // plushie, they're a multi-item pack. Clicking Have on one opens
  // the component picker rather than dropping a 'bundle' row in
  // the user's collection.
  if (item.isBundle) return 'bundle';
  // Clothing is its own category — worn garments are pulled out of the
  // generic 'accessory' bucket so a Clothing filter can show them and an
  // Accessories filter can exclude them.
  if (catalogIsClothing(item)) return 'clothing';
  if (isMiniPlushie(item)) return 'mini';
  if (t === 'plush' || t === 'toy' || t === 'stuffed toy') return 'plush';
  if (t === 'accessory' || t === 'plush accessory' || t === 'hair clip'
      || t === 'keychain' || t === 'patch' || t === 'plush backpack'
      || t === 'charms' || t === 'grab bag') return 'accessory';
  // Fallback: some real plushes ship with a blank/odd product_type (the
  // "… - Plush Stuffed Animal" buns), which would otherwise drop into
  // 'other' and lose their accessory checklist. Trust the name as a last
  // resort — this only runs after every type + merch check above, so it
  // can't pull merch (jewelry, bags, etc.) back into the plush bucket.
  // NB: word-bounded "plush" — NOT "plushie", which is the brand name
  // ("Plushie Dreadfuls") and would match every product.
  if (/\bplush\b|\bstuffed (animal|toy)\b/i.test(item.name || '')) return 'plush';
  return 'other';
}

// User-facing label for the canonical category. The upstream Shopify
// product_type is a mess — full-size plushies are tagged 'toy' OR 'plush'
// interchangeably (266 'toy' vs 133 'plush', all the same kind of item), so
// surfacing it raw just confuses. We label off catalogCategory() instead, so
// every full-size bun reads "Regular Size Plush" regardless of its feed type.
const CATALOG_CATEGORY_LABELS = {
  plush: 'Regular Size Plush',
  mini: 'Mini Plush',
  clothing: 'Clothing',
  accessory: 'Accessory',
  bundle: 'Bundle',
  other: 'Other',
};
function catalogCategoryLabel(item) {
  const cat = catalogCategory(item);
  if (cat === 'other') {
    // The 'other' bucket is diverse store merch (stickers, jewelry, mugs…)
    // where the specific Shopify type is more useful than a generic "Other".
    // Surface it title-cased — but never the ambiguous 'toy'/'plush' raw
    // types the rest of the app deliberately collapses.
    const t = (item.type || '').trim();
    if (t && !/^(toy|plush|stuffed toy)$/i.test(t)) {
      return t.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return CATALOG_CATEGORY_LABELS[cat] || 'Other';
}

function isComingSoon(item) {
  const tags = (item.tags || []).map((t) => t.toLowerCase());
  if (tags.includes('coming soon') || tags.includes('tba')) return true;
  const n = item.name.toLowerCase();
  return n.includes('tba') || n.includes('coming soon') || n.includes('future design');
}

// Lore an unmade "For Your Consideration" concept carries. PD uses a few
// wordings, all meaning the same thing — "we haven't made this yet, register
// interest": "considered for (a) prototyp(e/ing)", "currently in development …
// comment/sign up", "sign up to be notified / to show your interest", "gather
// enough interest". PD *rewrites* this into a real backstory the moment the
// plush is actually produced, which is why the lore — not the Shopify 'fyc'
// tag — is the reliable signal (the tag gets left on after a design ships).
const FYC_PITCH_RE = /considered for (a )?prototyp|currently in development|sign up to (be notified|show)|gather enough interest/i;
function hasFYCPitchLore(item) {
  const t = item.bodyHtml || item.lore || '';
  return !!t && FYC_PITCH_RE.test(t);
}
// A genuine concept ships with just its lone concept mockup (1, occasionally 2
// images). A real photo shoot (Vasculitis Rabbit: 5; Visual Snow: 23) means the
// plush exists. 4+ is comfortably above the mockup range and below every real
// shoot in the catalog.
const FYC_REAL_PHOTOGRAPHY_MIN = 4;

// FYC = "For Your Consideration" = an unmade concept, hidden from the default
// catalog/search. Graduation is permanent (a design never returns to FYC), so
// two hard exits come first: once it's *for sale*, or has *real photography*,
// it's a released plush regardless of a stale tag/lore. Otherwise it's FYC iff
// its lore still pitches it as unmade — falling back to the Shopify tag only
// when we have no lore to read (the cold-start catalog.json snapshot carries
// no body text).
function isFYC(item) {
  if (item.available) return false;
  if ((item.photoCount || 0) >= FYC_REAL_PHOTOGRAPHY_MIN) return false;
  if (item.bodyHtml || item.lore) return hasFYCPitchLore(item);
  return (item.tags || []).some((t) => t.toLowerCase() === 'fyc');
}

// Loyalty-reward items aren't for sale — they're redeemed with loyalty
// points. They come from Shopify as available:false (so itemStatus reports
// 'sold_out'), but we surface them with a green "Rewards" badge instead of
// the red "Sold Out" pill.
function isLoyaltyReward(item) {
  return (item.tags || []).some((t) => t.toLowerCase() === 'loyalty reward');
}

function isBuyableNow(item) {
  return !!item.available && !isComingSoon(item) && !isFYC(item) && !item.retired;
}

function itemStatus(item) {
  if (item.retired) return 'retired';
  // FYC (unmade concept) is tested before coming-soon: PD sometimes slaps a
  // 'coming soon'/'TBA' tag on a design whose lore still says "being considered
  // for prototyping" (e.g. Event Horizon, TBA Rabbit). The lore is the truth —
  // it isn't made yet — so it stays hidden rather than teasing an empty Coming
  // Soon card. isFYC() already lets genuinely-made items through (for sale, or
  // real photography like the 5-shot Vasculitis pre-release), so this only
  // catches the mis-tagged concepts, not real upcoming plushes.
  if (isFYC(item)) return 'fyc';
  if (isComingSoon(item)) return 'coming_soon';
  if (!item.available) return 'sold_out';
  return 'available';
}

// ─── Photo compression ───────────────────────────────────────────────
async function compressImage(file, maxDim = 800, quality = 0.82) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    // Fallback via HTMLImageElement for Safari/older browsers
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const ratio = maxDim / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
      'image/jpeg',
      quality
    );
  });
}

// ─── Perceptual hash (dHash) ──────────────────────────────────────────
// A 64-bit difference hash used to catch someone passing off the catalog
// *stock* image as a "real" trade photo. Downscale to 9×8 grayscale; each
// bit records whether a pixel is brighter than its right-hand neighbour.
// dHash is stable across resizes/JPEG recompression, so a copy of the same
// image hashes within a handful of bits (see hammingDistance), while a genuine
// new photo of the plush lands far away. Returns a BigInt, or null if the
// image can't be read (decode failure or a cross-origin canvas taint).
async function perceptualHash(source) {
  let img;
  try {
    img = source instanceof Blob
      ? await createImageBitmap(source)
      : await loadCorsImage(source);   // URL string — needs CORS to read pixels
  } catch { return null; }
  const w = 9, h = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  let px;
  try { px = ctx.getImageData(0, 0, w, h).data; }
  catch { return null; }   // tainted canvas (cross-origin host without CORS)
  let hash = 0n, bit = 0n;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const j = (y * w + x + 1) * 4;
      const a = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      const b = px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114;
      if (a > b) hash |= (1n << bit);
      bit++;
    }
  }
  return hash;
}

// Count differing bits between two dHashes. Infinity when either is missing
// so callers treat "couldn't hash" as "not a match" (fail open, never block a
// real photo just because we couldn't fingerprint the stock image).
function hammingDistance(a, b) {
  if (a == null || b == null) return Infinity;
  let x = a ^ b, count = 0;
  while (x) { count += Number(x & 1n); x >>= 1n; }
  return count;
}

// Load a (possibly cross-origin) image URL with CORS so its pixels are
// readable on a canvas. Rejects if the host doesn't send the header.
function loadCorsImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Blob URL management ─────────────────────────────────────────────
function urlFor(id, blob) {
  const existing = state.blobUrls.get(id);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  state.blobUrls.set(id, url);
  return url;
}

function revokeAllBlobUrls() {
  for (const url of state.blobUrls.values()) URL.revokeObjectURL(url);
  state.blobUrls.clear();
}

// A gentle, on-brand "still summoning your data" placeholder. Shown in a
// section's grid/list in place of its empty-state while its first load is
// still in flight (see state.ready) — so a slow boot or refresh doesn't
// flash a misleading "nothing here" / "your crypt is empty" message.
function loadingPlaceholder(msg = 'Summoning from the crypt…') {
  return `<div class="empty loading-ph"><div class="ghost">🕯</div>
    <p>${msg}</p></div>`;
}

// ─── Data load ───────────────────────────────────────────────────────
async function loadAll() {
  state.collection = (await data.list('collection')).sort(byNewest);
  state.wishlist = (await data.list('wishlist')).sort(byNewest);
  state.ready.add('collection');
}

async function loadCatalog() {
  try {
    const r = await fetch('./catalog.json?v=69', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const json = await r.json();
    const shopify = expandVariants((json.products || []).filter(isPlushieCollectible));
    state.catalog = await mergeCustomCatalog(shopify);
  } catch (e) {
    console.warn('catalog load failed', e);
    state.catalog = [];
  }
  state.ready.add('catalog');
}

// Merge admin-curated catalog_items into the Shopify-derived list so
// they show up in the Catalog tab alongside live products. Custom
// items are normalised to the same shape (id, name, handle, type,
// image, available, retired, tags) so renderCatalogCard doesn't care
// where each row came from. Custom items keep the form_label on the
// row for grouped display.
// Lay admin overrides on top of the live-parsed Shopify rows, keyed by
// handle. Each override field is optional: a value replaces what the
// body_html parse produced for that one field; null/empty leaves the
// live value untouched (non-destructive). Custom catalog_items rows are
// never targeted — overrides are for upstream Shopify products only.
// Mutates the passed rows in place.
function applyCatalogOverrides(shopifyProducts, overrides) {
  if (!Array.isArray(overrides) || overrides.length === 0) return;
  const byHandle = new Map(overrides.map((o) => [o.handle, o]));
  for (const item of shopifyProducts) {
    const ov = byHandle.get(item.handle);
    if (!ov) continue;
    if (ov.lore) item.lore = ov.lore;
    // Our same-style retelling. Kept separate from `lore` (PD's original,
    // still live-parsed) so the original is never overwritten; the detail
    // modal prefers `altLore` for display and falls back to `lore`.
    if (ov.alt_lore) item.altLore = ov.alt_lore;
    if (ov.symbolism) {
      // Plain-text override wins over the (now stale) parsed HTML block,
      // so the detail modal renders the edited text, not the old images.
      item.symbolism = ov.symbolism;
      item.symbolismHtml = null;
    }
    if (Array.isArray(ov.accessories) && ov.accessories.length) {
      item.accessories = categoryHasAccessories(item) ? normalizeAccessories(ov.accessories) : [];
    }
    // A picked cover photo replaces Shopify's default first image; when that
    // cover is a community submission, image_credit carries the contributor's
    // @handle so the detail view can credit them under the photo.
    // NB: a handle-level cover must NOT paint expanded variant children —
    // they share the parent handle but are each their own form, so one shot
    // can't represent all of them. It lands on the hidden parent + genuine
    // single cards only; variant children get their cover from
    // applyVariantCovers (keyed by variant id) instead.
    if (!item.isVariant) {
      if (ov.image) item.image = ov.image;
      if (ov.image_credit) item.imageCredit = ov.image_credit;
      // Contributor opted out of being named publicly — admins still see the
      // @handle (in blue), everyone else gets an anonymous credit.
      item.imageCreditAnon = ov.credit_anon === true;
    }
    // Tag overrides: re-categorise and/or force retired. categoryOverrideTag is
    // read by categoryOverride() below; retiredOverride drives itemStatus and
    // lets the modal prefill auto/active/retired.
    if (ov.category) item.categoryOverrideTag = ov.category;
    if (ov.retired === true)  { item.retired = true;  item.retiredOverride = true; }
    if (ov.retired === false) { item.retired = false; item.retiredOverride = false; }
    item.hasOverride = true;
  }
}

// Lay per-variant community covers onto expanded variant children, keyed by
// Shopify variant id (catalog_variant_covers). This is the variant-aware
// twin of the handle-level cover in applyCatalogOverrides: a multi-variant
// product shows one card per variant, all sharing the parent handle, so each
// variant carries its OWN cover here instead of a single handle shot painting
// them all. Only isVariant children are touched; the hidden parent and
// genuine single products keep using the handle-level override. Mutates rows.
function applyVariantCovers(shopifyProducts, variantCovers) {
  if (!Array.isArray(variantCovers) || variantCovers.length === 0) return;
  const byVariant = new Map(variantCovers.map((c) => [String(c.variant_id), c]));
  for (const item of shopifyProducts) {
    if (!item.isVariant || !item.variantId) continue;
    const cov = byVariant.get(String(item.variantId));
    if (!cov) continue;
    if (cov.image) item.image = cov.image;
    if (cov.image_credit) item.imageCredit = cov.image_credit;
    item.imageCreditAnon = cov.credit_anon === true;
    item.hasOverride = true;
  }
}

async function mergeCustomCatalog(shopifyProducts) {
  try {
    // Lay any admin overrides on top of the live-parsed Shopify rows
    // first, then merge in the custom catalog_items. Both reads run in
    // parallel.
    const [customsRaw, overrides, variantCovers] = await Promise.all([
      data.listApprovedCatalogItems(),
      // Overrides carry every community cover + alt-lore retelling. If this
      // read fails (schema drift, RLS, network) we still render the store
      // base so the catalog isn't dead — but LOUDLY, never silently: a
      // swallowed failure here once masqueraded as a total content wipe.
      data.listCatalogOverrides().catch((e) => {
        console.error(
          'Catalog overrides failed to load — every item is falling back to its '
          + 'store photo/lore until this is fixed (often a db/00NN migration not yet applied).', e);
        if (window.currentUser?.isAdmin) {
          toast('⚠️ Catalog overrides failed to load — showing store photos/lore. See console.');
        }
        return [];
      }),
      // Per-variant community covers (catalog_variant_covers). Non-fatal and
      // additive — if it fails (e.g. db/0069 not yet applied) variant cards
      // simply keep their per-variant store photo, so swallow quietly.
      data.listVariantCovers().catch(() => []),
    ]);
    applyCatalogOverrides(shopifyProducts, overrides);
    applyVariantCovers(shopifyProducts, variantCovers);
    // Hidden items (e.g. the Tom mascot) exist as catalog_items rows but
    // are kept out of the client catalog entirely — no grid, search, or
    // Own/Want. `hidden` is undefined on older rows → treated as visible.
    const customs = customsRaw.filter((c) => !c.hidden);
    const normalised = customs.map((c) => {
      const item = {
        id: c.id,                       // UUID — collectors' plushies.catalog_id will hold this
        name: c.name,
        handle: c.handle,
        type: c.type || 'plush',
        image: c.image || null,         // signed URL produced by data.listApprovedCatalogItems
        imageCredit: c.image_credit || null, // contributor @handle for a community cover
        imageCreditAnon: c.credit_anon === true, // contributor hid their name publicly
        price: null,
        available: !!c.available,
        retired: !!c.retired,
        createdAt: c.created_at,
        publishedAt: c.created_at,
        tags: c.tags || [],
        parentHandle: c.parent_handle || null,
        formLabel: c.form_label || null,
        isCustom: true,
        description: c.description || null,
        lore: c.lore || null,
        altLore: c.alt_lore || null,
        symbolism: c.symbolism || null,
        accessories: [],
        releaseYear: c.release_year ?? null,
        isBundle: false,
      };
      // Same gate + de-noise as Shopify items so customs stay consistent.
      item.accessories = categoryHasAccessories(item) ? normalizeAccessories(c.accessories) : [];
      return item;
    });
    return [...shopifyProducts, ...normalised];
  } catch (e) {
    console.warn('custom catalog merge skipped', e);
    return shopifyProducts;
  }
}

// For form-variant catalog items (parent_handle set), fall back to the
// parent's metadata field-by-field. The variant's own value wins when
// set; the parent fills in blanks. Once Phase L parses lore/symbolism
// from Shopify body_html, variants inherit for free without re-creation.
// Pure function — does not mutate the input.
function resolveCatalogItem(item) {
  if (!item || (!item.isCustom && !item.isVariant) || !item.parentHandle) return item;
  // Feed-derived variants share their parent's handle (they live under one
  // Shopify product), so a handle lookup would match siblings/self — resolve
  // by the exact parent id instead. Curated customs (no parentId) keep the
  // by-handle lookup against the real, non-variant parent.
  const parent = item.parentId
    ? state.catalog.find((c) => c.id === item.parentId)
    : state.catalog.find((c) => c.handle === item.parentHandle && !c.isCustom && !c.isVariant);
  if (!parent) return item;
  return {
    ...item,
    // image stays — variants are their own form, photo never inherits
    type:        item.type ?? parent.type,
    available:   item.available ?? parent.available,
    retired:     item.retired ?? parent.retired,
    price:       item.price ?? parent.price,
    tags:        (item.tags && item.tags.length) ? item.tags : (parent.tags || []),
    description: item.description ?? parent.description ?? null,
    lore:        item.lore ?? parent.lore ?? null,
    altLore:     item.altLore ?? parent.altLore ?? null,
    symbolism:   item.symbolism ?? parent.symbolism ?? null,
    // Inherit the HTML-rich symbolism block too — the detail modal
    // prefers it over the plain-text version when present. Without
    // this, a form variant of a Shopify-fed item would render the
    // less-pretty text fallback even though the parent has the parsed
    // images-and-paragraphs version ready.
    symbolismHtml: item.symbolismHtml ?? parent.symbolismHtml ?? null,
    bodyHtml:    item.bodyHtml ?? parent.bodyHtml ?? null,
    photoCount:  item.photoCount ?? parent.photoCount ?? 0,
    // Accessories inherit from the parent only when the variant
    // didn't declare its own list. This lets a form variant override
    // the Set Includes (e.g., the Original came without the tote
    // bag) by entering even one row in the admin modal.
    accessories: (item.accessories && item.accessories.length)
      ? item.accessories
      : (parent.accessories || []),
    // The shopping URL on a variant uses the parent's handle so Buy
    // sends people to plushiedreadfuls.com for whatever the upstream
    // SKU currently is. They can buy the current iteration and still
    // catalogue the form they actually own.
    parentShopifyHandle: parent.handle,
  };
}

const LIVE_CATALOG_BASE = 'https://plushiedreadfuls.com/products.json?limit=250';

function normalizeShopifyProduct(p) {
  const variants = p.variants || [];
  const available = variants.some((v) => v.available);
  const priceNums = variants.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n));
  const tags = p.tags || [];
  const lcTags = tags.map((t) => t.toLowerCase());
  const comingSoon = lcTags.includes('coming soon') || lcTags.includes('tba');
  // PD explicitly tags truly-retired designs 'retired'. They also tag
  // final-stock legacy runs 'last chance' — once those sell out they're
  // gone for good, so a sold-out 'last chance' item is effectively retired.
  // Guard on !comingSoon so a restocking item (tagged 'coming soon'/'TBA')
  // never reads as retired, and leave still-buyable 'last chance' items as
  // available so we don't hide something you can still purchase.
  const retired = lcTags.includes('retired')
    || (!available && !comingSoon && lcTags.includes('last chance'));
  const parsed = parseBodyHtml(p.body_html, p.title);
  const item = {
    id: String(p.id),
    name: p.title,
    handle: p.handle,
    type: p.product_type || '',
    image: p.images?.[0]?.src || null,
    photoCount: (p.images || []).length,   // graduation signal for isFYC (real shoot vs lone concept mockup)
    price: priceNums.length ? Math.min(...priceNums) : null,
    available,
    retired,
    createdAt: p.created_at,
    publishedAt: p.published_at,
    tags,
    bodyHtml: p.body_html || null,
    lore: parsed.lore,
    symbolism: parsed.symbolism,
    symbolismHtml: parsed.symbolismHtml,
    accessories: [],
    isBundle: parsed.isBundle || tags.some((t) => t.toLowerCase().includes('bundle')),
  };
  // Only plushes/bundles carry accessories, and the raw parse needs
  // de-noising (features, specs, duplicates) before it's a checklist.
  item.accessories = categoryHasAccessories(item) ? normalizeAccessories(parsed.accessories) : [];
  // Stash the raw option/variant data expandVariants() needs. Kept under a
  // private key so it never leaks into render/search; expandVariants strips
  // it off the parent before returning.
  item._raw = { options: p.options || [], variants: p.variants || [] };
  return item;
}

// Option names whose multiple values represent genuinely distinct
// collectibles (a different colour/form), as opposed to a purchase choice
// like a hang-tag or size. Extend this set as PD introduces new ones.
const COLLECTIBLE_OPTION_NAMES = new Set(
  ['type', 'color', 'colour', 'style', 'design', 'character', 'form', 'face', 'bunny', 'fur'],
);

// Auto-expand a Shopify product that ships in multiple collectible variants
// (e.g. Skelly Bun Flower Crown → Purple / Peach / Skelly Bows) into one
// trackable sub-item per variant, nested under the product via the existing
// parentHandle/formLabel model. The umbrella product stays in the list but
// is flagged `variantParent` so the grid hides it (filteredCatalog) while
// children inherit its lore/accessories via resolveCatalogItem — and any
// collection row still keyed to the product id keeps resolving to it.
//
// Returns a new array; non-expanding items pass through unchanged (minus the
// private _raw stash). Idempotent on inputs that carry no _raw (e.g. the
// catalog.json cold-load snapshot), so it's safe to call at every build site.
function expandVariants(items) {
  const out = [];
  for (const item of items) {
    const raw = item._raw;
    delete item._raw;
    const options = (raw && raw.options) || [];
    const variants = (raw && raw.variants) || [];
    // Eligible only when there's exactly one multi-value option and its name
    // marks a collectible distinction. Anything else (single option, size,
    // hang-tag, default-title) stays a single card.
    const multi = options.filter((o) => Array.isArray(o.values) && o.values.length > 1);
    const collectible = multi.length === 1
      && COLLECTIBLE_OPTION_NAMES.has((multi[0].name || '').trim().toLowerCase());
    const realVariants = variants.filter((v) => v && v.title && v.title !== 'Default Title');
    if (!collectible || realVariants.length < 2) {
      out.push(item);
      continue;
    }
    item.variantParent = true;
    out.push(item);
    for (const v of realVariants) {
      const priceNum = parseFloat(v.price);
      out.push({
        id: `${item.id}::${v.id}`,
        name: item.name,                 // formLabel renders the distinction
        handle: item.handle,             // Buy points at the parent product
        parentHandle: item.handle,
        parentId: item.id,
        variantId: String(v.id),         // Shopify variant id — keys per-variant covers
        formLabel: v.title,              // the option value, e.g. 'Purple'
        isVariant: true,
        type: item.type,
        image: (v.featured_image && v.featured_image.src) || item.image,
        price: isNaN(priceNum) ? item.price : priceNum,
        available: !!v.available,
        retired: item.retired,           // retirement is product-level
        createdAt: item.createdAt,
        publishedAt: item.publishedAt,
        tags: item.tags,
        accessories: [],                 // inherited from parent at resolve time
        isBundle: false,
      });
    }
  }
  return out;
}

