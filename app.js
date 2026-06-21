// ─── State ────────────────────────────────────────────────────────────
const state = {
  tab: 'social',              // landing tab — 'social' | 'catalog' | 'collection' | 'wishlist' | 'trade' | 'admin'
  colSubTab: 'plushes',       // collection sub-tab: 'plushes' | 'minis' | 'accessories' | 'other' | 'pens'
  filter: 'all',              // collection: all | active | retired
  colCategory: 'all',         // legacy category chip (superseded by sub-tabs; kept inert)
  colDupes: false,            // collection: only quantity > 1
  colNoBag: false,            // collection: only missing bag
  colSort: 'acquired_desc',
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
async function mergeCustomCatalog(shopifyProducts) {
  try {
    // Hidden items (e.g. the Tom mascot) exist as catalog_items rows but
    // are kept out of the client catalog entirely — no grid, search, or
    // Own/Want. `hidden` is undefined on older rows → treated as visible.
    const customs = (await data.listApprovedCatalogItems()).filter((c) => !c.hidden);
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
  const parsed = parseBodyHtml(p.body_html);
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

// ─── Lore / Symbolism / Set-Includes parser ──────────────────────
// Walks Shopify's body_html for a product, strips the boilerplate noise
// (decorative divider images, charity banners, YouTube embeds, the
// stock 'IMPORTANT NOTE Regarding the design' paragraph, and the trailing
// copyright/trademark paragraph), then splits what's left into three
// sections:
//   * lore        — everything before the first 'Set Includes' heading
//   * symbolism   — text under a 'Symbolism:' heading (plus first
//                   distinct image per group, dupes dropped per Scott's
//                   option b)
//   * accessories — items from the 'Set Includes' list, minus the
//                   single primary plush (which is implied)
// Returns nulls / empty arrays for sections that don't exist on a given
// product, which is fine — the UI hides empty sections.
function parseBodyHtml(html) {
  const empty = { lore: null, symbolism: null, symbolismHtml: null, accessories: [], isBundle: false };
  if (!html || typeof html !== 'string') return empty;
  let doc;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); }
  catch { return empty; }
  const root = doc.body;
  if (!root) return empty;

  stripBoilerplate(root);

  // Walk nodes once, marking the offsets of section boundaries. We
  // recognize headings by text content rather than by tag — these
  // products use bold paragraphs ('<p><b>Set Includes</b></p>') just
  // as often as <h2>/<h3>. flattenBlocks unwraps structural wrapper
  // <div>s (some products nest the whole description inside a single
  // '<div class="text_exposed_show">') so headings/lists/paragraphs
  // become first-class blocks rather than being hidden one level down —
  // otherwise a wrapper's combined textContent overruns the heading
  // length guards below and 'Set Includes' is never detected.
  const blocks = flattenBlocks(root);
  let setIncludesIdx = -1;
  let symbolismIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const t = (blocks[i].textContent || '').trim();
    if (setIncludesIdx === -1 && /set\s+includes/i.test(t) && t.length < 80) setIncludesIdx = i;
    if (symbolismIdx === -1 && /^symbolism\s*:?\s*$/i.test(t)) symbolismIdx = i;
  }

  // Lore = blocks[0 .. setIncludesIdx) as plain text, joined.
  const loreEnd = setIncludesIdx === -1 ? blocks.length : setIncludesIdx;
  const loreParas = [];
  for (let i = 0; i < loreEnd; i++) {
    if (symbolismIdx !== -1 && i >= symbolismIdx) break;
    const txt = textOf(blocks[i]);
    if (txt) loreParas.push(txt);
  }
  const lore = loreParas.length ? loreParas.join('\n\n') : null;

  // Symbolism = blocks[symbolismIdx+1 .. next-divider-or-end).
  let symbolism = null;
  let symbolismHtml = null;
  if (symbolismIdx !== -1) {
    const symEnd = blocks.length;
    const symBlocks = [];
    const seenImgSrcs = new Set();
    for (let i = symbolismIdx + 1; i < symEnd; i++) {
      const b = blocks[i];
      const t = (b.textContent || '').trim();
      // Stop at the IMPORTANT NOTE we already stripped — but if some
      // variant slipped through, stop again here.
      if (/^important\s+note/i.test(t)) break;
      // Dedupe identical images (the DPDR Rabbit triple-heart case).
      const img = b.querySelector ? b.querySelector('img') : null;
      if (img && img.src) {
        if (seenImgSrcs.has(img.src)) { img.remove(); }
        else { seenImgSrcs.add(img.src); }
      }
      if (b.textContent && b.textContent.trim()) {
        symBlocks.push(b.outerHTML);
      }
    }
    if (symBlocks.length) {
      symbolismHtml = symBlocks.join('');
      symbolism = stripTagsKeepNewlines(symbolismHtml);
    }
  }

  // Accessories = bullet list items under 'Set Includes', minus
  // anything that looks like the primary plush ('1x …Rabbit', '1x …Puppet')
  // and minus the tote/draw-string bag (which goes in its own field
  // when we add accessories Phase C).
  const accessories = setIncludesIdx === -1 ? [] : extractSetIncludes(blocks, setIncludesIdx, symbolismIdx);
  // Bundle detection is tag-only now. The earlier heuristic of '2+ plush
  // items in the Set Includes' false-flagged single products like the
  // Gemini Rabbit, which legitimately ships with multiple plushie pieces.
  // The Shopify-side 'bundle' tag is the authoritative signal.
  return { lore, symbolism, symbolismHtml, accessories, isBundle: false };
}

// True when an element wraps block-level children (so it's a structural
// container, not a leaf paragraph). Text-content boilerplate matches must
// skip these — otherwise a wrapper <div> that merely *contains* the
// copyright trailer (e.g. '<div class="text_exposed_show">…Set Includes…
// copyright…</div>') would be removed whole, taking the real content with
// it. The offending inner leaf paragraph still matches on its own pass.
function containsBlockElements(el) {
  return [...(el.children || [])].some((c) => /^(p|ul|ol|div|h[1-6])$/i.test(c.tagName || ''));
}

function stripBoilerplate(root) {
  // Drop YouTube embeds (iframes + anchor wrappers).
  for (const el of [...root.querySelectorAll('iframe, lite-youtube, [data-youtube]')]) el.remove();
  for (const a of [...root.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]')]) {
    // Drop the entire paragraph if the only meaningful content is the link.
    const p = a.closest('p,div');
    if (p && p.textContent.trim().length < 80) p.remove();
    else a.remove();
  }
  // Drop the standard 'IMPORTANT NOTE Regarding the design' paragraph
  // and any paragraph whose text starts with it. This is the same
  // boilerplate template across every mental-health rabbit product.
  for (const el of [...root.querySelectorAll('p, div')]) {
    if (containsBlockElements(el)) continue;
    const t = (el.textContent || '').trim();
    if (/^important\s+note\b.*regarding the design/i.test(t)) el.remove();
  }
  // Drop the copyright/trademark trailer and 'Beware of imitations'.
  for (const el of [...root.querySelectorAll('p, div')]) {
    if (containsBlockElements(el)) continue;
    const t = (el.textContent || '').trim();
    if (/is copyright of mysterious llc/i.test(t)) el.remove();
    else if (/^beware of imitations/i.test(t)) el.remove();
    else if (/plushie dreadfuls is a trademark/i.test(t)) el.remove();
  }
  // Drop decorative divider images (and any paragraph whose only
  // content is one of them). Heuristic: an <img> in a paragraph where
  // the paragraph carries no text. Charity banner detection: image
  // URLs/alts mentioning 'pride', 'donat', 'twloha', 'covenant', etc.
  for (const img of [...root.querySelectorAll('img')]) {
    const src = (img.getAttribute('src') || '').toLowerCase();
    const alt = (img.getAttribute('alt') || '').toLowerCase();
    const wrap = img.closest('p, div');
    const isCharityHint = /pride|donat|covenant|twloha|charity/i.test(src + ' ' + alt);
    const isLikelyDivider = wrap && wrap.textContent.trim().length < 4;
    if (isCharityHint || isLikelyDivider) {
      if (wrap) wrap.remove();
      else img.remove();
    }
  }
  // Drop wholly-empty paragraphs left over after the strips above.
  for (const el of [...root.querySelectorAll('p, div')]) {
    if (!el.textContent.trim() && !el.querySelector('img')) el.remove();
  }
}

// Linearise the description into a flat sequence of content blocks.
// Most products are already flat (top-level <p>/<ul>/heading paragraphs),
// but some wrap everything in a structural <div> (e.g. Facebook's old
// '<div class="text_exposed_show">'), which buries the 'Set Includes'
// heading and its list a level down. We unwrap any <div> that contains
// block-level children so those inner blocks surface; a <div> with no
// block children is itself a paragraph-like block and is kept as-is.
function flattenBlocks(root) {
  const out = [];
  const visit = (el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'div' && containsBlockElements(el)) {
      for (const c of el.children) visit(c); return;
    }
    out.push(el);
  };
  for (const child of root.children) visit(child);
  return out;
}

// Split a block into visual lines, treating <br> as a line break. Some
// products pack several "1x …" entries into ONE paragraph separated by
// <br> (e.g. "1x Super Soft Puppet<br><br>1x Totebag"); raw textContent
// would run them together ("1x Super Soft Puppet1x Totebag") into a
// single garbled accessory, so we split on the breaks first.
function blockLines(el) {
  if (!el || !el.cloneNode) return [(el && el.textContent || '').trim()].filter(Boolean);
  const clone = el.cloneNode(true);
  for (const br of [...clone.querySelectorAll('br')]) br.replaceWith('\n');
  return (clone.textContent || '')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractSetIncludes(blocks, startIdx, endIdx) {
  const items = [];
  const stop = endIdx === -1 ? blocks.length : endIdx;
  for (let i = startIdx + 1; i < stop; i++) {
    const b = blocks[i];
    if (!b) break;
    // Stop at the next obvious section heading.
    const t = (b.textContent || '').trim();
    if (/^(symbolism|important note|fun fact)/i.test(t)) break;
    // Pick up <li> elements OR paragraphs whose text starts with NNx /
    // 1× / 1x / "Includes".
    const lis = b.querySelectorAll('li');
    if (lis.length) {
      for (const li of lis) {
        const name = (li.textContent || '').trim().replace(/^[•·]\s*/, '');
        if (name) items.push({ name });
      }
    } else {
      // A single paragraph may hold several "1x …" entries separated by
      // <br>; split on the breaks and keep each line that reads as a
      // quantity-prefixed item.
      for (const line of blockLines(b)) {
        if (/^\d+\s*[x×]\s+/i.test(line)) items.push({ name: line });
      }
    }
  }
  // Strip the primary plush (first 'NNx …Rabbit/Bunny/Puppet/Plush') so
  // accessories are *just* the extras. Same logic the Phase C accessory
  // checkbox system will use.
  let primaryDropped = false;
  const filtered = items.filter((it) => {
    if (!primaryDropped && /\b(rabbit|bunny|puppet|plush|dinosaur)\b/i.test(it.name) && !/bag|tote|backpack|patch|sticker|standee/i.test(it.name)) {
      primaryDropped = true;
      return false;
    }
    return true;
  });
  // Canonicalize: each accessory carries both a display name (clean,
  // human) and a key (lowercase, used to match between catalog and
  // collection rows). Without canonicalization the saved
  // missing_accessories array would drift whenever Plushie Dreadfuls
  // re-words their Set Includes line.
  return filtered.map((it) => {
    const display = canonicalizeAccessoryName(it.name);
    return { name: display, key: display.toLowerCase() };
  });
}

function canonicalizeAccessoryName(raw) {
  const out = (raw || '')
    // Drop the 'Nx ' or 'N× ' quantity prefix.
    .replace(/^\d+\s*[x×]\s+/i, '')
    // Drop anything in trailing parentheses (usually 'measures NNcm…').
    .replace(/\s*\([^)]*\)\s*$/g, '')
    // Drop a trailing em-dash sub-clause ('— measures 38cm x 33cm').
    .replace(/\s*[—–-]\s*measures?.*$/i, '')
    .trim();
  return stripOutfitWord(out);
}

// ─── Accessory list hygiene ──────────────────────────────────────────
// The "Set Includes" text is freeform prose, so the raw parse drags in
// three kinds of noise: product *features* (poses, articulation,
// embroidery, body construction), *measurements*, and plain duplicates of
// the same physical extra worded two ways. Strip all three so the
// checklist is just the actual included items. Only plushes/bundles get a
// list at all — see categoryHasAccessories.

// A line matching this reads as a feature/spec, not a physical accessory.
const NON_ACCESSORY_RE = new RegExp([
  'pose', 'poseable', 'articulat', 'magnetic', 'connects? to',
  'attach(es|ed)? to (the )?(face|body|head)', 'embroider', 'printed',
  'stitched (on|in)', 'pouch body', 'zipper(ed)? body', 'hidden zip',
  'measures?', '\\d+\\s*cm', '\\d+\\s*(inch|in\\b|")', 'tall',
  'ears? to toes?', 'head to toe', 'machine wash', 'spot clean',
  'surface wash', 'washable', 'polyester', 'stuffing',
].join('|'), 'i');

// Identity key for de-duping: drop counts, size/material adjectives, and
// articles so "Sturdy Cotton Tote Bag" and "Anxiety Rabbit Tote Bag" both
// reduce toward their core noun, and "Tiny Worry Bunnies" collapses with
// "Two Tiny Worry Bunnies".
const ACC_FILLER_RE = /\b(a|an|the|with|for|and|of|in|on|one|two|three|four|five|six|seven|eight|nine|ten|tiny|small|mini|little|large|big|xl|sturdy|soft|plush|cotton|cloth|fabric|fluffy|extra|set|pair|brand|new|limited|edition|official|\d+)\b/g;
function accessoryDedupKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’"“”]/g, '')
    .replace(ACC_FILLER_RE, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(\w+?)s\b/g, '$1')   // crude singularise
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean + de-dupe a parsed accessory list. Accepts strings or {name}.
// Returns the existing {name, key} shape so missing-accessories matching
// keeps working. Keeps the first (leaner) phrasing of any duplicate.
function normalizeAccessories(list) {
  const kept = [];
  for (const raw of (Array.isArray(list) ? list : [])) {
    const name = canonicalizeAccessoryName(typeof raw === 'string' ? raw : (raw && raw.name) || '');
    if (!name) continue;
    if (NON_ACCESSORY_RE.test(name)) continue;          // feature / spec, not an item
    const dk = accessoryDedupKey(name);
    if (!dk) continue;
    const tokens = dk.split(' ').filter(Boolean);
    const dup = kept.some((k) => {
      if (k.dk === dk) return true;
      // Subset merge: collapse when one phrasing's core (≥2 tokens, so we
      // never merge on a lone generic word like "bag") is wholly contained
      // in the other.
      const kt = k.dk.split(' ').filter(Boolean);
      const small = tokens.length <= kt.length ? tokens : kt;
      const big   = tokens.length <= kt.length ? kt : tokens;
      return small.length >= 2 && small.every((t) => big.includes(t));
    });
    if (dup) continue;
    kept.push({ name, key: name.toLowerCase(), dk });
  }
  return kept.map(({ name, key }) => ({ name, key }));
}

// Only plushes and multi-item bundles ship with accessories. Store merch,
// minis, standees, etc. don't get a checklist at all.
function categoryHasAccessories(item) {
  const cat = catalogCategory(item);
  // Minis/keychain plushes get accessories too — they ship with (and have
  // clothing/outfits available for) them, same as full-size plushes.
  return cat === 'plush' || cat === 'bundle' || cat === 'mini';
}

function textOf(node) {
  // Plain-text dump that preserves paragraph breaks.
  return (node.textContent || '').trim().replace(/\s+/g, ' ');
}
function stripTagsKeepNewlines(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

async function refreshCatalogLive() {
  const all = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`${LIVE_CATALOG_BASE}&page=${page}`, { mode: 'cors' });
      if (!r.ok) throw new Error(`page ${page} ${r.status}`);
      const data = await r.json();
      const products = data.products || [];
      if (products.length === 0) break;
      all.push(...products.map(normalizeShopifyProduct));
      if (products.length < 250) break;
    }
  } catch (e) {
    console.info('Live catalog refresh skipped:', e.message);
    return false;
  }
  if (all.length === 0) return false;
  const shopify = all.filter(isPlushieCollectible);
  state.catalog = await mergeCustomCatalog(shopify);
  await idb.setMeta('last_live_refresh', Date.now());
  if (state.tab === 'catalog') render();
  return true;
}

function byNewest(a, b) {
  return (b.addedAt || 0) - (a.addedAt || 0);
}

// ─── Rendering ───────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Parse a search string into positive / negative terms. Supports:
//   foo bar      → must contain "foo" AND "bar"
//   "foo bar"    → must contain the exact phrase "foo bar"
//   -foo         → must NOT contain "foo"
//   -"foo bar"   → must NOT contain the phrase "foo bar"
// Expects a lowercased query (callers already lowercase). Cached per string
// since the same query is parsed once per item across a render pass.
let _queryCache = { src: null, terms: [] };
function parseQuery(q) {
  if (_queryCache.src === q) return _queryCache.terms;
  const terms = [];
  const re = /(-)?"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(q)) !== null) {
    if (m[2] !== undefined) {                 // quoted phrase
      const text = m[2].trim();
      if (text) terms.push({ neg: m[1] === '-', text });
    } else {                                   // bare token
      let tok = m[3];
      let neg = false;
      if (tok.startsWith('-') && tok.length > 1) { neg = true; tok = tok.slice(1); }
      if (tok && tok !== '-') terms.push({ neg, text: tok });
    }
  }
  _queryCache = { src: q, terms };
  return terms;
}

// Test a haystack string against a parsed query. Every positive term must be
// present and no negative term may be.
function queryMatches(hay, q) {
  if (!q) return true;
  const h = hay.toLowerCase();
  for (const t of parseQuery(q)) {
    const present = h.includes(t.text);
    if (t.neg ? present : !present) return false;
  }
  return true;
}

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = [item.name, item.nickname, item.meaning, item.acquiredHow]
    .filter(Boolean).join(' ');
  return queryMatches(hay, q);
}

// Look up a collection/wishlist item's category by joining to the catalog
// on catalog_id. Items without a catalog_id fall through to 'other'.
function itemCategory(item) {
  if (!item.catalogId) return isWearableItem(item) ? 'clothing' : 'other';
  const cat = state.catalog.find((c) => c.id === item.catalogId);
  return cat ? catalogCategory(cat) : (isWearableItem(item) ? 'clothing' : 'other');
}

function filteredCollection() {
  const q = state.query.trim().toLowerCase();
  const arr = state.collection.filter((it) => {
    if (state.filter === 'active' && it.retired) return false;
    if (state.filter === 'retired' && !it.retired) return false;
    if (state.colCategory !== 'all' && itemCategory(it) !== state.colCategory) return false;
    if (state.colDupes && (it.quantity || 1) <= 1) return false;
    if (state.colNoBag) {
      // The filter now covers any missing accessory, not just the bag.
      // Items with a missing_accessories array OR legacy has_bag = false
      // are 'incomplete'.
      const missing = Array.isArray(it.missingAccessories) ? it.missingAccessories : [];
      const incomplete = missing.length > 0 || it.hasBag === false;
      if (!incomplete) return false;
    }
    return matchesQuery(it, q);
  });
  return sortCollection(arr, state.colSort);
}

function filteredWishlist() {
  const q = state.query.trim().toLowerCase();
  const arr = state.wishlist.filter((it) => {
    if (state.wishCategory !== 'all' && itemCategory(it) !== state.wishCategory) return false;
    if (state.wishInStock && it.outOfStock) return false;
    return matchesQuery(it, q);
  });
  return sortWishlist(arr, state.wishSort);
}

function sortCollection(items, mode) {
  const a = items.slice();
  const cmpName = (x, y) => (x.nickname || x.name || '').localeCompare(y.nickname || y.name || '');
  const cmpAcquired = (x, y) => (y.dateCollected || '').localeCompare(x.dateCollected || '');
  const cmpAdded = (x, y) => (y.addedAt || 0) - (x.addedAt || 0);
  const cmpQty = (x, y) => (y.quantity || 1) - (x.quantity || 1);
  // Manual order: the user's hand-sorted sequence (item 20). Rows with a
  // sort_order come first in that order; anything un-ordered falls back to
  // newest-added so freshly-added items surface at the bottom.
  const cmpManual = (x, y) => {
    const xo = x.sortOrder, yo = y.sortOrder;
    if (xo == null && yo == null) return cmpAdded(x, y);
    if (xo == null) return 1;
    if (yo == null) return -1;
    return xo - yo;
  };
  switch (mode) {
    case 'manual':        a.sort(cmpManual); break;
    case 'acquired_asc':  a.sort((x, y) => -cmpAcquired(x, y)); break;
    case 'added_desc':    a.sort(cmpAdded); break;
    case 'name_asc':      a.sort(cmpName); break;
    case 'name_desc':     a.sort((x, y) => -cmpName(x, y)); break;
    case 'qty_desc':      a.sort(cmpQty); break;
    case 'acquired_desc':
    default:              a.sort(cmpAcquired);
  }
  return a;
}

// ─── Manual collection ordering (item 20) ───────────────────────────
// Stamp each collection item's sortOrder to match the given full-collection
// id sequence, so the next render (in 'manual' mode) reflects the new order.
function applyManualOrder(orderedIds) {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  for (const it of state.collection) {
    if (pos.has(it.id)) it.sortOrder = pos.get(it.id);
  }
}

// The ids currently shown in the collection grid, in display order. Read from
// the DOM so it always matches exactly what the user sees.
function displayedCollectionIds() {
  return [...document.querySelectorAll('#collection-grid [data-reorder-id]')]
    .map((el) => el.dataset.reorderId);
}

async function persistManualOrder(orderedIds) {
  applyManualOrder(orderedIds);
  render();
  try {
    await data.saveCollectionOrder(orderedIds);
  } catch (e) {
    console.error('saveCollectionOrder', e);
    toast(/sort_order/i.test(e?.message || '')
      ? 'Run the latest migration (db/0028_collection_sort.sql) — the sort_order column is missing.'
      : 'Could not save the new order.');
  }
}

// Move an item one slot up/down within the displayed list, preserving the
// positions of everything not currently shown (other sub-tabs, the closet).
async function moveCollectionItem(id, dir) {
  const displayed = displayedCollectionIds();
  const di = displayed.indexOf(id);
  if (di === -1) return;
  const neighbor = dir === 'up' ? displayed[di - 1] : displayed[di + 1];
  if (!neighbor) return; // already at the edge
  const gIds = sortCollection(state.collection.slice(), 'manual').map((x) => x.id);
  gIds.splice(gIds.indexOf(id), 1);
  let at = gIds.indexOf(neighbor);
  if (dir === 'down') at += 1;
  gIds.splice(at, 0, id);
  await persistManualOrder(gIds);
}

// Drag-drop: drop `dragId` onto `targetId`'s slot in the global order.
async function dropReorder(dragId, targetId) {
  if (!dragId || !targetId || dragId === targetId) return;
  const gIds = sortCollection(state.collection.slice(), 'manual').map((x) => x.id);
  gIds.splice(gIds.indexOf(dragId), 1);
  gIds.splice(gIds.indexOf(targetId), 0, dragId);
  await persistManualOrder(gIds);
}

function sortWishlist(items, mode) {
  const a = items.slice();
  const cmpName = (x, y) => (x.name || '').localeCompare(y.name || '');
  const cmpAdded = (x, y) => (y.addedAt || 0) - (x.addedAt || 0);
  switch (mode) {
    case 'added_asc':  a.sort((x, y) => -cmpAdded(x, y)); break;
    case 'name_asc':   a.sort(cmpName); break;
    case 'name_desc':  a.sort((x, y) => -cmpName(x, y)); break;
    case 'added_desc':
    default:           a.sort(cmpAdded);
  }
  return a;
}

function catalogIdMap() {
  const owned = new Map();
  const wished = new Map();
  for (const i of state.collection) if (i.catalogId) owned.set(i.catalogId, i.id);
  for (const i of state.wishlist) if (i.catalogId) wished.set(i.catalogId, i.id);
  return { owned, wished };
}

const CATALOG_CATEGORIES = new Set(['all', 'plush', 'mini', 'clothing', 'accessory', 'bundle', 'other']);

function filteredCatalog() {
  const q = state.query.trim().toLowerCase();
  const { owned } = catalogIdMap();
  const cat = CATALOG_CATEGORIES.has(state.catalogFilter) ? state.catalogFilter : 'all';
  const statuses = state.catalogStatuses;
  const theme = state.catalogTheme;
  const items = state.catalog.filter((raw) => {
    // Resolve so variants inherit parent's type / tags / status when
    // they don't override — keeps them filterable under the same
    // theme / category as the parent.
    const it = resolveCatalogItem(raw);
    if (cat !== 'all' && catalogCategory(it) !== cat) return false;
    if (statuses.size > 0 && !statuses.has(itemStatus(it))) return false;
    if (state.catalogUnowned && owned.has(it.id)) return false;
    if (state.catalogOriginal) {
      const tags = (it.tags || []).map((t) => String(t).toLowerCase());
      const isOriginalForm = tags.includes('original')
        || (it.formLabel && /original/i.test(it.formLabel));
      if (!isOriginalForm) return false;
    }
    if (theme && theme !== 'all') {
      const tags = (it.tags || []).map((t) => t.toLowerCase());
      if (!tags.includes(theme)) return false;
    }
    if (state.catalogColor && state.catalogColor !== 'all') {
      const tags = (it.tags || []).map((t) => t.toLowerCase());
      // Substring match so 'pink' catches 'hot pink', 'light pink', etc.
      if (!tags.some((t) => t.includes(state.catalogColor))) return false;
    }
    if (!q) return true;
    // Name + tags form one haystack so a term can match either, while
    // negative/phrase operators (-foo, "foo bar") still apply across both.
    const hay = `${it.name} ${(it.tags || []).join(' ')}`;
    return queryMatches(hay, q);
  });
  return sortCatalog(items, state.catalogSort);
}

function sortCatalog(items, mode) {
  const arr = items.slice();
  const cmpName = (a, b) => cleanCatalogName(a.name).localeCompare(cleanCatalogName(b.name));
  const cmpDate = (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  const cmpPrice = (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity);
  switch (mode) {
    case 'oldest':     arr.sort((a, b) => -cmpDate(a, b)); break;
    case 'name_asc':   arr.sort(cmpName); break;
    case 'name_desc':  arr.sort((a, b) => -cmpName(a, b)); break;
    case 'price_asc':  arr.sort(cmpPrice); break;
    case 'price_desc': arr.sort((a, b) => -cmpPrice(a, b)); break;
    case 'newest':
    default:           arr.sort(cmpDate);
  }
  return arr;
}

function renderCatalogMeta(item) {
  const parts = [];
  if (item.price != null) parts.push(`<span>$${Number(item.price).toFixed(2)}</span>`);
  // Prefer an explicit release_year (admin-set on customs) over the
  // createdAt fallback so retired/Patreon-era plushies show their
  // actual release date, not when they were added to the catalog.
  const year = item.releaseYear
    || (item.createdAt ? new Date(item.createdAt).getFullYear() : null);
  if (year && !isNaN(year)) parts.push(`<span>${year}</span>`);
  return parts.length ? `<div class="card-meta">${parts.join('')}</div>` : '';
}

function renderCatalogCard(rawItem, owned, wished) {
  const item = resolveCatalogItem(rawItem);
  const display = cleanCatalogName(item.name);
  // Custom catalog items already carry a signed Storage URL in
  // item.image; only Shopify URLs benefit from the _NNNx variant.
  const thumb = item.isCustom
    ? item.image
    : (shopifyImageVariant(item.image, 400) || item.image);
  const photoHtml = thumb
    ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(display)}" loading="lazy" />`
    : `<span class="no-photo">🖤</span>`;

  const isOwned = owned.has(item.id);
  const isWished = wished.has(item.id);

  const badges = [];
  // Owned / Wished render FIRST so when an item is both Owned and
  // Sold Out (or Retired etc.) the OWNED badge sits at the leading
  // edge of the stack — per Wifeosaurus's feedback that 'Owned
  // should come before Sold Out' for consistency.
  if (isOwned) badges.push(`<span class="card-status owned">✓ Owned</span>`);
  else if (isWished) badges.push(`<span class="card-status wished">★ Wished</span>`);
  const status = itemStatus(item);
  if (status === 'retired') badges.push(`<span class="badge badge-retired">Retired</span>`);
  else if (status === 'coming_soon') badges.push(`<span class="badge badge-soon">Coming Soon</span>`);
  else if (status === 'fyc') badges.push(`<span class="badge badge-fyc" title="For Your Consideration — under consideration, doesn't exist yet">FYC</span>`);
  else if (status === 'sold_out') badges.push(`<span class="badge badge-oos">Sold Out</span>`);
  if (isMiniPlushie(item)) badges.push(`<span class="badge badge-mini">Mini</span>`);
  if (item.isBundle) {
    badges.push(`<span class="badge badge-bundle" title="Bundle — multiple items. Click Have to pick which ones you own.">Bundle</span>`);
  }
  if (item.isCustom && item.formLabel) {
    badges.push(`<span class="badge badge-form" title="Form variant">${escapeHtml(item.formLabel)}</span>`);
  }

  // Custom items normally have no Shopify URL — but form variants
  // resolve through their parent handle so Buy points at the upstream
  // product page (the buyer gets whatever current iteration upstream
  // sells; their *collection* still records the form they own).
  const productHandleForBuy = item.isCustom
    ? item.parentShopifyHandle
    : item.handle;
  const productUrl = productHandleForBuy ? (PRODUCT_URL_BASE + productHandleForBuy) : null;
  const canHave = !(status === 'coming_soon' || status === 'fyc');
  const haveBtn  = canHave  ? `<button class="btn-have" data-action="cat-have" data-cid="${item.id}">🖤 Have</button>` : '';
  const wantBtn  = !isWished ? `<button class="btn-want" data-action="cat-want" data-cid="${item.id}">🕯 Want</button>` : '';
  const linkBtn  = productUrl ? `<a class="btn-buy" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener" title="Open product page">Buy</a>` : '';
  // "Suggest a photo" appears when the item has no image. We thread
  // the target id through dataset so the handler knows whether to
  // attach it to a Shopify id or a catalog_items uuid. Hidden when
  // the user_photo_uploads feature flag is off (admins still see it).
  const canSuggestPhotos = window.currentUser?.isAdmin || data.featureEnabled('feature.user_photo_uploads');
  const suggestBtn = (!thumb && canSuggestPhotos)
    ? `<button class="btn-suggest" data-action="cat-suggest-photo" data-cid="${item.id}" data-target-kind="${item.isCustom ? 'custom' : 'shopify'}">🤍 Suggest a photo</button>`
    : '';
  // Admins can edit any custom catalog item (Shopify rows are upstream — out of scope).
  const adminEditBtn = (window.currentUser?.isAdmin && item.isCustom)
    ? `<button class="btn-icon" data-action="cat-admin-edit" data-cid="${item.id}" title="Edit catalog entry">✎</button>`
    : '';
  const actions = isOwned
    ? `<button data-action="cat-edit" data-cid="${item.id}">Edit</button> ${haveBtn} ${linkBtn} ${adminEditBtn}`
    : `${haveBtn} ${wantBtn} ${linkBtn} ${adminEditBtn}`;

  return `
    <article class="card" data-cid="${item.id}" title="${escapeHtml(display)}">
      <div class="card-photo" data-action="cat-detail" data-cid="${item.id}" role="button" aria-label="View details">
        ${photoHtml}
        ${badges.length ? `<div class="badge-stack">${badges.join('')}</div>` : ''}
      </div>
      <div class="card-body">
        <h3 class="card-name card-name-clickable" data-action="cat-detail" data-cid="${item.id}">${escapeHtml(display)}${item.isCustom && item.formLabel ? ` <span class="card-form-label">${escapeHtml(item.formLabel)}</span>` : ''}</h3>
        ${renderCatalogMeta(item)}
        ${suggestBtn}
      </div>
      <div class="card-actions">${actions}</div>
    </article>
  `;
}

function photoSrc(item) {
  if (!item.photo) return null;
  if (item.photo instanceof Blob) return urlFor(item.id, item.photo);
  if (typeof item.photo === 'string') return item.photo;
  return null;
}

// ─── Wearable accessories (clothing) ────────────────────────────────
// Detect plush clothing so it can be attached to the plush wearing it.
// Plushie Dreadfuls' wearables are the "Plush Outfit" / "Mini Plush
// Outfit" / "Dreadful Disguises" lines (all catalog type 'accessory'),
// plus anything with a clothing keyword on an accessory-typed item.
const PLUSH_CLOTHING_LINES = /plush outfit|dreadful disguises/i;
// NB: "mask" is here on purpose — a plush gas mask / face mask is worn ON a
// plush, so it's closet clothing, not a generic accessory.
const CLOTHING_RE = /\b(outfit|hoodie|sweater|sweatshirt|cardigan|jacket|coat|dress|gown|skirt|overalls|romper|onesie|jumpsuit|jumper|pinafore|pajamas?|robe|vest|tunic|kimono|poncho|cape|capelet|cloak|costume|wings|tutu|scarf|shawl|beanie|bonnet|mask)\b/i;

