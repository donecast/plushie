// ════════════════════════════════════════════════════════════════════
// app-collection.js — part 3 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Card rendering, manual ordering, edit modal, and worn clothing.
// ════════════════════════════════════════════════════════════════════

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
  // Date-only ISO strings parse as UTC midnight; render in UTC too so the
  // calendar day is stable regardless of the viewer's timezone.
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ─── Real-name helpers (mirror db/0045 server-side logic) ──────────────
// A "full" last name is more than a bare initial: at least two letters.
// Used to gate listing an item for trade (the DB enforces the same rule).
function hasFullLastName(last) {
  return (String(last ?? '').match(/\p{L}/gu) || []).length >= 2;
}

// Build the public display name for a profile from its raw fields and the
// owner's visibility choice. Returns '' when there's nothing to show
// (no first name, or the owner opted out). Mirrors public_display_name().
//   'full'          → "First Last"
//   'first_initial' → "First L."   (the default)
//   'hidden'        → ''
function formatDisplayName(first, last, visibility) {
  first = String(first ?? '').trim();
  last = String(last ?? '').trim();
  if (!first || visibility === 'hidden') return '';
  if (visibility === 'full' && last) return `${first} ${last}`;
  if (last) return `${first} ${last[0].toUpperCase()}.`;
  return first;
}

// Parse one AND-group of a search string into positive / negative terms.
// Supports:
//   foo bar      → must contain "foo" AND "bar"
//   foo & bar    → same; "&" is an explicit AND separator (like a space)
//   "foo bar"    → must contain the exact phrase "foo bar"
//   -foo         → must NOT contain "foo"
//   -"foo bar"   → must NOT contain the phrase "foo bar"
// (OR is handled one level up by splitOrGroups / parseSearch, on commas.)
// Expects a lowercased query (callers already lowercase). Cached per string
// since the same group is parsed once per item across a render pass.
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
      if (tok === '&') continue;               // bare AND separator — skip
      let neg = false;
      if (tok.startsWith('-') && tok.length > 1) { neg = true; tok = tok.slice(1); }
      if (tok && tok !== '-') terms.push({ neg, text: tok });
    }
  }
  _queryCache = { src: q, terms };
  return terms;
}

// Split a search string into OR-groups on top-level commas, leaving commas
// inside "quoted phrases" untouched. Each non-empty group is an AND-query
// (see parseQuery). So  tote, bag  → "tote" OR "bag", while
// -tote & -bag  → a single group requiring neither.
function splitOrGroups(q) {
  const groups = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === '"') { inQuote = !inQuote; buf += c; }
    else if (c === ',' && !inQuote) { groups.push(buf); buf = ''; }
    else buf += c;
  }
  groups.push(buf);
  return groups.map((s) => s.trim()).filter(Boolean);
}

// Parse a full search string into OR-groups of parsed AND-terms. Cached per
// string so a multi-group query is split/parsed once per render pass.
let _searchCache = { src: null, groups: [] };
function parseSearch(q) {
  if (_searchCache.src === q) return _searchCache.groups;
  const groups = splitOrGroups(q).map((g) => parseQuery(g)).filter((t) => t.length);
  _searchCache = { src: q, groups };
  return groups;
}

