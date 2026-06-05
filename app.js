// ─── State ────────────────────────────────────────────────────────────
const state = {
  tab: 'catalog',             // 'catalog' | 'collection' | 'wishlist' | 'pens'
  filter: 'all',              // collection: all | active | retired
  colCategory: 'all',         // collection category chip
  colDupes: false,            // collection: only quantity > 1
  colNoBag: false,            // collection: only missing bag
  colSort: 'acquired_desc',
  wishCategory: 'all',
  wishInStock: false,
  wishSort: 'added_desc',
  catalogFilter: 'all',       // catalog category: all | plush | accessory | other
  catalogStatuses: new Set(), // empty = any; otherwise OR of: available/sold_out/coming_soon/retired/fyc
  catalogUnowned: false,      // toggle: hide ones already in collection
  catalogCharmOnly: false,    // toggle: only show items tagged bag charm
  catalogTheme: 'all',        // tag value to require; 'all' = no constraint
  catalogColor: 'all',        // color tag substring match; 'all' = no constraint
  catalogSort: 'newest',      // newest | oldest | name_asc | name_desc | price_asc | price_desc
  query: '',
  editingId: null,
  collection: [],
  wishlist: [],
  catalog: [],                // loaded from catalog.json
  pensOwned: new Map(),       // id → count (omitted = 0)
  blobUrls: new Map(),

  // ─── Trade state ──────────────────────────────────────────────────
  tradeSubTab: 'browse',      // 'browse' | 'trades' | 'items'
  myTradeItems: [],
  tradeBrowse: [],
  trades: [],
  myFeedback: { good_count: 0, meh_count: 0, bad_count: 0, net_score: 0, total_count: 0 },
  partnerFeedback: new Map(), // userId → summary
  offerDraft: null,           // { recipientId, recipientUsername, recipientItems, myItems, parentTradeId? }
  feedbackDraft: null,        // { tradeId, rateeId, rateeUsername, rating, comment }

  // ─── Admin state ──────────────────────────────────────────────────
  adminUsers: [],             // list of all profiles + feedback
  adminUserView: null,        // { user, snapshot } when drilled into a user
};

const PRODUCT_URL_BASE = 'https://plushiedreadfuls.com/products/';

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

function cleanCatalogName(name) {
  const afterPrefix = name.replace(/^Plushie Dreadfuls\s*-?\s*/i, '').trim() || name;
  let n = afterPrefix;
  // Trailing descriptive type suffixes that just repeat "this is a plushie."
  n = n.replace(/\s*-?\s*Plush\s+(Rabbit\s+)?Stuffed\s+(Cryptid\s+)?Animals?$/i, '').trim();
  n = n.replace(/\s*-?\s*Stuffed\s+Plush\s+Animals?$/i, '').trim();
  n = n.replace(/\s*-?\s*Plush\s+Cryptid\s+Stuffed\s+Animals?$/i, '').trim();
  n = n.replace(/\s*-?\s*(Mini\s+)?Plush\s+Keychain(\s+Accessor(?:y|ies))?$/i, '').trim();
  n = n.replace(/\s*-\s*$/, '').trim();
  return n.length >= 3 ? n : afterPrefix;
}

