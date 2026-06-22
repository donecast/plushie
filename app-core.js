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
  tab: 'social',              // landing tab — 'social' | 'catalog' | 'collection' | 'wishlist' | 'trade' | 'admin'
  colSubTab: 'plushes',       // collection sub-tab: 'plushes' | 'minis' | 'accessories' | 'other' | 'pens'
  filter: 'all',              // collection: all | active | retired
  colCategory: 'all',         // legacy category chip (superseded by sub-tabs; kept inert)
  colDupes: false,            // collection: only quantity > 1
  colNoBag: false,            // collection: only missing bag
  colSort: 'acquired_desc',
  arranging: false,           // actively in drag-to-reorder mode (the ↕ Arrange toggle).
                              // Separate from colSort==='manual': the custom order can be
                              // *shown* without the drag grips being live.
  colView: 'cards',           // collection layout: 'cards' (roomy) | 'compact' (dense list)
  wishCategory: 'all',
  wishInStock: false,
  wishSort: 'added_desc',
  catalogFilter: 'all',       // catalog category: all | plush | accessory | other
  catalogStatuses: new Set(), // empty = any; otherwise OR of: available/sold_out/coming_soon/retired/fyc
  catalogUnowned: false,      // toggle: hide ones already in collection
  catalogOriginal: false,     // toggle: only show items tagged 'original' (early forms / OG versions)
  catalogTheme: 'all',        // tag value to require; 'all' = no constraint
  catalogColor: 'all',        // color tag substring match; 'all' = no constraint
  catalogSort: 'newest',      // newest | oldest | name_asc | name_desc | price_asc | price_desc
  query: '',
  editingId: null,
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
  socComposeVis: 'friends',   // visibility selected in the composer
  socComposePhoto: null,      // pending compressed Blob for a new post
  socPendingCount: 0,         // incoming friend requests — drives the tab badge
};

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
  const total = state.catalog.length;
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
  if (state.query) {
    pills.push(`<button class="active-pill" data-clear="query">"${escapeHtml(state.query)}" ×</button>`);
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
    syncCatalogChips();
  } else if (tab === 'collection') {
    state.filter = 'all';
    state.colCategory = 'all';
    state.colDupes = false;
    state.colNoBag = false;
    state.colSort = 'acquired_desc';
    state.arranging = false;
    syncCollectionChips();
  } else if (tab === 'wishlist') {
    state.wishCategory = 'all';
    state.wishInStock = false;
    state.wishSort = 'added_desc';
    syncWishlistChips();
  }
  state.query = '';
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
    state.query = '';
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
    state.query = '';
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
  for (const o of CATEGORY_OVERRIDES) if (o.test(item)) return o.category;
  return null;
}

function catalogCategory(item) {
  const ov = categoryOverride(item);
  if (ov) return ov;
  const t = (item.type || '').toLowerCase();
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

function isComingSoon(item) {
  const tags = (item.tags || []).map((t) => t.toLowerCase());
  if (tags.includes('coming soon') || tags.includes('tba')) return true;
  const n = item.name.toLowerCase();
  return n.includes('tba') || n.includes('coming soon') || n.includes('future design');
}

function isFYC(item) {
  return (item.tags || []).some((t) => t.toLowerCase() === 'fyc');
}

function isBuyableNow(item) {
  return !!item.available && !isComingSoon(item) && !isFYC(item) && !item.retired;
}

function itemStatus(item) {
  if (item.retired) return 'retired';
  if (isComingSoon(item)) return 'coming_soon';
  if (isFYC(item)) return 'fyc';
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

// ─── Data load ───────────────────────────────────────────────────────
async function loadAll() {
  state.collection = (await data.list('collection')).sort(byNewest);
  state.wishlist = (await data.list('wishlist')).sort(byNewest);
}

async function loadCatalog() {
  try {
    const r = await fetch('./catalog.json?v=69', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const json = await r.json();
    const shopify = (json.products || []).filter(isPlushieCollectible);
    state.catalog = await mergeCustomCatalog(shopify);
  } catch (e) {
    console.warn('catalog load failed', e);
    state.catalog = [];
  }
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
    if (ov.symbolism) {
      // Plain-text override wins over the (now stale) parsed HTML block,
      // so the detail modal renders the edited text, not the old images.
      item.symbolism = ov.symbolism;
      item.symbolismHtml = null;
    }
    if (Array.isArray(ov.accessories) && ov.accessories.length) {
      item.accessories = categoryHasAccessories(item) ? normalizeAccessories(ov.accessories) : [];
    }
    item.hasOverride = true;
  }
}

async function mergeCustomCatalog(shopifyProducts) {
  try {
    // Lay any admin overrides on top of the live-parsed Shopify rows
    // first, then merge in the custom catalog_items. Both reads run in
    // parallel; overrides fall back to [] so the catalog still renders.
    const [customsRaw, overrides] = await Promise.all([
      data.listApprovedCatalogItems(),
      data.listCatalogOverrides().catch(() => []),
    ]);
    applyCatalogOverrides(shopifyProducts, overrides);
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
  if (!item || !item.isCustom || !item.parentHandle) return item;
  const parent = state.catalog.find((c) => c.handle === item.parentHandle && !c.isCustom);
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
    symbolism:   item.symbolism ?? parent.symbolism ?? null,
    // Inherit the HTML-rich symbolism block too — the detail modal
    // prefers it over the plain-text version when present. Without
    // this, a form variant of a Shopify-fed item would render the
    // less-pretty text fallback even though the parent has the parsed
    // images-and-paragraphs version ready.
    symbolismHtml: item.symbolismHtml ?? parent.symbolismHtml ?? null,
    bodyHtml:    item.bodyHtml ?? parent.bodyHtml ?? null,
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
  const parsed = parseBodyHtml(p.body_html, p.title);
  const item = {
    id: String(p.id),
    name: p.title,
    handle: p.handle,
    type: p.product_type || '',
    image: p.images?.[0]?.src || null,
    price: priceNums.length ? Math.min(...priceNums) : null,
    available,
    retired: tags.some((t) => t.toLowerCase() === 'retired'),
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
  return item;
}