function catalogForItem(item) {
  return item.catalogId ? state.catalog.find((c) => c.id === item.catalogId) : null;
}

// Does a catalog entry describe wearable plush clothing? Either it's on one
// of the named clothing lines, or it's an accessory-typed product whose name
// carries a clothing keyword.
function catalogIsClothing(cat) {
  // A manual 'clothing' override (e.g. gas/plague masks that Shopify types as
  // plushes) forces wearable behaviour regardless of product_type.
  if (categoryOverride(cat) === 'clothing') return true;
  const name = (cat?.name || '').toLowerCase();
  const type = (cat?.type || '').toLowerCase();
  if (PLUSH_CLOTHING_LINES.test(name)) return true;
  if (type === 'accessory' && CLOTHING_RE.test(name)) return true;
  return false;
}

function isWearableItem(item) {
  const cat = catalogForItem(item);
  if (cat) return catalogIsClothing(cat);
  // Pre-catalog / custom items: fall back to the user's own name, which
  // is often possessive ("Ni'ni's Purple Overalls").
  return CLOTHING_RE.test((item.name || '').toLowerCase());
}

// Mini clothing vs. full-size clothing. Plushie Dreadfuls names every
// mini-scale garment "Mini Plush Outfit …", so the word "mini" on a
// wearable is the tell. We check the *catalog* name (the user-facing name is
// stripped of the "Mini Plush Outfit" wording) and fall back to the item's
// own name for custom pieces.
function clothingIsMini(item) {
  const cat = catalogForItem(item);
  const name = `${cat?.name || ''} ${item.name || ''}`.toLowerCase();
  return /\bmini\b/.test(name);
}

// Is a (non-clothing) plush a mini? Resolves through the catalog category so
// overrides win. Used to keep clothing on a same-scale plush.
function plushIsMini(item) {
  return itemCategory(item) === 'mini';
}

// Scale gate for attaching clothing to a plush: mini clothing only fits mini
// plushes, full-size clothing only fits full-size plushes. Never the twain.
function clothingFitsPlush(acc, plush) {
  return clothingIsMini(acc) === plushIsMini(plush);
}

// Which collection sub-tab an item belongs to: 'plushes' | 'minis' |
// 'accessories' | 'other'. Clothing is special-cased — it lives in the
// Plushes or Minis closet, by scale — so it never lands under Accessories.
function collectionTabOf(item) {
  if (isWearableItem(item)) return clothingIsMini(item) ? 'minis' : 'plushes';
  const c = itemCategory(item);            // catalog category: plush|mini|accessory|bundle|other
  if (c === 'mini') return 'minis';
  if (c === 'accessory') return 'accessories';
  if (c === 'plush' || c === 'bundle') return 'plushes';
  return 'other';
}

// A collection entry = a plush card, plus any accessories attached to it
// shown side-by-side on the right. Plain plushes render as a bare card.
function renderCollectionEntry(item) {
  const card = renderCard(item, 'collection');
  const attached = state._attByPlush ? (state._attByPlush.get(item.id) || []) : [];
  if (!attached.length) return card;
  const accs = attached.map(renderAttachedAccessory).join('');
  return `<div class="col-entry outfitted">${card}<div class="attached-wrap">${accs}</div></div>`;
}

function renderAttachedAccessory(a) {
  const src = photoSrc(a) || catalogImageFor(a.catalogId);
  const photo = src
    ? `<img src="${escapeHtml(src)}" loading="lazy" alt="" />`
    : '<span class="no-photo">🧥</span>';
  return `
    <div class="attached-acc" data-acc-id="${a.id}">
      <div class="attached-acc-photo" data-action="open-detail" data-id="${a.id}" role="button" title="Edit / rename / reassign">${photo}</div>
      <div class="attached-acc-info">
        <span class="attached-acc-name" data-action="open-detail" data-id="${a.id}" role="button">${escapeHtml(a.nickname || stripOutfitWord(a.name))}</span>
        <button class="attached-detach" data-action="detach-acc" data-id="${a.id}" title="Hang it back up in the closet">↩ Hang it back up</button>
      </div>
    </div>`;
}

function renderCard(item, kind) {
  const src = photoSrc(item);
  const photoHtml = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
    : `<span class="no-photo">🖤</span>`;

  const meta = [];
  if (kind === 'collection') {
    if (item.dateCollected) meta.push(`<span>${formatDate(item.dateCollected)}</span>`);
    if (item.acquiredHow) meta.push(`<span>${escapeHtml(item.acquiredHow)}</span>`);
    // Missing-accessories pill. Generalises the old 'No bag' warning:
    // any unchecked accessory on the user's row surfaces as a small
    // warning. The most common case (just the tote bag) keeps the
    // 'No bag' label for familiarity; multiple missing pieces show
    // a count instead.
    const missingAcc = Array.isArray(item.missingAccessories) ? item.missingAccessories : [];
    const legacyNoBag = (missingAcc.length === 0 && item.hasBag === false);
    if (missingAcc.length > 0 || legacyNoBag) {
      const cat = item.catalogId ? state.catalog.find((c) => c.id === item.catalogId) : null;
      const isPlushie = !cat || (cat.type || '').toLowerCase() === 'plush';
      if (isPlushie) {
        const effective = missingAcc.length ? missingAcc : ['tote bag'];
        const label = effective.length === 1 && /\bbag\b/i.test(effective[0])
          ? 'No bag'
          : `Missing ${effective.length} accessor${effective.length === 1 ? 'y' : 'ies'}`;
        meta.push(`<span class="meta-warn" title="${escapeHtml(effective.join(', '))}">${escapeHtml(label)}</span>`);
      }
    }
  } else {
    if (item.url) {
      try {
        meta.push(`<span>${escapeHtml(new URL(item.url).hostname.replace(/^www\./, ''))}</span>`);
      } catch { /* invalid url, skip */ }
    }
  }

  const badges = [];
  if (kind === 'collection' && item.retired) badges.push(`<span class="badge badge-retired">Retired</span>`);
  if (kind === 'wishlist' && item.outOfStock) badges.push(`<span class="badge badge-oos">Out of Stock</span>`);
  if (kind === 'collection' && (item.quantity || 1) > 1) {
    badges.push(`<span class="badge badge-qty">×${item.quantity}</span>`);
  }

  // Trade markers: show if this catalog item is already in trade_items
  const tradeMark = tradeMarkerFor(item, kind);
  if (tradeMark) badges.push(tradeMark);

  const tradeBtn = kind === 'collection'
    ? `<button data-action="offer-trade" data-id="${item.id}">↻ Offer for trade</button>`
    : `<button data-action="seek-trade" data-id="${item.id}">↺ Seek in trade</button>`;

  const qty = item.quantity || 1;
  const qtyControl = kind === 'collection' ? `
    <div class="qty-control" title="How many you have">
      <button class="qty-btn" data-action="col-dec" data-id="${item.id}" aria-label="One fewer">−</button>
      <span class="qty-display">×${qty}</span>
      <button class="qty-btn" data-action="col-inc" data-id="${item.id}" aria-label="One more">+</button>
    </div>` : '';

  const isSeeking = kind === 'wishlist' && item.catalogId
    && state.myTradeItems.some((t) => t.kind === 'seeking' && t.catalogId === item.catalogId);

  // Wearable accessory that isn't attached yet → offer to attach it.
  const wearerBtn = (kind === 'collection' && isWearableItem(item) && !item.wornBy)
    ? `<button data-action="assign-wearer" data-id="${item.id}" title="Attach this to the plush wearing it">🧥 Who's wearing this?</button>`
    : '';

  // Manual reorder controls (item 20) — only in My-order mode. A drag grip
  // (desktop) plus up/down arrows (works everywhere, incl. touch).
  const manualMode = kind === 'collection' && state.colSort === 'manual';
  const reorder = manualMode
    ? `<div class="col-reorder" title="Drag the grip to reorder, or use the arrows">
         <button class="reorder-btn" data-action="move-up" data-id="${item.id}" aria-label="Move up">▲</button>
         <span class="reorder-grip" aria-hidden="true">☰</span>
         <button class="reorder-btn" data-action="move-down" data-id="${item.id}" aria-label="Move down">▼</button>
       </div>`
    : '';

  const actions = kind === 'collection'
    ? `
      ${reorder}
      ${qtyControl}
      ${wearerBtn}
      ${tradeBtn}
      <button class="btn-trash" data-action="delete" data-id="${item.id}" aria-label="Delete" title="Delete">🗑</button>
    `
    : `
      <button class="btn-got" data-action="got" data-id="${item.id}">✓ Got it! — move to collection</button>
      <div class="card-actions-secondary">
        ${item.url && !item.outOfStock ? `<a class="btn-buy" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="Buy on plushiedreadfuls.com">Buy ↗</a>` : ''}
        ${isSeeking
          ? `<button class="btn-icon btn-icon-labeled" data-action="seek-trade" data-id="${item.id}" aria-label="Stop seeking" title="Stop telling other collectors you'd accept this in a trade">✕ Stop seeking</button>`
          : `<button class="btn-icon btn-icon-seek btn-icon-labeled" data-action="seek-trade" data-id="${item.id}" aria-label="Seek in trade" title="Tell other collectors you'd accept this in a trade">↺ Seek in trade</button>`}
        <button class="btn-icon btn-icon-danger" data-action="delete" data-id="${item.id}" aria-label="Remove from wish list" title="Remove">🗑</button>
      </div>
    `;

  // Body content. On the collection (list view) we keep things compact —
  // nickname/name only — and tapping the card opens the detail modal with
  // meaning, date, acquired-how, has-bag, etc. The Edit button is gone in
  // that mode because the card body IS the entry point.
  const collectionBody = `
    ${item.nickname
      ? `<h3 class="card-name nickname">${escapeHtml(item.nickname)}</h3>
         <p class="card-product">${escapeHtml(stripOutfitWord(item.name))}</p>`
      : `<h3 class="card-name">${escapeHtml(stripOutfitWord(item.name))}</h3>`}
    ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
  `;
  const otherBody = `
    <h3 class="card-name">${escapeHtml(stripOutfitWord(item.name))}</h3>
    ${item.meaning ? `<p class="card-meaning">${escapeHtml(item.meaning)}</p>` : ''}
    ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
  `;
  const bodyOpen = kind === 'collection'
    ? `<div class="card-body card-clickable" data-action="open-detail" data-id="${item.id}">`
    : `<div class="card-body">`;

  // Tapping the photo opens the lightbox so collectors can see the bigger
  // picture (item 14). Only when there's actually an image to enlarge.
  const photoZoom = src
    ? ` data-action="zoom-photo" data-id="${item.id}" role="button" tabindex="0" aria-label="View larger" title="Tap to see it bigger"`
    : '';
  const dragAttr = manualMode ? ` draggable="true" data-reorder-id="${item.id}"` : '';
  return `
    <article class="card${manualMode ? ' card-draggable' : ''}" data-id="${item.id}"${dragAttr}>
      <div class="card-photo"${photoZoom}>
        ${photoHtml}
        ${badges.length ? `<div class="badge-stack">${badges.join('')}</div>` : ''}
      </div>
      ${bodyOpen}
        ${kind === 'collection' ? collectionBody : otherBody}
      </div>
      <div class="card-actions">${actions}</div>
    </article>
  `;
}

// Apply the current data.appSettings to DOM elements that aren't
// re-rendered on every change (the catalog/pens lists already gate
// their own buttons inline). Called on boot and after any admin
// settings change.
function applyFeatureFlags() {
  const canSuggest = window.currentUser?.isAdmin || data.featureEnabled('feature.user_photo_uploads');
  const suggestBtn = document.getElementById('suggest-plushie-btn');
  if (suggestBtn) suggestBtn.classList.toggle('hidden', !canSuggest);
}

function render() {
  revokeAllBlobUrls();

  const tab = state.tab;
  // Pens used to be a top-level tab; it's now a sub-tab of Collection.
  // We treat a Pens sub-view selection like 'tab is collection, but
  // showing the pens checklist'. The flags below derive from both.
  const onPens = tab === 'collection' && state.colSubTab === 'pens';

  document.getElementById('collection-view').classList.toggle('hidden', tab !== 'collection');
  document.getElementById('wishlist-view').classList.toggle('hidden', tab !== 'wishlist');
  document.getElementById('catalog-view').classList.toggle('hidden', tab !== 'catalog');
  document.getElementById('trade-view').classList.toggle('hidden', tab !== 'trade');
  document.getElementById('social-view').classList.toggle('hidden', tab !== 'social');
  document.getElementById('admin-view').classList.toggle('hidden', tab !== 'admin');
  // Admin tab visibility is gated by the current user being is_admin.
  document.getElementById('admin-tab').classList.toggle('hidden', !window.currentUser?.isAdmin);

  // Collection sub-tabs and sub-views.
  if (tab === 'collection') {
    document.querySelectorAll('#collection-subtabs .subtab').forEach((s) =>
      s.classList.toggle('active', s.dataset.colSubtab === state.colSubTab)
    );
    document.getElementById('collection-sub-items').classList.toggle('hidden', state.colSubTab === 'pens');
    document.getElementById('collection-sub-pens').classList.toggle('hidden', state.colSubTab !== 'pens');
  }

  // Toolbar visibility: Plushies sub-tab gets the search + filters;
  // Pens sub-tab hides them. Other tabs untouched.
  document.getElementById('collection-filters').classList.toggle('hidden', tab !== 'collection' || onPens);
  document.getElementById('wishlist-actions').classList.toggle('hidden', tab !== 'wishlist');
  document.getElementById('catalog-filters').classList.toggle('hidden', tab !== 'catalog');

  // Search bar makes sense on item lists, not on the checklist/trade/social tabs.
  document.getElementById('search').classList.toggle('hidden', onPens || tab === 'trade' || tab === 'admin' || tab === 'social');
  // Active-filters bar belongs to the catalog.
  document.getElementById('active-filters').classList.toggle('hidden', tab !== 'catalog');
  // The plain count-label now only shows for non-catalog tabs (catalog has its own bar).
  document.getElementById('count-label').classList.toggle('hidden', tab === 'catalog' || onPens || tab === 'social');

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );

  if (tab === 'collection') {
    syncCollectionChips();
    // Map every attached accessory to the plush wearing it (computed from
    // the whole collection so attachments survive search/filters), then
    // hide the attached accessories from the grid itself.
    const attByPlush = new Map();
    for (const it of state.collection) {
      if (!it.wornBy) continue;
      if (!attByPlush.has(it.wornBy)) attByPlush.set(it.wornBy, []);
      attByPlush.get(it.wornBy).push(it);
    }
    state._attByPlush = attByPlush;

    // The active category sub-tab ('plushes' | 'minis' | 'accessories' |
    // 'other'); Pens is handled separately below.
    const sub = state.colSubTab === 'pens' ? 'plushes' : state.colSubTab;
    const shown = filteredCollection().filter((i) => !i.wornBy);
    // Items that live in this sub-tab's main grid: matching category, minus
    // clothing (clothing lives in the closet, by scale).
    const mainItems = shown.filter((i) => !isWearableItem(i) && collectionTabOf(i) === sub);
    // Only Plushes and Minis have a closet. Plushes → full-size clothing,
    // Minis → mini-scale clothing.
    const closetItems = (sub === 'plushes' || sub === 'minis')
      ? shown.filter((i) => isWearableItem(i) && collectionTabOf(i) === sub)
      : [];

    // Layout: roomy cards (default) or a dense compact list (item 13).
    const compact = state.colView === 'compact';
    const colGrid = document.getElementById('collection-grid');
    colGrid.classList.toggle('grid-compact', compact);
    colGrid.classList.toggle('grid-list', !compact);
    colGrid.innerHTML = mainItems.map((i) => renderCollectionEntry(i)).join('');
    const unwornSection = document.getElementById('unworn-clothing-section');
    if (unwornSection) {
      document.getElementById('unworn-clothing-grid').innerHTML = closetItems.map((i) => renderCard(i, 'collection')).join('');
      unwornSection.classList.toggle('hidden', closetItems.length === 0);
      const cnt = document.getElementById('unworn-clothing-count');
      if (cnt) cnt.textContent = closetItems.length ? `· ${closetItems.length}` : '';
    }
    const tabTotal = mainItems.length + closetItems.length;
    document.getElementById('collection-empty').classList.toggle('hidden', tabTotal > 0);
    document.getElementById('count-label').textContent =
      `${tabTotal} of ${state.collection.length} item${state.collection.length === 1 ? '' : 's'}`;

    // Per-tab badge counts, computed over the whole collection (unfiltered)
    // so the tab chips show stable totals regardless of search/filters.
    const tabCounts = { plushes: 0, minis: 0, accessories: 0, other: 0 };
    for (const it of state.collection) tabCounts[collectionTabOf(it)]++;
    for (const k of Object.keys(tabCounts)) {
      const el = document.getElementById(`col-subtab-count-${k}`);
      if (el) el.textContent = `· ${tabCounts[k]}`;
    }

    // Pens sub-tab — always re-render so the counts stay current even when
    // another sub-tab is showing. renderPens() updates #pens-progress + #pens-list.
    renderPens();
    const pensBadge = `${state.pensOwned.size}/${activePens().length}`;
    document.getElementById('col-subtab-count-pens').textContent = `· ${pensBadge}`;
    // When Pens sub-tab is showing, the count-label is hidden (handled
    // above via the onPens flag); no need to set it here.
  } else if (tab === 'wishlist') {
    syncWishlistChips();
    const items = filteredWishlist();
    document.getElementById('wishlist-grid').innerHTML = items.map((i) => renderCard(i, 'wishlist')).join('');
    document.getElementById('wishlist-empty').classList.toggle('hidden', items.length > 0);
    document.getElementById('count-label').textContent =
      `${items.length} of ${state.wishlist.length} item${state.wishlist.length === 1 ? '' : 's'}`;
  } else if (tab === 'catalog') {
    syncCatalogChips();
    const items = filteredCatalog();
    const { owned, wished } = catalogIdMap();
    document.getElementById('catalog-grid').innerHTML =
      items.map((i) => renderCatalogCard(i, owned, wished)).join('');
    const empty = state.catalog.length === 0;
    document.getElementById('catalog-empty').classList.toggle('hidden', !empty);
    renderActiveFilters(items.length);
  } else if (tab === 'trade') {
    renderTrade();
    document.getElementById('count-label').textContent = tradeCountLabel();
  } else if (tab === 'admin') {
    renderAdmin();
    document.getElementById('count-label').textContent = state.adminUserView
      ? `Inspecting @${state.adminUserView.user.username}`
      : `${state.adminUsers.length} user${state.adminUsers.length === 1 ? '' : 's'}`;
  } else if (tab === 'social') {
    renderSocial();
  }
  updateTradeBadge();
  updateSocialBadge();
  saveFilters();    // persist filter state every render — cheap, captures all mutations
}

function renderPens() {
  const pens = activePens();
  const lines = [...new Set(pens.map((p) => p.line))];
  const unique = state.pensOwned.size;
  const total = [...state.pensOwned.values()].reduce((a, b) => a + b, 0);
  const progressPct = Math.round((unique / pens.length) * 100);
  document.getElementById('pens-progress').innerHTML = `
    <div class="pens-progress-text">
      <span class="pens-count">${unique}</span>
      <span class="pens-total">/ ${pens.length} unique</span>
      <span class="pens-total-grand">· ${total} total</span>
    </div>
    <div class="pens-bar"><div class="pens-bar-fill" style="width: ${progressPct}%"></div></div>
  `;

  document.getElementById('pens-list').innerHTML = lines.map((line) => {
    const items = pens.filter((p) => p.line === line);
    const ownedUnique = items.filter((p) => state.pensOwned.has(p.id)).length;
    const ownedTotal = items.reduce((sum, p) => sum + (state.pensOwned.get(p.id) || 0), 0);
    const rows = items.map((p) => {
      const count = state.pensOwned.get(p.id) || 0;
      // Thumbnail when the pen has an image_path on its DB row;
      // otherwise a placeholder + 🤍 'suggest a photo' button so
      // collectors can submit one. The button is hidden when the
      // user_photo_uploads feature flag is off (admins still see it).
      const canSuggestPhotos = window.currentUser?.isAdmin || data.featureEnabled('feature.user_photo_uploads');
      const photo = p.image
        ? `<img class="pen-thumb" src="${escapeHtml(p.image)}" alt="" loading="lazy" />`
        : canSuggestPhotos
          ? `<button type="button" class="pen-thumb-placeholder" data-action="pen-suggest-photo" data-pen-id="${p.id}" data-pen-name="${escapeHtml(p.name)}" title="Suggest a photo of this pen">🤍</button>`
          : `<span class="pen-thumb-placeholder" aria-hidden="true">🖤</span>`;
      return `
        <div class="pen-row ${count > 0 ? 'owned' : ''}">
          ${photo}
          <span class="pen-name">${escapeHtml(p.name)}</span>
          <div class="pen-qty">
            <button class="pen-btn" data-pen-id="${p.id}" data-pen-delta="-1" aria-label="Decrease">−</button>
            <span class="pen-count">${count}</span>
            <button class="pen-btn" data-pen-id="${p.id}" data-pen-delta="1" aria-label="Increase">+</button>
          </div>
        </div>
      `;
    }).join('');
    return `
      <section class="pens-group">
        <h2 class="pens-group-title">
          <span>${escapeHtml(line)}</span>
          <span class="pens-group-count">${ownedUnique} / ${items.length} · ${ownedTotal} total</span>
        </h2>
        <div class="pen-rows">${rows}</div>
      </section>
    `;
  }).join('');
}

// iOS hybrid devices fire both touchend → click in rapid succession; without
// a guard a single tap registers as 2-3 increments. 150ms is short enough
// that intentional rapid tapping still works (you can tap 6 times a second).
let _lastPenTap = 0;
let _lastQtyTap = 0;
function adjustPen(id, delta) {
  const now = Date.now();
  if (now - _lastPenTap < 150) return;
  _lastPenTap = now;

  const current = state.pensOwned.get(id) || 0;
  const next = Math.max(0, Math.min(99, current + delta));
  if (next === current) return;
  if (next === 0) state.pensOwned.delete(id);
  else state.pensOwned.set(id, next);
  render();   // optimistic — UI updates immediately, sync runs in the background
  data.setPen(id, next).catch((e) => {
    console.error('setPen', e);
    toast('Could not save pen count.');
  });
}