// Test a haystack string against a parsed query. A haystack matches if it
// satisfies ANY OR-group; a group is satisfied when every positive term is
// present and no negative term is.
function queryMatches(hay, q) {
  if (!q) return true;
  const groups = parseSearch(q);
  if (!groups.length) return true;
  const h = hay.toLowerCase();
  for (const group of groups) {
    let ok = true;
    for (const t of group) {
      const present = h.includes(t.text);
      if (t.neg ? present : !present) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
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
  const q = state.colQuery.trim().toLowerCase();
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
  const q = state.wishQuery.trim().toLowerCase();
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
      ? 'Run the latest migration (db/0029_collection_sort.sql) — the sort_order column is missing.'
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

// ─── Wish-list manual ordering (mirrors the collection helpers above) ──────
// The wishlist is a flat list (no closet / sub-tabs), so its order is simply
// the displayed sequence. The top of this order is what surfaces in Crypt Vitals.
function applyManualWishOrder(orderedIds) {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  for (const it of state.wishlist) {
    if (pos.has(it.id)) it.sortOrder = pos.get(it.id);
  }
}

async function persistManualWishOrder(orderedIds) {
  applyManualWishOrder(orderedIds);
  render();
  try {
    await data.saveWishlistOrder(orderedIds);
  } catch (e) {
    console.error('saveWishlistOrder', e);
    toast(/sort_order/i.test(e?.message || '')
      ? 'Run the latest migration (db/0045_wishlist_sort.sql) — the sort_order column is missing.'
      : 'Could not save the new wish-list order.');
  }
}

async function moveWishlistItem(id, dir) {
  const ordered = sortWishlist(state.wishlist.slice(), 'manual').map((x) => x.id);
  const i = ordered.indexOf(id);
  if (i === -1) return;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return; // already at the edge
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  await persistManualWishOrder(ordered);
}

async function dropReorderWish(dragId, targetId) {
  if (!dragId || !targetId || dragId === targetId) return;
  const ordered = sortWishlist(state.wishlist.slice(), 'manual').map((x) => x.id);
  ordered.splice(ordered.indexOf(dragId), 1);
  ordered.splice(ordered.indexOf(targetId), 0, dragId);
  await persistManualWishOrder(ordered);
}

function sortWishlist(items, mode) {
  const a = items.slice();
  const cmpName = (x, y) => (x.name || '').localeCompare(y.name || '');
  const cmpAdded = (x, y) => (y.addedAt || 0) - (x.addedAt || 0);
  switch (mode) {
    case 'manual': {
      // Custom priority order (sort_order). Unplaced rows fall to the bottom,
      // newest-added first, so a fresh wishlist still reads sensibly.
      const rank = (x) => (x.sortOrder == null ? Infinity : x.sortOrder);
      a.sort((x, y) => (rank(x) - rank(y)) || cmpAdded(x, y));
      break;
    }
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
  const q = state.catQuery.trim().toLowerCase();
  const { owned } = catalogIdMap();
  const cat = CATALOG_CATEGORIES.has(state.catalogFilter) ? state.catalogFilter : 'all';
  const statuses = state.catalogStatuses;
  const theme = state.catalogTheme;
  const items = state.catalog.filter((raw) => {
    // A product auto-expanded into per-variant children: hide the now-
    // redundant umbrella card. The parent stays in state.catalog so
    // resolveCatalogItem can read its metadata and any collection row still
    // keyed to the product id keeps resolving to it.
    if (raw.variantParent) return false;
    // Resolve so variants inherit parent's type / tags / status when
    // they don't override — keeps them filterable under the same
    // theme / category as the parent.
    const it = resolveCatalogItem(raw);
    if (cat !== 'all' && catalogCategory(it) !== cat) return false;
    // FYC ("for your consideration") items are unconfirmed concepts that look
    // unfinished, so they're hidden from every feed/search by default. They
    // surface only when the viewer explicitly enables the FYC status filter.
    if (itemStatus(it) === 'fyc' && !statuses.has('fyc')) return false;
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
    // Name, tags, AND the parsed 'Set Includes' contents form one haystack so a
    // term can match the plush itself, a theme tag, or an accessory it ships
    // with — searching "bees" now surfaces every plush whose set includes bees,
    // not just the ones the brand happened to tag. Negative/phrase operators
    // (-foo, "foo bar") still apply across all of it.
    const accNames = (it.accessories || []).map((a) => a.name).join(' ');
    const hay = `${it.name} ${(it.tags || []).join(' ')} ${accNames}`;
    return queryMatches(hay, q);
  });
  return sortCatalog(items, state.catalogSort);
}

// Sort key for the date-ordered catalog views. Hand-entered (custom) items
// usually carry only a release_year — there's no real publish timestamp lined
// up with when the plush actually came out, just the created_at of when it was
// keyed in. Sorting on created_at alone strands those items at the "just added"
// end, so they read as missing from Newest/Oldest. Treat an explicit
// releaseYear as Jan 1 of that year (the same year renderCatalogMeta shows), so
// each custom sorts among its year-mates; order within a year doesn't matter.
// Shopify items have no releaseYear and keep their full created_at precision.
function catalogSortTime(item) {
  if (item.releaseYear && !isNaN(item.releaseYear)) {
    return Date.UTC(Number(item.releaseYear), 0, 1);
  }
  return Date.parse(item.createdAt) || 0;
}

function sortCatalog(items, mode) {
  const arr = items.slice();
  const cmpName = (a, b) => cleanCatalogName(a.name).localeCompare(cleanCatalogName(b.name));
  const cmpDate = (a, b) => catalogSortTime(b) - catalogSortTime(a);
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
  // Loyalty rewards aren't for sale, so a dollar price is misleading — omit it.
  if (item.price != null && !isLoyaltyReward(item)) parts.push(`<span>$${Number(item.price).toFixed(2)}</span>`);
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
  else if (status === 'sold_out') badges.push(isLoyaltyReward(item)
    ? `<span class="badge badge-reward" title="Loyalty reward — redeem with loyalty points, not for direct purchase">Rewards</span>`
    : `<span class="badge badge-oos">Sold Out</span>`);
  if (isMiniPlushie(item)) badges.push(`<span class="badge badge-mini">Mini</span>`);
  if (item.isBundle) {
    badges.push(`<span class="badge badge-bundle" title="Bundle — multiple items. Click Have to pick which ones you own.">Bundle</span>`);
  }
  // NB: form/variant is intentionally NOT badged on the photo — the variant
  // reads as the gold form-label text after the name (below) instead.

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
  // No Buy for loyalty rewards — they're redeemed with points, not purchasable.
  // No Buy for loyalty rewards (points-only) or retired items (no longer sold).
  const linkBtn  = (productUrl && !isLoyaltyReward(item) && status !== 'retired') ? `<a class="btn-buy" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener" title="Open product page">Buy</a>` : '';
  // "Suggest a photo" appears when the item has no image. We thread
  // the target id through dataset so the handler knows whether to
  // attach it to a Shopify id or a catalog_items uuid. Hidden when
  // the user_photo_uploads feature flag is off (admins still see it).
  const canSuggestPhotos = window.currentUser?.isAdmin || data.featureEnabled('feature.user_photo_uploads');
  // Variants carry a synthetic id with no Shopify product / catalog_items
  // row to attach a suggestion to (and they always inherit a photo), so the
  // suggest-photo affordance is suppressed for them.
  const suggestBtn = (!thumb && canSuggestPhotos && !item.isVariant)
    ? `<button class="btn-suggest" data-action="cat-suggest-photo" data-cid="${item.id}" data-target-kind="${item.isCustom ? 'custom' : 'shopify'}">🤍 Suggest a photo</button>`
    : '';
  // Admins can edit any catalog item. Custom rows get the full editor;
  // Shopify rows get the lighter overrides editor (lore / symbolism /
  // Set Includes overlay) since the rest is owned by the upstream feed.
  const adminEditBtn = window.currentUser?.isAdmin
    ? (item.isCustom
        ? `<button class="btn-icon" data-action="cat-admin-edit" data-cid="${item.id}" title="Edit catalog entry">✎</button>`
        : `<button class="btn-icon" data-action="cat-admin-override" data-cid="${item.id}" title="Edit catalog details">✎</button>`)
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
        <h3 class="card-name card-name-clickable" data-action="cat-detail" data-cid="${item.id}">${escapeHtml(display)}${(item.isCustom || item.isVariant) && item.formLabel ? ` <span class="card-form-label">${escapeHtml(item.formLabel)}</span>` : ''}</h3>
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
  // User-added off-catalog clothing carries an explicit scale flag — the
  // most authoritative signal, so check it first.
  if (item.clothingScale) return true;
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
  // User-added clothing records its scale explicitly.
  if (item.clothingScale) return item.clothingScale === 'mini';
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

// A "bun" is an actual plush — a plushie or a mini. Clothing, accessories, and
// everything else in the crypt are NOT buns and don't count toward the tally.
function isBun(item) {
  if (isWearableItem(item)) return false;
  const c = itemCategory(item);
  return c === 'plush' || c === 'mini';
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
  // Compact view is starved for space: drop the button label down to the bare
  // ↩ arrow (the title/aria-label still carries the meaning).
  const compact = state.colView === 'compact';
  const detachLabel = compact ? '↩' : '↩ Hang it back up';
  return `
    <div class="attached-acc" data-acc-id="${a.id}">
      <span class="attached-acc-name" data-action="open-detail" data-id="${a.id}" role="button">${escapeHtml(a.nickname || stripOutfitWord(a.name))}</span>
      <div class="attached-acc-photo" data-action="zoom-photo" data-id="${a.id}" role="button" title="Tap to see it bigger">${photo}</div>
      <button class="attached-detach" data-action="detach-acc" data-id="${a.id}" title="Hang it back up in the closet" aria-label="Hang it back up in the closet">${detachLabel}</button>
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
  // Custom (user-added, off-catalog) clothing gets a ✨ tag so it reads
  // clearly as "not a Plushie Dreadfuls item." First in the stack → it
  // sits in the upper-left corner of the card.
  if (kind === 'collection' && item.clothingScale) {
    badges.push(`<span class="badge badge-custom" title="Custom — not a Plushie Dreadfuls item">✨</span>`);
  }
  // Retired wins over Out of Stock. A wish-list row's own snapshot can be stale,
  // so read retired from the live catalog item when there is one — a wished
  // retired plush should read "Retired", not "Out of Stock".
  const liveCat = item.catalogId ? catalogForItem(item) : null;
  const isRetired = item.retired || (liveCat && liveCat.retired);
  if (isRetired) badges.push(`<span class="badge badge-retired">Retired</span>`);
  else if (kind === 'wishlist' && item.outOfStock) badges.push(`<span class="badge badge-oos">Out of Stock</span>`);
  if (kind === 'collection' && (item.quantity || 1) > 1) {
    badges.push(`<span class="badge badge-qty">×${item.quantity}</span>`);
  }

  // Trade markers: show if this catalog item is already in trade_items.
  // Rendered INLINE in the body (next to the name), not as a photo overlay —
  // on the compact list the tiny thumbnail can't hold an overlay badge without
  // it spilling onto the picture.
  const tradeMark = tradeMarkerFor(item, kind);
  const tradeMarkHtml = tradeMark ? `<div class="card-trade-mark">${tradeMark}</div>` : '';

  const tradeBtn = kind === 'collection'
    ? `<button data-action="offer-trade" data-id="${item.id}">↻ Trade?</button>`
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

  // Manual reorder controls (item 20) — only while actively arranging (the ↕
  // Arrange toggle), and only for items that live in the main collection grid
  // (clothing sits in its own closet section, so it doesn't take part in
  // manual ordering). A drag grip (desktop) plus up/down arrows (touch). Note
  // this is gated on `arranging`, NOT the sort: viewing the saved custom order
  // ("My order" in the sort menu) shows it without the live drag handles.
  const manualMode = !isWearableItem(item) && (
    (kind === 'collection' && state.arranging) ||
    (kind === 'wishlist' && state.wishArranging)
  );
  const upAction = kind === 'wishlist' ? 'move-up-wish' : 'move-up';
  const downAction = kind === 'wishlist' ? 'move-down-wish' : 'move-down';
  const reorder = manualMode
    ? `<div class="col-reorder" title="Drag the grip to reorder, or use the arrows">
         <button class="reorder-btn" data-action="${upAction}" data-id="${item.id}" aria-label="Move up">▲</button>
         <span class="reorder-grip" aria-hidden="true">☰</span>
         <button class="reorder-btn" data-action="${downAction}" data-id="${item.id}" aria-label="Move down">▼</button>
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
      ${reorder}
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
    ${tradeMarkHtml}
    ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
  `;
  const otherBody = `
    <h3 class="card-name">${escapeHtml(stripOutfitWord(item.name))}</h3>
    ${item.meaning ? `<p class="card-meaning">${escapeHtml(item.meaning)}</p>` : ''}
    ${tradeMarkHtml}
    ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
  `;
  // Collection AND wish-list cards open their detail (right-rail master-detail on
  // wide screens; modal / lightbox fallback otherwise). Catalog cards don't.
  const bodyOpen = (kind === 'collection' || kind === 'wishlist')
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

  // Insider prototype: the experimental 3-zone "rails" layout. The body class is
  // all the CSS keys off to swap the centered column for left-nav + stage +
  // right-context rails (see styles.css; off => display:contents, unchanged).
  const railsOn = data.featureEnabled('feature.side_rails', false);
  document.body.classList.toggle('rails-on', railsOn);
  if (railsOn) { renderRailIdentity(); loadCatalogEvents(); }
  // Admin lives in the left rail too, but only for admins.
  document.querySelector('.rail-tab-admin')?.classList.toggle('hidden', !window.currentUser?.isAdmin);
}

function render() {
  revokeAllBlobUrls();

  const tab = state.tab;
  // Pens used to be a top-level tab; it's now a sub-tab of Collection.
  // We treat a Pens sub-view selection like 'tab is collection, but
  // showing the pens checklist'. The flags below derive from both.
  // 'crypt' is the merged identity surface: profile masthead + the collection
  // sub-tabs + Wish List (folded in from its old top-level tab). The flags
  // below derive from the tab + which sub-tab is active.
  const onCrypt = tab === 'crypt';
  const onWish  = onCrypt && state.colSubTab === 'wishlist';
  const onPens  = onCrypt && state.colSubTab === 'pens';
  const onCol   = onCrypt && !onWish;   // collection grid (also hosts the Pens sub-view)

  // Profile masthead (slim header, top) + sub-tab strip + the crypt footer
  // (Top 8 + your posts, below the collection) all show whenever we're on Crypt.
  document.getElementById('crypt-masthead').classList.toggle('hidden', !onCrypt);
  document.getElementById('collection-subtabs').classList.toggle('hidden', !onCrypt);
  document.getElementById('crypt-footer').classList.toggle('hidden', !onCrypt);

  document.getElementById('collection-view').classList.toggle('hidden', !onCol);
  document.getElementById('wishlist-view').classList.toggle('hidden', !onWish);
  document.getElementById('catalog-view').classList.toggle('hidden', tab !== 'catalog');
  document.getElementById('trade-view').classList.toggle('hidden', tab !== 'trade');
  document.getElementById('social-view').classList.toggle('hidden', tab !== 'home');
  document.getElementById('admin-view').classList.toggle('hidden', tab !== 'admin');
  // Admin is a distinct, full-width utility mode (no right rail, clear fonts).
  document.body.classList.toggle('on-admin', tab === 'admin');

  // My Crypt: render the profile masthead, light the active sub-tab, and pick
  // the collection grid vs. the Pens checklist sub-view.
  if (onCrypt) {
    renderCryptMasthead();
    renderCryptFooter();

    // Sub-tab badge counts over the whole collection (unfiltered) so the chips
    // are stable regardless of search/filters. Clothing lives in The Closet and
    // is NOT a plush/mini, so wearables are excluded from these counts.
    const tabCounts = { plushes: 0, minis: 0, accessories: 0, other: 0 };
    for (const it of state.collection) {
      if (isWearableItem(it)) continue;
      tabCounts[collectionTabOf(it)]++;
    }
    for (const k of Object.keys(tabCounts)) {
      const el = document.getElementById(`col-subtab-count-${k}`);
      if (el) el.textContent = `· ${tabCounts[k]}`;
    }
    document.getElementById('col-subtab-count-pens').textContent = `· ${state.pensOwned.size}/${activePens().length}`;
    const wlc = document.getElementById('col-subtab-count-wishlist');
    if (wlc) wlc.textContent = state.wishlist.length ? `· ${state.wishlist.length}` : '';

    // Light the active sub-tab, and hide any empty non-Pens sub-tab to keep the
    // strip tight (Pens always shows — it's a checklist; the active tab never
    // hides, so the current selection can't vanish).
    const subCount = (key) => key === 'wishlist' ? state.wishlist.length : (tabCounts[key] ?? 0);
    document.querySelectorAll('#collection-subtabs .subtab').forEach((s) => {
      const key = s.dataset.colSubtab;
      s.classList.toggle('active', key === state.colSubTab);
      const hide = key !== 'pens' && key !== state.colSubTab && subCount(key) === 0;
      s.classList.toggle('hidden', hide);
    });

    document.getElementById('collection-sub-items').classList.toggle('hidden', state.colSubTab === 'pens');
    document.getElementById('collection-sub-pens').classList.toggle('hidden', state.colSubTab !== 'pens');
  }

  // Toolbar visibility: Plushies sub-tab gets the search + filters;
  // Pens sub-tab hides them. Other tabs untouched.
  document.getElementById('collection-filters').classList.toggle('hidden', !onCol || onPens);
  document.getElementById('wishlist-actions').classList.toggle('hidden', !onWish);
  document.getElementById('catalog-filters').classList.toggle('hidden', tab !== 'catalog');

  // Search bar makes sense on item lists, not on the checklist/trade/social tabs.
  const searchEl = document.getElementById('search');
  searchEl.classList.toggle('hidden', onPens || tab === 'trade' || tab === 'admin' || tab === 'home');
  // Re-sync the box to the active section's own query (per-section search). Only
  // write when it differs, so typing doesn't fight the caret.
  const qKey = activeQueryKey();
  if (qKey && searchEl.value !== state[qKey]) searchEl.value = state[qKey];
  // Active-filters bar belongs to the catalog.
  document.getElementById('active-filters').classList.toggle('hidden', tab !== 'catalog');
  // The plain count-label now only shows for non-catalog tabs (catalog has its own bar).
  document.getElementById('count-label').classList.toggle('hidden', tab === 'catalog' || onPens || tab === 'home');

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  // Mobile bottom nav mirrors the active tab (same data-tab values).
  document.querySelectorAll('.bottom-tab').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // Keep the header avatar button current (username + avatar).
  if (typeof updateUserBadge === 'function') updateUserBadge();

  // Rails layout (insider): keep the left nav lit + the right contextual rail
  // in sync with the active tab. No-ops visually unless body.rails-on is set.
  if (document.body.classList.contains('rails-on')) {
    document.querySelectorAll('.rail-tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === tab)
    );
    renderRailIdentity();
    renderRightRail();
    renderRailStirrings();
  }

  if (onCol) {
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
    // While arranging, surface a hint so the drag/▲▼ affordance is discoverable.
    const manualHint = state.arranging && mainItems.length > 1
      ? '<p class="subview-hint">↕ Drag the ☰ grip or use ▲▼ to arrange your collection exactly how you want.</p>'
      : '';
    colGrid.innerHTML = manualHint + mainItems.map((i) => renderCollectionEntry(i)).join('');
    const unwornSection = document.getElementById('unworn-clothing-section');
    if (unwornSection) {
      document.getElementById('unworn-clothing-grid').innerHTML = closetItems.map((i) => renderCard(i, 'collection')).join('');
      // The closet is a permanent fixture of the Plushes/Minis tabs —
      // shown even when empty so it reads as a consistent home for
      // clothing. The "+ Add your own" affordance, though, is gated to
      // users the feature is turned on for.
      const isClosetTab = (sub === 'plushes' || sub === 'minis');
      const canAddClothing = data.featureEnabled('feature.custom_clothing');
      // Always-on once the crypt has anything in it; suppressed only for a
      // brand-new, totally empty collection so the single "crypt is empty"
      // prompt isn't doubled up with an empty closet.
      unwornSection.classList.toggle('hidden', !(isClosetTab && state.collection.length > 0));
      const cnt = document.getElementById('unworn-clothing-count');
      if (cnt) cnt.textContent = closetItems.length ? `· ${closetItems.length}` : '';
      const addBtn = document.getElementById('add-custom-clothing-btn');
      if (addBtn) {
        addBtn.classList.toggle('hidden', !(isClosetTab && canAddClothing));
        // Add into whichever closet the user is looking at.
        addBtn.dataset.scale = (sub === 'minis') ? 'mini' : 'full';
      }
      const emptyNote = document.getElementById('closet-empty-note');
      if (emptyNote) {
        emptyNote.classList.toggle('hidden', closetItems.length > 0);
        // Only invite a custom add when the user can actually do it.
        emptyNote.textContent = canAddClothing
          ? 'Nothing in the closet yet. Add your own clothing, or hit “🧥 Who’s wearing this?” on a Plushie Dreadfuls outfit.'
          : 'Nothing in the closet yet. Hit “🧥 Who’s wearing this?” on an outfit to hang it here.';
      }
    }
    const tabTotal = mainItems.length + closetItems.length;
    document.getElementById('collection-empty').classList.toggle('hidden', tabTotal > 0);
    document.getElementById('count-label').textContent =
      `${tabTotal} of ${state.collection.length} item${state.collection.length === 1 ? '' : 's'}`;

    // Per-tab badge counts + sub-tab visibility are handled in the onCrypt
    // block above (they must stay correct on the Wish List / Pens sub-tabs too).

    // Pens sub-tab — always re-render so the counts stay current even when
    // another sub-tab is showing. renderPens() updates #pens-progress + #pens-list.
    renderPens();
    // When Pens sub-tab is showing, the count-label is hidden (handled
    // above via the onPens flag); no need to set it here.
  } else if (onWish) {
    syncWishlistChips();
    const items = filteredWishlist();
    // Layout mirrors the collection: roomy list ('cards') or dense 'compact'.
    const wishCompact = state.wishView === 'compact';
    const wlGrid = document.getElementById('wishlist-grid');
    wlGrid.classList.toggle('grid-compact', wishCompact);
    wlGrid.classList.toggle('grid-list', !wishCompact);
    // Discoverability hint while arranging, same as the collection.
    const wishHint = state.wishArranging && items.length > 1
      ? '<p class="subview-hint">↕ Drag the ☰ grip or use ▲▼ to set your wish-list priority — the top of the list shows in your Crypt Vitals.</p>'
      : '';
    wlGrid.innerHTML = wishHint + items.map((i) => renderCard(i, 'wishlist')).join('');
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
  } else if (tab === 'home') {
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
  // Title the editor by what's actually being edited (item 28).
  const EDIT_TITLE = { plush: 'Edit Plushie', mini: 'Edit Mini', clothing: 'Edit Clothing', accessory: 'Edit Accessory', bundle: 'Edit Bundle', other: 'Edit Other' };
  document.getElementById('modal-title').textContent = fresh
    ? (wearable ? 'Added! Who’s wearing it?' : 'Added! Make it yours')
    : (EDIT_TITLE[itemCategory(item)] || 'Edit Plushie');
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
  // Custom clothing already carries the name the user typed when adding it,
  // so an "Alternate name?" field is redundant — hide it (item 4). Instead we
  // let them edit that main name directly, and hide the static name label so it
  // isn't shown twice. Catalog items keep the fixed, catalog-sourced name.
  const isCustom = !!item.clothingScale;
  nicknameField.classList.toggle('hidden', isCustom);
  const nameField = document.getElementById('field-name');
  nameField.classList.toggle('hidden', !isCustom);
  document.getElementById('modal-name').classList.toggle('hidden', isCustom);
  if (isCustom) document.getElementById('f-name').value = item.name ?? '';
  document.querySelector('#field-nickname > span').textContent =
    loreLike ? 'Your name for it (optional)' : 'Alternate name?';
  document.querySelector('#field-meaning > span').textContent =
    loreLike ? 'Personal meaning' : 'Notes';
  // Placeholders match the relabeled fields: clothing/other gets example
  // alternate names; "Notes" gets no leading prompt (15/16).
  document.getElementById('f-nickname').placeholder =
    loreLike ? 'e.g. Anxious Andy, Sir Floof…' : 'e.g. Birthday Dress, Work Overalls…';
  document.getElementById('f-meaning').placeholder =
    loreLike ? 'What this one means to you…' : '';
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
  // Wearables (incl. user-added custom clothing) never get the bag/accessory
  // fallback — a cardigan has no "tote bag".
  const isPlushie = !isWearableItem(item) && (!cat || (cat.type || '').toLowerCase() === 'plush');
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

// Remove a collection (or wish-list) row, cleaning up any active offering for
// the same catalog id first. Returns true if it was actually removed.
async function removeCollectionItem(id) {
  if (!confirm('Remove this from your collection?')) return false;
  const col = state.collection.find((x) => x.id === id);
  const inCol = !!col;
  // Collection deletes must also clean up any active offering for the same
  // catalog id, unless reservations would be orphaned.
  if (inCol && col.catalogId) {
    const ok = await syncOfferingToOwned(col.catalogId, 0);
    if (!ok) return false;
  }
  await data.delete(inCol ? 'collection' : 'wishlist', id);
  await loadAll();
  render();
  toast('Removed.');
  return true;
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

// ─── Add-your-own clothing (gated: feature.custom_clothing) ─────────
// Lets entitled users add an off-catalog clothing piece straight into
// their closet. Stored as a normal collection row with catalog_id null
// and an explicit clothing_scale, so RLS keeps it private and the
// client treats it as wearable without guessing from the name.
function openCustomClothingModal(scale = 'full') {
  if (!data.featureEnabled('feature.custom_clothing')) return;
  const form = document.getElementById('custom-clothing-form');
  form.reset();
  document.getElementById('cc-name').value = '';
  // Default the scale to the closet they're standing in.
  const want = scale === 'mini' ? 'mini' : 'full';
  form.querySelectorAll('input[name="cc-scale"]').forEach((r) => { r.checked = (r.value === want); });

  // Worn-by candidates: the user's plushes that aren't themselves clothing.
  const candidates = state.collection.filter((c) => !isWearableItem(c));
  document.getElementById('cc-worn-by').innerHTML = ['<option value="">— not assigned —</option>']
    .concat(candidates.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nickname || c.name)}</option>`))
    .join('');

  // Photo upload rides the same per-user gate as everywhere else.
  const photoField = document.getElementById('cc-photo-field');
  document.getElementById('cc-photo').value = '';
  document.getElementById('cc-photo-name').textContent = '';
  photoField.classList.toggle('hidden', !data.featureEnabled('feature.user_photo_uploads'));

  document.getElementById('custom-clothing-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('cc-name').focus(), 50);
}

function closeCustomClothingModal() {
  document.getElementById('custom-clothing-modal').classList.add('hidden');
  document.getElementById('custom-clothing-form').reset();
}

async function submitCustomClothing(e) {
  e.preventDefault();
  if (!data.featureEnabled('feature.custom_clothing')) return;
  const name = document.getElementById('cc-name').value.trim();
  if (!name) { document.getElementById('cc-name').focus(); return; }
  const scale = document.querySelector('input[name="cc-scale"]:checked')?.value === 'mini' ? 'mini' : 'full';
  const wornVal = document.getElementById('cc-worn-by').value || null;

  const id = crypto.randomUUID();
  const record = {
    id,
    name,
    catalogId: null,
    catalogHandle: null,
    clothingScale: scale,
    meaning: null,
    dateCollected: new Date().toISOString().slice(0, 10),
    acquiredHow: null,
    hasBag: true,
    missingAccessories: [],
    retired: false,
    quantity: 1,
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };

  const photoFile = document.getElementById('cc-photo').files?.[0];
  if (photoFile && data.featureEnabled('feature.user_photo_uploads')) {
    record.photo = await compressImage(photoFile).catch(() => photoFile);
  }

  try {
    await data.put('collection', record);
    if (wornVal) {
      try { await data.setWornBy(id, wornVal); }
      catch (err) { console.warn('setWornBy', err); }
    }
    await loadAll();
    closeCustomClothingModal();
    render();
    toast(wornVal ? 'Added to the closet and dressed. 🧥' : 'Added to your closet. 🧥');
  } catch (err) {
    console.error('add custom clothing', err);
    toast(/column.*clothing_scale/i.test(err?.message || '')
      ? 'Run the latest migration (db/0026_custom_clothing.sql) — the clothing_scale column is missing.'
      : 'Could not add: ' + (err.message || err));
  }
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
  // Custom clothing can rename itself — the name field is only shown then.
  // Fall back to the existing name so an accidentally-cleared field can't blank it.
  const nameField = document.getElementById('field-name');
  if (nameField && !nameField.classList.contains('hidden')) {
    record.name = document.getElementById('f-name').value.trim() || existing.name;
  }
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

