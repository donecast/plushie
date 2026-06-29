// ════════════════════════════════════════════════════════════════════
// app-admin-catalog.js — part 8 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Admin catalog tools: create/merge entries, photo suggestions, bundles.
// ════════════════════════════════════════════════════════════════════

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
    // Reflect the item's effective category (not the raw stored `type`), so
    // legacy rows typed in the old Shopify vocabulary — 'Plush Accessory',
    // 'charms', etc. — preselect the right canonical option instead of a blank.
    document.getElementById('ci-type').value = catalogCategory(row);
    document.getElementById('ci-retired').value = row.retired ? 'retired' : 'active';
    document.getElementById('ci-handle').value = row.handle || '';
    document.getElementById('ci-release-year').value = row.releaseYear ?? '';
    document.getElementById('ci-tags').value = (row.tags || []).join(', ');
    document.getElementById('ci-lore').value = row.lore || '';
    document.getElementById('ci-alt-lore').value = row.altLore || '';
    document.getElementById('ci-accessories').value = (row.accessories || [])
      .map((a) => a.name || a).join('\n');
    document.getElementById('ci-notes').value = '';
    if (row.image) {
      document.getElementById('ci-photo-preview-wrap').innerHTML =
        `<span class="dim">Current photo kept unless you upload a new one.</span>`;
    }
  }

  // Close the catalog detail modal if we were launched from it (the
  // "✎ Edit entry" button), so this editor isn't stacked behind it.
  document.getElementById('catalog-detail-modal').classList.add('hidden');
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
  const altLore = (document.getElementById('ci-alt-lore')?.value || '').trim() || null;
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
    .map((name) => ({ name, key: accessoryKey(name) }));
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
        alt_lore: altLore,
        tags,
        accessories,
        release_year: releaseYear,
        retired: document.getElementById('ci-retired').value === 'retired',
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
        alt_lore: altLore,
        tags,
        accessories,
        release_year: releaseYear,
        notes_to_admin: notes,
        status: isAdmin ? 'approved' : undefined,
      });
      toast(isAdmin ? 'Catalog item created.' : 'Submitted to admin for review. Thanks!');
    }
    document.getElementById('catalog-item-modal').classList.add('hidden');
    // Prefer a live refresh over a bare loadCatalog(): reloading
    // catalog.json drops the on-demand-parsed lore/accessories on every
    // Shopify item (which silently broke accessory searches). A live
    // refresh restores them, re-applies overrides, and still re-fetches
    // custom items so this create/edit shows up. Fall back to loadCatalog
    // only if the live fetch is unavailable, so the new item still lands.
    const refreshed = await refreshCatalogLive();
    if (!refreshed) await loadCatalog();
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