// ─── Edit modal (collection items only — name & photo are catalog-sourced) ──
function openModal(kind, item, { fresh = false } = {}) {
  if (kind !== 'collection' || !item) return; // wishlist has no editable fields
  state.editingId = item.id;

  const wearable = isWearableItem(item);
  document.getElementById('modal-title').textContent = fresh
    ? (wearable ? 'Added! Who’s wearing it?' : 'Added! Make it yours')
    : 'Edit Plushie';
  document.getElementById('modal-name').textContent = stripOutfitWord(item.name || '');

  // Only true plushes & minis carry "lore"-flavoured fields (a personal name
  // and a personal meaning). For everything else — clothing, accessories,
  // other merch — the name field is just an "Alternate name?" and the meaning
  // field is plain "Notes". For wearables we also float the "Worn by" picker
  // to the very top of the form (it's the thing you actually want to set).
  const editCat = itemCategory(item);
  const loreLike = editCat === 'plush' || editCat === 'mini' || editCat === 'bundle';
  const form = document.getElementById('plushie-form');
  const nicknameField = document.getElementById('field-nickname');
  const wornFieldEl = document.getElementById('field-worn-by');
  document.querySelector('#field-nickname > span').textContent =
    loreLike ? 'Your name for it (optional)' : 'Alternate name?';
  document.querySelector('#field-meaning > span').textContent =
    loreLike ? 'Personal meaning' : 'Notes';
  if (!loreLike) {
    // Move "Worn by" above the alternate-name field.
    form.insertBefore(wornFieldEl, nicknameField);
  } else {
    // Restore canonical order: "Worn by" sits just before the action buttons.
    form.insertBefore(wornFieldEl, form.querySelector('.form-actions'));
  }

  document.getElementById('f-nickname').value = item.nickname ?? '';
  document.getElementById('f-meaning').value = item.meaning ?? '';

  // Per-item visibility (item 11). Options broad → narrow, ending in "Only me".
  const visSel = document.getElementById('f-visibility');
  const curVis = item.visibility || 'friends';
  visSel.innerHTML = Object.entries(ITEM_VIS_META).map(([k, m]) =>
    `<option value="${k}" ${k === curVis ? 'selected' : ''}>${m.glyph} ${m.label} — ${m.hint}</option>`).join('');
  document.getElementById('f-date').value = item.dateCollected ?? '';
  document.getElementById('f-acquired').value = item.acquiredHow ?? '';

  // Build the accessories checklist from the catalog item's parsed
  // Set Includes. One checkbox per expected accessory; unchecked
  // means the user is missing it (oddful, lost it, etc.). On items
  // where the catalog hasn't yielded an accessories list — pens,
  // charms, customs without parsed data — fall back to the simple
  // bag toggle for backwards compatibility, but only on full-size
  // Plushies. Other types get no accessory section at all.
  const cat = item.catalogId ? resolveCatalogItem(state.catalog.find((c) => c.id === item.catalogId)) : null;
  const isPlushie = !cat || (cat.type || '').toLowerCase() === 'plush';
  const expected = (cat && Array.isArray(cat.accessories)) ? cat.accessories : [];
  const missing = Array.isArray(item.missingAccessories) ? item.missingAccessories : [];

  const checklist = document.getElementById('accessory-checklist');
  const fieldset = document.getElementById('field-accessories');
  if (expected.length > 0) {
    checklist.innerHTML = expected.map((acc, i) => {
      const name = typeof acc === 'string' ? acc : acc.name;
      const key = typeof acc === 'string' ? acc.toLowerCase() : (acc.key || name.toLowerCase());
      const isMissing = missing.includes(key);
      return `<label class="checkbox accessory-row">
        <input type="checkbox" data-accessory-key="${escapeHtml(key)}" ${isMissing ? '' : 'checked'} />
        <span>${escapeHtml(name)}</span>
      </label>`;
    }).join('');
    fieldset.classList.remove('hidden');
  } else if (isPlushie) {
    // Fallback for plushies with no parsed accessories: a single
    // "Tote bag" checkbox so the existing has_bag behavior survives.
    const hasBag = !missing.some((a) => /\bbag\b/i.test(a));
    checklist.innerHTML = `<label class="checkbox accessory-row">
      <input type="checkbox" data-accessory-key="tote bag" ${hasBag ? 'checked' : ''} />
      <span>Tote bag</span>
    </label>`;
    fieldset.classList.remove('hidden');
  } else {
    fieldset.classList.add('hidden');
    checklist.innerHTML = '';
  }

  // "Worn by" picker — only for plush clothing. Lists the user's full
  // plushes (not other wearables), preselecting the current assignment
  // or auto-suggesting from a possessive name ("Ni'ni's …" → Ni'ni).
  const wornField = document.getElementById('field-worn-by');
  const wornSel = document.getElementById('f-worn-by');
  if (wearable) {
    const candidates = state.collection.filter((c) => c.id !== item.id && !isWearableItem(c) && clothingFitsPlush(item, c));
    let suggestedId = item.wornBy || null;
    if (!suggestedId) {
      const m = (item.nickname || item.name || '').match(/^([\p{L}\p{N}'’.\- ]+?)['’]s\b/u);
      const hint = m ? m[1].trim().toLowerCase() : null;
      if (hint) {
        const match = candidates.find((c) => (c.nickname || c.name || '').toLowerCase().startsWith(hint));
        if (match) suggestedId = match.id;
      }
    }
    wornSel.innerHTML = ['<option value="">— not assigned —</option>']
      .concat(candidates.map((c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === suggestedId ? 'selected' : ''}>${escapeHtml(c.nickname || c.name)}</option>`))
      .join('');
    wornField.classList.remove('hidden');
  } else {
    wornField.classList.add('hidden');
    wornSel.innerHTML = '';
  }

  // Photo upload — only when the per-user uploads flag is on (admins
  // always). Reset the picker each open so a prior selection doesn't
  // leak across items.
  const photoField = document.getElementById('field-photo');
  document.getElementById('f-photo').value = '';
  document.getElementById('f-photo-name').textContent = '';
  photoField.classList.toggle('hidden', !data.featureEnabled('feature.user_photo_uploads'));

  document.getElementById('modal').dataset.kind = 'collection';
  document.getElementById('modal').classList.remove('hidden');
  // Focus the rename field on a fresh add (the discovery moment), else
  // the meaning field as before.
  setTimeout(() => document.getElementById(fresh ? 'f-nickname' : 'f-meaning').focus(), 50);
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('plushie-form').reset();
  state.editingId = null;
}

// ─── Wearer picker (attach a clothing accessory to a plush) ─────────
async function setWearer(accId, plushId) {
  try {
    await data.setWornBy(accId, plushId);
    const it = state.collection.find((i) => i.id === accId);
    if (it) it.wornBy = plushId;
    closeWearerModal();
    render();
    toast(plushId ? 'Attached. 🧥' : 'Hung back up. 🧥');
  } catch (e) {
    console.error('setWornBy', e);
    toast(/column.*worn_by/i.test(e?.message || '')
      ? 'Run the latest migration (db/0023_worn_by.sql) — the worn_by column is missing.'
      : 'Could not update.');
  }
}

function openWearerPicker(accId) {
  const acc = state.collection.find((i) => i.id === accId);
  if (!acc) return;
  // Candidates = your plushes (not other wearables, not this item) that match
  // the garment's scale — mini clothing on minis, full-size on full-size.
  const candidates = state.collection.filter((i) => i.id !== accId && !isWearableItem(i) && clothingFitsPlush(acc, i));
  // Auto-suggest from a possessive name: "Ni'ni's Purple Overalls" → ni'ni.
  const m = (acc.nickname || acc.name || '').match(/^([\p{L}\p{N}'’.\- ]+?)['’]s\b/u);
  const hint = m ? m[1].trim().toLowerCase() : null;
  const nameOf = (i) => (i.nickname || i.name || '').toLowerCase();
  const score = (i) => (hint && nameOf(i).startsWith(hint) ? 1 : 0);
  candidates.sort((a, b) => score(b) - score(a) || nameOf(a).localeCompare(nameOf(b)));

  const rows = candidates.map((p) => {
    const src = photoSrc(p) || catalogImageFor(p.catalogId);
    const photo = src ? `<img src="${escapeHtml(src)}" loading="lazy" alt="" />` : '<span class="no-photo">🖤</span>';
    const suggested = hint && nameOf(p).startsWith(hint);
    return `
      <button class="wearer-row ${suggested ? 'suggested' : ''}" data-action="pick-wearer" data-acc-id="${accId}" data-plush-id="${p.id}">
        <span class="wearer-photo">${photo}</span>
        <span class="wearer-name">${escapeHtml(p.nickname || p.name)}${suggested ? ' <span class="wearer-suggest">suggested</span>' : ''}</span>
      </button>`;
  }).join('');

  const accName = escapeHtml(acc.nickname || stripOutfitWord(acc.name));
  document.getElementById('wearer-modal-card').innerHTML = `
    <button class="modal-close" data-close-wearer aria-label="Close">×</button>
    <h2>Who's wearing this?</h2>
    <p class="modal-name">${accName}</p>
    ${candidates.length
      ? `<div class="wearer-list">${rows}</div>`
      : `<p class="empty-note">No ${clothingIsMini(acc) ? 'mini' : 'full-size'} plushes to dress yet — ${clothingIsMini(acc) ? 'mini' : 'full-size'} clothing only fits ${clothingIsMini(acc) ? 'mini' : 'full-size'} plushes.</p>`}
    <div class="form-actions">
      <button type="button" class="btn-ghost" data-close-wearer>Cancel</button>
    </div>`;
  document.getElementById('wearer-modal').classList.remove('hidden');
}

function closeWearerModal() {
  document.getElementById('wearer-modal').classList.add('hidden');
  document.getElementById('wearer-modal-card').innerHTML = '';
}

async function submitForm(e) {
  e.preventDefault();
  const existing = state.collection.find((x) => x.id === state.editingId);
  if (!existing) { closeModal(); return; }

  // Collect unchecked accessories. Each input's data-accessory-key is
  // the canonical lowercase identifier (matches what catalog parser
  // emits). data._itemToRow syncs has_bag for legacy clients.
  const missingAccessories = [...document.querySelectorAll('#accessory-checklist input[data-accessory-key]')]
    .filter((cb) => !cb.checked)
    .map((cb) => cb.dataset.accessoryKey);

  const record = {
    ...existing,
    nickname: document.getElementById('f-nickname').value.trim() || null,
    meaning: document.getElementById('f-meaning').value.trim() || null,
    visibility: document.getElementById('f-visibility').value || 'friends',
    dateCollected: document.getElementById('f-date').value || null,
    acquiredHow: document.getElementById('f-acquired').value || null,
    missingAccessories,
    hasBag: !missingAccessories.some((a) => /\bbag\b/i.test(a)),
    updatedAt: Date.now(),
  };
  const kind = 'collection';

  // New photo (only when the uploads flag is on). Compress, then hand the
  // Blob to data.put with photoPath cleared so it re-uploads under this
  // item's path instead of keeping the catalog-sourced photo.
  const photoFile = document.getElementById('f-photo').files?.[0];
  if (photoFile && data.featureEnabled('feature.user_photo_uploads')) {
    record.photo = await compressImage(photoFile).catch(() => photoFile);
    record.photoPath = null;
  }

  await data.put(kind, record);

  // Persist per-item visibility separately (item 11) — best-effort so a
  // pre-migration client still saves everything else cleanly.
  if (record.visibility && record.visibility !== existing.visibility) {
    try { await data.setItemVisibility(record.id, record.visibility); }
    catch (err) { console.warn('setItemVisibility', err); }
  }

  // Persist the "worn by" assignment when the field is shown (clothing
  // accessories). Dedicated update so it never rides through _itemToRow.
  const wornField = document.getElementById('field-worn-by');
  if (wornField && !wornField.classList.contains('hidden')) {
    const wornVal = document.getElementById('f-worn-by').value || null;
    if ((existing.wornBy || null) !== wornVal) {
      try { await data.setWornBy(existing.id, wornVal); }
      catch (err) { console.warn('setWornBy', err); }
    }
  }

  await loadAll();
  closeModal();
  render();
  toast('Updated.');
  scheduleReminderCheck();
}

// ─── Card actions ────────────────────────────────────────────────────
async function onCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  // Capture scroll up front so any re-render triggered by the action
  // doesn't snap the user to the top. Actions that intentionally change
  // tabs (currently none — we removed the auto-jumps) would override
  // this by scrolling explicitly.
  try {
    await keepScroll(() => onCardClickInner(btn));
  } catch (err) {
    console.error('card action failed', err);
    const msg = err?.message || '';
    if (/column.*quantity/i.test(msg)) {
      toast('Run the latest SQL migration (db/0003_quantity.sql) — the quantity column is missing.');
    } else if (msg) {
      toast('Error: ' + msg);
    } else {
      toast('Something went wrong. See console.');
    }
  }
}

async function onCardClickInner(btn) {
  const { action, id, cid } = btn.dataset;

  if (action === 'edit' || action === 'open-detail') {
    const item = state.collection.find((x) => x.id === id);
    if (item) openModal('collection', item);
  } else if (action === 'zoom-photo') {
    const item = state.collection.find((x) => x.id === id) || state.wishlist.find((x) => x.id === id);
    const src = item && (photoSrc(item) || catalogImageFor(item.catalogId));
    if (src) openLightbox(src, stripOutfitWord(item.nickname || item.name || ''));
  } else if (action === 'move-up') {
    await moveCollectionItem(id, 'up');
  } else if (action === 'move-down') {
    await moveCollectionItem(id, 'down');
  } else if (action === 'delete') {
    if (!confirm('Remove this plushie?')) return;
    const col = state.collection.find((x) => x.id === id);
    const inCol = !!col;
    // Collection deletes must also clean up any active offering for the same
    // catalog id, unless reservations would be orphaned.
    if (inCol && col.catalogId) {
      const ok = await syncOfferingToOwned(col.catalogId, 0);
      if (!ok) return;
    }
    await data.delete(inCol ? 'collection' : 'wishlist', id);
    await loadAll();
    render();
    toast('Removed.');
  } else if (action === 'got') {
    const item = state.wishlist.find((x) => x.id === id);
    if (!item) return;
    const collected = {
      id: crypto.randomUUID(),
      name: item.name,
      photo: item.photo || null,
      catalogId: item.catalogId || null,
      meaning: null,
      dateCollected: new Date().toISOString().slice(0, 10),
      acquiredHow: null,
      hasBag: true,
      missingAccessories: [],
      retired: !!item.retired,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      // Reuse the wishlist photo path so we don't re-upload — it's already in storage.
      // Pass keepPhoto:true so delete() doesn't sweep the file (collection still references it).
      collected.photoPath = item.photoPath || null;
      await data.put('collection', collected);
      await data.delete('wishlist', id, { keepPhoto: true });
      await loadAll();
      // Stay on Wish List — the user is probably marking multiple items
      // as 'got it' in a row. They can switch to Collection themselves
      // when they're done. Preserves their scroll position too.
      render();
      toast(`Moved “${item.name}” to collection. 🖤`);
    } catch (err) {
      console.error('Got It! failed', err);
      toast('Could not move to collection.');
    }
  } else if (action === 'cat-have') {
    // Bundles open a 'which of these do you own?' picker instead of
    // dropping a single bundle row into the collection.
    const raw = state.catalog.find((c) => c.id === cid);
    const it = raw ? resolveCatalogItem(raw) : null;
    if (it && it.isBundle) openBundlePickerModal(cid);
    else await addFromCatalog(cid, 'collection', { customize: true });
  } else if (action === 'cat-want') {
    await addFromCatalog(cid, 'wishlist');
  } else if (action === 'cat-detail') {
    openCatalogDetailModal(cid);
  } else if (action === 'cat-suggest-photo') {
    const targetKind = btn.dataset.targetKind || 'shopify';
    const target = state.catalog.find((c) => c.id === cid);
    openSuggestPhotoModal(cid, targetKind, target ? cleanCatalogName(target.name) : '');
  } else if (action === 'cat-edit') {
    const owned = state.collection.find((x) => x.catalogId === cid);
    if (owned) openModal('collection', owned);
  } else if (action === 'cat-admin-edit') {
    if (window.currentUser?.isAdmin) openCatalogItemModal('edit', cid);
  } else if (action === 'offer-trade') {
    const item = state.collection.find((x) => x.id === id);
    if (item) await markForTrade(item, 'offering');
  } else if (action === 'seek-trade') {
    const item = state.wishlist.find((x) => x.id === id);
    if (item) await markForTrade(item, 'seeking');
  } else if (action === 'assign-wearer') {
    openWearerPicker(id);
  } else if (action === 'detach-acc') {
    await setWearer(id, null);
  } else if (action === 'col-inc') {
    if (Date.now() - _lastQtyTap < 150) return;
    _lastQtyTap = Date.now();
    const item = state.collection.find((x) => x.id === id);
    if (!item) return;
    const next = (item.quantity || 1) + 1;
    item.quantity = next;
    render();   // optimistic
    await data.put('collection', { ...item, updatedAt: Date.now() });
    await loadAll();
    render();
  } else if (action === 'col-dec') {
    if (Date.now() - _lastQtyTap < 150) return;
    _lastQtyTap = Date.now();
    const item = state.collection.find((x) => x.id === id);
    if (!item) return;
    const next = (item.quantity || 1) - 1;
    if (next <= 0) {
      if (!confirm(`Remove “${item.name}” from your collection?`)) return;
      if (item.catalogId) {
        const ok = await syncOfferingToOwned(item.catalogId, 0);
        if (!ok) return;
      }
      await data.delete('collection', id);
    } else {
      // Trim a matching offering down to match (and bail if that would
      // orphan a reservation).
      if (item.catalogId) {
        const ok = await syncOfferingToOwned(item.catalogId, next);
        if (!ok) return;
      }
      item.quantity = next;
      render();   // optimistic
      await data.put('collection', { ...item, updatedAt: Date.now() });
    }
    await loadAll();
    render();
  }
}

// One-tap add from a catalog card. No modal; commits a record with
// catalog-sourced fields and sensible defaults. If the user already owns
// this catalog id (collection only), bumps quantity on the existing row
// instead of creating a duplicate — duplicates are how trades happen.
async function addFromCatalog(catalogId, kind, { customize = false } = {}) {
  const cat = state.catalog.find((c) => c.id === catalogId);
  if (!cat) return;

  if (kind === 'collection') {
    const existing = state.collection.find((x) => x.catalogId === cat.id);
    if (existing) {
      const next = (existing.quantity || 1) + 1;
      await data.put('collection', { ...existing, quantity: next, updatedAt: Date.now() });
      await loadAll();
      // Stay on whatever tab the user is on — don't jump to Collection.
      render();
      toast(`Now you have ${next} of “${cleanCatalogName(cat.name)}”. 🖤`);
      return;
    }
  } else {
    // Same idea on wishlist — don't duplicate, and don't jump tabs.
    const existing = state.wishlist.find((x) => x.catalogId === cat.id);
    if (existing) {
      render();
      toast(`Already on your wish list.`);
      return;
    }
  }

  // Snapshot the product photo so the card stays good even if upstream
  // rotates the URL (the Overthinking Bunny problem — same SKU, new
  // image). Routes through the img-proxy Worker for CORS + Shopify
  // ?width= resizing; on any failure, falls back to direct fetch, then
  // to storing the URL as a hot link.
  // Don't run the Shopify _NNNx URL mangler on non-Shopify images;
  // signed Supabase Storage URLs end with .jpg?token=… and the regex
  // would corrupt the token. Custom catalog items just use the URL
  // we already have.
  const isShopify = !!(cat.image && /^https:\/\/cdn\.shopify\.com\//.test(cat.image));
  const originalUrl = cat.image ? (isShopify ? shopifyImageVariant(cat.image, 800) : cat.image) : null;
  let photo = originalUrl;
  if (originalUrl) {
    const sources = [
      proxyImageUrl(originalUrl, 800),     // CORS-friendly via Worker
      originalUrl,                         // last-ditch direct (legacy)
    ].filter((u, i, a) => u && a.indexOf(u) === i); // dedupe if proxy not configured
    for (const src of sources) {
      try {
        const resp = await fetch(src, { mode: 'cors' });
        if (resp.ok) {
          const blob = await resp.blob();
          // Client-side downscale + JPEG re-encode; caps at ~800px /
          // ~80% quality so a 2 MB upstream becomes ~60-200 KB before
          // it ever touches Supabase Storage.
          photo = await compressImage(blob).catch(() => blob);
          break;
        }
      } catch { /* try next source */ }
    }
  }

  const base = {
    id: crypto.randomUUID(),
    name: cleanCatalogName(cat.name),
    photo,
    catalogId: cat.id,
    catalogHandle: cat.handle,
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };

  let record;
  if (kind === 'collection') {
    record = {
      ...base,
      meaning: null,
      dateCollected: new Date().toISOString().slice(0, 10),
      acquiredHow: null,
      hasBag: true,
      missingAccessories: [],
      retired: !!cat.retired,
      quantity: 1,
    };
  } else {
    record = {
      ...base,
      url: PRODUCT_URL_BASE + cat.handle,
      outOfStock: !cat.available,
      retired: !!cat.retired,
    };
  }

  await data.put(kind, record);
  await loadAll();
  // Stay on Catalog when adding from there — keeps the user's place in
  // the grid so they can keep marking items. Just confirm with a toast.
  render();
  if (kind === 'collection') {
    toast(`Added “${cleanCatalogName(cat.name)}” to your collection. 🖤`);
    // Pop the customize modal so people discover they can rename it, add
    // meaning/date, mark missing accessories — and, for plush clothing,
    // say which plush is wearing it. Only on the single Have add, not
    // bulk/bundle/quantity paths.
    if (customize) {
      // If the Have came from the catalog detail modal, close it so the
      // customize modal isn't stacked on top.
      document.getElementById('catalog-detail-modal')?.classList.add('hidden');
      const justAdded = state.collection.find((x) => x.id === record.id);
      if (justAdded) openModal('collection', justAdded, { fresh: true });
    }
  } else {
    toast('Added to wish list. 🕯');
  }
}

// ─── Restocks ────────────────────────────────────────────────────────
function checkAllRestocks() {
  const urls = state.wishlist.map((w) => w.url).filter(Boolean);
  if (urls.length === 0) {
    toast('No saved URLs to check.');
    return;
  }
  if (urls.length > 6 && !confirm(`Open ${urls.length} tabs?`)) return;
  for (const url of urls) {
    window.open(url, '_blank', 'noopener');
  }
}

// ─── Notifications ───────────────────────────────────────────────────
async function toggleNotifications() {
  if (!('Notification' in window)) {
    toast('Notifications not supported on this device.');
    return;
  }
  if (Notification.permission === 'granted') {
    const wasOn = await idb.getMeta('notify_enabled');
    await idb.setMeta('notify_enabled', !wasOn);
    updateNotifyButton();
    toast(wasOn ? 'Reminders off.' : 'Reminders on.');
    if (!wasOn) scheduleReminderCheck();
  } else if (Notification.permission === 'denied') {
    toast('Notifications blocked in browser settings.');
  } else {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      await idb.setMeta('notify_enabled', true);
      updateNotifyButton();
      toast('Reminders on.');
      scheduleReminderCheck();
    }
  }
}

async function updateNotifyButton() {
  const btn = document.getElementById('notify-btn');
  const enabled = await idb.getMeta('notify_enabled');
  const granted = 'Notification' in window && Notification.permission === 'granted';
  btn.classList.toggle('active', !!(enabled && granted));
  btn.title = (enabled && granted) ? 'Reminders on — click to turn off' : 'Enable reminders';
}

async function scheduleReminderCheck() {
  // Check now and every hour while page is open
  await maybeFireReminder();
  if (window._reminderTimer) clearInterval(window._reminderTimer);
  window._reminderTimer = setInterval(maybeFireReminder, 60 * 60 * 1000);
}

// Compares each open trade's "needs my action" signature against what we
// fired notifications for last time. Whenever something fresh appears
// (their accept arrived, they shipped, they confirmed receipt), drop a
// local notification. No backend push — this only runs while the app
// is open or being loaded, which is fine for a hobby tracker.
async function maybeFireTradeNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;
  if (!Array.isArray(state.trades) || state.trades.length === 0) return;

  const seen = (await idb.getMeta('notified_trade_events')) || {};
  const uid = window.currentUser?.id;
  const fresh = [];

  for (const t of state.trades) {
    const isMine = t.proposer_id === uid;
    const status = tradeStatusLabel(t, uid, isMine);
    if (status.kind !== 'your') continue;
    // Stable signature per trade × action. If the partner advances the
    // trade so the action required of me changes, the signature changes
    // and we notify again.
    const sig = `${t.status}|${t.proposer_shipped_at ? '1' : '0'}|${t.recipient_shipped_at ? '1' : '0'}|${t.proposer_received_at ? '1' : '0'}|${t.recipient_received_at ? '1' : '0'}`;
    if (seen[t.id] === sig) continue;
    seen[t.id] = sig;
    const other = isMine ? t.recipient?.username : t.proposer?.username;
    fresh.push({ other: other || 'a collector', text: status.text, tradeId: t.id });
  }

  // Prune entries for trades that no longer require action so the meta
  // doesn't grow forever.
  const liveIds = new Set(state.trades.map((t) => t.id));
  for (const id of Object.keys(seen)) {
    if (!liveIds.has(id)) delete seen[id];
  }
  await idb.setMeta('notified_trade_events', seen);

  if (fresh.length === 0) return;
  const title = '🦇 The Plush Crypt';
  const body = fresh.length === 1
    ? `@${fresh[0].other}: ${fresh[0].text.replace(/^Your turn · /, '')}`
    : `${fresh.length} trades need your attention.`;
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, {
        body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'trade-action',
      });
    } else {
      new Notification(title, { body, icon: 'icon-192.png' });
    }
  } catch (e) {
    console.warn('Trade notification failed', e);
  }
}

async function fireLocalNotification(title, body, tag) {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag });
    } else {
      new Notification(title, { body, icon: 'icon-192.png' });
    }
  } catch (e) {
    console.warn('notification failed', e);
  }
}

// Local notification when a new incoming friend request appears. Same
// model as trades/reminders: fires while the app is open or loading (no
// backend push). Tracks the set of request user-ids we've already
// notified for in IDB; the first run after enabling seeds silently so a
// backlog of pending requests doesn't dump all at once.
async function maybeFireFriendNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;

  const reqs = state.socRequests || [];
  const prev = await idb.getMeta('notified_friend_reqs');   // null on first run
  const seen = new Set(prev || []);
  await idb.setMeta('notified_friend_reqs', reqs.map((r) => r.userId));
  if (prev === null) return;                                 // seed silently

  const fresh = reqs.filter((r) => !seen.has(r.userId));
  if (fresh.length === 0) return;
  const body = fresh.length === 1
    ? `@${fresh[0].username} sent you a friend request 🦇`
    : `${fresh.length} new friend requests in the crypt`;
  await fireLocalNotification('🦇 The Plush Crypt', body, 'friend-request');
}

async function maybeFireReminder() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;

  const oos = state.wishlist.filter((w) => w.outOfStock);
  if (oos.length === 0) return;

  const last = (await idb.getMeta('last_reminder')) || 0;
  const dayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - last < dayMs) return;

  const title = '🦇 The Plush Crypt';
  const body = oos.length === 1
    ? `Check on restock: ${oos[0].name}`
    : `${oos.length} out-of-stock wishlist items waiting…`;

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, {
        body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: 'restock-reminder',
      });
    } else {
      new Notification(title, { body, icon: 'icon-192.png' });
    }
    await idb.setMeta('last_reminder', Date.now());
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

// Backup/restore removed — Supabase syncs your account across devices.

// ─── Toast ───────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}

// ─── Filter + scroll persistence ─────────────────────────────────────
// Filters survive page reload via localStorage; scroll position per tab is
// kept in memory for the lifetime of the page so flipping between tabs
// always lands where you left off.
const FILTERS_KEY = 'filters';
const tabScroll = new Map();

// Capture window.scrollY before an action that triggers render() and put
// it back after the next paint, so list re-renders don't snap the user
// to the top. Use for actions that should leave the user where they
// were on the same tab (catalog Own/Want, wishlist Got It, etc.).
async function keepScroll(fn) {
  const y = window.scrollY;
  try {
    await fn();
  } finally {
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
  }
}

function saveFilters() {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      tab: state.tab,
      colSubTab: state.colSubTab,
      filter: state.filter,
      colCategory: state.colCategory,
      colDupes: state.colDupes,
      colNoBag: state.colNoBag,
      colSort: state.colSort,
      colView: state.colView,
      wishCategory: state.wishCategory,
      wishInStock: state.wishInStock,
      wishSort: state.wishSort,
      catalogFilter: state.catalogFilter,
      catalogStatuses: [...state.catalogStatuses],
      catalogUnowned: state.catalogUnowned,
      catalogOriginal: state.catalogOriginal,
      catalogTheme: state.catalogTheme,
      catalogColor: state.catalogColor,
      catalogSort: state.catalogSort,
      query: state.query,
      tradeFilter: state.tradeFilter,
      tradeSubTab: state.tradeSubTab,
    }));
  } catch { /* localStorage blocked or full — non-fatal */ }
}

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || !s) return;
    // Copy known scalar keys, fall back to current default if missing.
    // Note: 'tab' is intentionally NOT restored — the app always lands on
    // the Social tab (the default) when reopened. Filters/sub-tabs still
    // persist so each tab keeps its settings once you switch to it.
    const scalars = [
      'colSubTab', 'filter', 'colCategory', 'colSort', 'colView', 'wishCategory', 'wishSort',
      'catalogFilter', 'catalogTheme', 'catalogColor', 'catalogSort', 'query', 'tradeSubTab', 'tradeFilter',
    ];
    for (const k of scalars) if (k in s) state[k] = s[k];
    const bools = ['colDupes', 'colNoBag', 'wishInStock', 'catalogUnowned', 'catalogOriginal'];
    for (const k of bools) if (k in s) state[k] = !!s[k];
    if (Array.isArray(s.catalogStatuses)) state.catalogStatuses = new Set(s.catalogStatuses);
    // Legacy migration: 'pens' was a top-level tab pre-v52; users who had
    // it saved should land on Collection → Pens sub-tab instead so they
    // don't see an empty / non-existent tab.
    if (state.tab === 'pens') { state.tab = 'collection'; state.colSubTab = 'pens'; }
    // The collection sub-tabs were split from 'plushies'/'pens' into
    // plushes/minis/accessories/other/pens. Map the old plushies value and
    // guard against any unknown stored value.
    if (state.colSubTab === 'plushies') state.colSubTab = 'plushes';
    if (!['plushes', 'minis', 'accessories', 'other', 'pens'].includes(state.colSubTab)) {
      state.colSubTab = 'plushes';
    }
    // Sync the search input value so the visible UI matches the restored state.
    const searchEl = document.getElementById('search');
    if (searchEl && state.query) searchEl.value = state.query;
  } catch { /* corrupt JSON — ignore */ }
}

// ─── Event wiring ────────────────────────────────────────────────────
function wireEvents() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', async () => {
      // Remember the scroll position of the tab we're leaving so we can
      // restore it when the user comes back.
      tabScroll.set(state.tab, window.scrollY);
      state.tab = t.dataset.tab;
      if (state.tab === 'trade') await loadTradeData();  // refresh from server on enter
      if (state.tab === 'social') {
        state.socProfile = null;       // always land on the feed, not a stale profile
        await loadSocialData();
      }
      if (state.tab === 'admin') {
        state.adminUserView = null;
        await loadAdminUsers();
      }
      render();
      // Defer to next frame so the new tab's grid has laid out.
      requestAnimationFrame(() => {
        window.scrollTo({ top: tabScroll.get(state.tab) || 0, behavior: 'instant' });
      });
      saveFilters();
    });
  });

  // Collection sub-tabs (Plushies / Pens). Scroll is tracked per
  // sub-tab using a composite key so the lists keep their places.
  document.querySelectorAll('#collection-subtabs .subtab').forEach((s) => {
    s.addEventListener('click', () => {
      const key = `collection:${state.colSubTab}`;
      tabScroll.set(key, window.scrollY);
      state.colSubTab = s.dataset.colSubtab;
      render();
      requestAnimationFrame(() => {
        const nextKey = `collection:${state.colSubTab}`;
        window.scrollTo({ top: tabScroll.get(nextKey) || 0, behavior: 'instant' });
      });
      saveFilters();
    });
  });

  // Collection filters: native selects + a details/checkbox group for the
  // multi-select toggles. Each select fires 'change'; each checkbox fires
  // 'change' too.
  const wireSelect = (id, target) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { state[target] = el.value; render(); });
  };
  wireSelect('col-state', 'filter');
  wireSelect('col-sort', 'colSort');
  wireSelect('col-view', 'colView');
  document.querySelectorAll('#col-extras input[data-col-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.dataset.colToggle === 'dupes') state.colDupes = cb.checked;
      else if (cb.dataset.colToggle === 'nobag') state.colNoBag = cb.checked;
      syncCollectionChips();
      render();
    });
  });

  // Wishlist filters
  wireSelect('wish-cat', 'wishCategory');
  wireSelect('wish-sort', 'wishSort');
  document.querySelectorAll('#wish-extras input[data-wish-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.dataset.wishToggle === 'instock') state.wishInStock = cb.checked;
      syncWishlistChips();
      render();
    });
  });

  // Catalog filters
  wireSelect('cat-category-sel', 'catalogFilter');
  wireSelect('cat-sort', 'catalogSort');
  document.querySelectorAll('#cat-status-multi input[data-cat-status]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const s = cb.dataset.catStatus;
      if (cb.checked) state.catalogStatuses.add(s);
      else state.catalogStatuses.delete(s);
      syncCatalogChips();
      render();
    });
  });
  document.querySelectorAll('#cat-extras input[data-cat-toggle]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.dataset.catToggle === 'unowned') state.catalogUnowned = cb.checked;
      else if (cb.dataset.catToggle === 'original') state.catalogOriginal = cb.checked;
      syncCatalogChips();
      render();
    });
  });

  // Clear filters buttons (per tab)
  document.querySelectorAll('[data-clear-tab]').forEach((btn) => {
    btn.addEventListener('click', () => clearTabFilters(btn.dataset.clearTab));
  });

  // Active-filters bar: keep the per-pill click-to-drop affordance.
  document.getElementById('active-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if (btn) clearFilter(btn.dataset.clear);
  });

  const themeEl = document.getElementById('cat-theme');
  if (themeEl) {
    themeEl.addEventListener('change', () => {
      state.catalogTheme = themeEl.value;
      render();
    });
  }
  const colorEl = document.getElementById('cat-color');
  if (colorEl) {
    colorEl.addEventListener('change', () => {
      state.catalogColor = colorEl.value;
      render();
    });
  }

  document.getElementById('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });

  document.getElementById('check-restocks').addEventListener('click', checkAllRestocks);
  document.getElementById('notify-btn').addEventListener('click', toggleNotifications);

  document.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeModal)
  );

  document.getElementById('plushie-form').addEventListener('submit', submitForm);

  // Reflect the chosen photo filename next to the picker.
  document.getElementById('f-photo').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    document.getElementById('f-photo-name').textContent = file ? '✓ ' + file.name : '';
  });

  document.getElementById('collection-grid').addEventListener('click', onCardClick);
  // Drag-and-drop manual reordering (item 20) — active only in 'My order' mode
  // where cards carry data-reorder-id. Touch users use the ▲▼ arrows instead.
  const colGrid = document.getElementById('collection-grid');
  colGrid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-reorder-id]');
    if (!card) return;
    state._dragId = card.dataset.reorderId;
    card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  colGrid.addEventListener('dragover', (e) => {
    if (state._dragId) e.preventDefault();
  });
  colGrid.addEventListener('dragend', () => {
    colGrid.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    state._dragId = null;
  });
  colGrid.addEventListener('drop', async (e) => {
    if (!state._dragId) return;
    e.preventDefault();
    const target = e.target.closest('[data-reorder-id]');
    const dragId = state._dragId;
    state._dragId = null;
    colGrid.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    if (target && target.dataset.reorderId !== dragId) {
      await dropReorder(dragId, target.dataset.reorderId);
    }
  });
  document.getElementById('unworn-clothing-grid').addEventListener('click', onCardClick);
  document.getElementById('wishlist-grid').addEventListener('click', onCardClick);
  document.getElementById('catalog-grid').addEventListener('click', onCardClick);
  // Wearer picker modal — pick a plush to attach an accessory to.
  document.getElementById('wearer-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close-wearer]')) { closeWearerModal(); return; }
    const pick = e.target.closest('[data-action="pick-wearer"]');
    if (pick) setWearer(pick.dataset.accId, pick.dataset.plushId);
  });
  // The detail modal also renders data-action buttons (Have, Want, Buy,
  // admin Edit). Wire them through the same dispatcher.
  document.getElementById('catalog-detail-modal').addEventListener('click', onCardClick);

  // Trade tab wiring
  document.querySelectorAll('.subtab').forEach((s) => {
    s.addEventListener('click', () => setTradeSubTab(s.dataset.subtab));
  });
  document.getElementById('trade-view').addEventListener('click', onTradeClick);
  document.getElementById('trade-view').addEventListener('click', onTradeFilterClick);
  document.getElementById('admin-view').addEventListener('click', onAdminClick);
  // The admin queue + dispute review modals live OUTSIDE #admin-view
  // (top-level siblings) so their clicks don't bubble to the handler
  // above. Bind those modals to the same dispatcher so Approve /
  // Reject / Merge / Resolve buttons fire.
  document.getElementById('admin-queue-modal').addEventListener('click', onAdminClick);
  document.getElementById('dispute-review-modal')?.addEventListener('click', onAdminClick);

  // Offer modal
  document.querySelectorAll('[data-close-offer]').forEach((el) =>
    el.addEventListener('click', closeOfferModal)
  );
  document.getElementById('offer-send').addEventListener('click', sendOffer);
  document.getElementById('offer-builder').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-picker]');
    if (!btn) return;
    pickerAdjust(btn.dataset.picker, btn.dataset.id, parseInt(btn.dataset.delta, 10));
  });

  // Feedback modal — three structured thumbs.
  document.querySelectorAll('[data-close-feedback]').forEach((el) =>
    el.addEventListener('click', closeFeedbackModal)
  );
  document.querySelectorAll('#feedback-modal .thumb-row').forEach((row) => {
    const cat = row.dataset.category;
    row.querySelectorAll('.thumb-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setFeedbackRating(cat, btn.dataset.value === 'up');
      });
    });
  });
  document.getElementById('feedback-submit').addEventListener('click', submitFeedback);

  // Mini-profile popover — opens whenever a [data-mini-uid] element is
  // clicked anywhere in the app. Single delegated listener avoids
  // re-wiring after every render.
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mini-uid]');
    if (t) { e.preventDefault(); openMiniProfile(t.dataset.miniUid); }
  });
  document.querySelectorAll('[data-close-mini]').forEach((el) =>
    el.addEventListener('click', closeMiniProfile)
  );

  document.getElementById('user-badge').addEventListener('click', openAccountModal);

  // Catalog item create + suggest photo + admin queue modals.
  document.querySelectorAll('[data-close-catalog-item]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('catalog-item-modal').classList.add('hidden'))
  );
  document.querySelectorAll('[data-close-catalog-detail]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('catalog-detail-modal').classList.add('hidden'))
  );
  document.querySelectorAll('[data-close-bundle-picker]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('bundle-picker-modal').classList.add('hidden'))
  );
  document.getElementById('bundle-picker-form').addEventListener('submit', submitBundlePickerForm);
  // Merge tool wiring.
  document.querySelectorAll('[data-close-catalog-merge]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('catalog-merge-modal').classList.add('hidden'))
  );
  document.getElementById('cm-search').addEventListener('input', onMergeSearchInput);
  document.getElementById('cm-results').addEventListener('click', (e) => {
    const t = e.target.closest('[data-merge-id]');
    if (t) onMergeSelectWinner(t.dataset.mergeId, t.dataset.mergeName, t.dataset.mergeHandle);
  });
  document.getElementById('cm-submit').addEventListener('click', submitCatalogMerge);
  document.getElementById('catalog-item-form').addEventListener('submit', submitCatalogItemForm);
  // Public 'Suggest a plushie' button on the catalog toolbar.
  document.getElementById('suggest-plushie-btn')?.addEventListener('click', () => openCatalogItemModal('user'));
  // Photo source tabs (admin-only) + user picker autocomplete + plushie thumb click.
  document.querySelectorAll('.ci-source-tab').forEach((b) =>
    b.addEventListener('click', () => setSourceTab(b.dataset.ciSource))
  );
  document.getElementById('ci-pick-user').addEventListener('input', onPickUserInput);
  document.getElementById('ci-pick-user-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick-uid]');
    if (t) onPickUserSelect(t.dataset.pickUid, t.dataset.pickUsername);
  });
  document.getElementById('ci-pick-plushie-list').addEventListener('click', (e) => {
    const t = e.target.closest('[data-pick-photo-path]');
    if (t) onPickPlushieSelect(t.dataset.pickPhotoPath, t.dataset.pickName);
  });
  document.querySelectorAll('[data-close-suggest-photo]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('suggest-photo-modal').classList.add('hidden'))
  );
  document.getElementById('suggest-photo-form').addEventListener('submit', submitSuggestPhotoForm);
  document.querySelectorAll('[data-close-admin-queue]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('admin-queue-modal').classList.add('hidden'))
  );
  document.querySelectorAll('[data-close-dispute-stmt]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('dispute-statement-modal').classList.add('hidden'))
  );
  document.getElementById('dispute-statement-form').addEventListener('submit', submitDisputeStatementForm);
  document.querySelectorAll('[data-close-dispute-review]').forEach((el) =>
    el.addEventListener('click', () => document.getElementById('dispute-review-modal').classList.add('hidden'))
  );

  // Account modal
  document.querySelectorAll('[data-close-account]').forEach((el) =>
    el.addEventListener('click', closeAccountModal)
  );
  document.getElementById('acct-save-username').addEventListener('click', saveUsername);
  document.getElementById('acct-save-email').addEventListener('click', saveEmail);
  document.getElementById('acct-save-address').addEventListener('click', saveDefaultAddress);
  document.getElementById('acct-save-profile').addEventListener('click', saveAccountProfile);
  document.getElementById('acct-avatar').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) { state._acctAvatarBlob = null; syncAcctAvatarPreview(); return; }
    try {
      state._acctAvatarBlob = await compressImage(file);
      document.getElementById('acct-avatar-name').textContent = '✓ ' + file.name;
      syncAcctAvatarPreview();
    } catch (err) { console.warn('compress', err); toast('Could not read that image.'); }
  });

  document.getElementById('acct-theme').addEventListener('change', (e) => setTheme(e.target.value));
  document.getElementById('theme-btn').addEventListener('click', () => {
    // Debounce: this is a *relative* toggle, so if the handler ever fires
    // twice for one tap (stacked listeners from a re-run, a synthesized
    // click on touch, etc.) the two flips cancel out and the theme
    // appears not to change. Swallow a second invocation within 300ms.
    const now = Date.now();
    if (now - (window._lastThemeToggle || 0) < 300) return;
    window._lastThemeToggle = now;
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
  syncThemeButton();
  document.getElementById('acct-share').addEventListener('click', () => {
    closeAccountModal();
    openShareModal();
  });
  document.getElementById('acct-signout').addEventListener('click', () => {
    closeAccountModal();
    handleSignOut();
  });
  document.getElementById('acct-collections').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-switch-cid]');
    if (btn) {
      closeAccountModal();
      switchCollection(btn.dataset.switchCid);
    }
  });

  // Share modal
  document.querySelectorAll('[data-close-share]').forEach((el) =>
    el.addEventListener('click', closeShareModal)
  );
  document.getElementById('generate-invite').addEventListener('click', generateInvite);
  document.getElementById('copy-invite').addEventListener('click', copyInviteLink);
  document.getElementById('share-members').addEventListener('click', onShareClick);

  // Address modal
  document.querySelectorAll('[data-close-address]').forEach((el) =>
    el.addEventListener('click', closeAddressModal)
  );
  document.getElementById('address-save').addEventListener('click', saveAddress);

  document.getElementById('pens-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.pen-btn');
    if (btn) {
      const id = btn.dataset.penId;
      const delta = parseInt(btn.dataset.penDelta, 10);
      if (id && delta) adjustPen(id, delta);
      return;
    }
    // Suggest-a-photo on a pen with no image yet.
    const suggest = e.target.closest('[data-action="pen-suggest-photo"]');
    if (suggest) {
      openSuggestPhotoModal(suggest.dataset.penId, 'pen', suggest.dataset.penName);
      return;
    }
    // Click the pen thumbnail to open it full-size.
    const thumb = e.target.closest('img.pen-thumb');
    if (thumb) {
      const row = thumb.closest('.pen-row');
      const name = row?.querySelector('.pen-name')?.textContent || '';
      openLightbox(thumb.src, name);
    }
  });

  // Lightbox close — backdrop, card, and × button all carry the
  // data-close-lightbox attribute.
  document.querySelectorAll('[data-close-lightbox]').forEach((el) =>
    el.addEventListener('click', (e) => {
      // Don't close when the user clicks the image itself.
      if (e.target.id === 'lightbox-img') return;
      document.getElementById('lightbox-modal').classList.add('hidden');
    })
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal').classList.contains('hidden')) {
      closeModal();
    }
  });
}

// ─── Trade: data load + sub-tab switching ────────────────────────────
async function loadTradeData() {
  try {
    state.myTradeItems = await data.listMyTradeItems();
    // Live-link enforcement: clamp every offering to what the user
    // currently owns before anything renders or browse is computed.
    // This is the load-time backstop for "you can never offer more than
    // you own" — it self-heals drift from completed trades, removed
    // collection items, or older data, regardless of cause. If it
    // changed anything it re-fetches myTradeItems internally.
    await reconcileAllOfferings({ announce: true });
    state.tradeBrowse  = await data.browseOfferings();
    state.trades       = await data.listTrades();
    state.myFeedback   = await data.getFeedbackSummary(window.currentUser.id);
    state.partnerFeedback.set(window.currentUser.id, state.myFeedback);
    state.myFeedbackByTrade = await data.listMyFeedback();

    // Collect every user we'll show a badge for and pull their summaries
    // in one batch — browse list owners + trade partners.
    const uids = new Set();
    for (const it of state.tradeBrowse) uids.add(it.ownerId);
    for (const t of state.trades) {
      const other = t.proposer_id === window.currentUser.id ? t.recipient_id : t.proposer_id;
      uids.add(other);
    }
    await ensureReputationFor([...uids]);
    // Fire local notifications for any partner action that just appeared
    // (their shipment, their receipt confirmation, etc.).
    maybeFireTradeNotifications().catch((e) => console.warn(e));
  } catch (err) {
    console.error('loadTradeData', err);
    toast('Could not load trade data.');
  }
}

function setTradeSubTab(name) {
  state.tradeSubTab = name;
  document.querySelectorAll('.subtab').forEach((s) =>
    s.classList.toggle('active', s.dataset.subtab === name)
  );
  document.getElementById('subtab-browse').classList.toggle('hidden', name !== 'browse');
  document.getElementById('subtab-trades').classList.toggle('hidden', name !== 'trades');
  document.getElementById('subtab-items').classList.toggle('hidden', name !== 'items');
  renderTrade();
}

// ─── Trade: marker badge & count label ────────────────────────────────
function tradeMarkerFor(item, kind) {
  if (!item.catalogId) return null;
  const wantedKind = kind === 'collection' ? 'offering' : 'seeking';
  const match = state.myTradeItems.find((t) => t.kind === wantedKind && t.catalogId === item.catalogId);
  if (!match) return null;
  if (wantedKind === 'offering') {
    const avail = match.quantity - match.reserved;
    return `<span class="badge badge-trade">Offering ${avail}</span>`;
  }
  return `<span class="badge badge-trade">Seeking</span>`;
}

function pendingForMeCount() {
  const uid = window.currentUser.id;
  return state.trades.filter((t) =>
    t.status === 'pending' && t.recipient_id === uid && !tradeIsExpired(t)
  ).length;
}

function activeTradeCount() {
  const uid = window.currentUser.id;
  return state.trades.filter((t) =>
    t.status === 'accepted' && (t.proposer_id === uid || t.recipient_id === uid) && !tradeIsFinished(t)
  ).length;
}

function updateTradeBadge() {
  const n = pendingForMeCount() + activeTradeCount();
  const b = document.getElementById('trade-badge');
  if (n > 0) { b.textContent = n; b.classList.remove('hidden'); }
  else       { b.classList.add('hidden'); }
  const b2 = document.getElementById('subtab-trades-badge');
  if (b2) {
    if (n > 0) { b2.textContent = n; b2.classList.remove('hidden'); }
    else       { b2.classList.add('hidden'); }
  }
}

function tradeIsExpired(t) {
  return t.status === 'pending' && t.expires_at && new Date(t.expires_at) < new Date();
}
function tradeIsFinished(t) {
  return !!(t.proposer_received_at && t.recipient_received_at);
}
function tradeCountLabel() {
  switch (state.tradeSubTab) {
    case 'browse': return `${state.tradeBrowse.length} offering${state.tradeBrowse.length === 1 ? '' : 's'} from other collectors`;
    case 'trades': {
      const me = pendingForMeCount();
      const active = activeTradeCount();
      return `${me} awaiting your reply · ${active} active`;
    }
    case 'items': {
      const off = state.myTradeItems.filter((x) => x.kind === 'offering').length;
      const seek = state.myTradeItems.filter((x) => x.kind === 'seeking').length;
      return `Offering ${off} · Seeking ${seek}`;
    }
  }
  return '';
}

// ─── Trade: mark for trade from a Collection/Wishlist card ────────────
async function markForTrade(item, kind) {
  if (!item.catalogId) {
    toast('Only catalog items can be traded.');
    return;
  }

  // Offerings are gated on actually owning the item — find your collection
  // row for this catalog product and use its quantity as the ceiling.
  let owned = 0;
  if (kind === 'offering') {
    const colItem = state.collection.find((c) => c.catalogId === item.catalogId);
    owned = colItem?.quantity || 0;
    if (owned < 1) {
      toast('You need to own at least one of these to offer it for trade.');
      return;
    }
  }

  const existing = state.myTradeItems.find((t) => t.kind === kind && t.catalogId === item.catalogId);
  if (existing) {
    if (kind === 'offering') {
      const qty = prompt(
        `You own ${owned}. Currently offering ${existing.quantity}. New quantity (0 to remove)?`,
        String(existing.quantity),
      );
      if (qty === null) return;
      let n = parseInt(qty, 10);
      if (Number.isNaN(n)) return;
      // Floor at reserved (can't take back what's already locked in trades),
      // ceiling at owned (can't offer more than you have).
      n = Math.max(existing.reserved, Math.min(owned, n));
      if (n === 0) {
        await data.deleteTradeItem(existing.id);
        toast('Removed from offerings.');
      } else {
        await data.updateTradeItem(existing.id, { quantity: n });
        toast(`Offering ${n} now.`);
      }
    } else {
      await data.deleteTradeItem(existing.id);
      toast('Removed from seeking.');
    }
  } else {
    let quantity = 1;
    if (kind === 'offering') {
      const q = prompt(`You own ${owned}. How many to offer for trade?`, String(owned));
      if (q === null) return;
      quantity = Math.max(1, Math.min(owned, parseInt(q, 10) || 1));
    }
    // Copy the photo into the public 'social' bucket so other collectors
    // can see it in Browse — the 'photos' bucket photoPath points at is
    // collection-scoped and unreadable to them. Best-effort: a failed
    // copy just means Browse falls back to the catalog image.
    let photoSocialPath = null;
    if (item.photoPath) {
      try { photoSocialPath = await data._copyPhotoToSocial(item.photoPath); }
      catch (err) { console.warn('copy trade photo to social', err); }
    }
    await data.addTradeItem({
      kind,
      catalogId: item.catalogId,
      catalogHandle: item.catalogHandle ?? null,
      name: item.name,
      photoPath: item.photoPath ?? null,
      photoSocialPath,
      quantity,
    });
    toast(kind === 'offering' ? `Offering ${quantity} for trade.` : 'Seeking listed.');
  }
  state.myTradeItems = await data.listMyTradeItems();
  render();
}

// When a collection row's quantity drops, the matching offering row must
// follow — you can't promise to trade more copies than you own. Returns
// false (and toasts) if the change would orphan a reservation.
// Sweep every offering and clamp it to the current owned quantity for
// its catalog product. Floors at `reserved` so we never break an active
// trade; removes an offering entirely when the user owns zero and has
// none reserved. Custom (non-catalog) offerings are left alone — they
// have no collection to link to. Persists each correction to the server
// so other browsers see the clamped offering. Returns true if anything
// changed. Pass { announce:true } to toast a one-line summary.
async function reconcileAllOfferings({ announce = false } = {}) {
  if (!Array.isArray(state.myTradeItems) || state.myTradeItems.length === 0) return false;
  const ownedByCatalog = new Map();
  for (const c of state.collection) {
    if (c.catalogId) {
      ownedByCatalog.set(c.catalogId, (ownedByCatalog.get(c.catalogId) || 0) + (c.quantity || 1));
    }
  }
  let removed = 0;
  let trimmed = 0;
  for (const off of state.myTradeItems) {
    if (off.kind !== 'offering' || !off.catalogId) continue;
    const owned = ownedByCatalog.get(off.catalogId) || 0;
    const reserved = off.reserved || 0;
    const target = Math.max(reserved, Math.min(owned, off.quantity));
    if (target === off.quantity) continue;
    try {
      if (target === 0) { await data.deleteTradeItem(off.id); removed++; }
      else { await data.updateTradeItem(off.id, { quantity: target }); trimmed++; }
    } catch (err) {
      console.error('reconcile offering', off.id, err);
    }
  }
  const changed = removed + trimmed > 0;
  if (changed) {
    state.myTradeItems = await data.listMyTradeItems();
    if (announce) {
      const parts = [];
      if (removed) parts.push(`removed ${removed} offering${removed === 1 ? '' : 's'} you no longer own`);
      if (trimmed) parts.push(`trimmed ${trimmed} to match what you own`);
      toast('Trade offerings updated: ' + parts.join(', ') + '.');
    }
  }
  return changed;
}

async function syncOfferingToOwned(catalogId, newOwned) {
  const offering = state.myTradeItems.find((t) => t.kind === 'offering' && t.catalogId === catalogId);
  if (!offering) return true;
  if (offering.quantity <= newOwned) return true;
  if (offering.reserved > newOwned) {
    toast(`Can't drop below ${offering.reserved} — that count is reserved in an active trade.`);
    return false;
  }
  if (newOwned === 0) {
    await data.deleteTradeItem(offering.id);
  } else {
    await data.updateTradeItem(offering.id, { quantity: newOwned });
  }
  state.myTradeItems = await data.listMyTradeItems();
  return true;
}

// ─── Trade: render the tab ───────────────────────────────────────────
function renderTrade() {
  document.querySelectorAll('.subtab').forEach((s) =>
    s.classList.toggle('active', s.dataset.subtab === state.tradeSubTab)
  );
  document.getElementById('subtab-browse').classList.toggle('hidden', state.tradeSubTab !== 'browse');
  document.getElementById('subtab-trades').classList.toggle('hidden', state.tradeSubTab !== 'trades');
  document.getElementById('subtab-items').classList.toggle('hidden', state.tradeSubTab !== 'items');

  if (state.tradeSubTab === 'browse')   renderBrowse();
  else if (state.tradeSubTab === 'trades') renderMyTrades();
  else                                  renderMyTradeItems();
}

function renderBrowse() {
  const list = state.tradeBrowse;
  if (list.length === 0) {
    document.getElementById('subtab-browse').innerHTML = `
      <div class="empty"><div class="ghost">🕯</div>
      <p>No active offerings from other collectors right now.</p></div>`;
    return;
  }
  // Group by owner
  const byOwner = new Map();
  for (const it of list) {
    if (!byOwner.has(it.ownerId)) byOwner.set(it.ownerId, { username: it.ownerUsername, items: [] });
    byOwner.get(it.ownerId).items.push(it);
  }
  const groups = [...byOwner.entries()].map(([ownerId, g]) => {
    // Sort each trader's offerings by category, then alphabetically by name
    // (item 19) — a tidy, scannable order within each crypt.
    g.items.sort((a, b) =>
      tradeCategoryRank(a) - tradeCategoryRank(b)
      || (a.name || '').localeCompare(b.name || ''));
    return `
    <section class="trader-group">
      <h2 class="trader-head">
        ${repBadge(ownerId, g.username, state.partnerFeedback.get(ownerId), { large: true })}
        <button class="btn-link" data-action="propose-trade" data-uid="${ownerId}">Propose a trade →</button>
      </h2>
      <ul class="trade-offer-list">
        ${g.items.map((it) => renderOfferingCard(it)).join('')}
      </ul>
    </section>
  `; }).join('');
  document.getElementById('subtab-browse').innerHTML = groups;
}

// Resolve a trade item's category (plush/mini/clothing/accessory/bundle/other)
// via the catalog, with a name-based fallback for custom pieces.
const TRADE_CAT_ORDER = ['plush', 'mini', 'clothing', 'accessory', 'bundle', 'other'];
const TRADE_CAT_LABEL = {
  plush: 'Plush', mini: 'Mini', clothing: 'Clothing',
  accessory: 'Accessory', bundle: 'Bundle', other: 'Other',
};
function tradeItemCategory(it) {
  if (it.catalogId) {
    const cat = state.catalog.find((c) => c.id === it.catalogId);
    if (cat) return catalogCategory(cat);
  }
  return CLOTHING_RE.test((it.name || '').toLowerCase()) ? 'clothing' : 'other';
}
function tradeCategoryRank(it) {
  const i = TRADE_CAT_ORDER.indexOf(tradeItemCategory(it));
  return i === -1 ? TRADE_CAT_ORDER.length : i;
}

function catalogImageFor(catalogId) {
  if (!catalogId) return null;
  const cat = state.catalog.find((c) => c.id === catalogId);
  return cat?.image ? shopifyImageVariant(cat.image, 400) : null;
}

function renderOfferingCard(it) {
  const src = it.photo || catalogImageFor(it.catalogId);
  const photo = src
    ? `<img src="${escapeHtml(src)}" loading="lazy" data-action="zoom-trade" data-src="${escapeHtml(src)}" data-name="${escapeHtml(stripOutfitWord(it.name))}" />`
    : `<span class="no-photo">🖤</span>`;
  // Compact row (item 19): small picture on the left, bullet-pointed facts on
  // the right, with a quick-trade CTA. Quick-trade drops you straight into the
  // offer builder with this one item pre-selected on their side.
  const facts = [
    `<li>${TRADE_CAT_LABEL[tradeItemCategory(it)] || 'Other'}</li>`,
    `<li>Available: ${it.available}</li>`,
  ];
  if (it.notes) facts.push(`<li class="trade-offer-note">${escapeHtml(it.notes)}</li>`);
  return `
    <li class="trade-offer-row">
      <div class="trade-offer-photo">${photo}</div>
      <div class="trade-offer-body">
        <h3 class="trade-offer-name">${escapeHtml(stripOutfitWord(it.name))}</h3>
        <ul class="trade-offer-facts">${facts.join('')}</ul>
      </div>
      <button class="btn-primary trade-offer-cta" data-action="quick-trade" data-uid="${it.ownerId}" data-item-id="${it.id}">I'll trade for this</button>
    </li>
  `;
}

function renderMyTradeItems() {
  const offering = state.myTradeItems.filter((t) => t.kind === 'offering');
  const seeking  = state.myTradeItems.filter((t) => t.kind === 'seeking');
  const renderSection = (title, items, kind) => `
    <section class="my-items-section">
      <h2 class="trader-head"><span>${title}</span></h2>
      ${items.length === 0 ? `<p class="empty-note">Nothing here yet — tap "${kind === 'offering' ? 'Offer for trade' : 'Seek in trade'}" on a card to add.</p>` : ''}
      <div class="grid grid-tight">
        ${items.map((it) => {
          const src = it.photo || catalogImageFor(it.catalogId);
          const photo = src ? `<img src="${escapeHtml(src)}" loading="lazy" />` : `<span class="no-photo">🖤</span>`;
          return `
            <article class="card card-small">
              <div class="card-photo">${photo}</div>
              <div class="card-body">
                <h3 class="card-name">${escapeHtml(stripOutfitWord(it.name))}</h3>
                <div class="card-meta">
                  ${kind === 'offering' ? `<span>${it.available} available · ${it.reserved} reserved</span>` : ''}
                </div>
              </div>
              <div class="card-actions">
                ${kind === 'offering' ? `<button data-action="trade-item-adjust" data-id="${it.id}">Adjust</button>` : ''}
                <button class="btn-danger" data-action="trade-item-remove" data-id="${it.id}">Remove</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
  document.getElementById('subtab-items').innerHTML =
    renderSection('Offering', offering, 'offering') +
    renderSection('Seeking', seeking, 'seeking');
}

function renderMyTrades() {
  const uid = window.currentUser.id;
  // Bucket per status group; the user picks one via filter pills rather
  // than scrolling through stacked sections.
  const buckets = { pending: [], active: [], past: [] };
  for (const t of state.trades) {
    if (t.status === 'pending' && !tradeIsExpired(t))         buckets.pending.push(t);
    else if (t.status === 'accepted' && !tradeIsFinished(t))  buckets.active.push(t);
    else                                                      buckets.past.push(t);
  }
  // Trades that need *my* action win sort priority within their bucket.
  const yoursFirst = (a, b) => {
    const aMine = a.proposer_id === uid;
    const bMine = b.proposer_id === uid;
    const ak = tradeStatusLabel(a, uid, aMine).kind === 'your' ? 0 : 1;
    const bk = tradeStatusLabel(b, uid, bMine).kind === 'your' ? 0 : 1;
    return ak - bk;
  };
  buckets.pending.sort(yoursFirst);
  buckets.active.sort(yoursFirst);

  const counts = {
    pending: buckets.pending.length,
    active:  buckets.active.length,
    past:    buckets.past.length,
  };
  const total = counts.pending + counts.active + counts.past;
  if (total === 0) {
    document.getElementById('subtab-trades').innerHTML =
      `<div class="empty"><div class="ghost">📜</div><p>No trades yet. Browse offerings to start one.</p></div>`;
    return;
  }

  const filter = state.tradeFilter || 'open';
  const pill = (key, label, count) =>
    `<button class="chip chip-toggle ${filter === key ? 'active' : ''}" data-trade-filter="${key}">${label}${count > 0 ? ` <span class="dim">${count}</span>` : ''}</button>`;

  let list;
  if (filter === 'pending')      list = buckets.pending;
  else if (filter === 'active')  list = buckets.active;
  else if (filter === 'past')    list = buckets.past.slice(0, 50);
  else                           list = [...buckets.pending, ...buckets.active]; // 'open' default

  const rows = list.length === 0
    ? `<p class="empty-note">Nothing here.</p>`
    : list.map((t) => renderTradeRow(t, uid)).join('');

  document.getElementById('subtab-trades').innerHTML = `
    <div class="filters trade-filters">
      ${pill('open',    'Needs attention', counts.pending + counts.active)}
      ${pill('pending', 'Pending',         counts.pending)}
      ${pill('active',  'Active',          counts.active)}
      ${pill('past',    'Past',            counts.past)}
    </div>
    <div class="trade-list">${rows}</div>
  `;
}

function renderTradeRow(t, uid) {
  const isMine = t.proposer_id === uid;
  const otherName = isMine ? t.recipient?.username : t.proposer?.username;
  const lines = t.trade_line_items || [];
  const myLines    = lines.filter((l) => (l.side === 'proposer') === isMine);
  const theirLines = lines.filter((l) => (l.side === 'proposer') !== isMine);

  const lineHtml = (ls) => ls.map((l) =>
    `<li>${l.quantity}× ${escapeHtml(l.trade_item?.name ?? 'item')}</li>`
  ).join('');

  const status = tradeStatusLabel(t, uid, isMine);

  let actions = '';
  if (t.status === 'pending') {
    if (!isMine) {
      actions = `
        <button class="btn-primary" data-action="trade-accept" data-id="${t.id}">Accept</button>
        <button data-action="trade-counter" data-id="${t.id}">Counter</button>
        <button class="btn-danger" data-action="trade-reject" data-id="${t.id}">Reject</button>
      `;
    } else {
      actions = `<button class="btn-danger" data-action="trade-cancel" data-id="${t.id}">Cancel</button>`;
    }
  } else if (t.status === 'accepted') {
    actions = renderAcceptedTradeActions(t, isMine, uid);
  } else if (t.status === 'completed') {
    actions = renderCompletedTradeActions(t, isMine, uid);
  }

  const otherId = isMine ? t.recipient_id : t.proposer_id;
  const otherBadge = repBadge(otherId, otherName, state.partnerFeedback.get(otherId));
  return `
    <article class="trade-card">
      <header class="trade-head">
        <div>
          <span class="trade-with">${isMine ? 'You → ' : ''}${otherBadge}${isMine ? '' : ' → You'}</span>
          <span class="trade-status trade-status-${status.kind}">${status.text}</span>
        </div>
      </header>
      <div class="trade-lines">
        <div><h4>You give:</h4><ul>${lineHtml(myLines) || '<li class="dim">(nothing)</li>'}</ul></div>
        <div><h4>You get:</h4><ul>${lineHtml(theirLines) || '<li class="dim">(nothing)</li>'}</ul></div>
      </div>
      ${t.message ? `<p class="trade-message">“${escapeHtml(t.message)}”</p>` : ''}
      ${t.status === 'accepted' ? renderShipFirstBanner(t, isMine) : ''}
      ${renderFellThroughBanner(t, uid)}
      ${actions ? `<div class="card-actions">${actions}</div>` : ''}
    </article>
  `;
}

// Tells the viewer whose turn it is at a glance. The "ball is in your
// court" framing is more actionable than the raw status enum on cards
// where the user can see they have a trade but not whether they need
// to do something about it.
function tradeStatusLabel(t, uid, isMine) {
  // Returns { text, kind } where kind ∈ 'your' | 'their' | 'done' | 'dead'
  // and drives the trade-status pill color.
  if (t.status === 'pending') {
    const exp = new Date(t.expires_at);
    const hoursLeft = Math.max(0, Math.round((exp - new Date()) / 3600000));
    if (isMine) return { text: `Awaiting their response · expires in ${hoursLeft}h`, kind: 'their' };
    return { text: `Your turn to respond · ${hoursLeft}h left`, kind: 'your' };
  }
  if (t.status === 'accepted') {
    const myShip   = isMine ? t.proposer_shipped_at  : t.recipient_shipped_at;
    const theirShip = isMine ? t.recipient_shipped_at : t.proposer_shipped_at;
    const myRecv    = isMine ? t.proposer_received_at : t.recipient_received_at;
    const theirRecv = isMine ? t.recipient_received_at : t.proposer_received_at;
    const needShip    = !myShip;
    const needConfirm = theirShip && !myRecv;
    if (needShip && needConfirm) return { text: 'Your turn · ship and confirm receipt', kind: 'your' };
    if (needShip)                return { text: 'Your turn · ship your side', kind: 'your' };
    if (needConfirm)             return { text: 'Your turn · confirm you received theirs', kind: 'your' };
    if (!theirShip)              return { text: 'Awaiting their ship', kind: 'their' };
    if (!theirRecv)              return { text: 'Awaiting their confirmation', kind: 'their' };
    return { text: 'Wrapping up…', kind: 'their' };
  }
  if (t.status === 'completed') return { text: 'Completed', kind: 'done' };
  if (t.status === 'rejected')  return { text: 'Rejected',  kind: 'dead' };
  if (t.status === 'cancelled') return { text: 'Cancelled', kind: 'dead' };
  if (t.status === 'expired')   return { text: 'Expired',   kind: 'dead' };
  if (t.status === 'countered') return { text: 'Countered', kind: 'dead' };
  return { text: capitalize(t.status), kind: 'dead' };
}

function renderShipFirstBanner(t, isMine) {
  const otherId = isMine ? t.recipient_id : t.proposer_id;
  const mine = state.myFeedback || { net_score: 0 };
  const theirs = state.partnerFeedback.get(otherId) || { net_score: 0 };
  const result = data.whoShipsFirst(mine.net_score, theirs.net_score);
  let text;
  if (result === 'simultaneous') {
    text = `Ship simultaneously (your net ${mine.net_score} · theirs ${theirs.net_score}).`;
  } else if (result === 'me') {
    text = `You ship first — your net is ${mine.net_score} (vs theirs ${theirs.net_score}) and you've got under 20 trades.`;
  } else {
    text = `They ship first — their net is ${theirs.net_score} (vs yours ${mine.net_score}) and they've got under 20 trades.`;
  }
  return `<div class="ship-first-banner">${text}</div>`;
}

function renderAcceptedTradeActions(t, isMine, uid) {
  const mySide = isMine ? 'proposer' : 'recipient';
  const myShippedAt = isMine ? t.proposer_shipped_at : t.recipient_shipped_at;
  // "received" tracks what you received from THEM
  const myReceivedAt = isMine ? t.proposer_received_at : t.recipient_received_at;
  const otherShippedAt = isMine ? t.recipient_shipped_at : t.proposer_shipped_at;

  const parts = [];
  parts.push(`<button data-action="trade-address" data-id="${t.id}">Address</button>`);
  if (!myShippedAt) {
    parts.push(`<button class="btn-primary" data-action="trade-shipped" data-id="${t.id}" data-side="${mySide}">I shipped mine</button>`);
  } else {
    parts.push(`<span class="dim">You shipped ${shortDate(myShippedAt)}</span>`);
  }
  if (otherShippedAt && !myReceivedAt) {
    parts.push(`<button class="btn-primary" data-action="trade-received" data-id="${t.id}" data-side="${mySide}">I received theirs</button>`);
  } else if (myReceivedAt) {
    parts.push(`<span class="dim">You received ${shortDate(myReceivedAt)}</span>`);
  }
  // "Fell through" routes through a request/confirm dance now — one
  // party requests, the other confirms or disputes. We hide the
  // raw "Fell through" button when a request is already in flight;
  // the banner above the actions row carries the workflow instead.
  if (!t.fell_through_requested_by) {
    parts.push(`<button class="btn-danger" data-action="trade-fall-through" data-id="${t.id}">Fell through</button>`);
  } else if (t.fell_through_requested_by === uid) {
    parts.push(`<button class="btn-ghost" data-action="trade-withdraw-fall" data-id="${t.id}">Withdraw fell-through</button>`);
  }
  return parts.join(' ');
}

// Banners shown above the actions row on accepted trades. Three
// possible states, mutually exclusive:
//   1. fell_through_requested_by is set, no dispute open — partner
//      sees Confirm / Dispute, requester sees Withdraw.
//   2. dispute_open true, my side's statement not yet filed — I see
//      "please write your side" prompt.
//   3. dispute_open true, both statements filed — both see "admin is
//      reviewing" placeholder.
function renderFellThroughBanner(t, uid) {
  if (t.status !== 'accepted') return '';

  if (t.dispute_open) return renderDisputeBanner(t, uid);

  if (!t.fell_through_requested_by) return '';
  const isRequester = t.fell_through_requested_by === uid;
  if (isRequester) {
    return `<div class="ship-first-banner fell-through-banner dim">
      🕯 You've requested to mark this trade as fallen through.
      Waiting for the other side to confirm or dispute.
    </div>`;
  }
  return `<div class="ship-first-banner fell-through-banner">
    <strong>⚠ Your trade partner says this trade fell through.</strong>
    Both of you have to agree before the trade is cancelled and the items unreserve.
    <div class="fell-through-actions">
      <button class="btn-danger" data-action="trade-confirm-fall" data-id="${t.id}">Confirm cancellation</button>
      <button class="btn-ghost" data-action="trade-dispute-fall" data-id="${t.id}">Dispute — trade is still on</button>
    </div>
  </div>`;
}

function renderDisputeBanner(t, uid) {
  const isProposer = t.proposer_id === uid;
  const myStatement = isProposer ? t.dispute_proposer_statement : t.dispute_recipient_statement;
  const theirStatement = isProposer ? t.dispute_recipient_statement : t.dispute_proposer_statement;
  if (!myStatement) {
    return `<div class="ship-first-banner fell-through-banner">
      <strong>⚠ This trade is in dispute.</strong>
      Your trade partner has asked an admin to review what happened. Please share your side — it gets sent to admin alongside theirs.
      <div class="fell-through-actions">
        <button class="btn-primary" data-action="trade-dispute-statement" data-id="${t.id}">Write my statement</button>
      </div>
    </div>`;
  }
  // I've filed; either waiting for them, or both done.
  if (!theirStatement) {
    return `<div class="ship-first-banner fell-through-banner dim">
      🕯 Dispute open — your statement is in. Waiting for the other side to file theirs.
    </div>`;
  }
  return `<div class="ship-first-banner fell-through-banner dim">
    🕯 Dispute pending admin review. Both sides have filed statements.
  </div>`;
}

function renderCompletedTradeActions(t, isMine, uid) {
  const mine = state.myFeedbackByTrade?.[t.id];
  if (!mine) return `<button class="btn-primary" data-action="trade-feedback" data-id="${t.id}">Leave feedback</button>`;
  const ageMs = Date.now() - new Date(mine.created_at).getTime();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  if (ageMs > SEVEN_DAYS) {
    return `<span class="dim">Feedback locked</span>`;
  }
  return `<button data-action="trade-feedback" data-id="${t.id}">Edit your feedback</button>`;
}

// ─── Trade: card-action dispatchers ──────────────────────────────────
async function onTradeClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, uid } = btn.dataset;
  // Wrap the whole dispatch so a thrown error (e.g. an RLS or FK
  // failure deep in the data layer) surfaces as a toast instead of
  // silently doing nothing — that was the original "can't remove"
  // symptom.
  try {
    if (action === 'zoom-trade')            openLightbox(btn.dataset.src, btn.dataset.name);
    else if (action === 'propose-trade')         await openOfferModal(uid);
    else if (action === 'quick-trade')      await openOfferModal(uid, null, btn.dataset.itemId);
    else if (action === 'trade-item-remove') await removeMyTradeItem(id);
    else if (action === 'trade-item-adjust') await adjustMyTradeItem(id);
    else if (action === 'trade-accept')      await respondToTrade(id, 'accept');
    else if (action === 'trade-reject')      await respondToTrade(id, 'reject');
    else if (action === 'trade-counter')     await openCounterModal(id);
    else if (action === 'trade-cancel')      await respondToTrade(id, 'cancel');
    else if (action === 'trade-fall-through') await respondToTrade(id, 'fall-through');
    else if (action === 'trade-confirm-fall')  await respondToTrade(id, 'confirm-fall');
    else if (action === 'trade-dispute-fall')  openDisputeStatementModal(id, 'open');
    else if (action === 'trade-dispute-statement') openDisputeStatementModal(id, 'add');
    else if (action === 'trade-withdraw-fall') await respondToTrade(id, 'withdraw-fall');
    else if (action === 'trade-shipped')     await tradeShipped(id, btn.dataset.side);
    else if (action === 'trade-received')    await tradeReceived(id, btn.dataset.side);
    else if (action === 'trade-address')     await openAddressModal(id);
    else if (action === 'trade-feedback')    await openFeedbackModal(id);
  } catch (err) {
    console.error('trade action failed', action, err);
    toast('Something went wrong: ' + (err.message || 'see console'));
  }
}
// Filter pill clicks inside My Trades use a separate dataset key so
// they don't fight the generic [data-action] dispatcher.
function onTradeFilterClick(e) {
  const btn = e.target.closest('[data-trade-filter]');
  if (!btn) return;
  state.tradeFilter = btn.dataset.tradeFilter;
  renderTrade();
}

async function removeMyTradeItem(id) {
  const it = state.myTradeItems.find((x) => x.id === id);
  if (!it) return;
  if (it.reserved > 0) { toast('Cannot remove: reserved in an active trade.'); return; }
  if (!confirm('Remove this from your trade list?')) return;
  try {
    // deleteTradeItem hard-deletes when possible, else soft-archives if
    // the item is referenced by a historical trade. Either way it's gone
    // from the user's offerings and from Browse afterward.
    await data.deleteTradeItem(id);
    state.myTradeItems = await data.listMyTradeItems();
    render();
    toast('Removed.');
  } catch (err) {
    console.error('removeMyTradeItem', err);
    toast('Could not remove that item.');
  }
}

async function adjustMyTradeItem(id) {
  const it = state.myTradeItems.find((x) => x.id === id);
  if (!it) return;
  const q = prompt(`New quantity (minimum ${it.reserved} due to active trades):`, String(it.quantity));
  if (q === null) return;
  const n = Math.max(it.reserved, parseInt(q, 10) || 0);
  try {
    if (n === 0) await data.deleteTradeItem(id);
    else await data.updateTradeItem(id, { quantity: n });
    state.myTradeItems = await data.listMyTradeItems();
    render();
  } catch (err) {
    console.error('adjustMyTradeItem', err);
    toast('Could not update that item.');
  }
}

async function respondToTrade(id, action) {
  const t = state.trades.find((x) => x.id === id);
  if (!t) return;
  let toastMsg = '';
  try {
    if (action === 'accept') {
      await data.acceptTrade(id);
      toastMsg = 'Trade accepted.';
    } else if (action === 'reject') {
      await data.rejectTrade(id);
      toastMsg = 'Trade rejected.';
    } else if (action === 'cancel') {
      // Cancelling a pending trade (proposer pulls their offer) goes
      // straight through. Cancelling an accepted trade now requires
      // the fall-through handshake — handled by 'fall-through' below.
      await data.cancelTrade(id, 'cancelled');
      toastMsg = 'Trade cancelled.';
    } else if (action === 'fall-through') {
      // Mutual confirmation. The 'pending' status path never reaches
      // here because pending trades don't show a fall-through button.
      if (!confirm('Mark this trade as fallen through? Your partner has to confirm before the trade is cancelled.')) return;
      await data.requestFellThrough(id);
      toastMsg = 'Fall-through requested. Waiting for partner.';
    } else if (action === 'withdraw-fall') {
      await data.withdrawFellThrough(id);
      toastMsg = 'Fall-through request withdrawn.';
    } else if (action === 'confirm-fall') {
      if (!confirm('Confirm that this trade fell through? The trade will be cancelled and reserved items will be freed.')) return;
      await data.confirmFellThrough(id);
      toastMsg = 'Trade cancelled.';
    }
  } catch (err) {
    console.error(err);
    if (err.message === 'item_unavailable') {
      toast('One of those items is no longer available.');
    } else {
      toast(`Couldn't complete that action: ${err.message || err}`);
    }
    return;
  }
  if (toastMsg) toast(toastMsg);
  await loadTradeData();
  render();
}

async function tradeShipped(id, side) {
  await data.markShipped(id, side);
  await loadTradeData();
  render();
  toast('Marked as shipped.');
}

async function tradeReceived(id, side) {
  await data.markReceived(id, side);
  await loadTradeData();
  render();
  // If it just completed, open feedback
  const t = state.trades.find((x) => x.id === id);
  if (t && t.status === 'completed') await openFeedbackModal(id);
}

// promptAddress is now openAddressModal — defined later with a proper modal.

// ─── Trade: offer builder modal ──────────────────────────────────────
// preselectedItemId, when set, drops one of their items into recipientPicks
// at qty=1 so a quick-trade button can skip the picker step.
async function openOfferModal(recipientId, parentTradeId, preselectedItemId) {
  const recipientItems = state.tradeBrowse.filter((it) => it.ownerId === recipientId);
  const recipientUsername = recipientItems[0]?.ownerUsername ?? '?';

  const recipientPicks = new Map();
  if (preselectedItemId) {
    const found = recipientItems.find((it) => it.id === preselectedItemId);
    if (found && found.available > 0) recipientPicks.set(preselectedItemId, 1);
  }

  state.offerDraft = {
    recipientId,
    recipientUsername,
    recipientItems,
    myItems: state.myTradeItems.filter((t) => t.kind === 'offering'),
    proposerPicks: new Map(),    // tradeItemId → qty (my offerings)
    recipientPicks,              // tradeItemId → qty (their offerings)
    parentTradeId,
  };

  document.getElementById('offer-title').textContent = parentTradeId ? 'Counter offer' : 'Propose a trade';
  // Subtitle becomes the partner's reputation badge so the proposer
  // sees who they're dealing with before committing.
  document.getElementById('offer-sub').innerHTML = `with ${repBadge(recipientId, recipientUsername, state.partnerFeedback.get(recipientId))}`;
  document.getElementById('offer-message').value = '';
  renderOfferBuilder();
  document.getElementById('offer-modal').classList.remove('hidden');
}

function renderOfferBuilder() {
  const d = state.offerDraft;
  const lineRows = (items, picksMap, who) => items.length === 0
    ? `<p class="dim">${who === 'them' ? '@' + d.recipientUsername + ' isn\'t offering anything right now.' : 'You have nothing listed for trade yet. Add something from your Collection.'}</p>`
    : items.map((it) => {
        const avail = (it.quantity ?? 0) - (it.reserved ?? 0);
        const cur = picksMap.get(it.id) || 0;
        return `
          <div class="picker-row">
            <div class="picker-name">${escapeHtml(it.name)} <span class="dim">(${avail} avail)</span></div>
            <div class="picker-controls">
              <button class="pen-btn" data-picker="${who}" data-id="${it.id}" data-delta="-1">−</button>
              <span class="picker-count">${cur}</span>
              <button class="pen-btn" data-picker="${who}" data-id="${it.id}" data-delta="1">+</button>
            </div>
          </div>
        `;
      }).join('');

  document.getElementById('offer-builder').innerHTML = `
    <div class="picker-panel">
      <h3>They give:</h3>
      ${lineRows(d.recipientItems, d.recipientPicks, 'them')}
    </div>
    <div class="picker-panel">
      <h3>You give:</h3>
      ${lineRows(d.myItems, d.proposerPicks, 'me')}
    </div>
  `;
}

function pickerAdjust(who, id, delta) {
  const d = state.offerDraft;
  const map = who === 'me' ? d.proposerPicks : d.recipientPicks;
  const pool = who === 'me' ? d.myItems : d.recipientItems;
  const it = pool.find((x) => x.id === id);
  if (!it) return;
  const max = (it.quantity ?? 0) - (it.reserved ?? 0);
  const cur = map.get(id) || 0;
  const next = Math.max(0, Math.min(max, cur + delta));
  if (next === 0) map.delete(id); else map.set(id, next);
  renderOfferBuilder();
}

async function sendOffer() {
  const d = state.offerDraft;
  if (!d) return;
  const proposerLines = [...d.proposerPicks.entries()].map(([tradeItemId, quantity]) => ({ tradeItemId, quantity }));
  const recipientLines = [...d.recipientPicks.entries()].map(([tradeItemId, quantity]) => ({ tradeItemId, quantity }));
  if (proposerLines.length === 0 && recipientLines.length === 0) {
    toast('Pick at least one item on each side.');
    return;
  }
  if (proposerLines.length === 0 || recipientLines.length === 0) {
    if (!confirm('This trade has nothing on one side. Send anyway?')) return;
  }
  try {
    if (d.parentTradeId) await data.markCountered(d.parentTradeId);
    await data.createTrade({
      recipientId: d.recipientId,
      proposerLines,
      recipientLines,
      message: document.getElementById('offer-message').value.trim() || null,
      parentTradeId: d.parentTradeId,
    });
    toast('Offer sent.');
    closeOfferModal();
    await loadTradeData();
    render();
  } catch (err) {
    console.error(err);
    toast('Could not send offer.');
  }
}

function closeOfferModal() {
  document.getElementById('offer-modal').classList.add('hidden');
  state.offerDraft = null;
}

async function openCounterModal(tradeId) {
  const t = state.trades.find((x) => x.id === tradeId);
  if (!t) return;
  const uid = window.currentUser.id;
  const otherId = t.proposer_id === uid ? t.recipient_id : t.proposer_id;
  // Open builder pre-filled with inverse picks
  await openOfferModal(otherId, tradeId);
  const d = state.offerDraft;
  for (const li of (t.trade_line_items || [])) {
    // If they were giving (their side), it goes into "they give" again; if I was giving, into "I give".
    const fromMe = (li.side === 'proposer') === (t.proposer_id === uid);
    const map = fromMe ? d.proposerPicks : d.recipientPicks;
    if (li.trade_item?.id) map.set(li.trade_item.id, (map.get(li.trade_item.id) || 0) + li.quantity);
  }
  renderOfferBuilder();
}

// ─── Trade: feedback modal ───────────────────────────────────────────
// Feedback modal driver — three structured thumbs + optional comment.
// Opens in either 'new' or 'edit' mode depending on whether the current
// user already left feedback on this trade. Existing rows stay editable
// for 7 days (enforced by the DB policy).
async function openFeedbackModal(tradeId) {
  const t = state.trades.find((x) => x.id === tradeId);
  if (!t) return;
  const uid = window.currentUser.id;
  const rateeId = t.proposer_id === uid ? t.recipient_id : t.proposer_id;
  const rateeName = t.proposer_id === uid ? t.recipient?.username : t.proposer?.username;

  const existing = await data.getMyFeedbackForTrade(tradeId);
  let mode = 'new';
  let ratings = { communication: null, shipping: null, accuracy: null };
  let comment = '';
  if (existing) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (ageMs > SEVEN_DAYS) {
      toast('That feedback is locked (over 7 days old).');
      return;
    }
    mode = 'edit';
    ratings = {
      communication: existing.rating_communication,
      shipping:      existing.rating_shipping,
      accuracy:      existing.rating_accuracy,
    };
    comment = existing.comment || '';
  }

  state.feedbackDraft = { tradeId, rateeId, rateeUsername: rateeName, ratings, mode };
  document.getElementById('feedback-title').textContent = mode === 'edit' ? 'Update your feedback' : 'How was the trade?';
  document.getElementById('feedback-sub').textContent = `@${rateeName || 'partner'}`;
  document.getElementById('feedback-comment').value = comment;
  document.getElementById('feedback-edit-note').classList.toggle('hidden', mode !== 'new');

  document.querySelectorAll('#feedback-modal .thumb-btn').forEach((b) => b.classList.remove('selected'));
  for (const [cat, val] of Object.entries(ratings)) {
    if (val === null) continue;
    const v = val ? 'up' : 'down';
    document.querySelector(`#feedback-modal .thumb-row[data-category="${cat}"] .thumb-btn[data-value="${v}"]`)?.classList.add('selected');
  }
  refreshFeedbackSubmit();
  document.getElementById('feedback-modal').classList.remove('hidden');
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.add('hidden');
  state.feedbackDraft = null;
}