function shopifyImageVariant(url, size) {
  if (!url) return null;
  // Shopify CDN: insert _<size>x before extension, e.g. .jpg → _400x.jpg
  return url.replace(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i, `_${size}x.$1$2`);
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
  if (state.catalogCharmOnly) pills.push(`<button class="active-pill" data-clear="charm">Bag Charm ×</button>`);
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

function clearFilter(key) {
  if (key === 'all') {
    state.catalogFilter = 'all';
    state.catalogStatuses = new Set();
    state.catalogUnowned = false;
    state.catalogCharmOnly = false;
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
  } else if (key === 'charm') {
    state.catalogCharmOnly = false;
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

function syncCollectionChips() {
  document.querySelectorAll('#collection-filters .chip[data-filter]').forEach((c) => {
    c.classList.toggle('active', c.dataset.filter === state.filter);
  });
  document.querySelectorAll('#collection-filters .chip[data-col-cat]').forEach((c) => {
    c.classList.toggle('active', c.dataset.colCat === state.colCategory);
  });
  document.querySelectorAll('#collection-filters .chip[data-col-toggle]').forEach((c) => {
    const k = c.dataset.colToggle;
    c.classList.toggle('active', (k === 'dupes' && state.colDupes) || (k === 'nobag' && state.colNoBag));
  });
}

function syncWishlistChips() {
  document.querySelectorAll('#wishlist-actions .chip[data-wish-cat]').forEach((c) => {
    c.classList.toggle('active', c.dataset.wishCat === state.wishCategory);
  });
  document.querySelectorAll('#wishlist-actions .chip[data-wish-toggle]').forEach((c) => {
    const k = c.dataset.wishToggle;
    c.classList.toggle('active', k === 'instock' && state.wishInStock);
  });
}

// Re-apply the .active class on every chip from current state — safe to call
// after any state mutation. Single source of truth: state.catalogFilter,
// state.catalogStatuses, state.catalogUnowned, state.catalogCharmOnly.
function syncCatalogChips() {
  document.querySelectorAll('#catalog-filters .chip[data-cat-filter]').forEach((c) => {
    c.classList.toggle('active', c.dataset.catFilter === state.catalogFilter);
  });
  document.querySelectorAll('#catalog-filters .chip[data-cat-status]').forEach((c) => {
    c.classList.toggle('active', state.catalogStatuses.has(c.dataset.catStatus));
  });
  document.querySelectorAll('#catalog-filters .chip[data-cat-toggle]').forEach((c) => {
    const key = c.dataset.catToggle;
    const on = (key === 'unowned' && state.catalogUnowned)
            || (key === 'charm'   && state.catalogCharmOnly);
    c.classList.toggle('active', on);
  });
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
  const tags = (item.tags || []).map((t) => t.toLowerCase());
  const name = item.name.toLowerCase();
  const type = (item.type || '').toLowerCase();
  // Mini-plush keychains: explicitly tagged mini, or keychain-type plushies.
  if (type === 'keychain' && (tags.includes('plush') || tags.includes('plushie') || name.includes('plush'))) return true;
  if (tags.includes('mini') && (tags.includes('plush') || tags.includes('plushie'))) return true;
  return false;
}

function catalogCategory(item) {
  const t = (item.type || '').toLowerCase();
  if (NON_PLUSHIE_NAME.test(item.name || '')) return 'other';     // standees, etc. tagged as 'plush'
  if (OTHER_CATEGORY_TYPES.has(t)) return 'other';                // store merch
  if (isMiniPlushie(item)) return 'mini';
  if (t === 'plush' || t === 'toy' || t === 'stuffed toy') return 'plush';
  if (t === 'accessory' || t === 'plush accessory' || t === 'hair clip'
      || t === 'keychain' || t === 'patch' || t === 'plush backpack'
      || t === 'charms' || t === 'grab bag') return 'accessory';
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
    const r = await fetch('./catalog.json?v=33', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    state.catalog = (data.products || []).filter(isPlushieCollectible);
  } catch (e) {
    console.warn('catalog load failed', e);
    state.catalog = [];
  }
}

const LIVE_CATALOG_BASE = 'https://plushiedreadfuls.com/products.json?limit=250';

function normalizeShopifyProduct(p) {
  const variants = p.variants || [];
  const available = variants.some((v) => v.available);
  const priceNums = variants.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n));
  const tags = p.tags || [];
  return {
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
  };
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
  state.catalog = all.filter(isPlushieCollectible);
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

function matchesQuery(item, q) {
  if (!q) return true;
  const hay = [item.name, item.nickname, item.meaning, item.acquiredHow]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

// Look up a collection/wishlist item's category by joining to the catalog
// on catalog_id. Items without a catalog_id fall through to 'other'.
function itemCategory(item) {
  if (!item.catalogId) return 'other';
  const cat = state.catalog.find((c) => c.id === item.catalogId);
  return cat ? catalogCategory(cat) : 'other';
}

function filteredCollection() {
  const q = state.query.trim().toLowerCase();
  const arr = state.collection.filter((it) => {
    if (state.filter === 'active' && it.retired) return false;
    if (state.filter === 'retired' && !it.retired) return false;
    if (state.colCategory !== 'all' && itemCategory(it) !== state.colCategory) return false;
    if (state.colDupes && (it.quantity || 1) <= 1) return false;
    if (state.colNoBag && it.hasBag !== false) return false;
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
  switch (mode) {
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

const CATALOG_CATEGORIES = new Set(['all', 'plush', 'mini', 'accessory', 'other']);

function filteredCatalog() {
  const q = state.query.trim().toLowerCase();
  const { owned } = catalogIdMap();
  const cat = CATALOG_CATEGORIES.has(state.catalogFilter) ? state.catalogFilter : 'all';
  const statuses = state.catalogStatuses;
  const theme = state.catalogTheme;
  const items = state.catalog.filter((it) => {
    if (cat !== 'all' && catalogCategory(it) !== cat) return false;
    if (statuses.size > 0 && !statuses.has(itemStatus(it))) return false;
    if (state.catalogUnowned && owned.has(it.id)) return false;
    if (state.catalogCharmOnly && !isCharm(it)) return false;
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
    return (
      it.name.toLowerCase().includes(q) ||
      (it.tags || []).some((t) => t.toLowerCase().includes(q))
    );
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
  const year = item.createdAt ? new Date(item.createdAt).getFullYear() : null;
  if (year && !isNaN(year)) parts.push(`<span>${year}</span>`);
  return parts.length ? `<div class="card-meta">${parts.join('')}</div>` : '';
}

function renderCatalogCard(item, owned, wished) {
  const display = cleanCatalogName(item.name);
  const thumb = shopifyImageVariant(item.image, 400) || item.image;
  const photoHtml = thumb
    ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(display)}" loading="lazy" />`
    : `<span class="no-photo">🖤</span>`;

  const isOwned = owned.has(item.id);
  const isWished = wished.has(item.id);

  const badges = [];
  const status = itemStatus(item);
  if (status === 'retired') badges.push(`<span class="badge badge-retired">Retired</span>`);
  else if (status === 'coming_soon') badges.push(`<span class="badge badge-soon">Coming Soon</span>`);
  else if (status === 'fyc') badges.push(`<span class="badge badge-fyc" title="For Your Consideration — under consideration, doesn't exist yet">FYC</span>`);
  else if (status === 'sold_out') badges.push(`<span class="badge badge-oos">Sold Out</span>`);
  if (isMiniPlushie(item)) badges.push(`<span class="badge badge-mini">Mini</span>`);
  if (isOwned) badges.push(`<span class="card-status owned">✓ Owned</span>`);
  else if (isWished) badges.push(`<span class="card-status wished">★ Wished</span>`);

  const productUrl = PRODUCT_URL_BASE + item.handle;
  // Coming Soon / FYC items can't be owned yet — they don't physically exist.
  const canHave = !(status === 'coming_soon' || status === 'fyc');
  const haveBtn  = canHave  ? `<button class="btn-have" data-action="cat-have" data-cid="${item.id}">🖤 Have</button>` : '';
  const wantBtn  = !isWished ? `<button class="btn-want" data-action="cat-want" data-cid="${item.id}">🕯 Want</button>` : '';
  const linkBtn  = `<a class="btn-buy" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener" title="Open product page">Buy</a>`;
  const actions = isOwned
    ? `<button data-action="cat-edit" data-cid="${item.id}">Edit</button> ${haveBtn} ${linkBtn}`
    : `${haveBtn} ${wantBtn} ${linkBtn}`;

  return `
    <article class="card" data-cid="${item.id}">
      <div class="card-photo">
        ${photoHtml}
        ${badges.length ? `<div class="badge-stack">${badges.join('')}</div>` : ''}
      </div>
      <div class="card-body">
        <h3 class="card-name">${escapeHtml(display)}</h3>
        ${renderCatalogMeta(item)}
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

function renderCard(item, kind) {
  const src = photoSrc(item);
  const photoHtml = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
    : `<span class="no-photo">🖤</span>`;

  const meta = [];
  if (kind === 'collection') {
    if (item.dateCollected) meta.push(`<span>${formatDate(item.dateCollected)}</span>`);
    if (item.acquiredHow) meta.push(`<span>${escapeHtml(item.acquiredHow)}</span>`);
    if (item.hasBag === false) meta.push(`<span class="meta-warn">No bag</span>`);
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

  const actions = kind === 'collection'
    ? `
      ${qtyControl}
      ${tradeBtn}
      <button data-action="edit" data-id="${item.id}">Edit</button>
      <button class="btn-danger" data-action="delete" data-id="${item.id}">Delete</button>
    `
    : `
      <button class="btn-got" data-action="got" data-id="${item.id}">Got It! 🖤</button>
      ${tradeBtn}
      ${item.url ? `<a class="btn-buy" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="Open product page">Buy</a>` : ''}
      <button class="btn-danger" data-action="delete" data-id="${item.id}">Delete</button>
    `;

  return `
    <article class="card" data-id="${item.id}">
      <div class="card-photo">
        ${photoHtml}
        ${badges.length ? `<div class="badge-stack">${badges.join('')}</div>` : ''}
      </div>
      <div class="card-body">
        ${kind === 'collection' && item.nickname
          ? `<h3 class="card-name">${escapeHtml(item.nickname)}</h3>
             <p class="card-product">${escapeHtml(item.name)}</p>`
          : `<h3 class="card-name">${escapeHtml(item.name)}</h3>`}
        ${item.meaning ? `<p class="card-meaning">${escapeHtml(item.meaning)}</p>` : ''}
        ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
      </div>
      <div class="card-actions">${actions}</div>
    </article>
  `;
}

function render() {
  revokeAllBlobUrls();

  const tab = state.tab;
  document.getElementById('collection-view').classList.toggle('hidden', tab !== 'collection');
  document.getElementById('wishlist-view').classList.toggle('hidden', tab !== 'wishlist');
  document.getElementById('catalog-view').classList.toggle('hidden', tab !== 'catalog');
  document.getElementById('pens-view').classList.toggle('hidden', tab !== 'pens');
  document.getElementById('trade-view').classList.toggle('hidden', tab !== 'trade');
  document.getElementById('admin-view').classList.toggle('hidden', tab !== 'admin');
  // Admin tab visibility is gated by the current user being is_admin.
  document.getElementById('admin-tab').classList.toggle('hidden', !window.currentUser?.isAdmin);

  document.getElementById('collection-filters').classList.toggle('hidden', tab !== 'collection');
  document.getElementById('wishlist-actions').classList.toggle('hidden', tab !== 'wishlist');
  document.getElementById('catalog-filters').classList.toggle('hidden', tab !== 'catalog');

  // Search bar makes sense on item lists, not on the checklist/trade tabs.
  document.getElementById('search').classList.toggle('hidden', tab === 'pens' || tab === 'trade');
  // Active-filters bar belongs to the catalog.
  document.getElementById('active-filters').classList.toggle('hidden', tab !== 'catalog');
  // The plain count-label now only shows for non-catalog tabs (catalog has its own bar).
  document.getElementById('count-label').classList.toggle('hidden', tab === 'catalog');

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );

  if (tab === 'collection') {
    syncCollectionChips();
    const items = filteredCollection();
    document.getElementById('collection-grid').innerHTML = items.map((i) => renderCard(i, 'collection')).join('');
    document.getElementById('collection-empty').classList.toggle('hidden', items.length > 0);
    document.getElementById('count-label').textContent =
      `${items.length} of ${state.collection.length} item${state.collection.length === 1 ? '' : 's'}`;
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
  } else if (tab === 'pens') {
    renderPens();
    const unique = state.pensOwned.size;
    const total = [...state.pensOwned.values()].reduce((a, b) => a + b, 0);
    document.getElementById('count-label').textContent =
      `${unique} of ${PENS.length} unique · ${total} pen${total === 1 ? '' : 's'} total`;
  } else if (tab === 'trade') {
    renderTrade();
    document.getElementById('count-label').textContent = tradeCountLabel();
  } else if (tab === 'admin') {
    renderAdmin();
    document.getElementById('count-label').textContent = state.adminUserView
      ? `Inspecting @${state.adminUserView.user.username}`
      : `${state.adminUsers.length} user${state.adminUsers.length === 1 ? '' : 's'}`;
  }
  updateTradeBadge();
}

function renderPens() {
  const lines = [...new Set(PENS.map((p) => p.line))];
  const unique = state.pensOwned.size;
  const total = [...state.pensOwned.values()].reduce((a, b) => a + b, 0);
  const progressPct = Math.round((unique / PENS.length) * 100);
  document.getElementById('pens-progress').innerHTML = `
    <div class="pens-progress-text">
      <span class="pens-count">${unique}</span>
      <span class="pens-total">/ ${PENS.length} unique</span>
      <span class="pens-total-grand">· ${total} total</span>
    </div>
    <div class="pens-bar"><div class="pens-bar-fill" style="width: ${progressPct}%"></div></div>
  `;

  document.getElementById('pens-list').innerHTML = lines.map((line) => {
    const items = PENS.filter((p) => p.line === line);
    const ownedUnique = items.filter((p) => state.pensOwned.has(p.id)).length;
    const ownedTotal = items.reduce((sum, p) => sum + (state.pensOwned.get(p.id) || 0), 0);
    const rows = items.map((p) => {
      const count = state.pensOwned.get(p.id) || 0;
      return `
        <div class="pen-row ${count > 0 ? 'owned' : ''}">
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
function openModal(kind, item) {
  if (kind !== 'collection' || !item) return; // wishlist has no editable fields
  state.editingId = item.id;

  document.getElementById('modal-title').textContent = 'Edit Plushie';
  document.getElementById('modal-name').textContent = item.name || '';

  document.getElementById('f-nickname').value = item.nickname ?? '';
  document.getElementById('f-meaning').value = item.meaning ?? '';
  document.getElementById('f-date').value = item.dateCollected ?? '';
  document.getElementById('f-acquired').value = item.acquiredHow ?? '';
  document.getElementById('f-bag').checked = item.hasBag !== false;

  document.getElementById('modal').dataset.kind = 'collection';
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-meaning').focus(), 50);
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('plushie-form').reset();
  state.editingId = null;
}

async function submitForm(e) {
  e.preventDefault();
  const existing = state.collection.find((x) => x.id === state.editingId);
  if (!existing) { closeModal(); return; }

  const record = {
    ...existing,
    nickname: document.getElementById('f-nickname').value.trim() || null,
    meaning: document.getElementById('f-meaning').value.trim() || null,
    dateCollected: document.getElementById('f-date').value || null,
    acquiredHow: document.getElementById('f-acquired').value || null,
    hasBag: document.getElementById('f-bag').checked,
    updatedAt: Date.now(),
  };
  const kind = 'collection';

  await data.put(kind, record);
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
  try {
    await onCardClickInner(btn);
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

  if (action === 'edit') {
    const item = state.collection.find((x) => x.id === id);
    if (item) openModal('collection', item);
  } else if (action === 'delete') {
    if (!confirm('Remove this plushie?')) return;
    const inCol = state.collection.some((x) => x.id === id);
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
      state.tab = 'collection';
      state.filter = 'all';
      state.query = '';
      document.getElementById('search').value = '';
      render();
      toast(`Moved “${item.name}” to collection. 🖤`);
    } catch (err) {
      console.error('Got It! failed', err);
      toast('Could not move to collection.');
    }
  } else if (action === 'cat-have') {
    await addFromCatalog(cid, 'collection');
  } else if (action === 'cat-want') {
    await addFromCatalog(cid, 'wishlist');
  } else if (action === 'cat-edit') {
    const owned = state.collection.find((x) => x.catalogId === cid);
    if (owned) openModal('collection', owned);
  } else if (action === 'offer-trade') {
    const item = state.collection.find((x) => x.id === id);
    if (item) await markForTrade(item, 'offering');
  } else if (action === 'seek-trade') {
    const item = state.wishlist.find((x) => x.id === id);
    if (item) await markForTrade(item, 'seeking');
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
      await data.delete('collection', id);
    } else {
      // Don't drop below the count reserved for trades — that's already promised.
      const offering = state.myTradeItems.find((t) => t.kind === 'offering' && t.catalogId === item.catalogId);
      const reserved = offering?.reserved ?? 0;
      if (next < reserved) {
        toast(`Can't go below ${reserved} — that count is reserved in an active trade.`);
        return;
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
async function addFromCatalog(catalogId, kind) {
  const cat = state.catalog.find((c) => c.id === catalogId);
  if (!cat) return;

  if (kind === 'collection') {
    const existing = state.collection.find((x) => x.catalogId === cat.id);
    if (existing) {
      const next = (existing.quantity || 1) + 1;
      await data.put('collection', { ...existing, quantity: next, updatedAt: Date.now() });
      await loadAll();
      state.tab = 'collection';
      render();
      toast(`Now you have ${next} of “${cleanCatalogName(cat.name)}”. 🖤`);
      return;
    }
  } else {
    // Same idea on wishlist — don't duplicate.
    const existing = state.wishlist.find((x) => x.catalogId === cat.id);
    if (existing) {
      state.tab = 'wishlist';
      render();
      toast(`Already on your wish list.`);
      return;
    }
  }

  // Pull the product photo so the card stays good if the user goes offline
  // or the Shopify CDN URL ever rots. Fall back to the URL on CORS error.
  let photo = cat.image ? shopifyImageVariant(cat.image, 800) : null;
  if (photo) {
    try {
      const resp = await fetch(photo, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        photo = await compressImage(blob).catch(() => blob);
      }
    } catch { /* keep URL */ }
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
  state.tab = kind;
  render();
  if (kind === 'collection') {
    // Open the edit modal on the freshly-added row so the user can fill in
    // nickname / meaning / how-acquired up front.
    const newItem = state.collection.find((x) => x.id === base.id);
    if (newItem) openModal('collection', newItem);
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

async function maybeFireReminder() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;

  const oos = state.wishlist.filter((w) => w.outOfStock);
  if (oos.length === 0) return;

  const last = (await idb.getMeta('last_reminder')) || 0;
  const dayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - last < dayMs) return;

  const title = '🦇 Plushie Dreadfuls';
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

// ─── Event wiring ────────────────────────────────────────────────────
function wireEvents() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', async () => {
      state.tab = t.dataset.tab;
      if (state.tab === 'trade') await loadTradeData();  // refresh from server on enter
      if (state.tab === 'admin') {
        state.adminUserView = null;
        await loadAdminUsers();
      }
      render();
    });
  });

  // Collection chips: status (all/active/retired) + category (all/plush/mini/...)
  // + multi-select toggles (dupes/nobag). Per-chip listeners are simplest.
  function handleCollectionChip(c) {
    if (c.dataset.filter) {
      state.filter = c.dataset.filter;
    } else if (c.dataset.colCat) {
      state.colCategory = c.dataset.colCat;
    } else if (c.dataset.colToggle === 'dupes') {
      state.colDupes = !state.colDupes;
    } else if (c.dataset.colToggle === 'nobag') {
      state.colNoBag = !state.colNoBag;
    } else {
      return;
    }
    syncCollectionChips();
    render();
  }
  document.querySelectorAll('#collection-filters .chip').forEach((c) => {
    c.addEventListener('click', () => handleCollectionChip(c));
  });
  const colSortEl = document.getElementById('col-sort');
  if (colSortEl) colSortEl.addEventListener('change', () => {
    state.colSort = colSortEl.value;
    render();
  });

  // Wishlist chips: category + in-stock-only toggle.
  function handleWishlistChip(c) {
    if (c.dataset.wishCat) {
      state.wishCategory = c.dataset.wishCat;
    } else if (c.dataset.wishToggle === 'instock') {
      state.wishInStock = !state.wishInStock;
    } else {
      return;
    }
    syncWishlistChips();
    render();
  }
  document.querySelectorAll('#wishlist-actions .chip').forEach((c) => {
    c.addEventListener('click', () => handleWishlistChip(c));
  });
  const wishSortEl = document.getElementById('wish-sort');
  if (wishSortEl) wishSortEl.addEventListener('change', () => {
    state.wishSort = wishSortEl.value;
    render();
  });

  // Catalog chips: delegated handler. Each chip declares its purpose via
  // data-cat-filter / data-cat-status / data-cat-toggle and the dispatcher
  // updates the right state and re-syncs all chip active classes.
  // Belt-and-suspenders: also attach a direct click handler to each chip.
  // The delegated one should work, but if anything intercepts the bubbling
  // path the per-chip listener still fires.
  function handleChipClick(chip) {
    if (chip.dataset.catFilter) {
      state.catalogFilter = chip.dataset.catFilter;
    } else if (chip.dataset.catStatus) {
      const s = chip.dataset.catStatus;
      if (state.catalogStatuses.has(s)) state.catalogStatuses.delete(s);
      else state.catalogStatuses.add(s);
    } else if (chip.dataset.catToggle) {
      if (chip.dataset.catToggle === 'unowned') state.catalogUnowned = !state.catalogUnowned;
      else if (chip.dataset.catToggle === 'charm') state.catalogCharmOnly = !state.catalogCharmOnly;
    } else {
      return;
    }
    syncCatalogChips();
    render();
  }

  document.querySelectorAll('#catalog-filters .chip').forEach((c) => {
    c.addEventListener('click', () => handleChipClick(c));
  });

  // Active-filters bar: click any pill to drop that one filter, "Clear filters" to reset.
  document.getElementById('active-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if (btn) clearFilter(btn.dataset.clear);
  });

  const sortEl = document.getElementById('cat-sort');
  if (sortEl) {
    sortEl.addEventListener('change', () => {
      state.catalogSort = sortEl.value;
      render();
    });
  }
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

  document.getElementById('collection-grid').addEventListener('click', onCardClick);
  document.getElementById('wishlist-grid').addEventListener('click', onCardClick);
  document.getElementById('catalog-grid').addEventListener('click', onCardClick);

  // Trade tab wiring
  document.querySelectorAll('.subtab').forEach((s) => {
    s.addEventListener('click', () => setTradeSubTab(s.dataset.subtab));
  });
  document.getElementById('trade-view').addEventListener('click', onTradeClick);
  document.getElementById('admin-view').addEventListener('click', onAdminClick);

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

  // Feedback modal
  document.querySelectorAll('[data-close-feedback]').forEach((el) =>
    el.addEventListener('click', closeFeedbackModal)
  );
  document.querySelectorAll('.feedback-choice').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state.feedbackDraft) return;
      state.feedbackDraft.rating = b.dataset.rating;
      document.querySelectorAll('.feedback-choice').forEach((x) =>
        x.classList.toggle('selected', x === b)
      );
      document.getElementById('feedback-submit').disabled = false;
    });
  });
  document.getElementById('feedback-submit').addEventListener('click', submitFeedback);

  document.getElementById('user-badge').addEventListener('click', openAccountModal);

  // Account modal
  document.querySelectorAll('[data-close-account]').forEach((el) =>
    el.addEventListener('click', closeAccountModal)
  );
  document.getElementById('acct-save-username').addEventListener('click', saveUsername);
  document.getElementById('acct-save-email').addEventListener('click', saveEmail);
  document.getElementById('acct-save-address').addEventListener('click', saveDefaultAddress);
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
    if (!btn) return;
    const id = btn.dataset.penId;
    const delta = parseInt(btn.dataset.penDelta, 10);
    if (id && delta) adjustPen(id, delta);
  });

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
    state.tradeBrowse  = await data.browseOfferings();
    state.trades       = await data.listTrades();
    state.myFeedback   = await data.getFeedbackSummary(window.currentUser.id);

    // Cache feedback summaries for partners that appear in the trade list.
    const partnerIds = new Set();
    for (const t of state.trades) {
      const other = t.proposer_id === window.currentUser.id ? t.recipient_id : t.proposer_id;
      partnerIds.add(other);
    }
    await Promise.all([...partnerIds].map(async (uid) => {
      if (!state.partnerFeedback.has(uid)) {
        state.partnerFeedback.set(uid, await data.getFeedbackSummary(uid));
      }
    }));
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
  const existing = state.myTradeItems.find((t) => t.kind === kind && t.catalogId === item.catalogId);
  if (existing) {
    if (kind === 'offering') {
      const qty = prompt(`You're already offering ${existing.quantity}. New quantity?`, String(existing.quantity));
      if (qty === null) return;
      const n = Math.max(existing.reserved, parseInt(qty, 10) || 0);
      if (n === 0) {
        await data.deleteTradeItem(existing.id);
        toast('Removed from offerings.');
      } else {
        await data.updateTradeItem(existing.id, { quantity: n });
        toast('Updated offering.');
      }
    } else {
      await data.deleteTradeItem(existing.id);
      toast('Removed from seeking.');
    }
  } else {
    let quantity = 1;
    if (kind === 'offering') {
      const q = prompt('How many do you have to trade away?', '1');
      if (q === null) return;
      quantity = Math.max(1, parseInt(q, 10) || 1);
    }
    await data.addTradeItem({
      kind,
      catalogId: item.catalogId,
      catalogHandle: item.catalogHandle ?? null,
      name: item.name,
      photoPath: item.photoPath ?? null,
      quantity,
    });
    toast(kind === 'offering' ? 'Listed for trade.' : 'Seeking listed.');
  }
  state.myTradeItems = await data.listMyTradeItems();
  render();
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
  const groups = [...byOwner.entries()].map(([ownerId, g]) => `
    <section class="trader-group">
      <h2 class="trader-head">
        <span>@${escapeHtml(g.username)}</span>
        <button class="btn-link" data-action="propose-trade" data-uid="${ownerId}">Propose a trade →</button>
      </h2>
      <div class="grid grid-tight">
        ${g.items.map((it) => renderOfferingCard(it)).join('')}
      </div>
    </section>
  `).join('');
  document.getElementById('subtab-browse').innerHTML = groups;
}

function catalogImageFor(catalogId) {
  if (!catalogId) return null;
  const cat = state.catalog.find((c) => c.id === catalogId);
  return cat?.image ? shopifyImageVariant(cat.image, 400) : null;
}

function renderOfferingCard(it) {
  const src = it.photo || catalogImageFor(it.catalogId);
  const photo = src ? `<img src="${escapeHtml(src)}" loading="lazy" />` : `<span class="no-photo">🖤</span>`;
  return `
    <article class="card card-small">
      <div class="card-photo">${photo}</div>
      <div class="card-body">
        <h3 class="card-name">${escapeHtml(it.name)}</h3>
        <div class="card-meta"><span>Available: ${it.available}</span></div>
        ${it.notes ? `<p class="card-meaning">${escapeHtml(it.notes)}</p>` : ''}
      </div>
    </article>
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
                <h3 class="card-name">${escapeHtml(it.name)}</h3>
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
  const buckets = { pending: [], active: [], history: [] };
  for (const t of state.trades) {
    if (t.status === 'pending' && !tradeIsExpired(t))   buckets.pending.push(t);
    else if (t.status === 'accepted' && !tradeIsFinished(t)) buckets.active.push(t);
    else                                                 buckets.history.push(t);
  }

  const sec = (title, list) => list.length === 0
    ? ''
    : `<section class="trades-section"><h2 class="trader-head"><span>${title}</span></h2>${list.map((t) => renderTradeRow(t, uid)).join('')}</section>`;

  let html = '';
  html += sec('Pending', buckets.pending);
  html += sec('Active', buckets.active);
  html += sec('History', buckets.history.slice(0, 30));
  if (!html) html = `<div class="empty"><div class="ghost">📜</div><p>No trades yet. Browse offerings to start one.</p></div>`;
  document.getElementById('subtab-trades').innerHTML = html;
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

  const statusText = (() => {
    if (t.status === 'pending') {
      const exp = new Date(t.expires_at);
      const hoursLeft = Math.max(0, Math.round((exp - new Date()) / 3600000));
      return `Pending · expires in ${hoursLeft}h`;
    }
    return capitalize(t.status);
  })();

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

  return `
    <article class="trade-card">
      <header class="trade-head">
        <div>
          <span class="trade-with">${isMine ? 'You → ' : ''}@${escapeHtml(otherName || 'unknown')}${isMine ? '' : ' → You'}</span>
          <span class="trade-status">${statusText}</span>
        </div>
      </header>
      <div class="trade-lines">
        <div><h4>You give:</h4><ul>${lineHtml(myLines) || '<li class="dim">(nothing)</li>'}</ul></div>
        <div><h4>You get:</h4><ul>${lineHtml(theirLines) || '<li class="dim">(nothing)</li>'}</ul></div>
      </div>
      ${t.message ? `<p class="trade-message">“${escapeHtml(t.message)}”</p>` : ''}
      ${t.status === 'accepted' ? renderShipFirstBanner(t, isMine) : ''}
      ${actions ? `<div class="card-actions">${actions}</div>` : ''}
    </article>
  `;
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
  parts.push(`<button class="btn-danger" data-action="trade-fall-through" data-id="${t.id}">Fell through</button>`);
  return parts.join(' ');
}

function renderCompletedTradeActions(t, isMine, uid) {
  // Feedback availability: did we already submit?
  const myFb = (t._myFeedback);  // we'd need to look it up; for now just show button
  return `<button data-action="trade-feedback" data-id="${t.id}">Leave feedback</button>`;
}

// ─── Trade: card-action dispatchers ──────────────────────────────────
async function onTradeClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, uid } = btn.dataset;
  if (action === 'propose-trade')         await openOfferModal(uid);
  else if (action === 'trade-item-remove') await removeMyTradeItem(id);
  else if (action === 'trade-item-adjust') await adjustMyTradeItem(id);
  else if (action === 'trade-accept')      await respondToTrade(id, 'accept');
  else if (action === 'trade-reject')      await respondToTrade(id, 'reject');
  else if (action === 'trade-counter')     await openCounterModal(id);
  else if (action === 'trade-cancel')      await respondToTrade(id, 'cancel');
  else if (action === 'trade-fall-through') await respondToTrade(id, 'cancel');
  else if (action === 'trade-shipped')     await tradeShipped(id, btn.dataset.side);
  else if (action === 'trade-received')    await tradeReceived(id, btn.dataset.side);
  else if (action === 'trade-address')     await openAddressModal(id);
  else if (action === 'trade-feedback')    await openFeedbackModal(id);
}

async function removeMyTradeItem(id) {
  const it = state.myTradeItems.find((x) => x.id === id);
  if (!it) return;
  if (it.reserved > 0) { toast('Cannot remove: reserved in an active trade.'); return; }
  if (!confirm('Remove this from your trade list?')) return;
  await data.deleteTradeItem(id);
  state.myTradeItems = await data.listMyTradeItems();
  render();
}

async function adjustMyTradeItem(id) {
  const it = state.myTradeItems.find((x) => x.id === id);
  if (!it) return;
  const q = prompt(`New quantity (minimum ${it.reserved} due to active trades):`, String(it.quantity));
  if (q === null) return;
  const n = Math.max(it.reserved, parseInt(q, 10) || 0);
  if (n === 0) await data.deleteTradeItem(id);
  else await data.updateTradeItem(id, { quantity: n });
  state.myTradeItems = await data.listMyTradeItems();
  render();
}

async function respondToTrade(id, action) {
  const t = state.trades.find((x) => x.id === id);
  if (!t) return;
  try {
    if (action === 'accept')         await data.acceptTrade(id);
    else if (action === 'reject')    await data.rejectTrade(id);
    else if (action === 'cancel')    await data.cancelTrade(id, t.status === 'pending' ? 'cancelled' : 'cancelled');
  } catch (err) {
    console.error(err);
    if (err.message === 'item_unavailable') {
      toast('One of those items is no longer available.');
    } else {
      toast('Couldn’t complete that action.');
    }
    return;
  }
  toast(action === 'accept' ? 'Trade accepted.' : action === 'reject' ? 'Trade rejected.' : 'Trade cancelled.');
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
async function openOfferModal(recipientId, parentTradeId) {
  const recipientItems = state.tradeBrowse.filter((it) => it.ownerId === recipientId);
  const recipientUsername = recipientItems[0]?.ownerUsername ?? '?';

  state.offerDraft = {
    recipientId,
    recipientUsername,
    recipientItems,
    myItems: state.myTradeItems.filter((t) => t.kind === 'offering'),
    proposerPicks: new Map(),    // tradeItemId → qty (my offerings)
    recipientPicks: new Map(),   // tradeItemId → qty (their offerings)
    parentTradeId,
  };

  document.getElementById('offer-title').textContent = parentTradeId ? 'Counter offer' : 'Propose a trade';
  document.getElementById('offer-sub').textContent = `with @${recipientUsername}`;
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
async function openFeedbackModal(tradeId) {
  const t = state.trades.find((x) => x.id === tradeId);
  if (!t) return;
  const uid = window.currentUser.id;
  const rateeId = t.proposer_id === uid ? t.recipient_id : t.proposer_id;
  const rateeName = t.proposer_id === uid ? t.recipient?.username : t.proposer?.username;

  // Already left feedback?
  const existing = await data.getFeedbackForTrade(tradeId);
  if (existing.some((f) => f.rater_id === uid)) {
    toast('You already left feedback for this trade.');
    return;
  }

  state.feedbackDraft = { tradeId, rateeId, rateeUsername: rateeName, rating: null, comment: '' };
  document.getElementById('feedback-sub').textContent = `@${rateeName || 'partner'}`;
  document.getElementById('feedback-comment').value = '';
  document.querySelectorAll('.feedback-choice').forEach((b) => b.classList.remove('selected'));
  document.getElementById('feedback-submit').disabled = true;
  document.getElementById('feedback-modal').classList.remove('hidden');
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.add('hidden');
  state.feedbackDraft = null;
}

async function submitFeedback() {
  const d = state.feedbackDraft;
  if (!d || !d.rating) return;
  try {
    await data.leaveFeedback(d.tradeId, d.rateeId, d.rating, document.getElementById('feedback-comment').value.trim() || null);
    toast('Feedback recorded.');
    closeFeedbackModal();
    await loadTradeData();
    render();
  } catch (err) {
    console.error(err);
    toast('Could not save feedback.');
  }
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
async function openAccountModal() {
  document.getElementById('acct-username').value = window.currentUser?.username ?? '';
  document.getElementById('acct-email').value    = window.currentUser?.email ?? '';
  document.getElementById('acct-address').value  = await data.getMyAddress();
  // Admin tag in the modal header so it's obvious who you're signed in as.
  const heading = document.querySelector('#account-modal h2');
  if (heading) {
    heading.innerHTML = 'Your account' + (window.currentUser?.isAdmin
      ? ' <span class="role-tag">admin</span>' : '');
  }

  // Feedback summary
  const fb = state.myFeedback || { good_count: 0, meh_count: 0, bad_count: 0, net_score: 0, total_count: 0 };
  document.getElementById('acct-feedback').innerHTML = `
    <div class="fb-cell"><span class="fb-num fb-good">${fb.good_count}</span><span class="fb-label">good</span></div>
    <div class="fb-cell"><span class="fb-num fb-meh">${fb.meh_count}</span><span class="fb-label">meh</span></div>
    <div class="fb-cell"><span class="fb-num fb-bad">${fb.bad_count}</span><span class="fb-label">bad</span></div>
    <div class="fb-cell"><span class="fb-num">${fb.net_score}</span><span class="fb-label">net</span></div>
    <div class="fb-cell"><span class="fb-num">${fb.total_count}</span><span class="fb-label">total</span></div>
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
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('duplicate') || msg.includes('unique')) toast('That username is taken.');
    else toast('Could not update username.');
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

async function saveDefaultAddress() {
  const a = document.getElementById('acct-address').value.trim();
  try {
    await data.setMyAddress(a);
    toast(a ? 'Default address saved.' : 'Default address cleared.');
  } catch (err) {
    console.error(err);
    toast('Could not save address.');
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
  document.getElementById('address-sub').textContent = `Trade with @${otherName || 'partner'}`;
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
  document.getElementById('admin-content').innerHTML = `
    <h2 class="trader-head"><span>Users</span></h2>
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Joined</th><th>Feedback (g/m/b)</th><th>Net</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
          <h3 class="card-name">${escapeHtml(it.nickname || it.name)}</h3>
          ${it.nickname ? `<p class="card-product">${escapeHtml(it.name)}</p>` : ''}
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
  `;
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
    if (!confirm('Delete this wishlist entry on behalf of the user?')) return;
    try {
      await data.adminDeleteWishlist(btn.dataset.id);
      // Refresh snapshot
      const uid = state.adminUserView.user.id;
      state.adminUserView.snapshot = await data.adminUserSnapshot(uid);
      renderAdmin();
      toast('Removed.');
    } catch (err) {
      console.error(err);
      toast('Could not delete.');
    }
  }
}

// ─── Service worker ──────────────────────────────────────────────────
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW failed', e));
  });
}

// ─── Boot ────────────────────────────────────────────────────────────
async function boot() {
  wireEvents();
  await data.loadActiveCollection();
  await handleJoinToken();        // ?join=<token> redeems and switches in
  await data.migrateFromIDB();    // one-time IDB → Supabase upload per account
  await loadAll();
  state.pensOwned = await data.listPens();
  await loadTradeData();
  render();
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