// ─── Shopify catalog overrides (admin hand-edits) ────────────────
// Shopify-fed items derive their lore / symbolism / Set Includes from
// the upstream body_html every load — there's no row to edit and no
// "Edit entry" button. This modal saves a thin overlay (catalog_overrides,
// keyed by handle) so an admin can fix what the feed gets wrong (e.g.
// Vertigo Rabbit's tote bag, which only shows in the photos). Custom
// items keep using openCatalogItemModal('edit', …) — this is only for
// upstream Shopify products.
function openCatalogOverrideModal(cid) {
  if (!window.currentUser?.isAdmin) return;
  const raw = state.catalog.find((c) => c.id === cid);
  if (!raw) { toast('That item is no longer in the catalog.'); return; }
  const item = resolveCatalogItem(raw);
  if (item.isCustom) {
    // Custom rows have their own full editor; don't route them here.
    openCatalogItemModal('edit', cid);
    return;
  }
  if (!item.handle) { toast("This item has no handle to attach an edit to."); return; }
  state.catalogOverride = { handle: item.handle, cid, imagePickerReady: false };

  document.getElementById('catalog-override-form').reset();
  document.getElementById('co-error').classList.add('hidden');
  document.getElementById('co-subtitle').textContent = cleanCatalogName(item.name);

  // "Lore" on plush/mini/bundle reads as "Notes" on merch — match the
  // detail modal's heading so the field label isn't jarring.
  const loreCat = catalogCategory(item);
  const loreHeading = (loreCat === 'plush' || loreCat === 'mini' || loreCat === 'bundle') ? 'Lore' : 'Notes';
  document.getElementById('co-lore-label').textContent = loreHeading;
  document.getElementById('co-lore').value = item.lore || '';
  document.getElementById('co-alt-lore-label').textContent = `${loreHeading} (retelling)`;
  document.getElementById('co-alt-lore').value = item.altLore || '';

  // Prefill symbolism as plain text — from the plain field if present,
  // otherwise flattened from the parsed HTML block so the admin starts
  // from what's actually showing rather than a blank box.
  const symText = item.symbolism
    || (item.symbolismHtml ? stripTagsKeepNewlines(item.symbolismHtml) : '');
  document.getElementById('co-symbolism').value = symText;

  // Set Includes only applies to categories that carry a checklist.
  const accField = document.getElementById('co-accessories-field');
  const hasAcc = categoryHasAccessories(item);
  accField.classList.toggle('hidden', !hasAcc);
  document.getElementById('co-accessories').value = hasAcc
    ? (item.accessories || []).map((a) => a.name || a).join('\n')
    : '';

  // Tag overrides: reflect any current category / retired override (else "auto").
  document.getElementById('co-category').value = item.categoryOverrideTag || 'auto';
  document.getElementById('co-retired').value =
    item.retiredOverride === true ? 'retired'
    : item.retiredOverride === false ? 'active'
    : 'auto';

  // Close the catalog detail modal we were launched from so the editor
  // isn't hidden behind it (the post-save flow returns to the grid).
  document.getElementById('catalog-detail-modal').classList.add('hidden');
  document.getElementById('catalog-override-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('co-lore').focus(), 50);

  // The cover-photo picker needs the product's full image list, which the
  // runtime catalog doesn't carry (it keeps only the first image). Fetch it
  // live and reveal the dropdown once it's ready; if the fetch fails the
  // field just stays hidden and the rest of the editor works unchanged.
  populateCoverPhotoPicker(item);
  renderCatalogPhotosManager(item);
}

// Strip the '?v=' cache token so two URLs for the same image compare equal
// even when Shopify re-versions the asset.
function imageUrlBase(url) {
  return String(url || '').split('?')[0];
}

function updateCoverPhotoPreview() {
  const select = document.getElementById('co-image');
  const preview = document.getElementById('co-image-preview');
  const imgs = state.catalogOverride?.images || [];
  // Empty value === "store default" === photo 1.
  const url = select.value || imgs[0] || '';
  if (url) preview.src = shopifyImageVariant(url, 96) || url;
  else preview.removeAttribute('src');
}

async function populateCoverPhotoPicker(item) {
  const field = document.getElementById('co-image-field');
  const select = document.getElementById('co-image');
  field.classList.add('hidden');
  select.innerHTML = '';
  const handle = item.handle;
  if (!handle) return;
  if (state.catalogOverride) state.catalogOverride.item = item;

  // Community / extra pictures (catalog_photos) — lettered slots (A, B… =
  // community) sort BEFORE numbered (0, 1… = official). These are the
  // "Picture A" shots; surface them as cover options ABOVE the store's photos.
  let community = [];
  try { community = await data.adminListCatalogPhotos({ handle }); }
  catch (e) { console.warn('community photos unavailable', e); }

  // The store's own product photos (numbered). A failed fetch is non-fatal —
  // we can still offer the community shots.
  let images = [];
  try {
    const r = await fetch(`${PRODUCT_URL_BASE}${encodeURIComponent(handle)}.json`, { mode: 'cors' });
    if (r.ok) {
      const json = await r.json();
      images = (json.product?.images || [])
        .slice()
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((im) => im.src)
        .filter(Boolean);
    }
  } catch (e) {
    console.warn('cover photo list unavailable', e);
  }
  // The admin may have closed/switched modals while we were fetching.
  if (!state.catalogOverride || state.catalogOverride.handle !== handle) return;
  state.catalogOverride.images = images;
  // Nothing to pick between: no community shots AND 0–1 store photos.
  if (community.length === 0 && images.length < 2) return;

  // Store default first (empty value === inherit the store's photo 1).
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'Store default (Photo 1)';
  select.appendChild(def);
  // Community pictures, lettered-first (already ordered by the data layer).
  community.forEach((p) => {
    if (!p.url) return;
    const opt = document.createElement('option');
    opt.value = p.url;
    opt.textContent = `Picture ${p.slot} — community`;
    select.appendChild(opt);
  });
  // The store's remaining numbered photos (skip the default first one).
  images.forEach((src, i) => {
    if (i === 0) return;
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = `Photo ${i + 1}`;
    select.appendChild(opt);
  });
  // Preselect whatever is actually the cover now — a community URL, a store
  // photo, or the default — by matching the resolved override image.
  const cur = imageUrlBase(item.image);
  const match = [...select.options].find((o) => o.value && imageUrlBase(o.value) === cur);
  select.value = match ? match.value : '';
  updateCoverPhotoPreview();
  field.classList.remove('hidden');
  state.catalogOverride.imagePickerReady = true;
}

// ─── Community / extra photos manager (catalog_photos) ───────────────
// Lists an item's community (lettered) + official (numbered) shots, lettered
// first, with add/remove. The COVER is chosen via the dropdown above (which
// writes catalog_overrides.image on save); this panel manages the set itself.
function nextLetteredSlot(photos) {
  const letters = (photos || []).map((p) => p.slot)
    .filter((s) => /^[A-Za-z]$/.test(s)).map((s) => s.toUpperCase()).sort();
  if (!letters.length) return 'A';
  const next = String.fromCharCode(letters[letters.length - 1].charCodeAt(0) + 1);
  return next <= 'Z' ? next : '';
}

function renderCatalogPhotoRow(p) {
  const cover = state.catalogOverride?.item && p.url
    && imageUrlBase(p.url) === imageUrlBase(state.catalogOverride.item.image);
  const thumb = p.url
    ? `<img src="${escapeHtml(p.url)}" alt="" class="co-photo-thumb" />`
    : '<span class="no-photo">🖤</span>';
  return `
    <div class="co-photo-row${cover ? ' is-cover' : ''}">
      ${thumb}
      <span class="co-photo-slot-label">${escapeHtml(p.slot)}</span>
      <span class="dim">${escapeHtml(p.source || '')}${cover ? ' · cover' : ''}</span>
      <button type="button" class="btn-danger" data-admin-action="catalog-photo-delete" data-id="${escapeHtml(p.id)}">Delete</button>
    </div>`;
}

async function renderCatalogPhotosManager(item) {
  const field = document.getElementById('co-photos-field');
  const list = document.getElementById('co-photos-list');
  field.classList.add('hidden');
  list.innerHTML = '';
  const handle = item.handle;
  if (!handle) return;                          // Shopify-handle items only
  if (state.catalogOverride) state.catalogOverride.item = item;
  let photos = [];
  try { photos = await data.adminListCatalogPhotos({ handle }); }
  catch (e) { console.warn('photos manager load failed', e); return; }
  if (!state.catalogOverride || state.catalogOverride.handle !== handle) return;
  state.catalogOverride.photos = photos;
  document.getElementById('co-photo-slot').value = nextLetteredSlot(photos);
  list.innerHTML = photos.length
    ? photos.map(renderCatalogPhotoRow).join('')
    : '<p class="dim">No community/extra photos yet — add one below.</p>';
  field.classList.remove('hidden');
}

async function catalogPhotoAdd() {
  const ctx = state.catalogOverride;
  if (!ctx?.handle) return;
  const urlEl = document.getElementById('co-photo-url');
  const fileEl = document.getElementById('co-photo-file');
  const slotEl = document.getElementById('co-photo-slot');
  const url = (urlEl.value || '').trim();
  const file = fileEl && fileEl.files && fileEl.files[0];
  const slot = (slotEl.value || '').trim();
  if (!url && !file) { toast('Paste an image URL or choose a file first.'); return; }
  if (!slot) { toast('Give it a slot — a letter (A, B…) for community, a number for official.'); return; }
  const btn = document.querySelector('[data-admin-action="catalog-photo-add"]');
  if (btn) { btn.disabled = true; btn.textContent = file ? 'Uploading…' : 'Adding…'; }
  try {
    let payload;
    if (file) {
      // Uploaded file → store in R2 (catalog bucket) and reference by path.
      const path = await data.uploadCatalogPhotoFile(file, ctx.handle);
      payload = { slot, imagePath: path, source: 'owner' };
    } else {
      // Hot-linked URL.
      payload = { slot, imageUrl: url, source: 'community' };
    }
    await data.adminAddCatalogPhoto({ handle: ctx.handle }, payload);
    urlEl.value = '';
    if (fileEl) fileEl.value = '';
    toast('Photo added.');
    if (ctx.item) { await renderCatalogPhotosManager(ctx.item); await populateCoverPhotoPicker(ctx.item); }
  } catch (e) {
    console.error(e);
    toast('Could not add: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add photo'; }
  }
}

async function catalogPhotoDelete(id) {
  const ctx = state.catalogOverride;
  if (!ctx?.handle || !id) return;
  try {
    await data.adminDeleteCatalogPhoto(id);
    toast('Photo removed.');
    if (ctx.item) { await renderCatalogPhotosManager(ctx.item); await populateCoverPhotoPicker(ctx.item); }
  } catch (e) { console.error(e); toast('Could not remove: ' + (e.message || e)); }
}

async function submitCatalogOverrideForm(e) {
  e.preventDefault();
  const ctx = state.catalogOverride;
  if (!ctx) return;
  const errEl = document.getElementById('co-error');
  errEl.classList.add('hidden');
  const lore = document.getElementById('co-lore').value.trim() || null;
  const altLore = document.getElementById('co-alt-lore').value.trim() || null;
  const symbolism = document.getElementById('co-symbolism').value.trim() || null;
  // Same per-line parse as the custom-item form: canonicalised display
  // name + lowercase key, so the checklist treats overrides identically.
  const accessories = (document.getElementById('co-accessories').value || '')
    .split('\n')
    .map((s) => canonicalizeAccessoryName(s))
    .filter(Boolean)
    .map((name) => ({ name, key: accessoryKey(name) }));
  // Tag overrides: 'auto' = inherit (null). Availability maps active/retired to
  // a boolean the catalog merge applies.
  const catSel = document.getElementById('co-category').value;
  const retSel = document.getElementById('co-retired').value;
  const category = catSel && catSel !== 'auto' ? catSel : null;
  const retired = retSel === 'retired' ? true : retSel === 'active' ? false : null;
  const patch = { lore, altLore, symbolism, accessories, category, retired };
  // Cover photo: '' = store default (inherit), otherwise the picked image URL.
  // Only touch the image column when the picker actually loaded — if its live
  // image list was unavailable (offline / CORS) we leave any existing cover
  // override untouched rather than silently clearing it.
  if (ctx.imagePickerReady) patch.image = document.getElementById('co-image').value.trim() || null;

  const submit = document.getElementById('co-submit');
  submit.disabled = true;
  submit.textContent = 'Saving…';
  try {
    await data.adminUpsertCatalogOverride(ctx.handle, patch);
    toast('Catalog details saved.');
    document.getElementById('catalog-override-modal').classList.add('hidden');
    // Do NOT call loadCatalog() here: it reloads catalog.json, which
    // carries only basic fields, so it wipes the on-demand-parsed lore /
    // symbolism / Set Includes off every OTHER item — silently breaking
    // accessory searches like "-tote -bag" until the next live refresh.
    // A live refresh re-parses every item AND re-applies all overrides
    // (including this save, and correctly dropping any we just cleared).
    // If it's unavailable (offline / CORS), overlay just this edit in
    // memory so we still never drop the parsed data.
    const refreshed = await refreshCatalogLive();
    if (!refreshed) {
      applyCatalogOverrides(state.catalog, [{ handle: ctx.handle, ...patch }]);
      if (state.tab === 'catalog') render();
    }
    // Repaint the detail modal if it's still open behind this one.
    const detail = document.getElementById('catalog-detail-modal');
    if (detail && !detail.classList.contains('hidden')) openCatalogDetailModal(ctx.cid);
    state.catalogOverride = null;
  } catch (err) {
    console.error(err);
    errEl.textContent = err.message || 'Could not save.';
    errEl.classList.remove('hidden');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Save';
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
  const lookup = state.catalog.filter((c) => !c.isBundle && !c.variantParent);
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
  maybeRefreshCatalogDetail(cid);
  const body = catalogDetailBodyHtml(cid);
  if (body == null) return;
  document.getElementById('cd-body').innerHTML = body;
  document.getElementById('catalog-detail-modal').classList.remove('hidden');
}

// On-demand live refresh: the baked catalog may lack lore/symbolism/accessories
// until the first live Shopify refresh. Trigger it the first time a detail is
// opened, then repaint whichever surface is showing the item (modal or rail).
function maybeRefreshCatalogDetail(cid) {
  const raw = state.catalog.find((c) => c.id === cid);
  if (!raw) return;
  // Form variants pull lore/symbolism/accessories from their parent. If the
  // parent (a Shopify row) hasn't been refreshed live yet, none of those
  // fields are populated — so the variant looks empty too.
  const parentEmpty = (raw.isCustom || raw.isVariant) && raw.parentHandle
    && !state.catalog.some((c) => c.handle === raw.parentHandle && !c.isCustom && !c.isVariant && c.bodyHtml);
  if (!state._catalogRefreshAttempted
      && ((!raw.bodyHtml && !raw.isCustom && !raw.isVariant) || parentEmpty)) {
    state._catalogRefreshAttempted = true;
    refreshCatalogLive().then(() => {
      const modal = document.getElementById('catalog-detail-modal');
      if (modal && !modal.classList.contains('hidden')) openCatalogDetailModal(cid);
      else if (state.railCatalogId === cid && typeof renderRightRail === 'function') renderRightRail();
    }).catch((e) => console.warn('on-demand catalog refresh', e));
  }
}

// Builds the catalog detail inner HTML — shared by the modal (#cd-body) and the
// right-rail master-detail panel. Returns null if the item is gone.
function catalogDetailBodyHtml(cid, { forRail = false } = {}) {
  const raw = state.catalog.find((c) => c.id === cid);
  if (!raw) return null;
  const item = resolveCatalogItem(raw);
  const display = cleanCatalogName(item.name);
  const formLabel = (item.isCustom || item.isVariant) && item.formLabel ? item.formLabel : '';
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
  // Prefer our same-style retelling (altLore) over PD's original prose; fall
  // back to the original when no retelling exists yet.
  const loreText = item.altLore || item.lore;
  const loreHtml = loreText
    ? `<section class="cd-section"><h3>${loreHeading}</h3>${loreText.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</section>`
    : '';
  const symHtml = item.symbolismHtml
    ? `<section class="cd-section"><h3>Symbolism</h3><div class="cd-symbolism">${sanitizeBodyHtml(item.symbolismHtml)}</div></section>`
    : (item.symbolism ? `<section class="cd-section"><h3>Symbolism</h3><p>${escapeHtml(item.symbolism).replace(/\n/g, '<br/>')}</p></section>` : '');
  const isEmpty = !accessoriesHtml && !loreHtml && !symHtml;

  // Credit a community-submitted cover ("Image courtesy of @handle"), shown
  // in italics directly under the photo. ONLY when the credit names a Plush
  // Crypt user — i.e. an @handle (the format the suggestion-approval flow and
  // the admin community-photo picker store). Free-text source credits an admin
  // may type (e.g. "a customer review", a web/Okendo source) are NOT shown.
  const rawCredit = (thumb && item.imageCredit) ? String(item.imageCredit).trim() : '';
  const photoCredit = /^@\w/.test(rawCredit) ? rawCredit : '';
  return `
    <div class="cd-head">
      <div class="cd-photo-wrap">
        <div class="cd-photo">${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(display)}" />` : `<span class="no-photo">🖤</span>`}</div>
        ${photoCredit ? `<p class="cd-credit">Image courtesy of ${escapeHtml(photoCredit)}</p>` : ''}
      </div>
      <div class="cd-head-text">
        <div class="card-eyebrow">${escapeHtml(catalogCategoryLabel(item))}${item.releaseYear ? ` · ${item.releaseYear}` : ''}</div>
        <h2>${escapeHtml(display)}${formLabel ? ` <span class="card-form-label">${escapeHtml(formLabel)}</span>` : ''}</h2>
        ${item.price != null && !isLoyaltyReward(item) ? `<p class="cd-price">$${Number(item.price).toFixed(2)}</p>` : ''}
        <p class="dim">
          ${isOwned ? '<span class="card-status owned">✓ Owned</span> ' : ''}
          ${isWished ? '<span class="card-status wished">★ Wished</span> ' : ''}
          ${status === 'sold_out' ? (isLoyaltyReward(item)
            ? '<span class="badge badge-reward" title="Loyalty reward — redeem with loyalty points, not for direct purchase">Rewards</span> '
            : '<span class="badge badge-oos">Sold Out</span> ') : ''}
          ${status === 'retired' ? '<span class="badge badge-retired">Retired</span> ' : ''}
        </p>
        <div class="cd-actions">
          ${status !== 'coming_soon' && status !== 'fyc' ? `<button class="btn-have" data-action="cat-have" data-cid="${item.id}">🖤 Have</button>` : ''}
          ${!isWished ? `<button class="btn-want" data-action="cat-want" data-cid="${item.id}">🕯 Want</button>` : ''}
          ${productUrl && !isLoyaltyReward(item) && status !== 'retired' ? `<a class="btn-buy" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener">Buy ↗</a>` : ''}
          ${window.currentUser?.isAdmin
            ? (item.isCustom
                ? `<button class="btn-ghost" data-action="cat-admin-edit" data-cid="${item.id}">✎ Edit entry</button>`
                : `<button class="btn-ghost" data-action="cat-admin-override" data-cid="${item.id}">✎ Edit details</button>`)
            : ''}
        </div>
        ${forRail ? `<button class="cd-expand-btn" data-action="cat-expand" data-cid="${item.id}">⤢ Expand</button>` : ''}
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
    // The queue carries two kinds of row: genuinely pending submissions
    // awaiting a decision, and already-decided rows (trusted-submitter
    // auto-approvals) surfaced once for a retroactive glance. Keep the
    // pending ones front-and-centre; tuck the rest behind a one-line
    // "Show approved" toggle so they don't nag every visit.
    const pending = rows.filter((r) => r.status === 'pending');
    const reviewed = rows.filter((r) => r.status !== 'pending');

    const pendingHtml = pending.length
      ? pending.map(renderPendingCatalogRow).join('')
      : '<p class="dim">Nothing pending. ✨</p>';

    let reviewedHtml = '';
    if (reviewed.length) {
      reviewedHtml = `
        <button type="button" class="catalog-pending-toggle" data-admin-action="toggle-approved-catalog" aria-expanded="false">
          Show approved (${reviewed.length}) ▾
        </button>
        <div id="catalog-approved-list" class="hidden">
          ${reviewed.map(renderPendingCatalogRow).join('')}
        </div>
      `;
    }

    body.innerHTML = pendingHtml + reviewedHtml;
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="dim">Couldn't load queue: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

// Expand/collapse the already-approved rows inside the pending modal.
function toggleApprovedCatalog(btn) {
  const list = document.getElementById('catalog-approved-list');
  if (!list) return;
  const open = list.classList.toggle('hidden') === false;
  btn.setAttribute('aria-expanded', String(open));
  const count = list.children.length;
  btn.textContent = open ? `Hide approved (${count}) ▴` : `Show approved (${count}) ▾`;
}

function renderPendingCatalogRow(row) {
  // Fall back to the placeholder if the (signed) image URL ever fails to
  // load, rather than leaving a broken-image icon.
  const thumb = row.image
    ? `<img src="${escapeHtml(row.image)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'no-photo',textContent:'🖤'}))" />`
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
          : `<button class="btn-ghost" data-admin-action="dismiss-catalog-item" data-id="${row.id}">Dismiss</button>`
        }
      </div>
    </article>
  `;
}

// "Dismiss" marks an already-approved row as reviewed so it drops out of
// the queue for good (clears the retroactive-review surfacing).
async function adminDismissCatalogItem(id) {
  try {
    await data.adminMarkCatalogReviewSeen(id);
    // Drop it from the cached queue so the badge/count update immediately.
    state.adminPendingCatalog = (state.adminPendingCatalog || []).filter((r) => r.id !== id);
    toast('Dismissed.');
    await openCatalogPendingModal();
  } catch (err) {
    console.error(err);
    toast('Could not dismiss: ' + (err.message || err));
  }
}

async function adminApproveCatalogItem(id) {
  try {
    await data.adminApproveCatalogItem(id);
    toast('Approved.');
    await openCatalogPendingModal();
    // Live refresh (not a bare loadCatalog) so this admin action doesn't
    // wipe the on-demand-parsed lore/accessories off other items; fall
    // back to loadCatalog only if the live fetch is unavailable.
    const refreshed = await refreshCatalogLive();
    if (!refreshed) await loadCatalog();
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
    // Live refresh (not a bare loadCatalog) so this admin action doesn't
    // wipe the on-demand-parsed lore/accessories off other items; fall
    // back to loadCatalog only if the live fetch is unavailable.
    const refreshed = await refreshCatalogLive();
    if (!refreshed) await loadCatalog();
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
  // Resolve the target to a human name + a dim id line. The name comes from
  // the in-memory catalog (Shopify product, custom item) or the pens list, so
  // the admin sees WHICH plush they're approving rather than a bare id.
  let name = 'Photo suggestion';
  let target;
  if (row.target_pen_id) {
    const pen = activePens().find((p) => p.id === row.target_pen_id);
    if (pen) name = `${pen.line} — ${pen.name}`;
    target = `Pen: <code>${escapeHtml(row.target_pen_id)}</code>`;
  } else if (row.target_catalog_item_id) {
    const item = (state.catalog || []).find((c) => c.id === row.target_catalog_item_id);
    if (item) name = cleanCatalogName(item.name);
    target = `catalog_items: <code>${escapeHtml(row.target_catalog_item_id)}</code>`;
  } else {
    const prod = (state.catalog || []).find((c) => c.id === row.target_shopify_id && !c.isCustom);
    if (prod) name = cleanCatalogName(prod.name);
    target = `Shopify id: <code>${escapeHtml(row.target_shopify_id || '?')}</code>`;
  }
  // Who sent it — resolved to @handle by data.adminListPhotoSuggestions.
  const submitter = row.submitted_by_username
    ? `@${escapeHtml(row.submitted_by_username)}`
    : `<span class="dim">unknown user</span>`;
  return `
    <article class="catalog-pending-row">
      <div class="catalog-pending-photo">${thumb}</div>
      <div class="catalog-pending-body">
        <h3>${escapeHtml(name)}</h3>
        <p class="dim">${target}</p>
        <p>Submitted by ${submitter}</p>
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
    // product in state.catalog and pass its handle through so
    // adminApprovePhotoSuggestion can file the photo into that item's
    // catalog_photos gallery (as the new cover) instead of erroring.
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
    // Live refresh (not a bare loadCatalog) so this admin action doesn't
    // wipe the on-demand-parsed lore/accessories off other items; fall
    // back to loadCatalog only if the live fetch is unavailable.
    const refreshed = await refreshCatalogLive();
    if (!refreshed) await loadCatalog();
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