function setFeedbackRating(category, value) {
  const d = state.feedbackDraft;
  if (!d) return;
  // Tapping the already-selected thumb clears it.
  d.ratings[category] = d.ratings[category] === value ? null : value;
  document.querySelectorAll(`#feedback-modal .thumb-row[data-category="${category}"] .thumb-btn`).forEach((b) => {
    const isSelected = (d.ratings[category] === true && b.dataset.value === 'up')
                    || (d.ratings[category] === false && b.dataset.value === 'down');
    b.classList.toggle('selected', isSelected);
  });
  refreshFeedbackSubmit();
}

function refreshFeedbackSubmit() {
  const d = state.feedbackDraft;
  const btn = document.getElementById('feedback-submit');
  if (!btn) return;
  if (!d) { btn.disabled = true; return; }
  const all = ['communication', 'shipping', 'accuracy'].every((c) => d.ratings[c] === true || d.ratings[c] === false);
  btn.disabled = !all;
}

async function submitFeedback() {
  const d = state.feedbackDraft;
  if (!d) return;
  const comment = document.getElementById('feedback-comment').value.trim() || null;
  try {
    if (d.mode === 'edit') {
      await data.updateFeedback(d.tradeId, d.ratings, comment);
      toast('Feedback updated.');
    } else {
      await data.leaveFeedback(d.tradeId, d.rateeId, d.ratings, comment);
      toast('Feedback recorded.');
    }
    closeFeedbackModal();
    await loadTradeData();
    render();
  } catch (err) {
    console.error(err);
    toast('Could not save feedback.');
  }
}

