// ─── State ────────────────────────────────────────────────────────────
const state = {
  tab: 'collection',          // 'collection' | 'wishlist' | 'catalog'
  filter: 'all',              // collection: all | active | retired
  catalogFilter: 'all',       // catalog category: all | plush | accessory | other
  catalogStatuses: new Set(), // empty = any; otherwise OR of: available/sold_out/coming_soon/retired
  catalogUnowned: false,      // toggle: hide ones already in collection
  query: '',
  editingId: null,
  editingCatalogId: null,     // catalog id staged through modal
  pendingPhoto: null,
  collection: [],
  wishlist: [],
  catalog: [],                // loaded from catalog.json
  blobUrls: new Map(),
};

const PRODUCT_URL_BASE = 'https://plushiedreadfuls.com/products/';

function cleanCatalogName(name) {
  // Strip the "Plushie Dreadfuls -" prefix shoppers see in titles, so cards stay readable.
  return name.replace(/^Plushie Dreadfuls\s*-?\s*/i, '').trim();
}

function shopifyImageVariant(url, size) {
  if (!url) return null;
  // Shopify CDN: insert _<size>x before extension, e.g. .jpg → _400x.jpg
  return url.replace(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i, `_${size}x.$1$2`);
}

function catalogCategory(item) {
  const t = (item.type || '').toLowerCase();
  if (t === 'plush' || t === 'toy') return 'plush';
  if (t === 'accessory' || t === 'hair clip' || t === 'keychain' || t === 'patch') return 'accessory';
  return 'other';
}

function isComingSoon(item) {
  const tags = (item.tags || []).map((t) => t.toLowerCase());
  if (tags.includes('coming soon') || tags.includes('tba')) return true;
  const n = item.name.toLowerCase();
  return n.includes('tba') || n.includes('coming soon') || n.includes('future design');
}

function isBuyableNow(item) {
  return !!item.available && !isComingSoon(item) && !item.retired;
}

function itemStatus(item) {
  if (item.retired) return 'retired';
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
  state.collection = (await idb.getAll('collection')).sort(byNewest);
  state.wishlist = (await idb.getAll('wishlist')).sort(byNewest);
}