// ─── Reputation badge + mini-profile popover ─────────────────────────
// Renders inline `@user · Nt · P%` chip. Self-contained HTML; the
// containing element must have a click handler (set up at boot) that
// dispatches to openMiniProfile when [data-mini-uid] is clicked.
function repBadge(uid, username, summary, opts = {}) {
  const total = summary?.total_count ?? 0;
  const pct = summary?.overall_percent;
  let pctCls = 'rep-empty';
  let pctTxt = total === 0 ? 'new' : (pct == null ? '—' : `${pct}%`);
  if (pct != null && total > 0) {
    if (pct >= 80) pctCls = 'rep-good';
    else if (pct >= 50) pctCls = 'rep-meh';
    else pctCls = 'rep-bad';
  }
  const size = opts.large ? ' rep-large' : '';
  const u = escapeHtml(username || 'unknown');
  const countTxt = total === 0 ? '' : `<span class="rep-sep">·</span><span class="rep-count">${total}t</span>`;
  return `<button type="button" class="rep-badge${size}" data-mini-uid="${escapeHtml(uid)}" title="See @${u}'s reputation">
    <span class="rep-name">@${u}</span>
    ${countTxt}
    <span class="rep-sep">·</span><span class="rep-percent ${pctCls}">${pctTxt}</span>
  </button>`;
}

// Ensure state.partnerFeedback has entries for the supplied user IDs.
// Fires one batched query for any unknowns. Callers should await this
// before rendering so badges have data on first paint.
async function ensureReputationFor(userIds) {
  const want = userIds.filter((id) => id && !state.partnerFeedback.has(id));
  if (want.length === 0) return;
  try {
    const batch = await data.getFeedbackSummaryBatch(want);
    for (const id of want) {
      state.partnerFeedback.set(id, batch[id] || null);
    }
  } catch (err) {
    console.error('ensureReputationFor', err);
  }
}

async function openMiniProfile(userId) {
  const body = document.getElementById('mini-profile-body');
  body.innerHTML = `<p class="dim">Loading…</p>`;
  document.getElementById('mini-profile-modal').classList.remove('hidden');
  try {
    await ensureReputationFor([userId]);
    const summary = state.partnerFeedback.get(userId);
    const comments = await data.getPublicFeedback(userId, 8);
    const username = summary?.username
      || comments[0]?.rater_username  // fallback if their summary row is missing
      || '(unknown)';
    const total = summary?.total_count ?? 0;
    const pct = summary?.overall_percent;
    let pctCls = 'rep-empty';
    let pctTxt = total === 0 ? 'No trades yet' : (pct == null ? '—' : `${pct}%`);
    if (pct != null && total > 0) {
      if (pct >= 80) pctCls = 'rep-good';
      else if (pct >= 50) pctCls = 'rep-meh';
      else pctCls = 'rep-bad';
    }

    const catBar = (name, up, down) => {
      const t = up + down;
      const inner = t === 0
        ? `<span class="cat-empty">no ratings</span>`
        : `<span class="cat-up">👍 ${up}</span><span class="cat-down">👎 ${down}</span>`;
      return `<div class="mini-profile-cat"><div class="cat-name">${name}</div><div class="cat-bar">${inner}</div></div>`;
    };

    const commentHtml = comments.length === 0
      ? `<p class="mini-profile-empty">No public comments yet.</p>`
      : comments.map((c) => {
        const cls = c.rating === 'good' ? 'rating-good' : c.rating === 'bad' ? 'rating-bad' : 'rating-meh';
        const chips = [
          c.rating_communication != null && `${c.rating_communication ? '👍' : '👎'} comms`,
          c.rating_shipping      != null && `${c.rating_shipping      ? '👍' : '👎'} ship`,
          c.rating_accuracy      != null && `${c.rating_accuracy      ? '👍' : '👎'} item`,
        ].filter(Boolean).join(' · ');
        const body = c.comment
          ? `<p>${escapeHtml(c.comment)}</p>`
          : (chips ? `<p class="dim">${chips}</p>` : '');
        return `<div class="mini-profile-comment ${cls}">
          <div class="mini-profile-comment-head">
            <span class="from">@${escapeHtml(c.rater_username)}</span>
            <span class="when">${shortDate(c.created_at)}</span>
          </div>
          ${body}
          ${c.comment && chips ? `<p class="dim" style="margin-top:4px;font-size:0.8rem;">${chips}</p>` : ''}
        </div>`;
      }).join('');

    body.innerHTML = `
      <div class="mini-profile-head">
        <div>
          <h2>@${escapeHtml(username)}</h2>
          <span class="mini-profile-meta">${total === 0 ? 'No trades yet' : `${total} ${total === 1 ? 'trade' : 'trades'}`}</span>
        </div>
        <div class="mini-profile-pct ${pctCls}">${pctTxt}</div>
      </div>
      <div class="mini-profile-cats">
        ${catBar('Communication', summary?.comm_up ?? 0, summary?.comm_down ?? 0)}
        ${catBar('Shipping',      summary?.ship_up ?? 0, summary?.ship_down ?? 0)}
        ${catBar('Item accuracy', summary?.acc_up  ?? 0, summary?.acc_down  ?? 0)}
      </div>
      <div class="mini-profile-comments">
        <h3>Recent feedback</h3>
        ${commentHtml}
      </div>
    `;
  } catch (err) {
    console.error('openMiniProfile', err);
    body.innerHTML = `<p class="dim">Couldn't load reputation.</p>`;
  }
}

function closeMiniProfile() {
  document.getElementById('mini-profile-modal').classList.add('hidden');
}

function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString();
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ─── Collection sharing ──────────────────────────────────────────────
async function openShareModal() {
  const myMembership = data.memberships.find((m) => m.collection_id === data.collectionId);
  document.getElementById('share-collection-name').textContent = myMembership?.name ?? '';

  const members = await data.listMembers();
  const myId = window.currentUser.id;
  const iAmOwner = myMembership?.role === 'owner';

  // Resolve usernames
  document.getElementById('share-members').innerHTML = members.map((m) => {
    const tag = m.role === 'owner' ? '<span class="role-tag">owner</span>'
              : m.role === 'editor' ? '<span class="role-tag editor">editor</span>'
              : '<span class="role-tag viewer">viewer</span>';
    const canKick = (iAmOwner && m.user_id !== myId) || (m.user_id === myId && m.role !== 'owner');
    const btn = canKick
      ? `<button class="btn-danger" data-share-action="remove" data-uid="${m.user_id}">${m.user_id === myId ? 'Leave' : 'Remove'}</button>`
      : '';
    return `<li><span>@${escapeHtml(m.username ?? 'unknown')} ${tag}</span> ${btn}</li>`;
  }).join('');

  document.getElementById('generate-invite').classList.toggle('hidden', !iAmOwner);
  document.getElementById('invite-link-wrap').classList.add('hidden');
  document.getElementById('share-modal').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

async function generateInvite() {
  try {
    const token = await data.createInvite('editor');
    const url = `${window.location.origin}${window.location.pathname}?join=${token}`;
    document.getElementById('invite-link').value = url;
    document.getElementById('invite-link-wrap').classList.remove('hidden');
  } catch (err) {
    console.error(err);
    toast('Could not generate invite.');
  }
}

async function copyInviteLink() {
  const input = document.getElementById('invite-link');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    toast('Link copied. Paste it to your invitee.');
  } catch {
    document.execCommand('copy');
    toast('Link copied.');
  }
}

async function onShareClick(e) {
  const btn = e.target.closest('[data-share-action]');
  if (!btn) return;
  const action = btn.dataset.shareAction;
  const uid = btn.dataset.uid;
  if (action === 'remove') {
    const isMe = uid === window.currentUser.id;
    if (!confirm(isMe ? 'Leave this collection?' : 'Remove this member?')) return;
    try {
      await data.removeMember(uid);
      toast(isMe ? 'You left the collection.' : 'Member removed.');
      if (isMe) {
        // Reload memberships and switch active
        data.memberships = await data.listMyMemberships();
        const next = data.memberships.find((m) => m.role === 'owner') || data.memberships[0];
        if (next) {
          await data.switchActiveCollection(next.collection_id);
          await loadAll();
          state.pensOwned = await data.listPens();
          render();
        }
        closeShareModal();
      } else {
        openShareModal();   // refresh list
      }
    } catch (err) {
      console.error(err);
      toast('Couldn’t complete that.');
    }
  }
}

async function switchCollection(collectionId) {
  await data.switchActiveCollection(collectionId);
  await loadAll();
  state.pensOwned = await data.listPens();
  state.myTradeItems = await data.listMyTradeItems();
  document.getElementById('user-menu').classList.add('hidden');
  render();
  toast('Switched collection.');
}

// ─── Account modal ───────────────────────────────────────────────────
// v2 redesign: light parchment is the default; dark gothic is the opt-in
// theme. We persist localStorage.theme as 'dark' to opt in, or clear it
// (or save 'light') to use the default. The early-load script in
// index.html flips on <html data-theme="dark"> before paint.
function setTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('theme', t); } catch {}
  // Keep the iOS Safari tab bar / Android Chrome chrome in sync with the
  // in-app toggle. Without this, the OS chrome stays on whatever the
  // system pref dictates and the user sees a parchment bar above a
  // dark page, which reads as "dark mode didn't work" on mobile.
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.content = (t === 'dark') ? '#1a0d26' : '#f4eff3';
  syncThemeButton();
  const sel = document.getElementById('acct-theme');
  if (sel) sel.value = t;
}
function syncThemeButton() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = isDark ? '☀️' : '🌙';
  btn.title = isDark ? 'Switch to light' : 'Switch to dark';
}

// Legal modal wiring is delegated on document.body and registered at
// load (see call below runAuthGate) rather than inside wireEvents(),
// because the Terms/Privacy links also live on the pre-sign-in auth
// overlay — wireEvents() doesn't run until boot(), which is gated
// behind sign-in, so those links would otherwise be dead.
function wireLegalModal() {
  document.body.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open-legal]');
    if (open) { e.preventDefault(); openLegalModal(open.dataset.openLegal); return; }
    const close = e.target.closest('[data-close-legal]');
    if (close) { document.getElementById('legal-modal').classList.add('hidden'); return; }
    const tab = e.target.closest('#legal-modal [data-legal-tab]');
    if (tab) { switchLegalTab(tab.dataset.legalTab); return; }
  });
}

function openLegalModal(which) {
  document.getElementById('legal-modal').classList.remove('hidden');
  switchLegalTab(which || 'terms');
}
function switchLegalTab(which) {
  document.querySelectorAll('#legal-modal [data-legal-tab]').forEach((t) =>
    t.classList.toggle('active', t.dataset.legalTab === which)
  );
  document.querySelectorAll('#legal-modal [data-legal-section]').forEach((s) =>
    s.classList.toggle('hidden', s.dataset.legalSection !== which)
  );
}

async function openAccountModal() {
  document.getElementById('acct-username').value = window.currentUser?.username ?? '';
  document.getElementById('acct-email').value    = window.currentUser?.email ?? '';
  await populateAddressFields();

  // Profile (bio + avatar) lives here now (item 9) so it's not buried in the
  // social tab. Populate from the My Crypt cache and reset the pending picker.
  if (state._myBio === undefined) { try { await loadMyProfileCache(); } catch { /* non-fatal */ } }
  state._acctAvatarBlob = null;
  document.getElementById('acct-bio').value = state._myBio || '';
  document.getElementById('acct-avatar').value = '';
  document.getElementById('acct-avatar-name').textContent = '';
  syncAcctAvatarPreview();
  syncUsernameCooldownHint();
  const themeSel = document.getElementById('acct-theme');
  if (themeSel) themeSel.value = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  // Admin tag in the modal header so it's obvious who you're signed in as.
  const heading = document.querySelector('#account-modal h2');
  if (heading) {
    heading.innerHTML = 'Your account' + (window.currentUser?.isAdmin
      ? ' <span class="role-tag">admin</span>' : '');
  }

  // Feedback summary: overall percent + per-category breakdown + a
  // "View your public profile" button that opens the same mini-profile
  // popover other collectors see.
  const fb = state.myFeedback || {};
  const total = fb.total_count ?? 0;
  const pct = fb.overall_percent;
  const pctTxt = total === 0 ? 'new' : (pct == null ? '—' : `${pct}%`);
  document.getElementById('acct-feedback').innerHTML = `
    <div class="fb-cell"><span class="fb-num">${pctTxt}</span><span class="fb-label">overall</span></div>
    <div class="fb-cell"><span class="fb-num">${total}</span><span class="fb-label">trades</span></div>
    <div class="fb-cell"><span class="fb-num fb-good">${(fb.comm_up ?? 0)}/${(fb.comm_up ?? 0) + (fb.comm_down ?? 0)}</span><span class="fb-label">comms</span></div>
    <div class="fb-cell"><span class="fb-num fb-good">${(fb.ship_up ?? 0)}/${(fb.ship_up ?? 0) + (fb.ship_down ?? 0)}</span><span class="fb-label">ship</span></div>
    <div class="fb-cell"><span class="fb-num fb-good">${(fb.acc_up ?? 0)}/${(fb.acc_up ?? 0) + (fb.acc_down ?? 0)}</span><span class="fb-label">item</span></div>
  `;

  // Collections list
  const myId = window.currentUser.id;
  document.getElementById('acct-collections').innerHTML = (data.memberships || []).map((m) => {
    const active = m.collection_id === data.collectionId;
    const isOwner = m.owner_id === myId;
    const tag = isOwner ? '<span class="role-tag">owner</span>' : '<span class="role-tag editor">member</span>';
    const dot = active ? '<span class="active-dot">●</span>' : '';
    return `
      <li>
        <span>${dot} ${escapeHtml(m.name)} ${tag}</span>
        ${active ? '<span class="dim">active</span>' : `<button class="btn-ghost" data-switch-cid="${m.collection_id}">Switch</button>`}
      </li>
    `;
  }).join('');

  document.getElementById('account-modal').classList.remove('hidden');
}

function closeAccountModal() {
  document.getElementById('account-modal').classList.add('hidden');
}

async function saveUsername() {
  const u = document.getElementById('acct-username').value.trim();
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(u)) {
    toast('Username must be 3–20 letters, numbers, _ or -.');
    return;
  }
  if (u === window.currentUser?.username) return;
  try {
    await data.updateUsername(u);
    document.querySelector('#user-badge .user-name').textContent = '@' + u;
    toast('Username updated.');
    syncUsernameCooldownHint();
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('username_cooldown') || msg.includes('once every 30 days')) {
      // Surface the next-allowed date the trigger reported, if present.
      const m = (err.message || '').match(/(\d{4}-\d{2}-\d{2})/);
      toast(m ? `You can change your username again on ${m[1]}.` : 'You can only change your username once every 30 days.');
      syncUsernameCooldownHint();
    } else if (msg.includes('duplicate') || msg.includes('unique')) {
      toast('That username is taken.');
    } else {
      toast('Could not update username.');
    }
  }
}

// Show "next change allowed on …" under the username field when inside the
// 30-day cooldown window, and disable the Save button until then.
async function syncUsernameCooldownHint() {
  const hint = document.getElementById('acct-username-cooldown');
  const saveBtn = document.getElementById('acct-save-username');
  if (!hint) return;
  let changedAt = null;
  try { changedAt = await data.getUsernameChangedAt(); } catch { /* non-fatal */ }
  const next = changedAt ? new Date(changedAt.getTime() + 30 * 864e5) : null;
  if (next && next > new Date()) {
    hint.textContent = `You can change your username again on ${next.toISOString().slice(0, 10)}.`;
    hint.classList.remove('hidden');
    if (saveBtn) saveBtn.disabled = true;
  } else {
    hint.textContent = '';
    hint.classList.add('hidden');
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function saveEmail() {
  const e = document.getElementById('acct-email').value.trim();
  if (!e || !e.includes('@')) { toast('Please enter a valid email.'); return; }
  if (e === window.currentUser?.email) return;
  try {
    await data.updateEmail(e);
    toast('Confirmation sent to ' + e + '. The change applies after you confirm.');
  } catch (err) {
    console.error(err);
    toast('Could not update email: ' + (err.message || 'unknown'));
  }
}

// ─── Default shipping address (structured + verified) ────────────────
const ADDR_FIELDS = {
  recipientName: 'acct-addr-name',
  line1: 'acct-addr-line1',
  line2: 'acct-addr-line2',
  city: 'acct-addr-city',
  region: 'acct-addr-region',
  postal: 'acct-addr-postal',
  country: 'acct-addr-country',
};

async function populateAddressFields() {
  let a;
  try { a = await data.getMyAddressFull(); }
  catch (err) { console.warn('getMyAddressFull', err); a = {}; }
  for (const [key, id] of Object.entries(ADDR_FIELDS)) {
    const el = document.getElementById(id);
    if (el) el.value = a[key] || '';
  }
  const badge = document.getElementById('acct-addr-verified');
  if (badge) badge.classList.toggle('hidden', !a.verified);
  const err = document.getElementById('acct-addr-error');
  if (err) { err.textContent = ''; err.classList.add('hidden'); }
}

function readAddressFields() {
  const out = {};
  for (const [key, id] of Object.entries(ADDR_FIELDS)) {
    out[key] = (document.getElementById(id)?.value || '').trim();
  }
  return out;
}

// Lightweight address verification. This is format-level validation +
// normalization (required fields, postal-code shape per country) — a clean
// seam where a real provider (USPS / Loqate / Google Address Validation)
// can drop in later behind the same call. Returns { ok, errors, normalized }.
function verifyAddress(a) {
  const errors = [];
  const norm = { ...a };
  // Country normalization: accept common US aliases.
  const c = (a.country || '').trim();
  if (/^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i.test(c)) norm.country = 'United States';
  if (!norm.line1) errors.push('Street address (line 1) is required.');
  if (!a.city) errors.push('City is required.');
  if (!a.region) errors.push('State / region is required.');
  if (!a.postal) errors.push('Postal code is required.');
  if (!norm.country) errors.push('Country is required.');
  // Postal-code shape check for the US (ZIP / ZIP+4); other countries: just
  // require something alphanumeric so we don't reject valid foreign formats.
  if (a.postal) {
    if (norm.country === 'United States') {
      if (!/^\d{5}(-\d{4})?$/.test(a.postal.trim())) errors.push('US ZIP must be 5 digits (or ZIP+4).');
      norm.region = a.region.trim().toUpperCase().slice(0, 20);
    } else if (!/[A-Za-z0-9]/.test(a.postal)) {
      errors.push('Postal code looks invalid.');
    }
  }
  return { ok: errors.length === 0, errors, normalized: norm };
}

async function saveDefaultAddress() {
  const raw = readAddressFields();
  const errEl = document.getElementById('acct-addr-error');
  const badge = document.getElementById('acct-addr-verified');
  const empty = Object.values(raw).every((v) => !v);
  if (empty) {
    // Clearing the whole address out is allowed.
    try {
      await data.setMyAddressFull(raw, { verified: false });
      if (badge) badge.classList.add('hidden');
      if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
      toast('Default address cleared.');
    } catch (err) { console.error(err); toast('Could not save address.'); }
    return;
  }
  const { ok, errors, normalized } = verifyAddress(raw);
  if (!ok) {
    if (errEl) { errEl.textContent = errors.join(' '); errEl.classList.remove('hidden'); }
    if (badge) badge.classList.add('hidden');
    toast('Please fix the address fields.');
    return;
  }
  try {
    await data.setMyAddressFull(normalized, { verified: true });
    // Reflect normalization back into the fields.
    for (const [key, id] of Object.entries(ADDR_FIELDS)) {
      const el = document.getElementById(id);
      if (el) el.value = normalized[key] || '';
    }
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    if (badge) badge.classList.remove('hidden');
    toast('Address verified & saved. ✓');
  } catch (err) {
    console.error(err);
    toast('Could not save address.');
  }
}

// Refresh the little avatar preview in the account modal from whatever's
// current — the just-picked blob if any, else the cached avatar URL.
function syncAcctAvatarPreview() {
  const el = document.getElementById('acct-avatar-preview');
  if (!el) return;
  const blobUrl = state._acctAvatarBlob ? URL.createObjectURL(state._acctAvatarBlob) : null;
  const url = blobUrl || state._myAvatarUrl;
  if (url) {
    el.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`;
    el.classList.remove('soc-avatar-fallback');
  } else {
    el.textContent = (window.currentUser?.username || '?').slice(0, 1).toUpperCase();
    el.classList.add('soc-avatar-fallback');
  }
}

async function saveAccountProfile() {
  const bio = document.getElementById('acct-bio').value.trim();
  try {
    await data.updateMyProfile({ bio, avatarBlob: state._acctAvatarBlob });
    state._acctAvatarBlob = null;
    document.getElementById('acct-avatar').value = '';
    document.getElementById('acct-avatar-name').textContent = '';
    await loadMyProfileCache();
    syncAcctAvatarPreview();
    toast('Profile updated.');
  } catch (err) {
    console.error('saveAccountProfile', err);
    toast('Could not save profile.');
  }
}

// Handle ?join=<token> in URL on boot — accept the invite and clean the URL.
async function handleJoinToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('join');
  if (!token) return;
  try {
    const collectionId = await data.acceptInvite(token);
    toast('You joined a new collection.');
    // Refresh memberships and switch in
    data.memberships = await data.listMyMemberships();
    await data.switchActiveCollection(collectionId);
  } catch (err) {
    console.error('join', err);
    const msg = err.message || '';
    if (msg.includes('expired')) toast('That invite expired.');
    else if (msg.includes('exhausted')) toast('That invite was already used.');
    else if (msg.includes('invalid')) toast('That invite link is invalid.');
    else toast('Could not accept invite.');
  } finally {
    // Always clean the token from the URL so it doesn't get redeemed on reload.
    params.delete('join');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }
}

// ─── Address exchange modal ──────────────────────────────────────────
let addressTradeId = null;
async function openAddressModal(tradeId) {
  addressTradeId = tradeId;
  const t = state.trades.find((x) => x.id === tradeId);
  const uid = window.currentUser.id;
  const otherName = t.proposer_id === uid ? t.recipient?.username : t.proposer?.username;
  const otherId   = t.proposer_id === uid ? t.recipient_id : t.proposer_id;
  document.getElementById('address-sub').innerHTML = `Trade with ${repBadge(otherId, otherName, state.partnerFeedback.get(otherId))}`;
  document.getElementById('address-input').value = '';
  document.getElementById('address-their').classList.add('hidden');
  document.getElementById('address-pending').classList.add('hidden');

  const addrs = await data.getAddresses(tradeId);
  const mine = addrs.find((a) => a.user_id === uid);
  const other = addrs.find((a) => a.user_id !== uid);
  if (mine) {
    document.getElementById('address-input').value = mine.address;
  } else {
    // Fall back to the user's saved default address from their account.
    const def = await data.getMyAddress();
    if (def) document.getElementById('address-input').value = def;
  }

  if (mine && other) {
    const el = document.getElementById('address-their');
    el.innerHTML = `<h3>Their address (ship here)</h3><pre>${escapeHtml(other.address)}</pre>`;
    el.classList.remove('hidden');
  } else if (mine) {
    document.getElementById('address-pending').classList.remove('hidden');
  }
  document.getElementById('address-modal').classList.remove('hidden');
}

function closeAddressModal() {
  document.getElementById('address-modal').classList.add('hidden');
  addressTradeId = null;
}

async function saveAddress() {
  if (!addressTradeId) return;
  const value = document.getElementById('address-input').value.trim();
  if (!value) { toast('Please enter an address.'); return; }
  try {
    await data.setAddress(addressTradeId, value);
    toast('Address saved.');
    // Reopen with updated state (will reveal partner's address if both now set)
    await openAddressModal(addressTradeId);
  } catch (err) {
    console.error(err);
    toast('Could not save address.');
  }
}

// ─── Admin ───────────────────────────────────────────────────────────
async function loadAdminUsers() {
  if (!window.currentUser?.isAdmin) return;
  try {
    state.adminUsers = await data.adminListUsers();
    // Also surface counts on the Tools strip badges. Non-fatal if any
    // of these fails — the queues still open from their buttons.
    const [disp, cats, photos] = await Promise.allSettled([
      data.adminListDisputes(),
      data.adminListCatalogPending(),
      data.adminListPhotoSuggestions('pending'),
    ]);
    if (disp.status === 'fulfilled') state.adminOpenDisputes = disp.value;
    if (cats.status === 'fulfilled') state.adminPendingCatalog = cats.value;
    if (photos.status === 'fulfilled') state.adminPendingPhotos = photos.value;
  } catch (err) {
    console.error('adminListUsers', err);
    toast('Could not load users.');
  }
}

function renderAdmin() {
  if (!window.currentUser?.isAdmin) {
    document.getElementById('admin-content').innerHTML = '<p class="dim">Not an admin.</p>';
    return;
  }
  if (state.adminUserView) {
    renderAdminUserView();
  } else {
    renderAdminUserList();
  }
}

function renderAdminUserList() {
  const rows = state.adminUsers.map((u) => {
    const f = u.feedback || { good_count: 0, meh_count: 0, bad_count: 0, net_score: 0, total_count: 0 };
    const me = u.id === window.currentUser.id;
    return `
      <tr data-uid="${u.id}" class="admin-row">
        <td><strong>@${escapeHtml(u.username)}</strong>${me ? ' <span class="dim">(you)</span>' : ''}${u.is_admin ? ' <span class="role-tag">admin</span>' : ''}</td>
        <td class="dim">${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</td>
        <td><span class="fb-num fb-good">${f.good_count}</span> · <span class="fb-num fb-meh">${f.meh_count}</span> · <span class="fb-num fb-bad">${f.bad_count}</span></td>
        <td>${f.net_score}</td>
        <td><button data-admin-action="open" data-uid="${u.id}">Inspect →</button></td>
      </tr>
    `;
  }).join('');
  const pendingCustomBadge = (state.adminPendingCatalog || []).length
    ? `<span class="badge badge-form">${state.adminPendingCatalog.length} pending</span>` : '';
  const pendingPhotoBadge = (state.adminPendingPhotos || []).length
    ? `<span class="badge badge-form">${state.adminPendingPhotos.length} pending</span>` : '';
  document.getElementById('admin-content').innerHTML = `
    <section class="admin-tools">
      <h2 class="trader-head"><span>Tools</span></h2>

      <div class="admin-tool">
        <div>
          <strong>Add a catalog item</strong>
          <p class="dim">Create an admin-curated entry for an off-catalog or form-variant plushie (the Overthinking Bunny Original case). Approved immediately, shows up in the Catalog tab next to live Shopify items.</p>
        </div>
        <button class="btn-primary" data-admin-action="new-catalog-item">Create</button>
      </div>

      <div class="admin-tool">
        <div>
          <strong>Pending catalog submissions ${pendingCustomBadge}</strong>
          <p class="dim">User-submitted catalog items waiting for review.</p>
        </div>
        <button data-admin-action="review-catalog-pending">Review</button>
      </div>

      <div class="admin-tool">
        <div>
          <strong>Trade disputes ${(state.adminOpenDisputes || []).length ? `<span class="badge badge-form">${state.adminOpenDisputes.length} open</span>` : ''}</strong>
          <p class="dim">Trades where one party requested fall-through and the other disputed. Review both statements and resolve.</p>
        </div>
        <button data-admin-action="review-disputes">Review</button>
      </div>

      <div class="admin-tool">
        <div>
          <strong>Photo suggestions ${pendingPhotoBadge}</strong>
          <p class="dim">Collectors' photo proposals for items missing an image. Approve to set the catalog item's photo.</p>
        </div>
        <button data-admin-action="review-photo-suggestions">Review</button>
      </div>

      <div class="admin-tool">
        <div>
          <strong>Re-snapshot hot-linked catalog photos</strong>
          <p class="dim">Scans plushies + wishlist for rows whose photo is still a Shopify CDN URL, fetches each through the image proxy, uploads to Storage, and rewrites the path.</p>
        </div>
        <button class="btn-primary" data-admin-action="backfill-photos" id="admin-backfill-btn">Start</button>
      </div>
      <div id="admin-backfill-log" class="admin-backfill-log hidden"></div>
    </section>
    <h2 class="trader-head"><span>Users</span></h2>
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Joined</th><th>Feedback (g/m/b)</th><th>Net</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function onTogglePhotoUploadsForUser(e) {
  const cb = e.target;
  const userId = cb.dataset.userId;
  const next = cb.checked;
  cb.disabled = true;
  try {
    await data.adminSetPhotoUploads(userId, next);
    // Reflect the change locally so the surrounding UI updates without
    // a full admin re-fetch.
    const u = state.adminUsers.find((x) => x.id === userId);
    if (u) u.photo_uploads_enabled = next;
    if (state.adminUserView?.user?.id === userId) {
      state.adminUserView.user.photo_uploads_enabled = next;
    }
    // If admin toggled their own account, update the live currentUser
    // shadow so the catalog/pens views re-gate buttons correctly.
    if (userId === window.currentUser?.id) {
      window.currentUser.photoUploadsEnabled = next;
      applyFeatureFlags();
      if (state.tab === 'catalog') render();
    }
    toast(next ? 'Photo uploads enabled for this user.' : 'Photo uploads disabled for this user.');
  } catch (err) {
    console.error(err);
    cb.checked = !next;
    toast('Could not save: ' + (err.message || err));
  } finally {
    cb.disabled = false;
  }
}

function renderAdminUserView() {
  const { user, snapshot } = state.adminUserView;
  const renderItemRow = (it, kind) => {
    const src = it.photo || catalogImageFor(it.catalogId);
    const photo = src ? `<img src="${escapeHtml(src)}" alt="" />` : `<span class="no-photo">🖤</span>`;
    return `
      <article class="card">
        <div class="card-photo">${photo}</div>
        <div class="card-body">
          <h3 class="card-name">${escapeHtml(it.nickname || stripOutfitWord(it.name))}</h3>
          ${it.nickname ? `<p class="card-product">${escapeHtml(stripOutfitWord(it.name))}</p>` : ''}
          ${it.meaning ? `<p class="card-meaning">${escapeHtml(it.meaning)}</p>` : ''}
          <div class="card-meta">
            ${kind === 'collection' && it.dateCollected ? `<span>${formatDate(it.dateCollected)}</span>` : ''}
            ${kind === 'collection' && it.acquiredHow ? `<span>${escapeHtml(it.acquiredHow)}</span>` : ''}
            ${kind === 'collection' && (it.quantity || 1) > 1 ? `<span>×${it.quantity}</span>` : ''}
            ${kind === 'wishlist' && it.outOfStock ? `<span class="meta-warn">Out of stock</span>` : ''}
          </div>
        </div>
        ${kind === 'wishlist' ? `<div class="card-actions">
          <button class="btn-danger" data-admin-action="del-wish" data-id="${it.id}">Delete</button>
        </div>` : ''}
      </article>
    `;
  };

  const f = snapshot.feedback || {};
  const tradesHtml = snapshot.trades.slice(0, 30).map((t) => {
    const them = t.proposer_id === user.id ? t.recipient?.username : t.proposer?.username;
    const direction = t.proposer_id === user.id ? '→' : '←';
    const lines = (t.trade_line_items || []).map((l) =>
      `${l.quantity}× ${escapeHtml(l.trade_item?.name ?? 'item')} (${l.side})`
    ).join(', ');
    return `<li><strong>${direction} @${escapeHtml(them || '?')}</strong> · ${escapeHtml(t.status)} · <span class="dim">${new Date(t.created_at).toLocaleDateString()}</span><br/><span class="dim">${lines}</span>${t.message ? `<br/><em>"${escapeHtml(t.message)}"</em>` : ''}</li>`;
  }).join('');

  document.getElementById('admin-content').innerHTML = `
    <div class="admin-back">
      <button data-admin-action="back">← Back to users</button>
    </div>
    <h2 class="trader-head"><span>@${escapeHtml(user.username)}</span>
      <span class="dim">${snapshot.collection?.name ?? '(no collection)'}</span>
    </h2>
    <div class="feedback-summary">
      <div class="fb-cell"><span class="fb-num fb-good">${f.good_count || 0}</span><span class="fb-label">good</span></div>
      <div class="fb-cell"><span class="fb-num fb-meh">${f.meh_count || 0}</span><span class="fb-label">meh</span></div>
      <div class="fb-cell"><span class="fb-num fb-bad">${f.bad_count || 0}</span><span class="fb-label">bad</span></div>
      <div class="fb-cell"><span class="fb-num">${f.net_score || 0}</span><span class="fb-label">net</span></div>
      <div class="fb-cell"><span class="fb-num">${f.total_count || 0}</span><span class="fb-label">total</span></div>
    </div>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Permissions</span></h3>
      <div class="admin-tool">
        <div>
          <strong>Photo uploads</strong>
          <p class="dim">Lets this user contribute photos: 🤍 suggest-a-photo on catalog cards + pens, and the "Suggest a plushie" form. Admins are always allowed regardless of this setting.</p>
        </div>
        <label class="checkbox" style="white-space:nowrap;">
          <input type="checkbox" data-admin-toggle="photo-uploads" data-user-id="${user.id}" ${user.photo_uploads_enabled === true ? 'checked' : ''} ${user.is_admin ? 'disabled title="Admins always allowed"' : ''} />
          <span>${user.is_admin ? 'Always on (admin)' : (user.photo_uploads_enabled === true ? 'Enabled' : 'Disabled')}</span>
        </label>
      </div>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Collection (${snapshot.plushies.length})</span><span class="dim">read-only</span></h3>
      <div class="grid grid-list">${snapshot.plushies.map((i) => renderItemRow(i, 'collection')).join('')}</div>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Wish list (${snapshot.wishlist.length})</span><span class="dim">deletable</span></h3>
      <div class="grid grid-list">${snapshot.wishlist.map((i) => renderItemRow(i, 'wishlist')).join('')}</div>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Trade items (${snapshot.tradeItems.length})</span></h3>
      <ul class="member-list">
        ${snapshot.tradeItems.map((ti) => `<li><span>${ti.kind === 'offering' ? '↻' : '↺'} ${escapeHtml(ti.name)} · ${ti.kind} · qty ${ti.quantity} (${ti.reserved} reserved)</span></li>`).join('') || '<li class="dim">none</li>'}
      </ul>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Trades (${snapshot.trades.length})</span></h3>
      <ul class="member-list">${tradesHtml || '<li class="dim">no trades</li>'}</ul>
    </section>

    <section class="admin-danger">
      <h3 class="trader-head"><span>Danger zone</span></h3>
      <p class="dim">Purging an account cascades through every table the user touches —
        profile, collections, wishlist, pens, trade items, trades, feedback, addresses,
        consent log, and uploaded photos. <strong>Irreversible.</strong></p>
      <button class="btn-danger admin-purge-btn" data-admin-action="purge-user"
        data-uid="${user.id}" data-username="${escapeHtml(user.username)}">
        Delete @${escapeHtml(user.username)}'s account
      </button>
    </section>
  `;
  document.querySelector('[data-admin-toggle="photo-uploads"]')
    ?.addEventListener('change', onTogglePhotoUploadsForUser);
}

async function onAdminClick(e) {
  const btn = e.target.closest('[data-admin-action]');
  if (!btn) return;
  const action = btn.dataset.adminAction;
  if (action === 'open') {
    const uid = btn.dataset.uid;
    const user = state.adminUsers.find((u) => u.id === uid);
    if (!user) return;
    document.getElementById('admin-content').innerHTML = '<p class="dim">Loading…</p>';
    try {
      const snapshot = await data.adminUserSnapshot(uid);
      state.adminUserView = { user, snapshot };
      renderAdmin();
    } catch (err) {
      console.error(err);
      toast('Could not load user.');
    }
  } else if (action === 'back') {
    state.adminUserView = null;
    renderAdmin();
  } else if (action === 'del-wish') {
    // Typed-username guard. Modifying another user's data is rare and
    // potentially confusing — make the admin spell it out.
    const username = state.adminUserView?.user?.username || '';
    const ok = await confirmTypingUsername({
      title: `Delete this wishlist entry?`,
      body: `You're about to delete a wish list entry on behalf of <strong>@${escapeHtml(username)}</strong>.<br/>Type their username to confirm.`,
      expected: username,
      confirmLabel: 'Delete entry',
    });
    if (!ok) return;
    try {
      await data.adminDeleteWishlist(btn.dataset.id);
      const uid = state.adminUserView.user.id;
      state.adminUserView.snapshot = await data.adminUserSnapshot(uid);
      renderAdmin();
      toast('Removed.');
    } catch (err) {
      console.error(err);
      toast('Could not delete.');
    }
  } else if (action === 'purge-user') {
    const uid = btn.dataset.uid;
    const username = btn.dataset.username;
    const ok = await confirmTypingUsername({
      title: 'Purge this account?',
      body: `This will permanently delete <strong>@${escapeHtml(username)}</strong>'s account and every row tied to it — collection, wish list, pens, trade items, trades, feedback, addresses, photos, and the auth row. <strong>Irreversible.</strong><br/><br/>Type the username to confirm.`,
      expected: username,
      confirmLabel: 'Purge account',
      danger: true,
    });
    if (!ok) return;
    try {
      await data.adminPurgeUser(uid);
      toast(`@${username} purged.`);
      // Refresh the user list and return to it.
      state.adminUserView = null;
      await loadAdminUsers();
      renderAdmin();
    } catch (err) {
      console.error(err);
      toast('Purge failed: ' + (err.message || err));
    }
  } else if (action === 'backfill-photos') {
    await adminBackfillPhotos();
  } else if (action === 'new-catalog-item') {
    openCatalogItemModal('admin');
  } else if (action === 'review-catalog-pending') {
    await openCatalogPendingModal();
  } else if (action === 'review-photo-suggestions') {
    await openPhotoSuggestionsModal();
  } else if (action === 'review-disputes') {
    await openDisputesModal();
  } else if (action === 'open-dispute-detail') {
    openDisputeDetailModal(btn.dataset.id);
  } else if (action === 'resolve-dispute') {
    await adminResolveDispute(btn.dataset.id, btn.dataset.outcome);
  } else if (action === 'approve-catalog-item') {
    await adminApproveCatalogItem(btn.dataset.id);
  } else if (action === 'reject-catalog-item') {
    await adminRejectCatalogItem(btn.dataset.id);
  } else if (action === 'merge-catalog-item') {
    openCatalogMergeModal(btn.dataset.id, btn.dataset.handle);
  } else if (action === 'approve-photo-suggestion') {
    await adminApprovePhotoSuggestion(btn.dataset.id);
  } else if (action === 'reject-photo-suggestion') {
    await adminRejectPhotoSuggestion(btn.dataset.id);
  }
}

// Re-snapshot every plushie + wishlist row whose photo_path is still a
// Shopify CDN URL (i.e., the original snapshot at add-time failed CORS
// and we fell back to hot-linking). For each row: fetch through the
// img-proxy Worker, downscale + re-encode via compressImage, upload to
// Storage under the row's collection folder, and rewrite photo_path
// to the new UUID path. Reports progress in #admin-backfill-log.
async function adminBackfillPhotos() {
  const btn = document.getElementById('admin-backfill-btn');
  const log = document.getElementById('admin-backfill-log');
  if (!window.IMG_PROXY_BASE) {
    toast('Set window.IMG_PROXY_BASE in config.js first (Worker URL).');
    return;
  }
  if (!confirm('Re-snapshot every hot-linked photo across all users? This can take a while on a large site.')) return;
  btn.disabled = true;
  btn.textContent = 'Working…';
  log.classList.remove('hidden');
  log.innerHTML = '<p class="dim">Loading hot-linked rows…</p>';
  let rows;
  try {
    rows = await data.adminListHotlinkedPhotos();
  } catch (err) {
    console.error(err);
    log.innerHTML = `<p class="dim">Couldn't list rows: ${escapeHtml(err.message || String(err))}</p>`;
    btn.disabled = false;
    btn.textContent = 'Start';
    return;
  }
  if (rows.length === 0) {
    log.innerHTML = '<p class="dim">Nothing to do — every photo is already snapshotted.</p>';
    btn.disabled = false;
    btn.textContent = 'Start';
    return;
  }
  const lines = [`<p class="dim">${rows.length} row${rows.length === 1 ? '' : 's'} to process.</p><ul class="admin-backfill-list">`];
  log.innerHTML = lines.join('') + '</ul>';
  let ok = 0, skip = 0, fail = 0;
  const list = log.querySelector('.admin-backfill-list');
  for (const row of rows) {
    const liId = `bf-${row.id}`;
    list.insertAdjacentHTML('beforeend', `<li id="${liId}"><span class="dim">⏳</span> ${escapeHtml(row.name)}</li>`);
    const li = document.getElementById(liId);
    try {
      const url = row.photo_path;
      if (!/^https:\/\/cdn\.shopify\.com\//.test(url)) {
        li.innerHTML = `<span class="dim">⊘ (non-Shopify URL, skipped)</span> ${escapeHtml(row.name)}`;
        skip++;
        continue;
      }
      const proxied = proxyImageUrl(url, 800);
      const resp = await fetch(proxied, { mode: 'cors' });
      if (!resp.ok) throw new Error(`fetch ${resp.status}`);
      const blob = await resp.blob();
      const compressed = await compressImage(blob).catch(() => blob);
      const path = await data.adminUploadPhoto(compressed, row.collection_id, row.id);
      await data.adminUpdatePhotoPath(row.kind, row.id, path);
      li.innerHTML = `<span class="ok">✓</span> ${escapeHtml(row.name)} <span class="dim">→ ${escapeHtml(path)}</span>`;
      ok++;
    } catch (err) {
      console.warn('backfill failed', row.id, err);
      li.innerHTML = `<span class="err">✗</span> ${escapeHtml(row.name)} <span class="dim">${escapeHtml(err.message || String(err))}</span>`;
      fail++;
    }
  }
  list.insertAdjacentHTML('afterend', `<p class="dim">Done — ${ok} snapshotted, ${skip} skipped, ${fail} failed.</p>`);
  btn.disabled = false;
  btn.textContent = 'Start';
}

// ─── Admin: dispute review ────────────────────────────────────────

async function openDisputesModal() {
  const body = document.getElementById('aq-body');
  document.getElementById('aq-title').textContent = 'Open trade disputes';
  body.innerHTML = '<p class="dim">Loading…</p>';
  document.getElementById('admin-queue-modal').classList.remove('hidden');
  try {
    const rows = await data.adminListDisputes();
    state.adminOpenDisputes = rows;
    if (rows.length === 0) {
      body.innerHTML = '<p class="dim">No open disputes. ✨</p>';
      return;
    }
    body.innerHTML = rows.map(renderDisputeRow).join('');
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="dim">Couldn't load: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function renderDisputeRow(t) {
  const hasProp = !!t.dispute_proposer_statement;
  const hasRec  = !!t.dispute_recipient_statement;
  const bothFiled = hasProp && hasRec;
  return `
    <article class="catalog-pending-row">
      <div class="catalog-pending-body">
        <h3>@${escapeHtml(t.proposer?.username || '?')} ⇄ @${escapeHtml(t.recipient?.username || '?')}</h3>
        <p class="dim">Opened by ${t.dispute_opened_by === t.proposer_id ? '@' + escapeHtml(t.proposer?.username || '?') : '@' + escapeHtml(t.recipient?.username || '?')}
          · ${new Date(t.dispute_opened_at).toLocaleString()}</p>
        <p class="dim">Statements: proposer ${hasProp ? '✓' : '⏳ pending'} · recipient ${hasRec ? '✓' : '⏳ pending'}</p>
        ${bothFiled
          ? `<button class="btn-primary" data-admin-action="open-dispute-detail" data-id="${t.id}">Review →</button>`
          : '<p class="dim">Waiting for both statements before review.</p>'}
      </div>
    </article>
  `;
}

function openDisputeDetailModal(tradeId) {
  const t = (state.adminOpenDisputes || []).find((x) => x.id === tradeId);
  if (!t) return;
  const body = document.getElementById('dr-body');
  document.getElementById('dr-title').textContent = `Dispute: @${t.proposer?.username || '?'} ⇄ @${t.recipient?.username || '?'}`;
  const lines = t.trade_line_items || [];
  const proposerLines = lines.filter((l) => l.side === 'proposer').map((l) => `${l.quantity}× ${escapeHtml(l.trade_item?.name || '?')}`).join(', ');
  const recipientLines = lines.filter((l) => l.side === 'recipient').map((l) => `${l.quantity}× ${escapeHtml(l.trade_item?.name || '?')}`).join(', ');
  body.innerHTML = `
    <p class="dim">Trade originated ${new Date(t.created_at).toLocaleString()} · accepted ${t.responded_at ? new Date(t.responded_at).toLocaleString() : '?'}</p>
    <p><strong>Proposer gave:</strong> ${proposerLines || '<em>nothing</em>'}</p>
    <p><strong>Recipient gave:</strong> ${recipientLines || '<em>nothing</em>'}</p>
    <p class="dim">Shipped: proposer ${t.proposer_shipped_at ? new Date(t.proposer_shipped_at).toLocaleString() : '—'}
       · recipient ${t.recipient_shipped_at ? new Date(t.recipient_shipped_at).toLocaleString() : '—'}</p>
    <p class="dim">Received: proposer ${t.proposer_received_at ? new Date(t.proposer_received_at).toLocaleString() : '—'}
       · recipient ${t.recipient_received_at ? new Date(t.recipient_received_at).toLocaleString() : '—'}</p>

    <h3 class="trader-head"><span>@${escapeHtml(t.proposer?.username || '?')} says</span></h3>
    <div class="dispute-statement-box">${t.dispute_proposer_statement ? escapeHtml(t.dispute_proposer_statement).replace(/\n/g, '<br/>') : '<em class="dim">no statement filed</em>'}</div>

    <h3 class="trader-head"><span>@${escapeHtml(t.recipient?.username || '?')} says</span></h3>
    <div class="dispute-statement-box">${t.dispute_recipient_statement ? escapeHtml(t.dispute_recipient_statement).replace(/\n/g, '<br/>') : '<em class="dim">no statement filed</em>'}</div>

    <h3 class="trader-head"><span>Resolution</span></h3>
    <label class="field">
      <span>Admin notes <em class="dim">— optional, visible only to admin</em></span>
      <textarea id="dr-notes" rows="3" maxlength="2000"></textarea>
    </label>
    <div class="form-actions">
      <button class="btn-ghost" data-admin-action="resolve-dispute" data-id="${t.id}" data-outcome="restored">Restore — trade is still on</button>
      <button class="btn-primary" data-admin-action="resolve-dispute" data-id="${t.id}" data-outcome="completed">Force complete</button>
      <button class="btn-danger admin-purge-btn" data-admin-action="resolve-dispute" data-id="${t.id}" data-outcome="cancelled">Cancel trade</button>
    </div>
  `;
  document.getElementById('dispute-review-modal').classList.remove('hidden');
}

async function adminResolveDispute(tradeId, outcome) {
  const labels = {
    cancelled: 'Cancel the trade (release reservations)',
    restored: 'Restore the trade (it keeps going)',
    completed: 'Force the trade complete',
  };
  if (!confirm(`${labels[outcome]}?`)) return;
  const notes = (document.getElementById('dr-notes')?.value || '').trim();
  try {
    await data.adminResolveDispute(tradeId, outcome, notes);
    toast('Dispute resolved.');
    document.getElementById('dispute-review-modal').classList.add('hidden');
    await openDisputesModal();
  } catch (err) {
    console.error(err);
    toast('Could not resolve: ' + (err.message || err));
  }
}

// ─── Catalog item: admin create + queues + suggest-photo flow ────

// Opens the catalog-item modal in one of three modes:
//   'admin' — new item, auto-approved, admins get the 'pick from
//             a user's collection' photo source tab.
//   'user'  — new item, end-user submission, status decided by
//             trust check, upload-only photo source.
//   'edit'  — admin edits an existing custom catalog item. Pass the
//             row id as the second arg. Photo upload is optional —
//             leaving the file input blank keeps the current image.
function openCatalogItemModal(mode = 'admin', editId = null) {
  if (mode === 'user' && !data.featureEnabled('feature.user_photo_uploads')) {
    toast('Plushie submissions are paused right now.');
    return;
  }
  state.catalogItemModalMode = mode;
  state.catalogItemEditId = mode === 'edit' ? editId : null;
  document.getElementById('catalog-item-form').reset();
  document.getElementById('ci-photo-preview-wrap').innerHTML = '';
  document.getElementById('ci-error').classList.add('hidden');
  state.catalogItemPicked = null;

  const isAdmin = mode === 'admin' || mode === 'edit';
  const isEdit = mode === 'edit';
  document.getElementById('ci-title').textContent = isEdit
    ? 'Edit catalog item'
    : (isAdmin ? 'Create catalog item' : 'Suggest a plushie');
  document.getElementById('ci-subtitle').textContent = isEdit
    ? 'Updates the public catalog row immediately.'
    : (isAdmin
      ? 'Approved immediately; appears in the Catalog tab right after save.'
      : 'Goes to the catalog team for review — they may edit the entry before approving.');
  document.getElementById('ci-submit').textContent = isEdit ? 'Save' : (isAdmin ? 'Create' : 'Submit');

  // Admins get the source-picker tabs (Upload / Pick from user). Users
  // only see the Upload field. Edit mode keeps the picker too in case
  // the admin wants to swap the photo for one from a user's collection.
  const tabs = document.getElementById('ci-photo-source-tabs');
  tabs.classList.toggle('hidden', !isAdmin);
  tabs.style.display = isAdmin ? 'flex' : 'none';
  setSourceTab('upload');

  if (isEdit) {
    const row = state.catalog.find((c) => c.id === editId);
    if (!row || !row.isCustom) {
      toast('Catalog item not found.');
      return;
    }
    document.getElementById('ci-name').value = row.name || '';
    document.getElementById('ci-form-label').value = row.formLabel || '';
    document.getElementById('ci-parent-handle').value = row.parentHandle || '';
    document.getElementById('ci-type').value = row.type || 'plush';
    document.getElementById('ci-handle').value = row.handle || '';
    document.getElementById('ci-release-year').value = row.releaseYear ?? '';
    document.getElementById('ci-tags').value = (row.tags || []).join(', ');
    document.getElementById('ci-lore').value = row.lore || '';
    document.getElementById('ci-accessories').value = (row.accessories || [])
      .map((a) => a.name || a).join('\n');
    document.getElementById('ci-notes').value = '';
    if (row.image) {
      document.getElementById('ci-photo-preview-wrap').innerHTML =
        `<span class="dim">Current photo kept unless you upload a new one.</span>`;
    }
  }

  document.getElementById('catalog-item-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('ci-name').focus(), 50);
}

function setSourceTab(which) {
  document.querySelectorAll('.ci-source-tab').forEach((b) =>
    b.classList.toggle('active', b.dataset.ciSource === which)
  );
  document.getElementById('ci-source-upload').classList.toggle('hidden', which !== 'upload');
  document.getElementById('ci-source-pick').classList.toggle('hidden', which !== 'pick');
  if (which === 'pick') setTimeout(() => document.getElementById('ci-pick-user').focus(), 50);
}

// Picker autocomplete: type a username, see matching profiles, click
// one to load their plushies. Click a plushie thumbnail to set it as
// the source. The actual image copy happens in submitCatalogItemForm.
async function onPickUserInput(e) {
  const q = e.target.value.trim();
  const userList = document.getElementById('ci-pick-user-list');
  if (q.length < 2) { userList.innerHTML = ''; return; }
  try {
    const users = await data.adminFindUsersByPrefix(q);
    userList.innerHTML = users.map((u) =>
      `<button type="button" class="ci-user-row" data-pick-uid="${u.id}" data-pick-username="${escapeHtml(u.username)}">@${escapeHtml(u.username)}</button>`
    ).join('');
  } catch (err) {
    console.error(err);
    userList.innerHTML = `<p class="dim">Search failed.</p>`;
  }
}

async function onPickUserSelect(userId, username) {
  document.getElementById('ci-pick-user').value = '@' + username;
  document.getElementById('ci-pick-user-list').innerHTML = '';
  const plushiesList = document.getElementById('ci-pick-plushie-list');
  plushiesList.innerHTML = '<p class="dim">Loading…</p>';
  try {
    const plushies = await data.adminListUserPlushies(userId);
    if (plushies.length === 0) {
      plushiesList.innerHTML = '<p class="dim">No plushies in this user\'s collection.</p>';
      return;
    }
    // Resolve photo URLs in parallel.
    const withUrls = await Promise.all(plushies.map(async (p) => {
      const url = p.photo_path ? await data.photoUrl(p.photo_path) : null;
      return { ...p, url };
    }));
    plushiesList.innerHTML = withUrls.map((p) => `
      <button type="button" class="ci-plushie-tile" data-pick-photo-path="${escapeHtml(p.photo_path || '')}" data-pick-name="${escapeHtml(p.nickname || p.name)}">
        ${p.url ? `<img src="${escapeHtml(p.url)}" alt="" />` : '<span class="no-photo">🖤</span>'}
        <span>${escapeHtml(p.nickname || p.name)}</span>
      </button>
    `).join('');
  } catch (err) {
    console.error(err);
    plushiesList.innerHTML = `<p class="dim">Couldn't load: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function onPickPlushieSelect(photoPath, displayName) {
  if (!photoPath) {
    document.getElementById('ci-pick-selected').textContent = 'That plushie has no stored photo to copy.';
    return;
  }
  state.catalogItemPicked = { photoPath };
  document.getElementById('ci-pick-selected').innerHTML = `<strong>Picked:</strong> ${escapeHtml(displayName)} <span class="dim">— will be copied as the catalog photo on save.</span>`;
}

// Slugify a name into a URL-safe handle. Mirrors what Shopify would
// produce so the admin doesn't have to think about it.
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function submitCatalogItemForm(e) {
  e.preventDefault();
  const errEl = document.getElementById('ci-error');
  errEl.classList.add('hidden');
  const name = document.getElementById('ci-name').value.trim();
  if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.remove('hidden'); return; }
  const formLabel = document.getElementById('ci-form-label').value.trim() || null;
  const parentHandle = document.getElementById('ci-parent-handle').value.trim() || null;
  const type = document.getElementById('ci-type').value;
  const handle = document.getElementById('ci-handle').value.trim() || slugify(name);
  const releaseYearRaw = (document.getElementById('ci-release-year')?.value || '').trim();
  const releaseYear = releaseYearRaw ? parseInt(releaseYearRaw, 10) : null;
  if (releaseYear !== null && (Number.isNaN(releaseYear) || releaseYear < 1900 || releaseYear > 2100)) {
    errEl.textContent = 'Release year must be between 1900 and 2100.';
    errEl.classList.remove('hidden');
    return;
  }
  const tags = (document.getElementById('ci-tags').value || '')
    .split(',').map((t) => t.trim()).filter(Boolean);
  const lore = document.getElementById('ci-lore').value.trim() || null;
  const notes = (document.getElementById('ci-notes')?.value || '').trim() || null;
  // Parse one accessory per non-empty line. Each carries a display
  // name + lowercase key — same shape the body_html parser produces
  // for Shopify items, so the collection-row checklist treats both
  // sources identically (resolveCatalogItem variants inherit either
  // way).
  const accessories = (document.getElementById('ci-accessories')?.value || '')
    .split('\n')
    .map((s) => canonicalizeAccessoryName(s))
    .filter(Boolean)
    .map((name) => ({ name, key: name.toLowerCase() }));
  const photoFile = document.getElementById('ci-photo').files[0] || null;
  const mode = state.catalogItemModalMode || 'admin';
  const isEdit = mode === 'edit';
  const isAdmin = mode === 'admin' || isEdit;

  const submit = document.getElementById('ci-submit');
  submit.disabled = true;
  submit.textContent = 'Working…';
  try {
    let imagePath = null;
    if (isAdmin && state.catalogItemPicked?.photoPath) {
      // Admin chose 'Pick from a user's collection' → copy the source
      // photo through to the catalog bucket (admin-only writes).
      imagePath = await data.adminCopyPhotoToCatalog(state.catalogItemPicked.photoPath, handle);
    } else if (photoFile) {
      const compressed = await compressImage(photoFile).catch(() => photoFile);
      imagePath = await data.uploadCatalogImage(compressed, handle);
    }

    if (isEdit) {
      const patch = {
        name,
        handle,
        type,
        parent_handle: parentHandle,
        form_label: formLabel,
        lore,
        tags,
        accessories,
        release_year: releaseYear,
      };
      // Only overwrite image_path when the admin uploaded or picked
      // a new photo — otherwise the existing one is preserved.
      if (imagePath) patch.image_path = imagePath;
      await data.adminUpdateCatalogItem(state.catalogItemEditId, patch);
      toast('Catalog item updated.');
    } else {
      // Admin-created items go straight to 'approved'. User submissions
      // let data.createCatalogItem resolve status via userIsTrustedSubmitter().
      await data.createCatalogItem({
        name,
        handle,
        type,
        parent_handle: parentHandle,
        form_label: formLabel,
        image_path: imagePath,
        lore,
        tags,
        accessories,
        release_year: releaseYear,
        notes_to_admin: notes,
        status: isAdmin ? 'approved' : undefined,
      });
      toast(isAdmin ? 'Catalog item created.' : 'Submitted to admin for review. Thanks!');
    }
    document.getElementById('catalog-item-modal').classList.add('hidden');
    await loadCatalog();
    if (state.tab === 'catalog') render();
  } catch (err) {
    console.error(err);
    errEl.textContent = err.message || 'Could not submit.';
    errEl.classList.remove('hidden');
  } finally {
    submit.disabled = false;
    submit.textContent = isEdit ? 'Save' : (isAdmin ? 'Create' : 'Submit');
  }
}

// "Do you have this picture?" — opens for catalog cards that have no
// image. We carry the target's id + kind on the button dataset so the
// row we insert points to the right place.
// Dispute statement modal — opened both for the side that initiates
// the dispute (mode='open') and for the side filing their reply
// later (mode='add'). The trade row carries everything we need.
function openDisputeStatementModal(tradeId, mode) {
  const t = state.trades.find((x) => x.id === tradeId);
  if (!t) return;
  state.disputeDraft = { tradeId, mode };
  const partnerName = t.proposer_id === window.currentUser.id
    ? (t.recipient?.username || 'partner')
    : (t.proposer?.username || 'partner');
  document.getElementById('ds-title').textContent =
    mode === 'open' ? 'Dispute and tell us what happened' : 'File your dispute statement';
  document.getElementById('ds-sub').textContent = `Trade with @${partnerName}`;
  document.getElementById('ds-statement').value = '';
  document.getElementById('ds-error').classList.add('hidden');
  document.getElementById('dispute-statement-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('ds-statement').focus(), 50);
}

async function submitDisputeStatementForm(e) {
  e.preventDefault();
  const draft = state.disputeDraft;
  if (!draft) return;
  const errEl = document.getElementById('ds-error');
  const submit = document.getElementById('ds-submit');
  errEl.classList.add('hidden');
  const text = document.getElementById('ds-statement').value.trim();
  if (!text) { errEl.textContent = 'Please share your statement.'; errEl.classList.remove('hidden'); return; }
  submit.disabled = true;
  submit.textContent = 'Sending…';
  try {
    if (draft.mode === 'open') {
      await data.openDisputeWithStatement(draft.tradeId, text);
      toast('Dispute opened. Admin notified.');
    } else {
      await data.addDisputeStatement(draft.tradeId, text);
      toast('Statement filed.');
    }
    document.getElementById('dispute-statement-modal').classList.add('hidden');
    state.disputeDraft = null;
    await loadTradeData();
    render();
  } catch (err) {
    console.error(err);
    errEl.textContent = err.message || 'Could not send.';
    errEl.classList.remove('hidden');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Send to admin';
  }
}

// ─── Bundle picker ────────────────────────────────────────────────
// Maps each accessory string parsed from a bundle's Set Includes back
// to a concrete catalog item (Shopify or custom). Returns rows shaped
// { key, label, match }, where match is the catalog item or null if
// nothing in state.catalog looked close enough. Used by the bundle
// picker modal so the user can see what they're checking off.
function matchBundleComponents(bundleCat) {
  const accessories = Array.isArray(bundleCat.accessories) ? bundleCat.accessories : [];
  const lookup = state.catalog.filter((c) => !c.isBundle);
  return accessories.map((acc) => {
    const label = typeof acc === 'string' ? acc : acc.name;
    const key = typeof acc === 'string' ? acc.toLowerCase() : (acc.key || label.toLowerCase());
    const match = findCatalogByName(label, lookup);
    return { key, label, match };
  });
}

function findCatalogByName(query, catalogList) {
  if (!query) return null;
  // Normalize the accessory string and each candidate catalog name —
  // drop the leading 'Plushie Dreadfuls - ' prefix Shopify uses,
  // trailing parens/sub-clauses, plural / singular noise.
  const norm = (s) => (s || '')
    .toLowerCase()
    .replace(/^plushie dreadfuls\s*-\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const q = norm(query);
  if (!q) return null;
  // Best match: catalog name CONTAINS the accessory string, or vice
  // versa. Among ties, the shortest candidate wins (least extra
  // noise).
  const candidates = [];
  for (const c of catalogList) {
    const n = norm(c.name);
    if (!n) continue;
    if (n.includes(q) || q.includes(n)) candidates.push({ c, n });
  }
  candidates.sort((a, b) => a.n.length - b.n.length);
  return candidates[0]?.c || null;
}

function openBundlePickerModal(cid) {
  const raw = state.catalog.find((c) => c.id === cid);
  if (!raw) return;
  const bundle = resolveCatalogItem(raw);
  const matches = matchBundleComponents(bundle);
  state.bundlePicker = { bundleId: cid, matches };

  document.getElementById('bp-title').textContent = cleanCatalogName(bundle.name);
  document.getElementById('bp-error').classList.add('hidden');
  document.getElementById('bp-list').innerHTML = matches.length === 0
    ? `<p class="dim">We couldn't parse a component list for this bundle. The catalog feed doesn't include one yet.</p>`
    : matches.map((m, i) => renderBundlePickerRow(m, i)).join('');
  // The submit button enables only when at least one box is ticked.
  document.getElementById('bp-submit').disabled = true;
  document.getElementById('bundle-picker-form').addEventListener('change', refreshBundleSubmit, { once: false });
  refreshBundleSubmit();
  document.getElementById('bundle-picker-modal').classList.remove('hidden');
}

function renderBundlePickerRow(m, i) {
  if (m.match) {
    const thumb = m.match.isCustom ? m.match.image : (shopifyImageVariant(m.match.image, 200) || m.match.image);
    const thumbHtml = thumb
      ? `<img src="${escapeHtml(thumb)}" alt="" />`
      : `<span class="no-photo">🖤</span>`;
    return `
      <label class="bundle-row">
        <input type="checkbox" data-bp-i="${i}" checked />
        <div class="bundle-row-photo">${thumbHtml}</div>
        <div class="bundle-row-body">
          <strong>${escapeHtml(cleanCatalogName(m.match.name))}</strong>
          <span class="dim">from "${escapeHtml(m.label)}"</span>
        </div>
      </label>
    `;
  }
  return `
    <label class="bundle-row bundle-row-unmatched">
      <input type="checkbox" data-bp-i="${i}" disabled />
      <div class="bundle-row-photo"><span class="no-photo">?</span></div>
      <div class="bundle-row-body">
        <strong>${escapeHtml(m.label)}</strong>
        <span class="dim">Not in the catalog yet — add it via "Suggest" or skip.</span>
      </div>
    </label>
  `;
}

function refreshBundleSubmit() {
  const submit = document.getElementById('bp-submit');
  if (!submit) return;
  const any = [...document.querySelectorAll('#bp-list input[type="checkbox"]:not([disabled])')]
    .some((cb) => cb.checked);
  submit.disabled = !any;
}

async function submitBundlePickerForm(e) {
  e.preventDefault();
  const draft = state.bundlePicker;
  if (!draft) return;
  const submit = document.getElementById('bp-submit');
  submit.disabled = true;
  submit.textContent = 'Adding…';
  const picked = [];
  document.querySelectorAll('#bp-list input[type="checkbox"]').forEach((cb) => {
    if (cb.checked && !cb.disabled) {
      const i = parseInt(cb.dataset.bpI, 10);
      const m = draft.matches[i];
      if (m && m.match) picked.push(m.match.id);
    }
  });
  let added = 0;
  let failed = 0;
  for (const id of picked) {
    try { await addFromCatalog(id, 'collection'); added++; }
    catch (err) { console.warn('bundle component add failed', id, err); failed++; }
  }
  toast(failed === 0
    ? `Added ${added} item${added === 1 ? '' : 's'} to your collection.`
    : `Added ${added}, ${failed} failed.`);
  document.getElementById('bundle-picker-modal').classList.add('hidden');
  state.bundlePicker = null;
  submit.disabled = false;
  submit.textContent = 'Add selected';
}

// Catalog detail — opens when the user taps a card's photo or title.
// Shows parsed lore, symbolism, accessories, and the standard Have /
// Want / Buy / Suggest-a-photo actions. Variants get their data via
// resolveCatalogItem so the body reads as if the variant had its own
// lore even though it inherits from the parent.
async function openCatalogDetailModal(cid) {
  const raw = state.catalog.find((c) => c.id === cid);
  if (!raw) {
    console.warn('openCatalogDetailModal: item not in state.catalog', cid);
    toast('That item is no longer in the catalog.');
    return;
  }
  // If the catalog hasn't had a live refresh yet, the lore / symbolism
  // / accessories fields are empty even on Shopify items. Trigger a
  // refresh on-demand the first time the user opens a detail — the
  // modal will paint with the empty-state copy and we'll re-render
  // when the refresh lands.
  // Form variants pull lore/symbolism/accessories from their parent.
  // If the parent (a Shopify row) hasn't been refreshed live yet, none
  // of those fields are populated — so the variant looks empty too. We
  // trigger the same on-demand refresh in that case.
  const parentEmpty = raw.isCustom && raw.parentHandle
    && !state.catalog.some((c) => c.handle === raw.parentHandle && !c.isCustom && c.bodyHtml);
  if (!state._catalogRefreshAttempted
      && ((!raw.bodyHtml && !raw.isCustom) || parentEmpty)) {
    state._catalogRefreshAttempted = true;
    refreshCatalogLive().then(() => {
      // If the modal is still open, repaint with the now-populated row.
      const modal = document.getElementById('catalog-detail-modal');
      if (modal && !modal.classList.contains('hidden')) {
        openCatalogDetailModal(cid);
      }
    }).catch((e) => console.warn('on-demand catalog refresh', e));
  }
  const item = resolveCatalogItem(raw);
  const display = cleanCatalogName(item.name);
  const formLabel = item.isCustom && item.formLabel ? item.formLabel : '';
  const thumb = item.isCustom ? item.image : (shopifyImageVariant(item.image, 800) || item.image);
  const { owned, wished } = catalogIdMap();
  const isOwned = owned.has(item.id);
  const isWished = wished.has(item.id);
  const status = itemStatus(item);
  const productHandleForBuy = item.isCustom ? item.parentShopifyHandle : item.handle;
  const productUrl = productHandleForBuy ? (PRODUCT_URL_BASE + productHandleForBuy) : null;

  const accessoriesHtml = (item.accessories && item.accessories.length)
    ? `<section class="cd-section">
         <h3>Set includes</h3>
         <ul class="cd-list">${item.accessories.map((a) => `<li>${escapeHtml(a.name)}</li>`).join('')}</ul>
       </section>` : '';
  // "Lore" is a plush/mini concept; on clothing, accessories & other merch the
  // same free-text reads as plain "Notes".
  const loreCat = catalogCategory(item);
  const loreHeading = (loreCat === 'plush' || loreCat === 'mini' || loreCat === 'bundle') ? 'Lore' : 'Notes';
  const loreHtml = item.lore
    ? `<section class="cd-section"><h3>${loreHeading}</h3>${item.lore.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</section>`
    : '';
  // Symbolism: we keep some HTML from the parsed block (one image per
  // distinct src already deduped). Sanitized lightly — strip <script>
  // and inline event handlers — then injected as innerHTML. Source is
  // plushiedreadfuls.com so this is low-risk, but defensive anyway.
  const symHtml = item.symbolismHtml
    ? `<section class="cd-section"><h3>Symbolism</h3><div class="cd-symbolism">${sanitizeBodyHtml(item.symbolismHtml)}</div></section>`
    : (item.symbolism ? `<section class="cd-section"><h3>Symbolism</h3><p>${escapeHtml(item.symbolism).replace(/\n/g, '<br/>')}</p></section>` : '');
  const isEmpty = !accessoriesHtml && !loreHtml && !symHtml;

  document.getElementById('cd-body').innerHTML = `
    <div class="cd-head">
      <div class="cd-photo">${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(display)}" />` : `<span class="no-photo">🖤</span>`}</div>
      <div class="cd-head-text">
        <div class="card-eyebrow">${escapeHtml(item.type || 'plush')}${item.releaseYear ? ` · ${item.releaseYear}` : ''}</div>
        <h2>${escapeHtml(display)}${formLabel ? ` <span class="card-form-label">${escapeHtml(formLabel)}</span>` : ''}</h2>
        ${item.price != null ? `<p class="cd-price">$${Number(item.price).toFixed(2)}</p>` : ''}
        <p class="dim">
          ${isOwned ? '<span class="card-status owned">✓ Owned</span> ' : ''}
          ${isWished ? '<span class="card-status wished">★ Wished</span> ' : ''}
          ${status === 'sold_out' ? '<span class="badge badge-oos">Sold Out</span> ' : ''}
          ${status === 'retired' ? '<span class="badge badge-retired">Retired</span> ' : ''}
        </p>
        <div class="cd-actions">
          ${status !== 'coming_soon' && status !== 'fyc' ? `<button class="btn-have" data-action="cat-have" data-cid="${item.id}">🖤 Have</button>` : ''}
          ${!isWished ? `<button class="btn-want" data-action="cat-want" data-cid="${item.id}">🕯 Want</button>` : ''}
          ${productUrl ? `<a class="btn-buy" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener">Buy ↗</a>` : ''}
          ${window.currentUser?.isAdmin && item.isCustom ? `<button class="btn-ghost" data-action="cat-admin-edit" data-cid="${item.id}">✎ Edit entry</button>` : ''}
        </div>
      </div>
    </div>
    ${isEmpty ? (raw.isCustom
      ? '<p class="dim">No lore, symbolism, or accessories on this one yet.</p>'
      : '<p class="dim">Loading lore from the catalog… <small>If this stays here after a moment, the catalog entry just doesn\'t carry a description.</small></p>'
    ) : ''}
    ${loreHtml}
    ${symHtml}
    ${accessoriesHtml}
  `;
  document.getElementById('catalog-detail-modal').classList.remove('hidden');
}

// Strip <script>, <iframe>, and inline event handlers from parsed
// body_html before innerHTML-ing it in the detail modal. The source is
// plushiedreadfuls.com (we control the upstream domain in the live
// fetch), so this is a defensive wrap rather than a hard guarantee.
function sanitizeBodyHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstChild;
    if (!root) return '';
    for (const el of [...root.querySelectorAll('script, iframe, object, embed')]) el.remove();
    for (const el of [...root.querySelectorAll('*')]) {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        if (attr.name === 'href' && /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    }
    return root.innerHTML;
  } catch { return ''; }
}

// Generic full-size image viewer. Set the src + optional caption, show
// the modal. Backdrop / close-× / .lightbox-card all dismiss; the img
// itself doesn't, so the user can drag-select / right-click-save.
function openLightbox(src, caption) {
  if (!src) return;
  const img = document.getElementById('lightbox-img');
  img.src = src;
  img.alt = caption || '';
  document.getElementById('lightbox-caption').textContent = caption || '';
  document.getElementById('lightbox-modal').classList.remove('hidden');
}

function openSuggestPhotoModal(targetId, targetKind, targetName) {
  if (!window.currentUser?.isAdmin && !data.featureEnabled('feature.user_photo_uploads')) {
    toast('Photo submissions are paused right now.');
    return;
  }
  state.suggestPhotoTarget = { id: targetId, kind: targetKind };
  document.getElementById('sp-target-name').textContent = targetName || '';
  document.getElementById('suggest-photo-form').reset();
  document.getElementById('sp-photo-preview-wrap').innerHTML = '';
  document.getElementById('sp-error').classList.add('hidden');
  document.getElementById('suggest-photo-modal').classList.remove('hidden');
}

async function submitSuggestPhotoForm(e) {
  e.preventDefault();
  const errEl = document.getElementById('sp-error');
  errEl.classList.add('hidden');
  const file = document.getElementById('sp-photo').files[0];
  if (!file) { errEl.textContent = 'Please pick a photo.'; errEl.classList.remove('hidden'); return; }
  const notes = document.getElementById('sp-notes').value.trim() || null;
  const target = state.suggestPhotoTarget;
  if (!target) return;
  const submit = document.getElementById('sp-submit');
  submit.disabled = true;
  submit.textContent = 'Sending…';
  try {
    const compressed = await compressImage(file).catch(() => file);
    const path = await data.uploadCatalogSuggestionImage(compressed, target.id);
    await data.suggestCatalogPhoto({
      targetShopifyId: target.kind === 'shopify' ? target.id : null,
      targetCatalogItemId: target.kind === 'custom' ? target.id : null,
      targetPenId: target.kind === 'pen' ? target.id : null,
      imagePath: path,
      notes,
    });
    toast('Thanks — sent to admin.');
    document.getElementById('suggest-photo-modal').classList.add('hidden');
  } catch (err) {
    console.error(err);
    errEl.textContent = err.message || 'Could not send.';
    errEl.classList.remove('hidden');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Send';
  }
}

async function openCatalogPendingModal() {
  const body = document.getElementById('aq-body');
  document.getElementById('aq-title').textContent = 'Pending catalog submissions';
  body.innerHTML = '<p class="dim">Loading…</p>';
  document.getElementById('admin-queue-modal').classList.remove('hidden');
  try {
    const rows = await data.adminListCatalogPending();
    state.adminPendingCatalog = rows;
    if (rows.length === 0) {
      body.innerHTML = '<p class="dim">Nothing pending. ✨</p>';
      return;
    }
    body.innerHTML = rows.map(renderPendingCatalogRow).join('');
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="dim">Couldn't load queue: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function renderPendingCatalogRow(row) {
  const thumb = row.image
    ? `<img src="${escapeHtml(row.image)}" alt="" />`
    : `<span class="no-photo">🖤</span>`;
  return `
    <article class="catalog-pending-row">
      <div class="catalog-pending-photo">${thumb}</div>
      <div class="catalog-pending-body">
        <h3>${escapeHtml(row.name)} ${row.form_label ? `<span class="card-form-label">${escapeHtml(row.form_label)}</span>` : ''}</h3>
        <p class="dim">handle: <code>${escapeHtml(row.handle)}</code>${row.parent_handle ? ` · parent: <code>${escapeHtml(row.parent_handle)}</code>` : ''}</p>
        ${row.lore ? `<p>${escapeHtml(row.lore).slice(0, 240)}${row.lore.length > 240 ? '…' : ''}</p>` : ''}
        <p class="dim">Status: <strong>${escapeHtml(row.status)}</strong> · submitted ${new Date(row.submitted_at).toLocaleString()}</p>
      </div>
      <div class="catalog-pending-actions">
        ${row.status === 'pending'
          ? `<button class="btn-primary" data-admin-action="approve-catalog-item" data-id="${row.id}">Approve</button>
             <button data-admin-action="merge-catalog-item" data-id="${row.id}" data-handle="${escapeHtml(row.handle)}">Merge into…</button>
             <button class="btn-ghost" data-admin-action="reject-catalog-item" data-id="${row.id}">Reject</button>`
          : `<p class="dim">${row.status}</p>`
        }
      </div>
    </article>
  `;
}

async function adminApproveCatalogItem(id) {
  try {
    await data.adminApproveCatalogItem(id);
    toast('Approved.');
    await openCatalogPendingModal();
    await loadCatalog();
    if (state.tab === 'catalog') render();
  } catch (err) {
    console.error(err);
    toast('Could not approve: ' + (err.message || err));
  }
}

// Merge: type-ahead search through state.catalog for a winner, pick
// one, confirm. The chosen winner.id is text (Shopify numeric or
// custom uuid string) — admin_merge_catalog_item handles both.
function openCatalogMergeModal(duplicateId, duplicateHandle) {
  state.catalogMerge = { duplicateId, winnerId: null };
  document.getElementById('cm-source').textContent = `Duplicate: ${duplicateHandle}`;
  document.getElementById('cm-search').value = '';
  document.getElementById('cm-results').innerHTML = '';
  document.getElementById('cm-selected').textContent = '';
  document.getElementById('cm-error').classList.add('hidden');
  document.getElementById('cm-submit').disabled = true;
  document.getElementById('catalog-merge-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('cm-search').focus(), 50);
}

function onMergeSearchInput(e) {
  const q = e.target.value.trim().toLowerCase();
  const results = document.getElementById('cm-results');
  if (q.length < 2) { results.innerHTML = ''; return; }
  const dupId = state.catalogMerge?.duplicateId;
  const candidates = state.catalog
    .filter((c) => c.id !== dupId
      && (cleanCatalogName(c.name).toLowerCase().includes(q) || (c.handle || '').toLowerCase().includes(q)))
    .slice(0, 12);
  if (candidates.length === 0) {
    results.innerHTML = '<p class="dim">No matches.</p>';
    return;
  }
  results.innerHTML = candidates.map((c) => {
    const thumb = c.isCustom ? c.image : (shopifyImageVariant(c.image, 200) || c.image);
    return `<button type="button" class="bundle-row" data-merge-id="${escapeHtml(c.id)}" data-merge-name="${escapeHtml(cleanCatalogName(c.name))}" data-merge-handle="${escapeHtml(c.handle || '')}">
      <span></span>
      <span class="bundle-row-photo">${thumb ? `<img src="${escapeHtml(thumb)}" alt="" />` : '<span class="no-photo">🖤</span>'}</span>
      <span class="bundle-row-body"><strong>${escapeHtml(cleanCatalogName(c.name))}</strong><span class="dim">${escapeHtml(c.handle || '')}${c.isCustom ? ' · custom' : ' · shopify'}</span></span>
    </button>`;
  }).join('');
}

function onMergeSelectWinner(id, name, handle) {
  state.catalogMerge.winnerId = id;
  document.getElementById('cm-selected').innerHTML = `<strong>Winner:</strong> ${escapeHtml(name)} <code>${escapeHtml(handle)}</code>`;
  document.getElementById('cm-submit').disabled = false;
}

async function submitCatalogMerge() {
  const m = state.catalogMerge;
  if (!m || !m.winnerId) return;
  const submit = document.getElementById('cm-submit');
  const errEl = document.getElementById('cm-error');
  errEl.classList.add('hidden');
  submit.disabled = true;
  submit.textContent = 'Merging…';
  try {
    await data.adminMergeCatalogItem(m.duplicateId, m.winnerId);
    toast('Merged.');
    document.getElementById('catalog-merge-modal').classList.add('hidden');
    state.catalogMerge = null;
    await openCatalogPendingModal();
    await loadCatalog();
    if (state.tab === 'catalog') render();
  } catch (err) {
    console.error(err);
    errEl.textContent = err.message || 'Merge failed.';
    errEl.classList.remove('hidden');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Merge';
  }
}

async function adminRejectCatalogItem(id) {
  if (!confirm('Reject this submission?')) return;
  try {
    await data.adminRejectCatalogItem(id);
    toast('Rejected.');
    await openCatalogPendingModal();
  } catch (err) {
    console.error(err);
    toast('Could not reject: ' + (err.message || err));
  }
}

async function openPhotoSuggestionsModal() {
  const body = document.getElementById('aq-body');
  document.getElementById('aq-title').textContent = 'Photo suggestions';
  body.innerHTML = '<p class="dim">Loading…</p>';
  document.getElementById('admin-queue-modal').classList.remove('hidden');
  try {
    const rows = await data.adminListPhotoSuggestions('pending');
    state.adminPendingPhotos = rows;
    if (rows.length === 0) {
      body.innerHTML = '<p class="dim">Nothing pending. ✨</p>';
      return;
    }
    body.innerHTML = rows.map(renderPendingPhotoRow).join('');
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="dim">Couldn't load: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

function renderPendingPhotoRow(row) {
  const thumb = row.image
    ? `<img src="${escapeHtml(row.image)}" alt="" />`
    : `<span class="no-photo">🖤</span>`;
  let target;
  if (row.target_pen_id) {
    const pen = activePens().find((p) => p.id === row.target_pen_id);
    target = `Pen: <code>${escapeHtml(row.target_pen_id)}</code>${pen ? ` (${escapeHtml(pen.line)} — ${escapeHtml(pen.name)})` : ''}`;
  } else if (row.target_catalog_item_id) {
    target = `catalog_items: <code>${escapeHtml(row.target_catalog_item_id)}</code>`;
  } else {
    target = `Shopify id: <code>${escapeHtml(row.target_shopify_id || '?')}</code>`;
  }
  return `
    <article class="catalog-pending-row">
      <div class="catalog-pending-photo">${thumb}</div>
      <div class="catalog-pending-body">
        <h3>Photo suggestion</h3>
        <p class="dim">${target}</p>
        ${row.notes ? `<p><em>"${escapeHtml(row.notes)}"</em></p>` : ''}
        <p class="dim">submitted ${new Date(row.submitted_at).toLocaleString()}</p>
      </div>
      <div class="catalog-pending-actions">
        <button class="btn-primary" data-admin-action="approve-photo-suggestion" data-id="${row.id}">Approve</button>
        <button class="btn-ghost" data-admin-action="reject-photo-suggestion" data-id="${row.id}">Reject</button>
      </div>
    </article>
  `;
}

async function adminApprovePhotoSuggestion(id) {
  try {
    // For suggestions targeting a raw Shopify product, find the upstream
    // product in state.catalog and pass its info through so
    // adminApprovePhotoSuggestion can auto-create the catalog_items
    // row instead of erroring.
    const row = (state.adminPendingPhotos || []).find((r) => r.id === id);
    let shopifyInfo;
    if (row && row.target_shopify_id && !row.target_catalog_item_id) {
      const prod = state.catalog.find((c) => c.id === row.target_shopify_id && !c.isCustom);
      if (prod) {
        shopifyInfo = {
          name: prod.name,
          handle: prod.handle,
          type: prod.type || 'plush',
        };
      }
    }
    await data.adminApprovePhotoSuggestion(id, shopifyInfo);
    toast('Photo approved.');
    await openPhotoSuggestionsModal();
    await loadCatalog();
    if (state.tab === 'catalog') render();
  } catch (err) {
    console.error(err);
    toast('Could not approve: ' + (err.message || err));
  }
}

async function adminRejectPhotoSuggestion(id) {
  if (!confirm('Reject this photo suggestion?')) return;
  try {
    await data.adminRejectPhotoSuggestion(id);
    toast('Rejected.');
    await openPhotoSuggestionsModal();
  } catch (err) {
    console.error(err);
    toast('Could not reject: ' + (err.message || err));
  }
}


// Promise-based modal that requires the admin to type the target's
// username to confirm a destructive action. Resolves true if they
// matched + clicked confirm; false otherwise (cancel, esc, mismatch).
function confirmTypingUsername({ title, body, expected, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal admin-confirm-modal';
    wrap.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card">
        <h2>${title}</h2>
        <p class="admin-confirm-body">${body}</p>
        <label class="field">
          <span>Type <code>${escapeHtml(expected)}</code> to enable</span>
          <input type="text" class="admin-confirm-input" autocomplete="off" autocapitalize="none" spellcheck="false" />
        </label>
        <div class="form-actions">
          <button class="btn-ghost" data-confirm-action="cancel">Cancel</button>
          <button class="btn-primary ${danger ? 'btn-danger-confirm' : ''}" data-confirm-action="confirm" disabled>${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('.admin-confirm-input');
    const submit = wrap.querySelector('[data-confirm-action="confirm"]');
    const cancel = wrap.querySelector('[data-confirm-action="cancel"]');
    const close = (result) => { wrap.remove(); resolve(result); };
    input.addEventListener('input', () => {
      submit.disabled = input.value.trim() !== expected;
    });
    submit.addEventListener('click', () => {
      if (input.value.trim() === expected) close(true);
    });
    cancel.addEventListener('click', () => close(false));
    wrap.querySelector('.modal-backdrop').addEventListener('click', () => close(false));
    setTimeout(() => input.focus(), 50);
  });
}

// ─── Service worker ──────────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW failed', e));
  });
}

// ─── Boot ────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════
// Social tab — friends (Coven), Inner Coffin, posts, likes, comments,
// Top 8, profiles. Early-Facebook-meets-MySpace, account required.
// ════════════════════════════════════════════════════════════════════

async function loadSocialData() {
  try {
    const [feed, friends, requests] = await Promise.all([
      data.listFeed(),
      data.listFriends(),
      data.listIncomingRequests(),
    ]);
    state.socFeed = feed;
    state.socFriends = friends;
    state.socRequests = requests;
    state.socPendingCount = requests.length;
    maybeFireFriendNotifications().catch((e) => console.warn(e));
  } catch (e) {
    console.error('loadSocialData', e);
    toast('Could not load the crypt social feed.');
  }
}

// Lightweight badge refresh (no feed fetch) — used at boot so the red
// pip shows pending friend requests even before the user opens Social.
async function refreshSocialBadge() {
  try {
    // Load the full request list (not just a count) so the badge stays
    // fresh AND the notifier has usernames to announce.
    const requests = await data.listIncomingRequests();
    state.socRequests = requests;
    state.socPendingCount = requests.length;
    updateSocialBadge();
    maybeFireFriendNotifications().catch((e) => console.warn(e));
  } catch (e) { console.warn('social badge', e); }
}

// Poll for new friend requests every few minutes while the app is open
// so the badge + notification land without needing to open the tab.
function scheduleSocialCheck() {
  if (window._socialTimer) clearInterval(window._socialTimer);
  window._socialTimer = setInterval(() => { refreshSocialBadge(); }, 5 * 60 * 1000);
}

function updateSocialBadge() {
  const n = state.socPendingCount || 0;
  for (const id of ['social-badge', 'soc-friends-badge']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
  }
}

function setSocSubTab(name) {
  state.socSubTab = name;
  renderSocial();
}

// ─── Small presentational helpers ───────────────────────────────────
function socTimeAgo(ts) {
  const d = typeof ts === 'number' ? ts : +new Date(ts);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24); if (day < 7) return `${day}d ago`;
  return new Date(d).toLocaleDateString();
}

function socAvatar(url, name, cls = '') {
  const initial = escapeHtml((name || '?').slice(0, 1).toUpperCase());
  if (url) return `<span class="soc-avatar ${cls}"><img src="${escapeHtml(url)}" loading="lazy" alt="" /></span>`;
  return `<span class="soc-avatar soc-avatar-fallback ${cls}">${initial}</span>`;
}

function visBadge(vis) {
  const m = VIS_META[vis] || VIS_META.friends;
  return `<span class="soc-vis-badge" title="${escapeHtml(m.hint)}">${m.glyph} ${escapeHtml(m.label)}</span>`;
}

// ─── Top-level social render dispatch ───────────────────────────────
// A profile overlay (state.socProfile) takes over the feed subview; the
// sub-tabs otherwise map 1:1 to the three subviews. All visibility is
// decided here so callers just set state and re-render.
function renderSocial() {
  const onProfile = !!state.socProfile;
  const showFeed = onProfile || state.socSubTab === 'feed';
  document.getElementById('soc-feed').classList.toggle('hidden', !showFeed);
  document.getElementById('soc-friends').classList.toggle('hidden', onProfile || state.socSubTab !== 'friends');
  document.getElementById('soc-me').classList.toggle('hidden', onProfile || state.socSubTab !== 'me');
  document.querySelectorAll('#social-view .subtab').forEach((s) =>
    s.classList.toggle('active', !onProfile && s.dataset.socSubtab === state.socSubTab));

  if (onProfile) {
    renderProfileInto(document.getElementById('soc-feed'), { ...state.socProfile, withBack: true });
    return;
  }
  if (state.socSubTab === 'feed') renderFeed();
  else if (state.socSubTab === 'friends') renderFriends();
  else if (state.socSubTab === 'me') renderMyProfileTab();
}

// ─── Feed ───────────────────────────────────────────────────────────
function renderFeed() {
  const el = document.getElementById('soc-feed');
  const composer = `
    <div class="soc-composer">
      <div class="soc-composer-row">
        ${socAvatar(null, window.currentUser.username)}
        <button class="soc-composer-open" data-soc-action="open-compose">
          Share a story about your plushes…
        </button>
      </div>
    </div>`;

  const posts = state.socFeed.length
    ? state.socFeed.map(renderPostCard).join('')
    : `<p class="empty-note">The crypt is quiet. Make the first post, or
        <button class="linklike" data-soc-action="go-friends">find some friends</button> to follow.</p>`;

  el.innerHTML = composer + `<div class="soc-feed-list">${posts}</div>`;
}

function renderPostCard(p) {
  const img = p.photoUrl || catalogImageFor(p.catalogId);
  const expanded = state.socExpandedComments.has(p.id);
  const shownComments = expanded ? p.comments : p.comments.slice(-2);
  const moreCount = p.comments.length - shownComments.length;

  return `
  <article class="soc-post" data-post-id="${p.id}">
    <header class="soc-post-head">
      <button class="soc-userlink" data-soc-action="view-profile" data-uid="${p.authorId}">
        ${socAvatar(p.authorAvatar, p.authorName)}
        <span class="soc-post-author">@${escapeHtml(p.authorName)}</span>
      </button>
      <span class="soc-post-meta">${visBadge(p.visibility)} · ${escapeHtml(socTimeAgo(p.createdAt))}${p.edited ? ' · edited' : ''}</span>
      ${p.mine ? `<button class="soc-post-edit" data-soc-action="edit-post" data-post-id="${p.id}" title="Edit">✏️</button>
                  <button class="soc-post-del" data-soc-action="delete-post" data-post-id="${p.id}" title="Delete">🗑</button>` : ''}
    </header>
    ${p.plushName ? `<p class="soc-post-plush">🧸 ${escapeHtml(p.plushName)}</p>` : ''}
    ${p.body ? `<p class="soc-post-body">${escapeHtml(p.body)}</p>` : ''}
    ${img ? `<div class="soc-post-photo"><img src="${escapeHtml(img)}" loading="lazy" alt="" /></div>` : ''}
    <div class="soc-post-actions">
      <button class="soc-like ${p.likedByMe ? 'liked' : ''}" data-soc-action="toggle-like" data-post-id="${p.id}">
        ${p.likedByMe ? '🖤' : '🤍'} <span>${p.likeCount || ''}</span>
      </button>
      <button class="soc-comment-btn" data-soc-action="toggle-comments" data-post-id="${p.id}">
        💬 <span>${p.comments.length || ''}</span>
      </button>
    </div>
    <div class="soc-comments">
      ${moreCount > 0 ? `<button class="linklike soc-more-comments" data-soc-action="toggle-comments" data-post-id="${p.id}">View ${moreCount} more comment${moreCount === 1 ? '' : 's'}</button>` : ''}
      ${shownComments.map((c) => `
        <div class="soc-comment">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${c.authorId}"><b>@${escapeHtml(c.authorName)}</b></button>
          <span>${escapeHtml(c.body)}</span>
          ${c.canDelete ? `<button class="soc-comment-del" data-soc-action="delete-comment" data-comment-id="${c.id}" title="Delete">×</button>` : ''}
        </div>`).join('')}
      ${expanded ? `
        <form class="soc-comment-form" data-soc-action="submit-comment" data-post-id="${p.id}">
          <input type="text" class="soc-comment-input" maxlength="500" placeholder="Add a comment…" />
          <button class="btn-primary" type="submit">Post</button>
        </form>` : ''}
    </div>
  </article>`;
}

// ─── Friends ────────────────────────────────────────────────────────
function renderFriends() {
  const el = document.getElementById('soc-friends');
  const requests = state.socRequests.length ? `
    <section class="soc-section">
      <h2 class="soc-section-head">Friend requests</h2>
      ${state.socRequests.map((r) => `
        <div class="soc-friend-row">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${r.userId}">
            ${socAvatar(r.avatarUrl, r.username)} <span>@${escapeHtml(r.username)}</span>
          </button>
          <span class="soc-friend-actions">
            <button class="btn-primary" data-soc-action="accept-friend" data-uid="${r.userId}">Accept</button>
            <button class="btn-ghost" data-soc-action="decline-friend" data-uid="${r.userId}">Decline</button>
          </span>
        </div>`).join('')}
    </section>` : '';

  const results = state.socSearch.length ? `
    <div class="soc-search-results">
      ${state.socSearch.map((u) => `
        <div class="soc-friend-row">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${u.userId}">
            ${socAvatar(u.avatarUrl, u.username)} <span>@${escapeHtml(u.username)}</span>
          </button>
          <button class="btn-primary" data-soc-action="add-friend" data-uid="${u.userId}">Add friend</button>
        </div>`).join('')}
    </div>` : (state.socSearchQuery ? `<p class="empty-note">No collectors match "@${escapeHtml(state.socSearchQuery)}".</p>` : '');

  const friends = state.socFriends.length ? `
    <section class="soc-section">
      <h2 class="soc-section-head">Your Coven · ${state.socFriends.length}</h2>
      ${state.socFriends.map((f) => {
        const tierTag = f.isCoffinBuddy
          ? '<span class="soc-inner-tag">⚰️ Coffin Buddies</span>'
          : (f.isInner ? '<span class="soc-inner-tag">🏰 Castle Crew</span>' : '');
        return `
        <div class="soc-friend-row">
          <button class="soc-userlink" data-soc-action="view-profile" data-uid="${f.userId}">
            ${socAvatar(f.avatarUrl, f.username)}
            <span>@${escapeHtml(f.username)} ${tierTag}</span>
          </button>
          <span class="soc-friend-actions">
            <button class="btn-ghost" data-soc-action="toggle-inner" data-uid="${f.userId}" data-on="${f.isInner ? '0' : '1'}">
              ${f.isInner ? 'Remove from Castle Crew' : 'Add to Castle Crew'}
            </button>
            <button class="btn-ghost" data-soc-action="toggle-coffin" data-uid="${f.userId}" data-on="${f.isCoffinBuddy ? '0' : '1'}">
              ${f.isCoffinBuddy ? 'Remove from Coffin Buddies' : 'Add to Coffin Buddies'}
            </button>
            <button class="btn-ghost" data-soc-action="remove-friend" data-uid="${f.userId}">Unfriend</button>
          </span>
        </div>`; }).join('')}
    </section>` : `<p class="empty-note">No friends in your Coven yet — search for a collector above.</p>`;

  el.innerHTML = `
    <div class="soc-search">
      <input type="search" id="soc-search-input" placeholder="Find collectors by @username…" value="${escapeHtml(state.socSearchQuery)}" />
    </div>
    ${results}
    ${requests}
    ${friends}`;
}

// ─── My profile tab ─────────────────────────────────────────────────
function renderMyProfileTab() {
  // Reuse the profile renderer pointed at myself, but with edit affordances.
  renderProfileInto(document.getElementById('soc-me'), {
    profile: { id: window.currentUser.id, username: window.currentUser.username, bio: state._myBio, avatarUrl: state._myAvatarUrl },
    posts: state._myPosts || [],
    top8: state._myTop8 || [],
    isMe: true,
  });
}

// ─── Viewing someone's profile (overlay) ────────────────────────────
async function openProfile(userId) {
  try {
    const [profile, posts, top8, friendship] = await Promise.all([
      data.getSocialProfile(userId),
      data.listUserPosts(userId),
      data.getTopPlushes(userId),
      data.friendshipWith(userId),
    ]);
    if (!profile) { toast('Profile not found.'); return; }
    state.socProfile = { profile, posts, top8, friendship, isMe: userId === window.currentUser.id };
    renderSocial();
  } catch (e) { console.error('openProfile', e); toast('Could not open profile.'); }
}

function renderProfileInto(el, { profile, posts, top8, friendship, isMe, withBack }) {
  const top8Html = renderTop8(top8, isMe);
  let relBtns = '';
  if (isMe) {
    relBtns = `<button class="btn-ghost" data-soc-action="edit-profile">Edit profile</button>
               <button class="btn-ghost" data-soc-action="edit-top8">Edit Top 8 Buns</button>`;
  } else {
    if (friendship === 'friends') relBtns = `<span class="soc-rel-tag">🦇 In your Coven</span>
               <button class="btn-ghost" data-soc-action="remove-friend" data-uid="${profile.id}">Unfriend</button>`;
    else if (friendship === 'outgoing') relBtns = `<button class="btn-ghost" data-soc-action="remove-friend" data-uid="${profile.id}">Cancel request</button>`;
    else if (friendship === 'incoming') relBtns = `<button class="btn-primary" data-soc-action="accept-friend" data-uid="${profile.id}">Accept request</button>`;
    else relBtns = `<button class="btn-primary" data-soc-action="add-friend" data-uid="${profile.id}">Add friend</button>`;
  }

  el.innerHTML = `
    ${withBack ? `<button class="linklike soc-back" data-soc-action="close-profile">← Back to feed</button>` : ''}
    <header class="soc-profile-head">
      ${socAvatar(profile.avatarUrl, profile.username, 'soc-avatar-lg')}
      <div class="soc-profile-id">
        <h2>@${escapeHtml(profile.username)}</h2>
        ${profile.bio ? `<p class="soc-bio">${escapeHtml(profile.bio)}</p>` : (isMe ? `<p class="soc-bio soc-bio-empty">Add a bio to tell the crypt about yourself…</p>` : '')}
        <div class="soc-profile-actions">${relBtns}</div>
      </div>
    </header>
    <section class="soc-section">
      <h2 class="soc-section-head">Top 8 Buns 🐰</h2>
      ${top8Html}
    </section>
    <section class="soc-section">
      <h2 class="soc-section-head">${isMe ? 'Your posts' : 'Posts'}</h2>
      ${posts.length ? posts.map(renderPostCard).join('') : `<p class="empty-note">No posts yet.</p>`}
    </section>`;
}

function renderTop8(top8, isMe) {
  if (!top8 || !top8.length) {
    return `<p class="empty-note soc-top8-empty">${isMe ? 'Pick your Top 8 Buns to show them off, MySpace-style.' : 'No Top 8 Buns picked yet.'}</p>`;
  }
  const slots = top8.map((t) => {
    const img = t.photoUrl || catalogImageFor(t.catalogId);
    return `
      <div class="soc-top8-slot">
        <span class="soc-top8-rank">${t.position}</span>
        <div class="soc-top8-photo">${img ? `<img src="${escapeHtml(img)}" loading="lazy" alt="" />` : '<span class="no-photo">🖤</span>'}</div>
        <span class="soc-top8-name">${escapeHtml(t.plushName)}</span>
      </div>`;
  }).join('');
  return `<div class="soc-top8-grid">${slots}</div>`;
}

// ─── Social modal (compose / edit profile / Top 8 picker) ───────────
function openSocialModal(html) {
  document.getElementById('social-modal-card').innerHTML = html;
  document.getElementById('social-modal').classList.remove('hidden');
}
function closeSocialModal() {
  document.getElementById('social-modal').classList.add('hidden');
  document.getElementById('social-modal-card').innerHTML = '';
  state.socComposePhoto = null;
}

function openComposer() {
  state.socComposeVis = state.socComposeVis || 'friends';
  state.socComposePhoto = null;
  const visOptions = Object.entries(VIS_META).map(([k, m]) =>
    `<option value="${k}" ${state.socComposeVis === k ? 'selected' : ''}>${m.glyph} ${m.label} — ${m.hint}</option>`).join('');
  // Optional: tag one of my own plushes (sets a catalog image + name).
  const plushOptions = ['<option value="">Tag a plush (optional)…</option>']
    .concat(state.collection.map((p) => `<option value="${escapeHtml(p.catalogId || '')}|${escapeHtml(p.nickname || p.name)}">${escapeHtml(p.nickname || p.name)}</option>`))
    .join('');
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>New post</h2>
    <form id="soc-compose-form">
      <label class="field">
        <span>Your story</span>
        <textarea id="soc-compose-body" rows="4" maxlength="1000" placeholder="Tell the crypt about your plush…"></textarea>
      </label>
      <label class="field">
        <span>Tag a plush</span>
        <select id="soc-compose-plush">${plushOptions}</select>
      </label>
      ${data.featureEnabled('feature.user_photo_uploads') ? `
      <label class="field">
        <span>Photo (optional)</span>
        <input type="file" id="soc-compose-photo" accept="image/*" />
        <span id="soc-compose-photo-name" class="soc-file-name"></span>
      </label>` : `
      <p class="soc-help soc-stock-note">📷 Photo uploads are off for now — tag a plush above to share its picture.</p>`}
      <label class="field">
        <span>Who can see this</span>
        <select id="soc-compose-vis">${visOptions}</select>
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-social>Cancel</button>
        <button type="submit" class="btn-primary">Post</button>
      </div>
    </form>`);
}

async function submitComposer(e) {
  e.preventDefault();
  const body = document.getElementById('soc-compose-body').value.trim();
  const vis = document.getElementById('soc-compose-vis').value;
  const plushVal = document.getElementById('soc-compose-plush').value;
  let catalogId = null, plushName = null;
  if (plushVal) {
    const [cid, name] = plushVal.split('|');
    catalogId = cid || null;
    plushName = name || null;
  }
  if (!body && !state.socComposePhoto && !plushName) {
    toast('Add a story, a photo, or tag a plush.');
    return;
  }
  try {
    await data.createPost({ body, visibility: vis, photoBlob: state.socComposePhoto, catalogId, plushName });
    state.socComposeVis = vis;
    closeSocialModal();
    toast('Posted to the crypt. 🦇');
    await loadSocialData();
    state.socProfile = null;
    setSocSubTab('feed');
  } catch (err) { console.error('createPost', err); toast('Could not post.'); }
}

// ─── Edit an existing post ──────────────────────────────────────────
function openPostEditor(postId) {
  const p = findFeedPost(postId);
  if (!p) { toast('Post not found.'); return; }
  state.socComposePhoto = null;
  const visOptions = Object.entries(VIS_META).map(([k, m]) =>
    `<option value="${k}" ${p.visibility === k ? 'selected' : ''}>${m.glyph} ${m.label} — ${m.hint}</option>`).join('');

  // Plush tag select, preselecting the post's current tag. If the tagged
  // plush is no longer in the collection, keep it as a current option.
  const currentTag = p.plushName ? `${p.catalogId || ''}|${p.plushName}` : '';
  const collOpts = state.collection.map((c) => `${c.catalogId || ''}|${c.nickname || c.name}`);
  let plushOptions = `<option value="" ${currentTag ? '' : 'selected'}>No plush tagged</option>`;
  if (currentTag && !collOpts.includes(currentTag)) {
    plushOptions += `<option value="${escapeHtml(currentTag)}" selected>${escapeHtml(p.plushName)} (current)</option>`;
  }
  plushOptions += state.collection.map((c) => {
    const val = `${c.catalogId || ''}|${c.nickname || c.name}`;
    return `<option value="${escapeHtml(val)}" ${val === currentTag ? 'selected' : ''}>${escapeHtml(c.nickname || c.name)}</option>`;
  }).join('');

  const hasPhoto = !!p.photoUrl;
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>Edit post</h2>
    <form id="soc-edit-form" data-post-id="${p.id}">
      <label class="field">
        <span>Your story</span>
        <textarea id="soc-edit-body" rows="4" maxlength="1000" placeholder="Tell the crypt about your plush…">${escapeHtml(p.body || '')}</textarea>
      </label>
      <label class="field">
        <span>Tag a plush</span>
        <select id="soc-edit-plush">${plushOptions}</select>
      </label>
      ${hasPhoto ? `
      <div class="field soc-edit-photo-current">
        <span>Current photo</span>
        <img src="${escapeHtml(p.photoUrl)}" alt="" class="soc-edit-thumb" />
        <label class="checkbox"><input type="checkbox" id="soc-edit-remove-photo" /> Remove photo</label>
      </div>` : ''}
      ${data.featureEnabled('feature.user_photo_uploads') ? `
      <label class="field">
        <span>${hasPhoto ? 'Replace photo' : 'Photo'} (optional)</span>
        <input type="file" id="soc-edit-photo" accept="image/*" />
        <span id="soc-edit-photo-name" class="soc-file-name"></span>
      </label>` : ''}
      <label class="field">
        <span>Who can see this</span>
        <select id="soc-edit-vis">${visOptions}</select>
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-social>Cancel</button>
        <button type="submit" class="btn-primary">Save changes</button>
      </div>
    </form>`);
}

async function submitPostEdit(e) {
  e.preventDefault();
  const postId = e.target.dataset.postId;
  const post = findFeedPost(postId);
  const body = document.getElementById('soc-edit-body').value.trim();
  const vis = document.getElementById('soc-edit-vis').value;
  const plushVal = document.getElementById('soc-edit-plush').value;
  const removePhoto = !!document.getElementById('soc-edit-remove-photo')?.checked;
  let catalogId = null, plushName = null;
  if (plushVal) { const [cid, name] = plushVal.split('|'); catalogId = cid || null; plushName = name || null; }

  // The DB requires body OR a photo OR a tagged plush. Work out whether
  // any survives this edit.
  const photoAfter = !!state.socComposePhoto || (!!post?.photoUrl && !removePhoto);
  if (!body && !photoAfter && !plushName) {
    toast('A post needs a story, a photo, or a tagged plush.');
    return;
  }
  try {
    await data.updatePost(postId, {
      body, visibility: vis, catalogId, plushName,
      photoBlob: state.socComposePhoto,
      removePhoto: removePhoto && !state.socComposePhoto,
    });
    closeSocialModal();
    toast('Post updated.');
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (err) { console.error('updatePost', err); toast('Could not update post.'); }
}

function openEditProfile() {
  const p = state.socProfile?.profile || { bio: state._myBio };
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>Edit profile</h2>
    <form id="soc-profile-form">
      <label class="field">
        <span>Bio</span>
        <textarea id="soc-bio" rows="3" maxlength="280" placeholder="A line or two about you and your crypt…">${escapeHtml(p.bio || '')}</textarea>
      </label>
      <label class="field">
        <span>Avatar (optional)</span>
        <input type="file" id="soc-avatar" accept="image/*" />
        <span id="soc-avatar-name" class="soc-file-name"></span>
      </label>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-close-social>Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>`);
}

async function submitEditProfile(e) {
  e.preventDefault();
  const bio = document.getElementById('soc-bio').value.trim();
  try {
    await data.updateMyProfile({ bio, avatarBlob: state.socComposePhoto });
    closeSocialModal();
    toast('Profile updated.');
    // Refresh both the My Crypt cache and the open overlay view.
    await loadMyProfileCache();
    await openProfile(window.currentUser.id);
  } catch (err) { console.error('updateProfile', err); toast('Could not save profile.'); }
}

// Top 8 picker — drag-free, click to add/remove from an ordered list.
function openTop8Picker() {
  const existing = state.socProfile?.top8 || state._myTop8 || [];
  const current = existing.map((t) => t.plushName);
  // Default the "keep Tom" toggle to whether he's currently in the list,
  // so once excommunicated he stays gone across re-opens (no migration —
  // his presence in top_plushes IS the stored preference).
  const tomPresent = existing.some((t) =>
    t.catalogId === data.TOM_TOP.catalogId || (t.plushName || '').trim().toLowerCase() === 'tom');
  // Build from the user's collection; preselect anything already chosen.
  // Top 8 Buns are plushes + minis only — accessories, outfits, charms and
  // other merch live in the collection but don't belong in the Buns lineup.
  const items = state.collection.filter((p) => {
    const cat = itemCategory(p);
    return cat === 'plush' || cat === 'mini';
  }).map((p) => {
    const name = p.nickname || p.name;
    const picked = current.includes(name);
    const img = p.photo || catalogImageFor(p.catalogId);
    return `
      <button type="button" class="soc-pick ${picked ? 'picked' : ''}"
        data-soc-pick data-name="${escapeHtml(name)}"
        data-catalog="${escapeHtml(p.catalogId || '')}"
        data-photo="${escapeHtml(p.photoPath || '')}">
        <div class="soc-pick-photo">${img ? `<img src="${escapeHtml(img)}" loading="lazy" alt="" />` : '<span class="no-photo">🖤</span>'}</div>
        <span class="soc-pick-name">${escapeHtml(name)}</span>
        <span class="soc-pick-rank"></span>
      </button>`;
  }).join('');
  openSocialModal(`
    <button class="modal-close" data-close-social aria-label="Close">×</button>
    <h2>Pick your Top 8 Buns</h2>
    <p class="soc-help">Tap up to 8 plushes from your collection. Tap again to remove. Order = pick order. Tom tags along until you've picked a full 8. 🐰</p>
    <div class="soc-pick-grid">${items || '<p class="empty-note">Your collection is empty — add some plushes first.</p>'}</div>
    <label class="checkbox soc-keep-tom">
      <input type="checkbox" id="soc-keep-tom" ${tomPresent ? 'checked' : ''} />
      <span>Keep Tom in my Top 8 Buns 🐰 <span class="soc-keep-tom-note">(uncheck to excommunicate him)</span></span>
    </label>
    <div class="form-actions">
      <button type="button" class="btn-ghost" data-close-social>Cancel</button>
      <button type="button" class="btn-primary" data-soc-action="save-top8">Save Top 8 Buns</button>
    </div>`);
  refreshTop8Ranks();
}

function refreshTop8Ranks() {
  const picked = [...document.querySelectorAll('.soc-pick.picked')];
  picked.forEach((b, i) => { b.querySelector('.soc-pick-rank').textContent = `#${i + 1}`; });
}

async function saveTop8() {
  const picked = [...document.querySelectorAll('.soc-pick.picked')];
  if (picked.length > 8) { toast('Pick at most 8.'); return; }
  const entries = picked.map((b) => ({
    plushName: b.dataset.name,
    catalogId: b.dataset.catalog || null,
    photoPath: b.dataset.photo || null,
  }));
  const keepTom = document.getElementById('soc-keep-tom')?.checked ?? true;
  try {
    await data.setTopPlushes(entries, { keepTom });
    closeSocialModal();
    toast('Top 8 Buns saved. 🐰');
    await loadMyProfileCache();
    await openProfile(window.currentUser.id);
  } catch (err) { console.error('saveTop8', err); toast('Could not save Top 8 Buns.'); }
}

// ─── Social event wiring ────────────────────────────────────────────
function wireSocialEvents() {
  // Sub-tabs.
  document.querySelectorAll('#social-view .subtab').forEach((s) => {
    s.addEventListener('click', async () => {
      state.socProfile = null;
      if (s.dataset.socSubtab === 'me') {
        // Lazy-load my own profile data into the cache the tab reads.
        await loadMyProfileCache();
      }
      setSocSubTab(s.dataset.socSubtab);
    });
  });

  // Delegated clicks across the whole social view + modal.
  document.getElementById('social-view').addEventListener('click', onSocialClick);
  document.getElementById('social-modal').addEventListener('click', onSocialModalClick);

  // Search (debounced) on the friends sub-tab.
  document.getElementById('social-view').addEventListener('input', async (e) => {
    if (e.target.id !== 'soc-search-input') return;
    state.socSearchQuery = e.target.value.trim();
    clearTimeout(wireSocialEvents._t);
    wireSocialEvents._t = setTimeout(async () => {
      state.socSearch = state.socSearchQuery ? await data.searchUsers(state.socSearchQuery).catch(() => []) : [];
      if (state.socSubTab === 'friends' && !state.socProfile) renderFriends();
    }, 250);
  });

  // Comment submit + compose/profile/top8 forms (submit events).
  document.getElementById('social-view').addEventListener('submit', (e) => {
    const f = e.target.closest('[data-soc-action="submit-comment"]');
    if (f) { e.preventDefault(); submitCommentForm(f); }
  });

  // Graceful image fallback. `error` doesn't bubble, so listen in the
  // capture phase. A broken Top 8 image collapses to the 🖤 placeholder;
  // a broken post photo drops its block — no broken-image icons.
  document.getElementById('social-view').addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.fellBack) return;
    img.dataset.fellBack = '1';
    const slot = img.closest('.soc-top8-photo');
    if (slot) { slot.innerHTML = '<span class="no-photo">🖤</span>'; return; }
    const photo = img.closest('.soc-post-photo');
    if (photo) { photo.remove(); }
  }, true);
  document.getElementById('social-modal').addEventListener('submit', (e) => {
    if (e.target.id === 'soc-compose-form') submitComposer(e);
    else if (e.target.id === 'soc-edit-form') submitPostEdit(e);
    else if (e.target.id === 'soc-profile-form') submitEditProfile(e);
  });

  // File pickers inside the modal — compress + stash the blob. Each photo
  // input has a matching `<id>-name` span for the chosen-file label.
  document.getElementById('social-modal').addEventListener('change', async (e) => {
    if (['soc-compose-photo', 'soc-avatar', 'soc-edit-photo'].includes(e.target.id)) {
      const file = e.target.files?.[0];
      if (!file) { state.socComposePhoto = null; return; }
      try {
        state.socComposePhoto = await compressImage(file);
        const label = document.getElementById(e.target.id + '-name');
        if (label) label.textContent = '✓ ' + file.name;
      } catch (err) { console.warn('compress', err); toast('Could not read that image.'); }
    }
  });
}

async function loadMyProfileCache() {
  try {
    const [profile, posts, top8] = await Promise.all([
      data.getSocialProfile(window.currentUser.id),
      data.listUserPosts(window.currentUser.id),
      data.getTopPlushes(window.currentUser.id),
    ]);
    state._myBio = profile?.bio || '';
    state._myAvatarUrl = profile?.avatarUrl || null;
    state._myPosts = posts;
    state._myTop8 = top8;
  } catch (e) { console.warn('loadMyProfileCache', e); }
}

function onSocialModalClick(e) {
  if (e.target.closest('[data-close-social]')) { closeSocialModal(); return; }
  const pick = e.target.closest('[data-soc-pick]');
  if (pick) {
    const isPicked = pick.classList.contains('picked');
    if (!isPicked && document.querySelectorAll('.soc-pick.picked').length >= 8) {
      toast('That\'s 8 — remove one first.');
      return;
    }
    pick.classList.toggle('picked');
    refreshTop8Ranks();
    return;
  }
  const action = e.target.closest('[data-soc-action]')?.dataset.socAction;
  if (action === 'save-top8') saveTop8();
}

async function onSocialClick(e) {
  const target = e.target.closest('[data-soc-action]');
  if (!target) return;
  const a = target.dataset.socAction;
  const uid = target.dataset.uid;
  const postId = target.dataset.postId;

  switch (a) {
    case 'open-compose': openComposer(); break;
    case 'go-friends': setSocSubTab('friends'); break;
    case 'view-profile': await openProfile(uid); break;
    case 'close-profile': state.socProfile = null; renderSocial(); break;
    case 'edit-profile': closeSocialModal(); openAccountModal(); break;
    case 'edit-top8': openTop8Picker(); break;

    case 'toggle-like': await onToggleLike(postId, target); break;
    case 'toggle-comments': onToggleComments(postId); break;
    case 'edit-post': openPostEditor(postId); break;
    case 'delete-post': await onDeletePost(postId); break;
    case 'delete-comment': await onDeleteComment(target.dataset.commentId); break;

    case 'add-friend':    await socFriendAction(() => data.sendFriendRequest(uid), 'Friend request sent.'); break;
    case 'accept-friend': await socFriendAction(() => data.acceptFriendRequest(uid), 'Friend added. 🦇'); break;
    case 'decline-friend':await socFriendAction(() => data.removeFriend(uid), 'Request declined.'); break;
    case 'remove-friend': await socFriendAction(() => data.removeFriend(uid), 'Removed.'); break;
    case 'toggle-inner':  await socFriendAction(() => data.setInner(uid, target.dataset.on === '1'), 'Castle Crew updated. 🏰'); break;
    case 'toggle-coffin': await socFriendAction(() => data.setCoffinBuddy(uid, target.dataset.on === '1'), 'Coffin Buddies updated. ⚰️'); break;
  }
}

// Run a friend-graph mutation, then refresh the relevant views + badge.
async function socFriendAction(fn, okMsg) {
  try {
    await fn();
    toast(okMsg);
    await loadSocialData();
    if (state.socProfile) {
      await openProfile(state.socProfile.profile.id);   // refresh the open profile
    } else {
      renderSocial();
    }
    updateSocialBadge();
  } catch (e) {
    console.error('friend action', e);
    toast(e.message === 'duplicate key value violates unique constraint "friendships_pkey"'
      ? 'Already requested.' : 'Could not complete that.');
  }
}

async function onToggleLike(postId, btn) {
  const post = findFeedPost(postId);
  if (!post) return;
  const newState = !post.likedByMe;
  // Optimistic update.
  post.likedByMe = newState;
  post.likeCount += newState ? 1 : -1;
  rerenderSocialCurrent();
  try { await data.toggleLike(postId, newState); }
  catch (e) { console.error('like', e); toast('Could not update like.'); await loadSocialData(); rerenderSocialCurrent(); }
}

function onToggleComments(postId) {
  if (state.socExpandedComments.has(postId)) state.socExpandedComments.delete(postId);
  else state.socExpandedComments.add(postId);
  rerenderSocialCurrent();
}

async function submitCommentForm(form) {
  const input = form.querySelector('.soc-comment-input');
  const body = input.value.trim();
  if (!body) return;
  const postId = form.dataset.postId;
  input.value = '';
  try {
    await data.addComment(postId, body);
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('comment', e); toast('Could not comment.'); }
}

async function onDeletePost(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    await data.deletePost(postId);
    toast('Post deleted.');
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('delete post', e); toast('Could not delete.'); }
}

async function onDeleteComment(commentId) {
  try {
    await data.deleteComment(commentId);
    await loadSocialData();
    if (state.socProfile) await openProfile(state.socProfile.profile.id);
    else rerenderSocialCurrent();
  } catch (e) { console.error('delete comment', e); toast('Could not delete comment.'); }
}

// Find a post in whichever list is currently displayed (feed or an open
// profile) so optimistic updates can mutate it in place.
function findFeedPost(postId) {
  if (state.socProfile) return state.socProfile.posts.find((p) => p.id === postId);
  return state.socFeed.find((p) => p.id === postId);
}

function rerenderSocialCurrent() {
  renderSocial();
}

// The auth gate calls boot() again on SIGNED_IN / TOKEN_REFRESHED, so
// guard the one-time event wiring — re-attaching listeners would make
// every form submit (post, trade, etc.) fire twice. Data reloads below
// are safe to repeat.
let eventsWired = false;
async function boot() {
  if (!eventsWired) {
    // Set the flag FIRST: if wiring throws partway, a later boot() must
    // not re-run it and stack a second set of listeners on everything
    // that did bind (which is how the theme toggle ends up double-firing).
    eventsWired = true;
    wireEvents();
    wireSocialEvents();
  }
  loadFilters();                  // restore filter state + active tab from localStorage
  await data.loadActiveCollection();
  await handleJoinToken();        // ?join=<token> redeems and switches in
  await data.migrateFromIDB();    // one-time IDB → Supabase upload per account
  await data.loadAppSettings();   // feature flags (e.g. user photo uploads)
  applyFeatureFlags();
  await loadAll();
  state.pensOwned = await data.listPens();
  try { state.pensMeta = await data.listPenMeta(); } catch (e) { console.warn('pens meta load skipped', e); }
  await loadTradeData();
  render();
  // Social is the landing tab — load its feed/friends/requests and
  // repaint when ready (also fires friend-request notifications + badge).
  loadSocialData().then(() => {
    updateSocialBadge();
    if (state.tab === 'social') renderSocial();
  });
  scheduleSocialCheck();  // keep polling for new requests while the app is open
  updateNotifyButton();
  registerSW();
  if (await idb.getMeta('notify_enabled')) scheduleReminderCheck();
  // Catalog: ship the baked copy immediately, then try to refresh from live
  // Shopify in the background. Falls back silently if CORS or network blocks it.
  loadCatalog().then(() => {
    if (state.tab === 'catalog') render();
    refreshCatalogLive();
  });
}

// Legal modal works on the pre-sign-in auth overlay too, so wire it up
// immediately rather than waiting for boot() (which is gated behind auth).
wireLegalModal();

// Gate the app behind sign-in + profile. The auth overlay handles its own UI;
// once both exist, runAuthGate's callback fires and the app boots normally.
runAuthGate(() => {
  boot().catch((e) => {
    console.error(e);
    toast('Something went wrong loading the app.');
  });
}).catch((e) => {
  console.error('auth bootstrap', e);
});