async function loadCatalog() {
  try {
    const r = await fetch('./catalog.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    state.catalog = data.products || [];
  } catch (e) {
    console.warn('catalog load failed', e);
    state.catalog = [];
  }
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
  const hay = [item.name, item.meaning, item.acquiredHow].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function filteredCollection() {
  const q = state.query.trim().toLowerCase();
  return state.collection.filter((it) => {
    if (state.filter === 'active' && it.retired) return false;
    if (state.filter === 'retired' && !it.retired) return false;
    return matchesQuery(it, q);
  });
}

function filteredWishlist() {
  const q = state.query.trim().toLowerCase();
  return state.wishlist.filter((it) => matchesQuery(it, q));
}

function catalogIdMap() {
  const owned = new Map();
  const wished = new Map();
  for (const i of state.collection) if (i.catalogId) owned.set(i.catalogId, i.id);
  for (const i of state.wishlist) if (i.catalogId) wished.set(i.catalogId, i.id);
  return { owned, wished };
}

const CATALOG_CATEGORIES = new Set(['all', 'plush', 'accessory', 'other']);

function filteredCatalog() {
  const q = state.query.trim().toLowerCase();
  const { owned } = catalogIdMap();
  const cat = CATALOG_CATEGORIES.has(state.catalogFilter) ? state.catalogFilter : 'all';
  const statuses = state.catalogStatuses;
  return state.catalog.filter((it) => {
    if (cat !== 'all' && catalogCategory(it) !== cat) return false;
    if (statuses.size > 0 && !statuses.has(itemStatus(it))) return false;
    if (state.catalogUnowned && owned.has(it.id)) return false;
    if (!q) return true;
    return (
      it.name.toLowerCase().includes(q) ||
      (it.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });
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
  const comingSoon = isComingSoon(item);
  if (item.retired) badges.push(`<span class="badge badge-retired">Retired</span>`);
  else if (comingSoon) badges.push(`<span class="badge badge-soon">Coming Soon</span>`);
  else if (!item.available) badges.push(`<span class="badge badge-oos">Sold Out</span>`);
  if (isOwned) badges.push(`<span class="card-status owned">✓ Owned</span>`);
  else if (isWished) badges.push(`<span class="card-status wished">★ Wished</span>`);

  const productUrl = PRODUCT_URL_BASE + item.handle;
  const actions = isOwned
    ? `
        <button data-action="cat-edit" data-cid="${item.id}">Edit</button>
        <a class="btn-link" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener" title="Open product page">↗</a>
      `
    : `
        <button class="btn-have" data-action="cat-have" data-cid="${item.id}">🖤 Have</button>
        <button class="btn-want" data-action="cat-want" data-cid="${item.id}">🕯 Want</button>
        <a class="btn-link" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener" title="Open product page">↗</a>
      `;

  return `
    <article class="card" data-cid="${item.id}">
      <div class="card-photo">
        ${photoHtml}
        ${badges.join('')}
      </div>
      <div class="card-body">
        <h3 class="card-name">${escapeHtml(display)}</h3>
        ${item.price ? `<div class="card-meta"><span>$${escapeHtml(item.price)}</span></div>` : ''}
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

  const actions = kind === 'collection'
    ? `
      <button data-action="edit" data-id="${item.id}">Edit</button>
      <button class="btn-danger" data-action="delete" data-id="${item.id}">Delete</button>
    `
    : `
      <button class="btn-got" data-action="got" data-id="${item.id}">Got It! 🖤</button>
      <button data-action="edit" data-id="${item.id}">Edit</button>
      ${item.url ? `<a class="btn-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" title="Open product page">↗</a>` : ''}
      <button class="btn-danger" data-action="delete" data-id="${item.id}">Delete</button>
    `;

  return `
    <article class="card" data-id="${item.id}">
      <div class="card-photo">
        ${photoHtml}
        ${badges.join('')}
      </div>
      <div class="card-body">
        <h3 class="card-name">${escapeHtml(item.name)}</h3>
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

  document.getElementById('collection-filters').classList.toggle('hidden', tab !== 'collection');
  document.getElementById('wishlist-actions').classList.toggle('hidden', tab !== 'wishlist');
  document.getElementById('catalog-filters').classList.toggle('hidden', tab !== 'catalog');

  document.getElementById('add-btn').classList.toggle('hidden', tab === 'catalog');
  document.getElementById('add-target').textContent = tab === 'wishlist' ? 'Wish List' : 'Collection';

  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );

  if (tab === 'collection') {
    const items = filteredCollection();
    document.getElementById('collection-grid').innerHTML = items.map((i) => renderCard(i, 'collection')).join('');
    document.getElementById('collection-empty').classList.toggle('hidden', items.length > 0);
    document.getElementById('count-label').textContent =
      `${items.length} of ${state.collection.length} item${state.collection.length === 1 ? '' : 's'}`;
  } else if (tab === 'wishlist') {
    const items = filteredWishlist();
    document.getElementById('wishlist-grid').innerHTML = items.map((i) => renderCard(i, 'wishlist')).join('');
    document.getElementById('wishlist-empty').classList.toggle('hidden', items.length > 0);
    document.getElementById('count-label').textContent =
      `${items.length} of ${state.wishlist.length} item${state.wishlist.length === 1 ? '' : 's'}`;
  } else {
    const items = filteredCatalog();
    const { owned, wished } = catalogIdMap();
    document.getElementById('catalog-grid').innerHTML =
      items.map((i) => renderCatalogCard(i, owned, wished)).join('');
    const empty = state.catalog.length === 0;
    document.getElementById('catalog-empty').classList.toggle('hidden', !empty);
    document.getElementById('count-label').textContent = state.catalog.length === 0
      ? 'Loading catalog…'
      : `${items.length} of ${state.catalog.length} products`;
  }
}

// ─── Modal / Form ────────────────────────────────────────────────────
function openModal(kind, item = null, seed = null) {
  state.editingId = item ? item.id : null;
  state.editingCatalogId = item?.catalogId || seed?.catalogId || null;
  state.pendingPhoto = item?.photo ?? seed?.photo ?? null;

  document.getElementById('modal-title').textContent =
    item ? 'Edit Plushie' : (kind === 'collection' ? 'Add to Collection' : 'Add to Wish List');

  const src = item ?? seed ?? {};
  document.getElementById('f-name').value = src.name ?? '';
  document.getElementById('f-meaning').value = src.meaning ?? '';
  document.getElementById('f-date').value = src.dateCollected ?? '';
  document.getElementById('f-acquired').value = src.acquiredHow ?? '';
  document.getElementById('f-url').value = src.url ?? '';
  document.getElementById('f-retired').checked = !!src.retired;
  document.getElementById('f-oos').checked = !!src.outOfStock;

  // Field visibility per tab
  const isCol = kind === 'collection';
  document.getElementById('field-meaning').classList.remove('hidden');
  document.getElementById('field-date').classList.toggle('hidden', !isCol);
  document.getElementById('field-acquired').classList.toggle('hidden', !isCol);
  document.getElementById('field-retired').classList.toggle('hidden', !isCol);
  document.getElementById('field-url').classList.toggle('hidden', isCol);
  document.getElementById('field-oos').classList.toggle('hidden', isCol);

  document.getElementById('modal').dataset.kind = kind;
  refreshPhotoPreview();

  document.getElementById('modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-name').focus(), 50);
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('plushie-form').reset();
  state.editingId = null;
  state.editingCatalogId = null;
  state.pendingPhoto = null;
  const prev = document.getElementById('photo-preview');
  if (prev._objectUrl) { URL.revokeObjectURL(prev._objectUrl); prev._objectUrl = null; }
}

function refreshPhotoPreview() {
  const preview = document.getElementById('photo-preview');
  const clearBtn = document.getElementById('photo-clear');
  if (preview._objectUrl) { URL.revokeObjectURL(preview._objectUrl); preview._objectUrl = null; }
  if (state.pendingPhoto) {
    let url;
    if (state.pendingPhoto instanceof Blob) {
      url = URL.createObjectURL(state.pendingPhoto);
      preview._objectUrl = url;
    } else {
      url = state.pendingPhoto;
    }
    preview.innerHTML = `<img src="${url}" alt="" />`;
    clearBtn.classList.remove('hidden');
  } else {
    preview.innerHTML = `<span class="photo-hint">+<br/>Photo</span>`;
    clearBtn.classList.add('hidden');
  }
}

async function submitForm(e) {
  e.preventDefault();
  const kind = document.getElementById('modal').dataset.kind;
  const name = document.getElementById('f-name').value.trim();
  if (!name) return;

  const existing = state.editingId
    ? (kind === 'collection' ? state.collection : state.wishlist).find((x) => x.id === state.editingId)
    : null;

  const base = {
    id: existing?.id || crypto.randomUUID(),
    name,
    meaning: document.getElementById('f-meaning').value.trim() || null,
    photo: state.pendingPhoto || null,
    catalogId: state.editingCatalogId || existing?.catalogId || null,
    addedAt: existing?.addedAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  let record;
  if (kind === 'collection') {
    record = {
      ...base,
      dateCollected: document.getElementById('f-date').value || null,
      acquiredHow: document.getElementById('f-acquired').value || null,
      retired: document.getElementById('f-retired').checked,
    };
  } else {
    record = {
      ...base,
      url: document.getElementById('f-url').value.trim() || null,
      outOfStock: document.getElementById('f-oos').checked,
    };
  }

  await idb.put(kind, record);
  await loadAll();
  closeModal();
  render();
  toast(existing ? 'Updated.' : 'Added.');
  scheduleReminderCheck();
}

// ─── Card actions ────────────────────────────────────────────────────
async function onCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, cid } = btn.dataset;

  if (action === 'edit') {
    const item = state.collection.find((x) => x.id === id) || state.wishlist.find((x) => x.id === id);
    if (!item) return;
    openModal(state.tab, item);
  } else if (action === 'delete') {
    if (!confirm('Delete this plushie?')) return;
    const inCol = state.collection.some((x) => x.id === id);
    await idb.delete(inCol ? 'collection' : 'wishlist', id);
    await loadAll();
    render();
    toast('Removed.');
  } else if (action === 'got') {
    const item = state.wishlist.find((x) => x.id === id);
    if (!item) return;
    const collected = {
      id: item.id,
      name: item.name,
      meaning: item.meaning || null,
      photo: item.photo || null,
      catalogId: item.catalogId || null,
      dateCollected: new Date().toISOString().slice(0, 10),
      acquiredHow: null,
      retired: false,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await idb.put('collection', collected);
    await idb.delete('wishlist', id);
    await loadAll();
    render();
    toast('Moved to collection. 🖤');
  } else if (action === 'cat-have') {
    await openModalFromCatalog(cid, 'collection');
  } else if (action === 'cat-want') {
    await openModalFromCatalog(cid, 'wishlist');
  } else if (action === 'cat-edit') {
    const owned = state.collection.find((x) => x.catalogId === cid);
    if (owned) openModal('collection', owned);
  }
}

async function openModalFromCatalog(catalogId, kind) {
  const cat = state.catalog.find((c) => c.id === catalogId);
  if (!cat) return;

  // Try to download the product photo so it lives offline. Fall back to URL on CORS errors.
  let photo = cat.image ? shopifyImageVariant(cat.image, 800) : null;
  if (photo) {
    try {
      const resp = await fetch(photo, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        photo = await compressImage(blob).catch(() => blob);
      }
    } catch {
      // keep URL string; will display fine via <img> at render time
    }
  }

  const seed = {
    name: cleanCatalogName(cat.name),
    photo,
    catalogId: cat.id,
    url: kind === 'wishlist' ? (PRODUCT_URL_BASE + cat.handle) : undefined,
    retired: !!cat.retired,
    outOfStock: kind === 'wishlist' ? !cat.available : undefined,
  };
  openModal(kind, null, seed);
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

  const title = '🦇 Plushie Dreadful';
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

// ─── Backup / Restore ────────────────────────────────────────────────
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const resp = await fetch(dataUrl);
  return resp.blob();
}

async function exportBackup() {
  const serialize = (items) => Promise.all(items.map(async (item) => {
    const out = { ...item };
    out.photo = item.photo instanceof Blob ? await blobToDataUrl(item.photo) : null;
    return out;
  }));

  const data = {
    app: 'plushie-dreadful',
    version: 1,
    exportedAt: new Date().toISOString(),
    collection: await serialize(state.collection),
    wishlist: await serialize(state.wishlist),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plushie-dreadful-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`Backed up ${data.collection.length + data.wishlist.length} items.`);
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('That file is not valid JSON.');
    return;
  }
  if (!data || data.app !== 'plushie-dreadful' || !Array.isArray(data.collection) || !Array.isArray(data.wishlist)) {
    toast("That doesn't look like a Dreadful backup.");
    return;
  }

  const counts = `${data.collection.length} collection, ${data.wishlist.length} wishlist`;
  const ok = confirm(
    `Restore backup (${counts})?\n\n` +
    `Items with matching IDs will be overwritten. Other existing items are kept.`
  );
  if (!ok) return;

  const restore = async (storeName, items) => {
    for (const raw of items) {
      const item = { ...raw };
      if (typeof item.photo === 'string' && item.photo.startsWith('data:')) {
        try { item.photo = await dataUrlToBlob(item.photo); } catch { item.photo = null; }
      } else if (!(item.photo instanceof Blob)) {
        item.photo = null;
      }
      if (!item.id) item.id = crypto.randomUUID();
      if (!item.addedAt) item.addedAt = Date.now();
      await idb.put(storeName, item);
    }
  };

  try {
    await restore('collection', data.collection);
    await restore('wishlist', data.wishlist);
    await loadAll();
    render();
    toast('Backup restored. 🖤');
  } catch (e) {
    console.error(e);
    toast('Restore failed. See console.');
  }
}

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
    t.addEventListener('click', () => {
      state.tab = t.dataset.tab;
      render();
    });
  });

  document.querySelectorAll('#collection-filters .chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.filter = c.dataset.filter;
      document.querySelectorAll('#collection-filters .chip').forEach((x) =>
        x.classList.toggle('active', x === c)
      );
      render();
    });
  });

  document.querySelectorAll('#catalog-filters .chip[data-cat-filter]').forEach((c) => {
    c.addEventListener('click', () => {
      state.catalogFilter = c.dataset.catFilter;
      document.querySelectorAll('#catalog-filters .chip[data-cat-filter]').forEach((x) =>
        x.classList.toggle('active', x === c)
      );
      render();
    });
  });
  document.querySelectorAll('#catalog-filters .chip[data-cat-status]').forEach((c) => {
    c.addEventListener('click', () => {
      const status = c.dataset.catStatus;
      if (state.catalogStatuses.has(status)) state.catalogStatuses.delete(status);
      else state.catalogStatuses.add(status);
      c.classList.toggle('active', state.catalogStatuses.has(status));
      render();
    });
  });
  document.querySelectorAll('#catalog-filters .chip[data-cat-toggle]').forEach((c) => {
    c.addEventListener('click', () => {
      const key = c.dataset.catToggle;
      if (key === 'unowned') {
        state.catalogUnowned = !state.catalogUnowned;
        c.classList.toggle('active', state.catalogUnowned);
        render();
      }
    });
  });

  document.getElementById('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });

  document.getElementById('add-btn').addEventListener('click', () => openModal(state.tab));
  document.getElementById('check-restocks').addEventListener('click', checkAllRestocks);
  document.getElementById('notify-btn').addEventListener('click', toggleNotifications);

  document.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeModal)
  );

  document.getElementById('plushie-form').addEventListener('submit', submitForm);

  document.getElementById('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      state.pendingPhoto = await compressImage(file);
      refreshPhotoPreview();
    } catch (err) {
      console.error(err);
      toast('Could not load that image.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('photo-clear').addEventListener('click', () => {
    state.pendingPhoto = null;
    refreshPhotoPreview();
  });

  document.getElementById('collection-grid').addEventListener('click', onCardClick);
  document.getElementById('wishlist-grid').addEventListener('click', onCardClick);
  document.getElementById('catalog-grid').addEventListener('click', onCardClick);

  document.getElementById('backup-btn').addEventListener('click', exportBackup);
  document.getElementById('restore-btn').addEventListener('click', () =>
    document.getElementById('restore-input').click()
  );
  document.getElementById('restore-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await importBackup(file);
    e.target.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal').classList.contains('hidden')) {
      closeModal();
    }
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
async function boot() {
  wireEvents();
  await loadAll();
  render();
  updateNotifyButton();
  registerSW();
  if (await idb.getMeta('notify_enabled')) scheduleReminderCheck();
  // Catalog can load lazily — it isn't blocking the first paint.
  loadCatalog().then(() => {
    if (state.tab === 'catalog') render();
  });
}

boot().catch((e) => {
  console.error(e);
  toast('Something went wrong loading the app.');
});
