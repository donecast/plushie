// ════════════════════════════════════════════════════════════════════
// app-trade.js — part 5 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: The trading flow end-to-end, plus reputation badges.
// ════════════════════════════════════════════════════════════════════

// ─── Trade: data load + sub-tab switching ────────────────────────────
async function loadTradeData() {
  // Each read is isolated so a single failing call (an expired session, an
  // RLS hiccup, a flaky mobile connection) can't blank the entire tab. A
  // failed step keeps its prior/empty state, logs its own label so the
  // console points straight at the culprit, and we only nag the user if
  // something actually failed.
  const failed = [];
  const step = async (label, fn) => {
    try { return await fn(); }
    catch (err) { console.error(`loadTradeData:${label}`, err); failed.push(label); return undefined; }
  };

  // My offerings/seeks first, then the live-link reconcile that clamps
  // every offering to what the user currently owns — the load-time backstop
  // for "you can never offer more than you own." It self-heals drift from
  // completed trades, removed collection items, or older data, and re-fetches
  // myTradeItems internally. Skip reconcile if the initial fetch failed.
  const items = await step('myTradeItems', () => data.listMyTradeItems());
  if (items !== undefined) {
    state.myTradeItems = items;
    await step('reconcile', () => reconcileAllOfferings({ announce: true }));
  }

  // The remaining reads are independent of one another — run them together
  // and commit each result only if it succeeded.
  const [browse, trades, myFb, myFbByTrade] = await Promise.all([
    step('browseOfferings',   () => data.browseOfferings()),
    step('listTrades',        () => data.listTrades()),
    step('getFeedbackSummary',() => data.getFeedbackSummary(window.currentUser.id)),
    step('listMyFeedback',    () => data.listMyFeedback()),
  ]);
  if (browse     !== undefined) state.tradeBrowse = browse;
  if (trades     !== undefined) state.trades = trades;
  if (myFb       !== undefined) {
    state.myFeedback = myFb;
    state.partnerFeedback.set(window.currentUser.id, myFb);
  }
  if (myFbByTrade !== undefined) state.myFeedbackByTrade = myFbByTrade;

  if (marketEnabled()) await step('market', () => loadMarketData());

  // Collect every user we'll show a badge for and pull their summaries in
  // one batch — browse list owners + trade partners. Best-effort.
  const uids = new Set();
  for (const it of state.tradeBrowse) uids.add(it.ownerId);
  for (const l of state.marketBrowse) uids.add(l.sellerId);
  for (const t of state.trades) {
    const other = t.proposer_id === window.currentUser.id ? t.recipient_id : t.proposer_id;
    uids.add(other);
  }
  await step('reputation', () => ensureReputationFor([...uids]));

  // Fire local notifications for any partner action that just appeared
  // (their shipment, their receipt confirmation, etc.).
  maybeFireTradeNotifications().catch((e) => console.warn(e));

  // Mark attempted regardless: a genuine empty browse should show its real
  // empty-state, not a forever "Summoning…" spinner.
  state.ready.add('trade');

  if (failed.length) {
    console.warn('loadTradeData: partial load; failed steps:', failed.join(', '));
    toast('Some trade data couldn’t load.');
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
  document.getElementById('subtab-sale')?.classList.toggle('hidden', name !== 'sale');
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
  const n = pendingForMeCount() + activeTradeCount() + marketTurnCount();
  const sb2 = document.getElementById('subtab-sale-badge');
  if (sb2) {
    const m = marketTurnCount();
    sb2.textContent = m;
    sb2.classList.toggle('hidden', m === 0);
  }
  const b = document.getElementById('trade-badge');
  if (n > 0) { b.textContent = n; b.classList.remove('hidden'); }
  else       { b.classList.add('hidden'); }
  const b2 = document.getElementById('subtab-trades-badge');
  if (b2) {
    if (n > 0) { b2.textContent = n; b2.classList.remove('hidden'); }
    else       { b2.classList.add('hidden'); }
  }
  const b3 = document.getElementById('bn-trade-badge');
  if (b3) {
    if (n > 0) { b3.textContent = n; b3.classList.remove('hidden'); }
    else       { b3.classList.add('hidden'); }
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
    case 'sale': {
      const live = state.myListings.filter((l) => l.status === 'active').length;
      return `${state.marketBrowse.length} for sale · ${marketTurnCount()} offer${marketTurnCount() === 1 ? '' : 's'} awaiting you · ${live} of yours live`;
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

  // Safety gate: listing anything for trade requires a full last name (the
  // DB enforces this too — see db/0045). Send them to Account to add it.
  if (kind === 'offering') {
    const names = await data.getMyNameFields();
    if (!hasFullLastName(names?.last_name)) {
      toast('Add your full last name in Account before listing items for trade.');
      openAccountModal();
      return;
    }
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

  // Offerings now require real proof photos, so both listing a new one and
  // editing an existing one go through the trade-list modal (quantity +
  // up-to-5 photo gallery). No silent prompt()/catalog-image copy anymore.
  if (kind === 'offering') {
    openTradeListModal(item, owned, existing || null);
    return;
  }

  // Seeking stays a lightweight toggle — you don't own it, so no photos.
  if (existing) {
    await data.deleteTradeItem(existing.id);
    toast('Removed from seeking.');
  } else {
    await data.addTradeItem({
      kind: 'seeking',
      catalogId: item.catalogId,
      catalogHandle: item.catalogHandle ?? null,
      name: item.name,
      photoPath: item.photoPath ?? null,
      photoSocialPath: null,
      quantity: 1,
    });
    toast('Seeking listed.');
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
  // For Sale is insider-gated; a non-insider who somehow lands on it falls back to Browse.
  const saleOn = marketEnabled();
  document.getElementById('subtab-sale-btn')?.classList.toggle('hidden', !saleOn);
  if (!saleOn && state.tradeSubTab === 'sale') state.tradeSubTab = 'browse';
  document.getElementById('subtab-sale')?.classList.toggle('hidden', state.tradeSubTab !== 'sale');

  if (state.tradeSubTab === 'browse')   renderBrowse();
  else if (state.tradeSubTab === 'trades') renderMyTrades();
  else if (state.tradeSubTab === 'sale') renderSale();
  else                                  renderMyTradeItems();
}

function renderBrowse() {
  const list = state.tradeBrowse;
  if (!state.ready.has('trade')) {
    document.getElementById('subtab-browse').innerHTML = loadingPlaceholder('Summoning offerings…');
    return;
  }
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

// An offering with no real proof photos can be listed (grandfathered rows
// from before PR #145 required them) but can NOT enter a trade — the DB
// enforces this too (db/0082), so this helper is the single client-side
// truth for "is this offering actually tradeable yet".
function offeringNeedsPhotos(it) {
  return (it.photos || []).length === 0;
}

// A horizontal strip of tappable real-photo thumbnails (zoom on tap). Returns
// '' when a seeking item has no gallery (you don't own it, so none is expected).
// An OFFERING with no photos yet — grandfathered from before we required them —
// shows a "picture soon" placeholder so it reads as "proof pending", not "trust me".
function renderProofStrip(it) {
  const photos = it.photos || [];
  if (!photos.length) {
    if (it.kind !== 'offering') return '';
    return `<div class="trade-proof-strip trade-proof-pending" title="The owner hasn't added real photos yet">`
      + `<span class="trade-proof-soon">📷 picture soon</span></div>`;
  }
  const name = stripOutfitWord(it.name || 'item');
  const thumbs = photos.map((p) => {
    const url = p.url || p;   // gallery objects on offerings, plain urls on line items
    return `<img class="trade-proof-thumb" src="${escapeHtml(url)}" loading="lazy" data-action="zoom-trade" data-src="${escapeHtml(url)}" data-name="${escapeHtml(name)}" />`;
  }).join('');
  return `<div class="trade-proof-strip" title="Real photos from the owner">${thumbs}</div>`;
}

function renderOfferingCard(it) {
  const src = it.photo || catalogImageFor(it.catalogId);
  const photoCount = (it.photos || []).length;
  const badge = photoCount ? `<span class="trade-proof-badge">📷 ${photoCount}</span>` : '';
  const photo = src
    ? `<img src="${escapeHtml(src)}" loading="lazy" data-action="zoom-trade" data-src="${escapeHtml(src)}" data-name="${escapeHtml(stripOutfitWord(it.name))}" />${badge}`
    : `<span class="no-photo">🖤</span>`;
  // Compact row (item 19): small picture on the left, bullet-pointed facts on
  // the right, with a quick-trade CTA. Quick-trade drops you straight into the
  // offer builder with this one item pre-selected on their side.
  const facts = [
    `<li>${TRADE_CAT_LABEL[tradeItemCategory(it)] || 'Other'}</li>`,
    `<li>Available: ${it.available}</li>`,
  ];
  // The owner's answers to the includes checklist — missing extras get their
  // own warning-styled line so nobody has to ask "does the bag come with it?".
  if (Array.isArray(it.extras) && it.extras.length) {
    const has = it.extras.filter((e) => e.included).map((e) => e.name);
    const missing = it.extras.filter((e) => !e.included).map((e) => e.name);
    if (has.length) facts.push(`<li>Includes: ${escapeHtml(has.join(', '))}</li>`);
    if (missing.length) facts.push(`<li class="trade-offer-missing">Missing: ${escapeHtml(missing.join(', '))}</li>`);
  }
  if (it.notes) facts.push(`<li class="trade-offer-note">${escapeHtml(it.notes)}</li>`);
  return `
    <li class="trade-offer-row">
      <div class="trade-offer-photo">${photo}</div>
      <div class="trade-offer-body">
        <h3 class="trade-offer-name">${escapeHtml(stripOutfitWord(it.name))}</h3>
        <ul class="trade-offer-facts">${facts.join('')}</ul>
        ${renderProofStrip({ ...it, kind: 'offering' })}
      </div>
      ${offeringNeedsPhotos(it)
        ? `<button class="btn-primary trade-offer-cta" disabled title="This can't be traded until the owner adds real photos of it">📷 Awaiting photos</button>`
        : `<button class="btn-primary trade-offer-cta" data-action="quick-trade" data-uid="${it.ownerId}" data-item-id="${it.id}">I'll trade for this</button>`}
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
          const photoCount = (it.photos || []).length;
          const badge = kind === 'offering' && photoCount ? `<span class="trade-proof-badge">📷 ${photoCount}</span>` : '';
          const photo = src ? `<img src="${escapeHtml(src)}" loading="lazy" />${badge}` : `<span class="no-photo">🖤</span>`;
          return `
            <article class="card card-small">
              <div class="card-photo">${photo}</div>
              <div class="card-body">
                <h3 class="card-name">${escapeHtml(stripOutfitWord(it.name))}</h3>
                <div class="card-meta">
                  ${kind === 'offering' ? `<span>${it.available} available · ${it.reserved} reserved</span>` : ''}
                </div>
                ${kind === 'offering' && offeringNeedsPhotos(it)
                  ? `<p class="trade-proof-warning">📷 Not tradeable yet — tap Manage and add a real photo so traders can see its condition.</p>`
                  : ''}
              </div>
              <div class="card-actions">
                ${kind === 'offering' ? `<button data-action="trade-item-manage" data-id="${it.id}">Manage</button>` : ''}
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

  const lineHtml = (ls) => ls.map((l) => {
    const ti = l.trade_item || {};
    // Proof photos travel on the line item's trade_item (attached in
    // data.listTrades). Show them right under the line so you can eyeball the
    // real thing before Accept — tap any thumb to zoom.
    const proof = renderProofStrip({ name: ti.name, photos: ti.photos, kind: ti.kind });
    return `<li>${l.quantity}× ${escapeHtml(ti.name ?? 'item')}${proof}</li>`;
  }).join('');

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
// Table-driven dispatch for [data-action] clicks in the Trade tab. Each
// handler receives the clicked element and reads whatever dataset fields it
// needs; it may return a promise (awaited below so a rejection surfaces as
// the catch-all toast). Keep this in sync with the data-action values emitted
// by the trade render functions.
const TRADE_ACTIONS = {
  'zoom-trade':              (b) => openLightbox(b.dataset.src, b.dataset.name),
  'propose-trade':           (b) => openOfferModal(b.dataset.uid),
  'quick-trade':             (b) => openOfferModal(b.dataset.uid, null, b.dataset.itemId),
  'trade-item-remove':       (b) => removeMyTradeItem(b.dataset.id),
  'trade-item-manage':       (b) => manageMyOffering(b.dataset.id),
  'trade-accept':            (b) => respondToTrade(b.dataset.id, 'accept'),
  'trade-reject':            (b) => respondToTrade(b.dataset.id, 'reject'),
  'trade-counter':           (b) => openCounterModal(b.dataset.id),
  'trade-cancel':            (b) => respondToTrade(b.dataset.id, 'cancel'),
  'trade-fall-through':      (b) => respondToTrade(b.dataset.id, 'fall-through'),
  'trade-confirm-fall':      (b) => respondToTrade(b.dataset.id, 'confirm-fall'),
  'trade-dispute-fall':      (b) => openDisputeStatementModal(b.dataset.id, 'open'),
  'trade-dispute-statement': (b) => openDisputeStatementModal(b.dataset.id, 'add'),
  'trade-withdraw-fall':     (b) => respondToTrade(b.dataset.id, 'withdraw-fall'),
  'trade-shipped':           (b) => tradeShipped(b.dataset.id, b.dataset.side),
  'trade-received':          (b) => tradeReceived(b.dataset.id, b.dataset.side),
  'trade-address':           (b) => openAddressModal(b.dataset.id),
  'trade-feedback':          (b) => openFeedbackModal(b.dataset.id),
};

async function onTradeClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const handler = TRADE_ACTIONS[btn.dataset.action];
  if (!handler) return;
  // Wrap the whole dispatch so a thrown error (e.g. an RLS or FK failure deep
  // in the data layer) surfaces as a toast instead of silently doing nothing —
  // that was the original "can't remove" symptom.
  try {
    await handler(btn);
  } catch (err) {
    console.error('trade action failed', btn.dataset.action, err);
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

// Manage an existing offering: opens the trade-list modal so the owner can
// change quantity and add/remove real photos (the gallery is required, so a
// plain quantity prompt is no longer enough).
function manageMyOffering(id) {
  const it = state.myTradeItems.find((x) => x.id === id);
  if (!it) return;
  const colItem = state.collection.find((c) => c.catalogId === it.catalogId);
  const owned = colItem?.quantity || it.quantity || 1;
  openTradeListModal(
    { catalogId: it.catalogId, catalogHandle: it.catalogHandle, name: it.name, photoPath: it.photoPath },
    owned,
    it,
  );
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
    if (found && found.available > 0 && !offeringNeedsPhotos(found)) recipientPicks.set(preselectedItemId, 1);
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
  showEl('offer-modal');
}

function renderOfferBuilder() {
  const d = state.offerDraft;
  const lineRows = (items, picksMap, who) => items.length === 0
    ? `<p class="dim">${who === 'them' ? '@' + d.recipientUsername + ' isn\'t offering anything right now.' : 'You have nothing listed for trade yet. Add something from your Collection.'}</p>`
    : items.map((it) => {
        // No proof photos = not tradeable (db/0082 rejects it server-side
        // too). Shown but inert, so the list still reflects what exists.
        if (offeringNeedsPhotos(it)) {
          const hint = who === 'me'
            ? 'Add a real photo (My Offerings → Manage) to trade this'
            : 'The owner hasn’t added real photos yet';
          return `
            <div class="picker-row picker-row-disabled" title="${hint}">
              <div class="picker-name">${escapeHtml(it.name)} <span class="dim">📷 awaiting photos</span></div>
            </div>
          `;
        }
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
  if (!it || offeringNeedsPhotos(it)) return;
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
    // db/0082 refuses photo-less offerings server-side; surface the real
    // reason instead of a generic failure.
    toast(/TRADE_PROOF_REQUIRED/.test(err?.message || '')
      ? 'An item in this trade has no real photos yet — it can’t be traded until its owner adds one.'
      : 'Could not send offer.');
  }
}

function closeOfferModal() {
  hideEl('offer-modal');
  state.offerDraft = null;
}

// ─── Trade: list-for-trade modal (quantity + REAL proof photos) ──────
// Every offering must carry at least one real, user-taken photo (up to 5).
// Uploads are perceptually fingerprinted against the product's catalog stock
// image and rejected on a near match, so nobody can pass the stock render off
// as proof they own the physical plush. Handles both a fresh listing and
// editing an existing offering (quantity, photos, notes, and a yes/no
// includes checklist for the product's expected extras).
const TRADE_MAX_PHOTOS = 5;
// dHash Hamming distance at/under which an upload is treated as the stock
// image. Kept tight so we never reject a genuine photo — the same image at a
// different size hashes within a few bits; a real photo lands far past this.
const STOCK_MATCH_MAX_DISTANCE = 6;

async function openTradeListModal(catalogItem, owned, existing) {
  state.tradeListDraft = {
    catalogItem,
    owned,
    existingId: existing?.id || null,
    existingReserved: existing?.reserved || 0,
    photos: (existing?.photos || []).map((p) => ({ id: p.id, socialPath: p.socialPath, url: p.url })),
    removedIds: [],
    stockHash: null,
    collectionPhoto: null,   // { path, url } — their own existing photo, offered as a one-tap option
    extras: buildTradeListExtras(catalogItem, existing),
    saving: false,
  };
  document.getElementById('tl-title').textContent = existing ? 'Manage your offering' : 'Offer for trade';
  document.getElementById('tl-name').textContent = stripOutfitWord(catalogItem.name || '');
  const qtyInput = document.getElementById('tl-qty');
  qtyInput.max = String(owned);
  qtyInput.min = String(Math.max(1, state.tradeListDraft.existingReserved || 1));
  qtyInput.value = String(existing?.quantity || owned || 1);
  document.getElementById('tl-notes').value = existing?.notes || '';
  hideEl('tl-error');
  renderTradeListExtras();
  renderTradeListPhotos();
  showEl('trade-list-modal');
  // Fingerprint the stock image in the background so the reject check is ready
  // by the time they add a photo. May stay null (cross-origin canvas taint) —
  // then we fail open and just require an upload.
  const stockUrl = catalogImageFor(catalogItem.catalogId);
  const stockHashReady = stockUrl
    ? perceptualHash(stockUrl)
        .then((h) => { if (state.tradeListDraft?.catalogItem === catalogItem) state.tradeListDraft.stockHash = h; return h; })
        .catch(() => null)
    : Promise.resolve(null);
  // If they've already photographed this item in their collection, offer that
  // shot as a one-tap option — only when first listing it, and never forced:
  // someone trading a *different* copy just ignores it and uploads fresh.
  // "Photographed" must mean THEIR OWN shot: adding from the catalog snapshots
  // the STORE image into the collection (or hot-links its URL), so an http(s)
  // photoPath, or one whose pixels dHash-match the stock render, is the store
  // picture wearing a collection costume — never suggest those. Unlike the
  // upload check this fails CLOSED (most collection covers ARE the snapshot):
  // if either hash can't be computed we just don't show the shortcut.
  if (!existing && catalogItem.photoPath && !/^https?:\/\//i.test(catalogItem.photoPath)) {
    data.photoUrl(catalogItem.photoPath)
      .then(async (url) => {
        if (!url) return;
        if (stockUrl) {
          const [stockHash, shotHash] = await Promise.all([stockHashReady, perceptualHash(url)]);
          if (stockHash == null || shotHash == null) return;
          if (hammingDistance(shotHash, stockHash) <= STOCK_MATCH_MAX_DISTANCE) return;
        }
        if (state.tradeListDraft?.catalogItem !== catalogItem) return;   // modal moved on
        state.tradeListDraft.collectionPhoto = { path: catalogItem.photoPath, url };
        renderTradeListSuggestion();
      })
      .catch(() => {});
  }
}

// The includes checklist for the offer modal, built from the catalog item's
// parsed Set Includes so we ask about each expected extra (bag, ribbon, …) by
// name. `included` is true/false/null — null means "not answered yet", and
// saving requires an answer for every row. Editing prefills from the saved
// offering; a fresh listing prefills "No" for anything the owner's collection
// row already marks missing (anything else stays an explicit question).
function buildTradeListExtras(catalogItem, existing) {
  if (!catalogItem.catalogId) return [];
  const raw = catalogById(catalogItem.catalogId);
  const cat = raw ? resolveCatalogItem(raw) : null;
  const expected = (cat && Array.isArray(cat.accessories)) ? cat.accessories : [];
  if (!expected.length) return [];
  const saved = new Map((existing?.extras || []).map((e) => [e.name, !!e.included]));
  const colItem = state.collection.find((c) => c.catalogId === catalogItem.catalogId);
  const missing = Array.isArray(colItem?.missingAccessories) ? colItem.missingAccessories : [];
  return expected.map((acc) => {
    const name = typeof acc === 'string' ? acc : acc.name;
    const key = typeof acc === 'string' ? acc.toLowerCase() : (acc.key || name.toLowerCase());
    let included = saved.has(name) ? saved.get(name) : null;
    if (included === null && missing.includes(key)) included = false;
    return { name, included };
  });
}

// One explicit Yes/No row per expected extra — asked outright rather than
// pre-checked, because "did they just not look?" is exactly the doubt the
// other trader needs resolved before shipping.
function renderTradeListExtras() {
  const field = document.getElementById('tl-extras-field');
  const box = document.getElementById('tl-extras');
  if (!field || !box) return;
  const extras = state.tradeListDraft?.extras || [];
  if (!extras.length) { field.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = extras.map((e, i) => `
    <div class="tl-extra-row">
      <span class="tl-extra-name">${escapeHtml(e.name)}</span>
      <div class="tl-extra-choice" role="group" aria-label="Is ${escapeHtml(e.name)} included?">
        <button type="button" class="tl-extra-btn${e.included === true ? ' tl-extra-yes' : ''}" data-tl-extra="${i}" data-tl-extra-val="yes">Yes</button>
        <button type="button" class="tl-extra-btn${e.included === false ? ' tl-extra-no' : ''}" data-tl-extra="${i}" data-tl-extra-val="no">No</button>
      </div>
    </div>
  `).join('');
  field.classList.remove('hidden');
}

function setTradeListExtra(idx, included) {
  const row = state.tradeListDraft?.extras?.[idx];
  if (!row) return;
  row.included = included;
  hideEl('tl-error');
  renderTradeListExtras();
}

// Renders the "use the photo you already have" prompt, shown only while an
// unconsumed collection photo is available and there's room in the gallery.
function renderTradeListSuggestion() {
  const box = document.getElementById('tl-suggestion');
  if (!box) return;
  const d = state.tradeListDraft;
  const cp = d?.collectionPhoto;
  const hasRoom = d && d.photos.length < TRADE_MAX_PHOTOS;
  if (!cp || !hasRoom) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = `
    <img src="${escapeHtml(cp.url)}" alt="" />
    <div class="tl-suggestion-text">
      <strong>Use the photo you already have?</strong>
      <span>You've got your own shot of this in your collection. If this is the one you're trading, add it — otherwise take a fresh photo.</span>
    </div>
    <button type="button" id="tl-use-collection" class="btn-ghost">Use it</button>
  `;
  box.classList.remove('hidden');
}

// One-tap add of the existing collection photo. Consumes the suggestion so it
// can't be double-added; it's re-offered if the photo is later removed.
function useCollectionPhoto() {
  const d = state.tradeListDraft;
  if (!d || !d.collectionPhoto || d.photos.length >= TRADE_MAX_PHOTOS) return;
  d.photos.push({ collectionPath: d.collectionPhoto.path, url: d.collectionPhoto.url });
  d.collectionPhoto = null;
  hideEl('tl-error');
  renderTradeListPhotos();
}

function renderTradeListPhotos() {
  const d = state.tradeListDraft;
  if (!d) return;
  const grid = document.getElementById('tl-photos');
  grid.innerHTML = d.photos.map((p, i) => `
    <div class="tl-photo-cell">
      <img src="${escapeHtml(p.url)}" alt="" />
      <button type="button" class="tl-photo-remove" data-tl-remove="${i}" aria-label="Remove photo">×</button>
    </div>
  `).join('') || '<p class="tl-photo-empty">No photos yet — add at least one real shot of your plush.</p>';
  const addBtn = document.getElementById('tl-add-photo');
  const atMax = d.photos.length >= TRADE_MAX_PHOTOS;
  addBtn.disabled = atMax;
  addBtn.textContent = atMax ? 'Maximum 5 photos' : `📷 Add photo (${d.photos.length}/${TRADE_MAX_PHOTOS})`;
  renderTradeListSuggestion();
}

function tlError(msg) {
  const el = document.getElementById('tl-error');
  el.textContent = msg;
  showEl('tl-error');
}

async function onTradeListAddPhotos(fileList) {
  const d = state.tradeListDraft;
  if (!d) return;
  hideEl('tl-error');
  const files = [...(fileList || [])];
  for (const file of files) {
    if (d.photos.length >= TRADE_MAX_PHOTOS) { tlError('Up to 5 photos.'); break; }
    let blob;
    try { blob = await compressPickedPhoto(file); }
    catch (err) { tlError(err.message); continue; }
    // Reject the catalog stock image (near-duplicate dHash). Fail open if we
    // couldn't fingerprint the stock render (hammingDistance → Infinity).
    const shotHash = await perceptualHash(blob);
    if (hammingDistance(shotHash, d.stockHash) <= STOCK_MATCH_MAX_DISTANCE) {
      tlError('That looks like the stock catalog photo — snap a real one of your actual plush.');
      continue;
    }
    d.photos.push({ blob, url: URL.createObjectURL(blob) });
  }
  renderTradeListPhotos();
}

function removeTradeListPhoto(idx) {
  const d = state.tradeListDraft;
  if (!d) return;
  const [removed] = d.photos.splice(idx, 1);
  if (removed?.id) d.removedIds.push(removed.id);
  if (removed?.blob && removed.url) URL.revokeObjectURL(removed.url);
  // Pulled their collection photo back out — re-offer it as the suggestion.
  if (removed?.collectionPath) d.collectionPhoto = { path: removed.collectionPath, url: removed.url };
  renderTradeListPhotos();
}

async function saveTradeList() {
  const d = state.tradeListDraft;
  if (!d || d.saving) return;
  if (d.photos.length < 1) { tlError('Add at least one real photo of your plush.'); return; }
  // Every expected extra needs an explicit Yes/No before the listing goes up.
  const unanswered = (d.extras || []).find((e) => e.included === null);
  if (unanswered) { tlError(`Is "${unanswered.name}" included? Answer Yes or No for each extra.`); return; }
  const notes = document.getElementById('tl-notes').value.trim() || null;
  const extras = (d.extras || []).length ? d.extras.map((e) => ({ name: e.name, included: e.included })) : null;
  let qty = parseInt(document.getElementById('tl-qty').value, 10);
  if (Number.isNaN(qty)) qty = d.owned;
  // Ceiling at what you own; floor at what's already reserved in live trades.
  qty = Math.max(Math.max(1, d.existingReserved), Math.min(d.owned, qty));

  const saveBtn = document.getElementById('tl-save');
  d.saving = true;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    const item = d.catalogItem;
    // Upload any newly-added photos to the public 'social' bucket, preserving
    // the on-screen order (existing kept photos already have a socialPath).
    const ordered = [];
    for (const p of d.photos) {
      if (p.socialPath) { ordered.push(p.socialPath); continue; }
      if (p.collectionPath) {
        // Their existing collection photo lives in the private 'photos' bucket;
        // copy it into public 'social' so the other trader can see it.
        const sp = await data._copyPhotoToSocial(p.collectionPath);
        if (sp) ordered.push(sp);
        continue;
      }
      ordered.push(await data.uploadSocialPhoto(p.blob));
    }
    if (!ordered.length) throw new Error('Photo upload failed — please try again.');
    const cover = ordered[0] || null;

    if (d.existingId) {
      await data.updateTradeItem(d.existingId, { quantity: qty, photoSocialPath: cover, notes, extras });
      for (const id of d.removedIds) {
        try { await data.deleteTradeItemPhoto(id); } catch (err) { console.warn('remove trade photo', err); }
      }
      // Persist only the freshly-uploaded ones; kept photos already have rows.
      const startPos = d.photos.filter((p) => p.socialPath).length;
      const fresh = ordered.slice(startPos);
      if (fresh.length) await data.addTradeItemPhotos(d.existingId, fresh, startPos);
      toast(`Offering ${qty} now.`);
    } else {
      const created = await data.addTradeItem({
        kind: 'offering',
        catalogId: item.catalogId,
        catalogHandle: item.catalogHandle ?? null,
        name: item.name,
        photoPath: item.photoPath ?? null,   // owner's own collection view
        photoSocialPath: cover,              // public cover = first real photo
        quantity: qty,
        notes,
        extras,
      });
      if (created?.id) await data.addTradeItemPhotos(created.id, ordered, 0);
      toast(`Offering ${qty} for trade.`);
    }

    for (const p of d.photos) { if (p.blob && p.url) URL.revokeObjectURL(p.url); }
    closeTradeListModal();
    state.myTradeItems = await data.listMyTradeItems();
    render();
  } catch (err) {
    console.error('saveTradeList', err);
    tlError('Could not save: ' + (err.message || 'see console'));
  } finally {
    d.saving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = 'List for trade';
  }
}

function closeTradeListModal() {
  hideEl('trade-list-modal');
  const d = state.tradeListDraft;
  if (d) for (const p of d.photos) { if (p.blob && p.url) URL.revokeObjectURL(p.url); }
  state.tradeListDraft = null;
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
  showEl('feedback-modal');
}

function closeFeedbackModal() {
  hideEl('feedback-modal');
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
  showEl('mini-profile-modal');
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
  hideEl('mini-profile-modal');
}

function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString();
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ════════════════════════════════════════════════════════════════════
// ─── For Sale market (db/0106) ───────────────────────────────────────
// Buy/sell alongside trading. THE RULE: you can only list something Plushie
// Dreadfuls isn't selling right now; if PD restocks it later, the listing
// stays up only at or below PD's price (a restock pauses anything priced
// above). Listings are written by the `market-listing` edge function, which
// checks PD live — the client never decides stock. Offers go through RPCs.
// Insider-gated (feature.market) until payments ship in phase 2, so an
// accepted offer holds the item 48h but checkout isn't wired yet.
// ════════════════════════════════════════════════════════════════════
const MARKET_MAX_PHOTOS = 5;

function marketEnabled() {
  return !!window.currentUser && data.featureEnabled('feature.market', false);
}
function money(cents) {
  return cents == null ? 'N/A' : `$${(cents / 100).toFixed(2)}`;
}
function dollarsToCents(v) {
  const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
// A hold from an accepted offer only counts until its window lapses.
function listingOnHold(l) {
  return l.status === 'reserved' && l.reservedUntil && new Date(l.reservedUntil) > new Date();
}
function offerIsLive(o) {
  return o.status === 'pending' && new Date(o.expiresAt) > new Date();
}
// It's my move on a pending offer when the OTHER side made it.
function offerIsMyTurn(o) {
  const uid = window.currentUser?.id;
  if (!offerIsLive(o)) return false;
  return (o.fromRole === 'buyer' && o.sellerId === uid) || (o.fromRole === 'seller' && o.buyerId === uid);
}
function marketTurnCount() {
  return (state.marketOffers || []).filter(offerIsMyTurn).length + marketOrderTurnCount();
}
// Orders waiting on me: a seller has something to ship, a buyer has a
// shipment to confirm or an accepted deal to pay for.
function marketOrderTurnCount() {
  const uid = window.currentUser?.id;
  const orders = state.marketOrders || [];
  const toShip = orders.filter((o) => o.sellerId === uid && o.status === 'paid').length;
  const toConfirm = orders.filter((o) => o.buyerId === uid && o.status === 'delivered').length;
  const toPay = (state.marketOffers || []).filter((o) => o.status === 'accepted' && o.buyerId === uid
    && o.listing?.reservedOfferId === o.id && o.listing?.reservedUntil && new Date(o.listing.reservedUntil) > new Date()
    && !orders.some((x) => x.offerId === o.id && x.status !== 'awaiting_payment')).length;
  return toShip + toConfirm + toPay;
}

async function loadMarketData() {
  const [browse, mine, offers, orders, payouts, termsOk, owed] = await Promise.all([
    data.browseListings(),
    data.listMyListings(),
    data.listMarketOffers(),
    data.listMarketOrders(),
    data.getMyPayouts(),
    data.hasAcceptedSellerTerms(),
    data.getMySellerOwedCents(),
  ]);
  state.sellerTermsOk = termsOk;
  state.myOwedCents = owed;
  state.marketBrowse = browse;
  state.myListings = mine;
  state.marketOffers = offers;
  state.marketOrders = orders;
  state.myPayouts = payouts;
  await consumeMarketReturn();
}

// Coming back from Stripe (?mkt=…): land on the right For Sale view, say what
// happened, and strip the marker so a reload doesn't repeat it.
async function consumeMarketReturn() {
  const params = new URLSearchParams(window.location.search);
  const mkt = params.get('mkt');
  if (!mkt) return;
  params.delete('mkt');
  const qs = params.toString();
  history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  state.tradeSubTab = 'sale';
  if (mkt === 'paid') {
    state.saleFilter = 'offers';
    toast('Paid 🎉 The seller has been told to ship it.');
    // Stripe's webhook can land a beat after the redirect; refresh once more.
    setTimeout(() => { refreshMarket().catch(() => {}); }, 4000);
  } else if (mkt === 'pay_cancelled') {
    state.saleFilter = 'offers';
    toast('Checkout cancelled — the deal is still held for you.');
  } else if (mkt === 'payouts_done' || mkt === 'payouts_retry') {
    state.saleFilter = 'mine';
    try {
      state.myPayouts = await data.marketPayCall({ action: 'payouts_status' });
      toast(state.myPayouts.ready ? 'Payouts are set up — buyers can pay you now.' : 'Stripe still needs a few details before you can be paid.');
    } catch (err) {
      console.error('payouts_status', err);
      toast(err.message);
    }
  }
}

// Friendly text for the RPCs' raised codes.
const MARKET_ERRORS = {
  MARKET_NOT_ENABLED: "Selling isn't open to your account yet.",
  MARKET_LISTING_NOT_FOUND: 'That listing is gone.',
  MARKET_LISTING_UNAVAILABLE: "That listing isn't taking offers right now.",
  MARKET_OWN_LISTING: "That's your own listing.",
  MARKET_OFFER_TOO_LOW: 'Offers start at $5.00.',
  MARKET_OFFER_ABOVE_PRICE: "An offer can't be more than the asking price.",
  MARKET_NOT_YOUR_OFFER: "That offer isn't yours to answer.",
  MARKET_OFFER_CLOSED: 'That offer has already been answered.',
  MARKET_OFFER_EXPIRED: 'That offer expired.',
  MARKET_LISTING_RESERVED: 'A buyer has this on hold — it can’t be taken down until the hold ends.',
  MARKET_LISTING_SOLD: 'That one already sold.',
};
function marketErrorText(err) {
  const code = /MARKET_[A-Z_]+/.exec(err?.message || '')?.[0];
  return MARKET_ERRORS[code] || err?.message || 'Something went wrong.';
}

function pdStateLine(l) {
  if (l.pdState === 'in_stock_capped') {
    return `<li class="mkt-pd mkt-pd-capped">Back at Plushie Dreadfuls for ${money(l.pdPriceCents)} — priced at or under</li>`;
  }
  if (l.pdState === 'not_on_pd') return '<li class="mkt-pd">Not sold by Plushie Dreadfuls</li>';
  return '<li class="mkt-pd">Sold out at Plushie Dreadfuls</li>';
}

function extrasLines(extras) {
  if (!Array.isArray(extras) || !extras.length) return '';
  const has = extras.filter((e) => e.included).map((e) => e.name);
  const missing = extras.filter((e) => !e.included).map((e) => e.name);
  return (has.length ? `<li>Includes: ${escapeHtml(has.join(', '))}</li>` : '')
    + (missing.length ? `<li class="trade-offer-missing">Missing: ${escapeHtml(missing.join(', '))}</li>` : '');
}

// ─── For Sale: render ────────────────────────────────────────────────
function renderSale() {
  const el = document.getElementById('subtab-sale');
  if (!el) return;
  if (!state.ready.has('trade')) { el.innerHTML = loadingPlaceholder('Summoning the market…'); return; }
  const f = state.saleFilter || 'shop';
  const turn = marketTurnCount();
  const pill = (key, label, count) =>
    `<button class="chip chip-toggle ${f === key ? 'active' : ''}" data-action="mkt-filter" data-filter="${key}">${label}${count > 0 ? ` <span class="dim">${count}</span>` : ''}</button>`;
  let body;
  if (f === 'offers') body = renderSaleOffers();
  else if (f === 'mine') body = renderSaleMine();
  else body = renderSaleShop();
  el.innerHTML = `
    <div class="mkt-preview-banner">🕯 Insider preview — payments run in Stripe <strong>test mode</strong>: no real money moves. Pay with card 4242 4242 4242 4242, any future date, any CVC. An accepted offer holds the item for 48 hours.</div>
    <div class="filters trade-filters">
      ${pill('shop', 'Shop', state.marketBrowse.length)}
      ${pill('offers', 'Offers', turn)}
      ${pill('mine', 'My listings', state.myListings.length)}
    </div>
    ${body}
  `;
}

function renderSaleShop() {
  const list = state.marketBrowse;
  if (!list.length) {
    return `<div class="empty"><div class="ghost">🕯</div><p>Nothing for sale yet. List something from your Crypt with “$ Sell”.</p></div>`;
  }
  return `<ul class="trade-offer-list">${list.map(renderListingCard).join('')}</ul>`;
}

function renderListingCard(l) {
  const uid = window.currentUser.id;
  const src = l.photo || catalogImageFor(l.catalogId);
  const photo = src
    ? `<img src="${escapeHtml(src)}" loading="lazy" data-action="zoom-trade" data-src="${escapeHtml(src)}" data-name="${escapeHtml(stripOutfitWord(l.name))}" />`
    : `<span class="no-photo">🖤</span>`;
  const mine = state.marketOffers.find((o) => o.listingId === l.id && o.buyerId === uid && offerIsLive(o));
  const facts = [
    `<li class="mkt-price">${money(l.priceCents)} <span class="dim">+ shipping at checkout</span></li>`,
    l.shipServices?.length ? `<li class="dim">Ships ${escapeHtml(l.shipServices.map(data.shipServiceLabel).join(' · '))}</li>` : '',
    pdStateLine(l),
    extrasLines(l.extras),
    l.notes ? `<li class="trade-offer-note">${escapeHtml(l.notes)}</li>` : '',
    mine ? `<li class="mkt-your-offer">${mine.fromRole === 'buyer' ? 'Your offer' : 'Their counter'}: ${money(mine.amountCents)} · pending</li>` : '',
  ].join('');
  const held = listingOnHold(l);
  const cta = held
    ? `<button class="btn-primary trade-offer-cta" disabled>On hold for a buyer</button>`
    : `<button class="btn-primary trade-offer-cta" data-action="mkt-offer" data-id="${l.id}">${mine ? 'Change offer' : 'Make offer'}</button>`;
  return `
    <li class="trade-offer-row">
      <div class="trade-offer-photo">${photo}</div>
      <div class="trade-offer-body">
        <h3 class="trade-offer-name">${escapeHtml(stripOutfitWord(l.name))}</h3>
        <div class="mkt-seller">${repBadge(l.sellerId, l.sellerUsername, state.partnerFeedback.get(l.sellerId))}</div>
        <ul class="trade-offer-facts">${facts}</ul>
        ${renderProofStrip({ name: l.name, photos: l.photos, kind: 'offering' })}
      </div>
      ${cta}
    </li>
  `;
}

// An accepted offer is a deal: before payment it shows the hold (and the
// buyer's Pay button); after, the order's progress and whoever's move it is.
function renderDealBlock(o, iAmSeller) {
  const order = (state.marketOrders || []).find((x) => x.offerId === o.id && x.status !== 'cancelled')
    || (state.marketOrders || []).find((x) => x.offerId === o.id);
  const held = o.listing?.reservedOfferId === o.id && o.listing?.reservedUntil
    && new Date(o.listing.reservedUntil) > new Date();
  const until = held ? new Date(o.listing.reservedUntil).toLocaleString() : '';

  if (!order || order.status === 'awaiting_payment') {
    if (!held) return `<div class="ship-first-banner">Deal at ${money(o.amountCents)} — the hold ended before it was paid.</div>`;
    const fee = data.marketTotals(o.amountCents, 0).buyerFee;
    if (iAmSeller) {
      const nudge = state.myPayouts?.ready ? ''
        : ` <strong>Set up payouts (My listings) so they can pay.</strong>`;
      return `<div class="ship-first-banner">Deal at ${money(o.amountCents)} — waiting for the buyer to pay (held until ${until}).${nudge}</div>`;
    }
    const svcs = (o.listing?.shipServices || []).map(data.shipServiceLabel).join(' · ');
    return `<div class="ship-first-banner mkt-deal">
        <p>Deal at ${money(o.amountCents)} — held for you until ${until}.</p>
        <p class="dim">${money(o.amountCents)} + ${money(fee)} buyer fee + shipping${svcs ? ` (${escapeHtml(svcs)})` : ''}</p>
        <div class="card-actions"><button class="btn-primary" data-action="mkt-pay" data-id="${o.id}">Checkout</button></div>
      </div>`;
  }

  const tracking = order.tracking ? `${escapeHtml(order.carrier || '')} ${escapeHtml(order.tracking)}` : '';
  const svc = order.shipService ? escapeHtml(data.shipServiceLabel(order.shipService)) : 'Shipping';
  const statusWord = {
    pre_transit: 'label made, not scanned yet', in_transit: 'in transit', out_for_delivery: 'out for delivery',
    available_for_pickup: 'ready for pickup', delivered: 'delivered', return_to_sender: 'returning to sender',
    failure: 'carrier problem', error: 'carrier problem',
  }[order.trackingStatus] || '';
  const trackLine = tracking ? `<p class="dim">${svc}: ${tracking}${statusWord ? ` · ${statusWord}` : ''}</p>` : '';
  switch (order.status) {
    case 'paid':
      if (iAmSeller) {
        const label = order.labelUrl
          ? `<a class="btn-primary" href="${escapeHtml(order.labelUrl)}" target="_blank" rel="noopener">🖨 Print shipping label</a>`
          : order.labelError
            ? `<p class="trade-proof-warning">We couldn't buy the label yet.</p><button class="btn-primary" data-action="mkt-label-retry" data-id="${order.id}">Try the label again</button>`
            : `<p class="dim">Getting your label…</p>`;
        return `<div class="ship-first-banner mkt-deal">
            <p><strong>Paid ${money(order.totalCents)}.</strong> Print the label, tape it on, and drop it off — tracking updates the buyer automatically.</p>
            <div class="card-actions">${label}
              <button class="btn-danger" data-action="mkt-refund" data-id="${order.id}">Can’t ship — refund</button>
            </div>
            ${trackLine}
            <p class="dim">You’ll get ${money(order.sellerPayoutCents)} 3 days after it’s delivered (or sooner if the buyer confirms).</p>
          </div>`;
      }
      return `<div class="ship-first-banner mkt-deal"><p>Paid ${money(order.totalCents)} — waiting for the seller to drop it off.</p>${trackLine}</div>`;
    case 'shipped':
      if (iAmSeller) return `<div class="ship-first-banner">On its way. ${trackLine}You’re paid ${money(order.sellerPayoutCents)} 3 days after delivery.</div>`;
      return `<div class="ship-first-banner mkt-deal">
          <p>On its way!</p>${trackLine}
          <div class="card-actions"><button class="btn-primary" data-action="mkt-arrived" data-id="${order.id}">It arrived</button></div>
          <p class="dim">Tapping this pays the seller right away. Otherwise they’re paid 3 days after delivery.</p>
        </div>`;
    case 'delivered':
      if (iAmSeller) return `<div class="ship-first-banner">Delivered. You’re paid ${money(order.sellerPayoutCents)} 3 days after delivery, or sooner if the buyer confirms.</div>`;
      return `<div class="ship-first-banner mkt-deal">
          <p>Delivered 📬</p>${trackLine}
          <div class="card-actions"><button class="btn-primary" data-action="mkt-arrived" data-id="${order.id}">All good — pay the seller</button></div>
          <p class="dim">Something wrong with it? Tell us within 3 days of delivery, before the seller is paid.</p>
        </div>`;
    case 'released':
      return `<div class="ship-first-banner">Done ✓ ${iAmSeller ? `${money(order.sellerPayoutCents)} sent to your payouts.` : 'The seller has been paid.'}</div>`;
    case 'refunded':
      return `<div class="ship-first-banner">Refunded — ${iAmSeller ? 'the buyer got their money back.' : `${money(order.totalCents)} is back on your card.`}</div>`;
    case 'disputed':
      return `<div class="ship-first-banner">Disputed with the card company — on hold while it’s reviewed.</div>`;
  }
  return '';
}

// Offer threads: one per (listing, buyer); newest offer leads, earlier rounds
// summarized underneath.
function renderSaleOffers() {
  const uid = window.currentUser.id;
  const threads = new Map();
  for (const o of state.marketOffers) {
    const k = `${o.listingId}|${o.buyerId}`;
    if (!threads.has(k)) threads.set(k, []);
    threads.get(k).push(o);   // already newest-first
  }
  if (!threads.size) {
    return `<div class="empty"><div class="ghost">📜</div><p>No offers yet.</p></div>`;
  }
  const rows = [...threads.values()]
    .sort((a, b) => (offerIsMyTurn(b[0]) ? 1 : 0) - (offerIsMyTurn(a[0]) ? 1 : 0))
    .map((offers) => {
      const o = offers[0];
      const iAmSeller = o.sellerId === uid;
      const other = iAmSeller
        ? repBadge(o.buyerId, o.buyerUsername, state.partnerFeedback.get(o.buyerId))
        : repBadge(o.sellerId, o.sellerUsername, state.partnerFeedback.get(o.sellerId));
      const byMe = (o.fromRole === 'seller') === iAmSeller;
      const expired = o.status === 'pending' && !offerIsLive(o);
      const statusText = expired ? 'Expired'
        : o.status === 'pending' ? (byMe ? 'Waiting on them' : 'Your turn')
        : o.status === 'accepted' ? 'Accepted' : capitalize(o.status);
      let actions = '';
      if (offerIsMyTurn(o)) {
        actions = `
          <button class="btn-primary" data-action="mkt-accept" data-id="${o.id}">Accept ${money(o.amountCents)}</button>
          <button data-action="mkt-counter" data-id="${o.id}">Counter</button>
          <button class="btn-danger" data-action="mkt-decline" data-id="${o.id}">Decline</button>`;
      } else if (offerIsLive(o) && byMe) {
        actions = `<button class="btn-ghost" data-action="mkt-withdraw" data-id="${o.id}">Withdraw</button>`;
      }
      const acceptedNote = o.status === 'accepted' ? renderDealBlock(o, iAmSeller) : '';
      const history = offers.slice(1, 4).map((h) =>
        `${money(h.amountCents)} (${((h.fromRole === 'seller') === iAmSeller) ? 'you' : 'them'})`).join(' ← ');
      return `
        <article class="trade-card">
          <header class="trade-head"><div>
            <span class="trade-with">${escapeHtml(stripOutfitWord(o.listing?.name || 'item'))} · ${iAmSeller ? 'buyer' : 'seller'} ${other}</span>
            <span class="trade-status trade-status-${offerIsMyTurn(o) ? 'your' : (o.status === 'pending' && !expired ? 'their' : (o.status === 'accepted' ? 'done' : 'dead'))}">${statusText}</span>
          </div></header>
          <p class="mkt-offer-amount">${byMe ? 'You offered' : 'They offered'} <strong>${money(o.amountCents)}</strong> <span class="dim">· asking ${money(o.listing?.priceCents)}</span></p>
          ${o.message ? `<p class="trade-message">“${escapeHtml(o.message)}”</p>` : ''}
          ${history ? `<p class="dim mkt-history">Earlier: ${history}</p>` : ''}
          ${acceptedNote}
          ${actions ? `<div class="card-actions">${actions}</div>` : ''}
        </article>`;
    }).join('');
  return `<div class="trade-list">${rows}</div>`;
}

function renderPayoutsBanner() {
  const p = state.myPayouts;
  const owed = state.myOwedCents > 0
    ? `<p class="trade-proof-warning">You owe ${money(state.myOwedCents)} in seller fees from a cancelled sale — it comes out of your next payout.</p>`
    : '';
  if (p?.ready) {
    return `<div class="mkt-payouts mkt-payouts-ready">💸 Payouts are set up. <button class="btn-ghost" data-action="mkt-payouts-dash">Open my Stripe payouts</button></div>${owed}`;
  }
  return `<div class="mkt-payouts">
      <p><strong>Set up payouts to get paid.</strong> Buyers can’t pay for your items until you do. Stripe handles it — it takes a few minutes and asks for your bank details.</p>
      <button class="btn-primary" data-action="mkt-payouts">${p?.started ? 'Finish payout setup' : 'Set up payouts'}</button>
    </div>${owed}`;
}

function renderSaleMine() {
  const list = state.myListings;
  if (!list.length) {
    return `${renderPayoutsBanner()}<p class="empty-note">Nothing listed yet — tap “$ Sell” on an item in your Crypt.</p>`;
  }
  const statusLine = (l) => {
    if (l.status === 'paused') {
      return `<p class="trade-proof-warning">⏸ Paused — Plushie Dreadfuls ${l.pauseReason === 'pd_price_drop' ? 'dropped its price' : 'restocked this'}. Edit it to ${l.pdPriceCents != null ? money(l.pdPriceCents) : 'PD’s price'} or lower to relist.</p>`;
    }
    if (listingOnHold(l)) return `<p class="dim">On hold for a buyer until ${new Date(l.reservedUntil).toLocaleString()}</p>`;
    if (l.status === 'sold') return `<p class="dim">Sold</p>`;
    return `<p class="dim">Live · checked against PD ${shortDate(l.pdCheckedAt)}</p>`;
  };
  return `${renderPayoutsBanner()}<div class="grid grid-tight">${list.map((l) => {
    const src = l.photo || catalogImageFor(l.catalogId);
    const photo = src ? `<img src="${escapeHtml(src)}" loading="lazy" />` : `<span class="no-photo">🖤</span>`;
    const editable = l.status === 'active' || l.status === 'paused';
    return `
      <article class="card card-small">
        <div class="card-photo">${photo}</div>
        <div class="card-body">
          <h3 class="card-name">${escapeHtml(stripOutfitWord(l.name))}</h3>
          <div class="card-meta"><span>${money(l.priceCents)} + shipping</span></div>
          ${statusLine(l)}
        </div>
        <div class="card-actions">
          ${editable ? `<button data-action="mkt-edit" data-id="${l.id}">Edit</button>` : ''}
          ${editable ? `<button class="btn-danger" data-action="mkt-remove" data-id="${l.id}">Remove</button>` : ''}
        </div>
      </article>`;
  }).join('')}</div>`;
}

async function refreshMarket() {
  await loadMarketData();
  updateTradeBadge();
  render();
}

// ─── For Sale: sell modal (list / edit) ──────────────────────────────
// colItem: the collection row being listed (create), or null when editing.
// listing: the existing listing (edit), or null when creating.
function openSellModal(colItem, listing) {
  if (!marketEnabled()) return;
  if (!state.sellerTermsOk) { requireSellerTerms(() => openSellModal(colItem, listing)); return; }
  const catalogId = listing?.catalogId || colItem?.catalogId;
  if (!catalogId) { toast('Only catalog items can be sold.'); return; }
  state.sellDraft = {
    colItem,
    listing,
    catalogId,
    photos: (listing?.photos || []).map((p) => ({ socialPath: p.socialPath, url: p.url })),
    extras: buildTradeListExtras({ catalogId }, listing ? { extras: listing.extras } : null),
    stockHash: null,
    saving: false,
    // Shipping: package + services ride on the listing; the ship-from address
    // is per seller (loaded below; null until known, false = none saved).
    services: listing?.shipServices?.length ? [...listing.shipServices] : ['usps_ground'],
    shipFrom: null,
    editShipFrom: false,
  };
  const name = listing?.name || colItem?.name || '';
  document.getElementById('ms-title').textContent = listing ? 'Edit your listing' : 'Sell this';
  document.getElementById('ms-name').textContent = stripOutfitWord(name);
  document.getElementById('ms-price').value = listing ? (listing.priceCents / 100).toFixed(2) : '';
  const parcelSel = document.getElementById('ms-parcel');
  parcelSel.innerHTML = data.PARCEL_PRESETS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)}</option>`).join('');
  parcelSel.value = listing?.parcel?.preset || 'mailer';
  const oz = listing?.parcel?.weightOz;
  document.getElementById('ms-weight-lb').value = oz ? Math.floor(oz / 16) : '';
  document.getElementById('ms-weight-oz').value = oz ? oz % 16 : '';
  document.getElementById('ms-notes').value = listing?.notes || '';
  document.getElementById('ms-save').textContent = listing ? 'Save & re-check' : 'List for sale';
  hideEl('ms-error');
  renderSellFees();
  renderSellExtras();
  renderSellPhotos();
  renderSellServices();
  renderSellShipFrom();
  showEl('market-sell-modal');
  const draft = state.sellDraft;
  data.getMyShipFrom()
    .then((row) => { if (state.sellDraft === draft) { draft.shipFrom = row || false; renderSellShipFrom(); } })
    .catch((err) => { console.error('getMyShipFrom', err); if (state.sellDraft === draft) { draft.shipFrom = false; renderSellShipFrom(); } });
  const stockUrl = catalogImageFor(catalogId);
  if (stockUrl) {
    perceptualHash(stockUrl)
      .then((h) => { if (state.sellDraft?.catalogId === catalogId) state.sellDraft.stockHash = h; })
      .catch(() => {});
  }
}

function closeSellModal() {
  hideEl('market-sell-modal');
  const d = state.sellDraft;
  if (d) for (const p of d.photos) { if (p.blob && p.url) URL.revokeObjectURL(p.url); }
  state.sellDraft = null;
}

function msError(msg) {
  const el = document.getElementById('ms-error');
  el.textContent = msg;
  showEl('ms-error');
}

// What the buyer pays and what the seller nets, from the settled 5%/5% fees.
function renderSellFees() {
  const el = document.getElementById('ms-fees');
  if (!el) return;
  const price = dollarsToCents(document.getElementById('ms-price').value);
  if (!Number.isFinite(price) || price <= 0) { el.textContent = 'Fees: buyers pay 5% on top; you pay 5% (minimum $1). Shipping is fee-free — the buyer pays the real label cost.'; return; }
  const { buyerPct, sellerPct } = data.MARKET_FEES;
  const t = data.marketTotals(price, 0);
  el.textContent = `Buyer pays ${money(t.buyerTotal)} (incl. ${buyerPct}% fee) + shipping. You get ${money(t.sellerNet)} after the ${money(t.sellerFee)} seller fee (${sellerPct}%, minimum $1) — shipping never comes out of your pocket.`;
}

// Services the buyer may choose from (checkboxes; at least one).
function renderSellServices() {
  const d = state.sellDraft;
  document.getElementById('ms-services').innerHTML = data.SHIP_SERVICES.map((svc) => `
    <label class="ms-service">
      <input type="checkbox" data-ms-service="${svc.key}" ${d?.services.includes(svc.key) ? 'checked' : ''} />
      ${escapeHtml(svc.label)}
    </label>`).join('');
}
function toggleSellService(key, on) {
  const d = state.sellDraft;
  if (!d) return;
  d.services = on ? [...new Set([...d.services, key])] : d.services.filter((k) => k !== key);
}

// The seller's ship-from address: a one-line summary once saved, a form the
// first time (or when they tap Change). Private to them.
function renderSellShipFrom() {
  const d = state.sellDraft;
  const box = document.getElementById('ms-shipfrom');
  if (!d || !box) return;
  if (d.shipFrom === null) { box.innerHTML = '<p class="dim">Loading your ship-from address…</p>'; return; }
  if (d.shipFrom && !d.editShipFrom) {
    const a = d.shipFrom;
    box.innerHTML = `<p class="dim">Ships from ${escapeHtml(a.name)}, ${escapeHtml(a.city)}, ${escapeHtml(a.state)} ${escapeHtml(a.zip)} · <button type="button" class="link-btn" data-action="ms-shipfrom-edit">Change</button></p>`;
    return;
  }
  const a = d.shipFrom || {};
  const f = (id, label, val, extra = '') => `<label class="field"><span>${label}</span><input type="text" id="${id}" value="${escapeHtml(val || '')}" ${extra} /></label>`;
  box.innerHTML = `
    <p class="dim">Your ship-from address goes on the label. Only you (and the label) see it.</p>
    ${f('msf-name', 'Name', a.name, 'maxlength="80" autocomplete="name"')}
    ${f('msf-street1', 'Street', a.street1, 'maxlength="100" autocomplete="address-line1"')}
    ${f('msf-street2', 'Apt / unit (optional)', a.street2, 'maxlength="100" autocomplete="address-line2"')}
    <div class="ms-price-row">
      ${f('msf-city', 'City', a.city, 'maxlength="60" autocomplete="address-level2"')}
      ${f('msf-state', 'State', a.state, 'maxlength="2" placeholder="MA" autocomplete="address-level1"')}
      ${f('msf-zip', 'ZIP', a.zip, 'maxlength="10" inputmode="numeric" autocomplete="postal-code"')}
    </div>`;
}
function editSellShipFrom() {
  const d = state.sellDraft;
  if (!d) return;
  d.editShipFrom = true;
  renderSellShipFrom();
}
// Read + check an address form (ids prefixed `pre`). Returns { address } or { error }.
function readAddressForm(pre) {
  const v = (k) => (document.getElementById(`${pre}-${k}`)?.value || '').trim();
  const a = { name: v('name'), street1: v('street1'), street2: v('street2'), city: v('city'), state: v('state').toUpperCase(), zip: v('zip') };
  if (!a.name || !a.street1 || !a.city) return { error: 'Fill in name, street and city.' };
  if (!/^[A-Z]{2}$/.test(a.state)) return { error: 'Use the 2-letter state code (e.g. MA).' };
  if (!/^\d{5}(-\d{4})?$/.test(a.zip)) return { error: 'Enter a 5-digit ZIP code.' };
  return { address: a };
}

function renderSellExtras() {
  const field = document.getElementById('ms-extras-field');
  const box = document.getElementById('ms-extras');
  const extras = state.sellDraft?.extras || [];
  if (!extras.length) { field.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = extras.map((e, i) => `
    <div class="tl-extra-row">
      <span class="tl-extra-name">${escapeHtml(e.name)}</span>
      <div class="tl-extra-choice" role="group" aria-label="Is ${escapeHtml(e.name)} included?">
        <button type="button" class="tl-extra-btn${e.included === true ? ' tl-extra-yes' : ''}" data-ms-extra="${i}" data-ms-extra-val="yes">Yes</button>
        <button type="button" class="tl-extra-btn${e.included === false ? ' tl-extra-no' : ''}" data-ms-extra="${i}" data-ms-extra-val="no">No</button>
      </div>
    </div>`).join('');
  field.classList.remove('hidden');
}

function setSellExtra(idx, included) {
  const row = state.sellDraft?.extras?.[idx];
  if (!row) return;
  row.included = included;
  hideEl('ms-error');
  renderSellExtras();
}

function renderSellPhotos() {
  const d = state.sellDraft;
  if (!d) return;
  document.getElementById('ms-photos').innerHTML = d.photos.map((p, i) => `
    <div class="tl-photo-cell">
      <img src="${escapeHtml(p.url)}" alt="" />
      <button type="button" class="tl-photo-remove" data-ms-remove="${i}" aria-label="Remove photo">×</button>
    </div>`).join('') || '<p class="tl-photo-empty">No photos yet — add at least one real shot of the one you’re selling.</p>';
  const addBtn = document.getElementById('ms-add-photo');
  const atMax = d.photos.length >= MARKET_MAX_PHOTOS;
  addBtn.disabled = atMax;
  addBtn.textContent = atMax ? 'Maximum 5 photos' : `📷 Add photo (${d.photos.length}/${MARKET_MAX_PHOTOS})`;
}

async function onSellAddPhotos(fileList) {
  const d = state.sellDraft;
  if (!d) return;
  hideEl('ms-error');
  for (const file of [...(fileList || [])]) {
    if (d.photos.length >= MARKET_MAX_PHOTOS) { msError('Up to 5 photos.'); break; }
    let blob;
    try { blob = await compressPickedPhoto(file); }
    catch (err) { msError(err.message); continue; }
    // Same stock-image guard as trade proof photos (fails open if unhashable).
    const shotHash = await perceptualHash(blob);
    if (hammingDistance(shotHash, d.stockHash) <= STOCK_MATCH_MAX_DISTANCE) {
      msError('That looks like the stock catalog photo — snap a real one of the one you’re selling.');
      continue;
    }
    d.photos.push({ blob, url: URL.createObjectURL(blob) });
  }
  renderSellPhotos();
}

function removeSellPhoto(idx) {
  const d = state.sellDraft;
  if (!d) return;
  const [removed] = d.photos.splice(idx, 1);
  if (removed?.blob && removed.url) URL.revokeObjectURL(removed.url);
  renderSellPhotos();
}

async function saveSellListing() {
  const d = state.sellDraft;
  if (!d || d.saving) return;
  const priceCents = dollarsToCents(document.getElementById('ms-price').value);
  if (!Number.isFinite(priceCents) || priceCents < 500) { msError('Set a price of at least $5.00.'); return; }
  const lb = parseInt(document.getElementById('ms-weight-lb').value || '0', 10);
  const oz = parseInt(document.getElementById('ms-weight-oz').value || '0', 10);
  const weightOz = (Number.isFinite(lb) ? lb : 0) * 16 + (Number.isFinite(oz) ? oz : 0);
  if (weightOz < 1) { msError('Enter the packed weight — it sets the shipping price.'); return; }
  if (!d.services.length) { msError('Pick at least one shipping service.'); return; }
  let newShipFrom = null;
  if (!d.shipFrom || d.editShipFrom) {
    const r = readAddressForm('msf');
    if (r.error) { msError(`Ship-from address: ${r.error}`); return; }
    newShipFrom = r.address;
  }
  if (d.photos.length < 1) { msError('Add at least one real photo.'); return; }
  const unanswered = (d.extras || []).find((e) => e.included === null);
  if (unanswered) { msError(`Is "${unanswered.name}" included? Answer Yes or No for each extra.`); return; }

  const btn = document.getElementById('ms-save');
  d.saving = true;
  btn.disabled = true;
  btn.textContent = 'Checking Plushie Dreadfuls…';
  try {
    if (newShipFrom) {
      await data.saveMyShipFrom(newShipFrom);
      d.shipFrom = newShipFrom;
      d.editShipFrom = false;
      renderSellShipFrom();
    }
    // Upload new shots once; remembering the path means a retry after a
    // refusal (PD in stock, price cap) doesn't upload them again.
    const photoPaths = [];
    for (const p of d.photos) {
      if (!p.socialPath) p.socialPath = await data.uploadSocialPhoto(p.blob);
      photoPaths.push(p.socialPath);
    }
    const body = {
      priceCents,
      parcel: { preset: document.getElementById('ms-parcel').value, weightOz },
      services: d.services,
      notes: document.getElementById('ms-notes').value.trim() || null,
      extras: (d.extras || []).length ? d.extras.map((e) => ({ name: e.name, included: e.included })) : null,
      photoPaths,
    };
    if (d.listing) await data.marketListingCall({ action: 'update', listingId: d.listing.id, ...body });
    else await data.marketListingCall({ action: 'create', plushieId: d.colItem.id, ...body });
    toast(d.listing ? 'Listing updated.' : 'Listed for sale.');
    closeSellModal();
    state.saleFilter = 'mine';
    await refreshMarket();
  } catch (err) {
    console.error('saveSellListing', err);
    msError(err.message || 'Could not save the listing.');
  } finally {
    if (state.sellDraft === d) {
      d.saving = false;
      btn.disabled = false;
      btn.textContent = d.listing ? 'Save & re-check' : 'List for sale';
    }
  }
}

// ─── For Sale: offer modal (offer / counter) ─────────────────────────
function openMarketOfferModal({ mode, listingId, offerId, name, askCents, shippingCents, currentCents }) {
  state.marketOfferDraft = { mode, listingId, offerId, askCents, shippingCents };
  document.getElementById('mo-title').textContent = mode === 'counter' ? 'Counter offer' : 'Make an offer';
  document.getElementById('mo-sub').textContent = `${stripOutfitWord(name)} · asking ${money(askCents)}`;
  document.getElementById('mo-amount').value = currentCents ? (currentCents / 100).toFixed(2) : '';
  document.getElementById('mo-amount').max = (askCents / 100).toFixed(2);
  document.getElementById('mo-message').value = '';
  hideEl('mo-error');
  renderMarketOfferHint();
  showEl('market-offer-modal');
}

function closeMarketOfferModal() {
  hideEl('market-offer-modal');
  state.marketOfferDraft = null;
}

function renderMarketOfferHint() {
  const d = state.marketOfferDraft;
  const el = document.getElementById('mo-hint');
  if (!d || !el) return;
  const amt = dollarsToCents(document.getElementById('mo-amount').value);
  if (!Number.isFinite(amt) || amt <= 0) { el.textContent = `Up to the asking price of ${money(d.askCents)}.`; return; }
  const t = data.marketTotals(amt, 0);
  el.textContent = `At checkout the buyer pays ${money(t.buyerTotal)} (${money(amt)} + ${money(t.buyerFee)} fee) plus shipping, picked from the seller's options.`;
}

async function sendMarketOffer() {
  const d = state.marketOfferDraft;
  if (!d) return;
  const amt = dollarsToCents(document.getElementById('mo-amount').value);
  const show = (m) => { const e = document.getElementById('mo-error'); e.textContent = m; showEl('mo-error'); };
  if (!Number.isFinite(amt) || amt < 500) { show('Offers start at $5.00.'); return; }
  if (amt > d.askCents) { show(`That's over the asking price of ${money(d.askCents)}.`); return; }
  const msg = document.getElementById('mo-message').value.trim() || null;
  const btn = document.getElementById('mo-send');
  btn.disabled = true;
  try {
    if (d.mode === 'counter') await data.respondMarketOffer(d.offerId, 'counter', amt, msg);
    else await data.makeMarketOffer(d.listingId, amt, msg);
    toast(d.mode === 'counter' ? 'Counter sent.' : 'Offer sent.');
    closeMarketOfferModal();
    state.saleFilter = 'offers';
    await refreshMarket();
  } catch (err) {
    console.error('sendMarketOffer', err);
    show(marketErrorText(err));
  } finally {
    btn.disabled = false;
  }
}

// ─── For Sale: Seller Agreement gate (db/0109) ──────────────────────
// First listing / payout setup: show the agreement (copied from the Legal
// modal's Seller Agreement section), require the checkbox, record acceptance,
// then carry on with what the seller was doing.
function requireSellerTerms(next) {
  state.sellerTermsNext = next;
  const src = document.querySelector('#legal-modal [data-legal-section="seller"]');
  document.getElementById('st-body').innerHTML = src ? src.innerHTML : '';
  document.getElementById('st-check').checked = false;
  document.getElementById('st-accept').disabled = true;
  hideEl('st-error');
  showEl('seller-terms-modal');
}
function closeSellerTerms() {
  hideEl('seller-terms-modal');
  state.sellerTermsNext = null;
}
async function acceptSellerTerms() {
  const btn = document.getElementById('st-accept');
  btn.disabled = true;
  try {
    await data.acceptSellerTerms();
    state.sellerTermsOk = true;
    const next = state.sellerTermsNext;
    closeSellerTerms();
    next?.();
  } catch (err) {
    console.error('acceptSellerTerms', err);
    const el = document.getElementById('st-error');
    el.textContent = err.message || 'Could not save that — try again.';
    showEl('st-error');
    btn.disabled = false;
  }
}

// ─── For Sale: checkout modal (address → live rates → Stripe) ─────────
const SHIP_TO_KEY = 'pc.market.shipTo';   // last address used, for convenience

function openMarketPayModal(offerId) {
  const o = state.marketOffers.find((x) => x.id === offerId);
  if (!o) return;
  state.marketPayDraft = { offerId, amountCents: o.amountCents, shipmentId: null, options: [], rateId: null, busy: false };
  document.getElementById('mp-sub').textContent = `${stripOutfitWord(o.listing?.name || '')} · ${money(o.amountCents)}`;
  let last = {};
  try { last = JSON.parse(localStorage.getItem(SHIP_TO_KEY) || '{}'); } catch { /* ignore */ }
  for (const k of ['name', 'street1', 'street2', 'city', 'state', 'zip']) {
    document.getElementById(`mp-${k}`).value = last[k] || '';
  }
  clearMarketRates();
  showEl('market-pay-modal');
}
function closeMarketPayModal() {
  hideEl('market-pay-modal');
  state.marketPayDraft = null;
}
function mpError(msg) {
  const el = document.getElementById('mp-error');
  if (!msg) { hideEl('mp-error'); return; }
  el.textContent = msg;
  showEl('mp-error');
}
// Any address edit invalidates the rates shown.
function clearMarketRates() {
  const d = state.marketPayDraft;
  if (d) { d.shipmentId = null; d.options = []; d.rateId = null; }
  document.getElementById('mp-options').innerHTML = '';
  mpError('');
  renderMarketPayTotal();
}
async function fetchMarketRates() {
  const d = state.marketPayDraft;
  if (!d || d.busy) return;
  const r = readAddressForm('mp');
  if (r.error) { mpError(r.error); return; }
  const btn = document.getElementById('mp-rates');
  d.busy = true; btn.disabled = true; btn.textContent = 'Checking the address…';
  try {
    const out = await data.marketPayCall({ action: 'quote', offerId: d.offerId, address: r.address });
    if (state.marketPayDraft !== d) return;
    try { localStorage.setItem(SHIP_TO_KEY, JSON.stringify(r.address)); } catch { /* ignore */ }
    d.shipmentId = out.shipmentId;
    d.options = out.options;
    d.rateId = out.options[0]?.rateId || null;   // cheapest first
    mpError('');
    renderMarketRates();
  } catch (err) {
    console.error('quote', err);
    mpError(err.message);
  } finally {
    d.busy = false; btn.disabled = false; btn.textContent = 'Get shipping options';
  }
}
function renderMarketRates() {
  const d = state.marketPayDraft;
  document.getElementById('mp-options').innerHTML = (d?.options || []).map((o) => `
    <label class="mp-option">
      <input type="radio" name="mp-rate" data-mp-rate="${escapeHtml(o.rateId)}" ${o.rateId === d.rateId ? 'checked' : ''} />
      <span>${escapeHtml(o.label)}${o.days ? ` <span class="dim">· ~${o.days} day${o.days === 1 ? '' : 's'}</span>` : ''}</span>
      <strong>${money(o.cents)}</strong>
    </label>`).join('');
  renderMarketPayTotal();
}
function chooseMarketRate(rateId) {
  const d = state.marketPayDraft;
  if (!d) return;
  d.rateId = rateId;
  renderMarketPayTotal();
}
function renderMarketPayTotal() {
  const d = state.marketPayDraft;
  const el = document.getElementById('mp-total');
  const pay = document.getElementById('mp-pay');
  const opt = d?.options.find((o) => o.rateId === d.rateId);
  if (!d || !opt) {
    el.textContent = d ? `${money(d.amountCents)} + ${money(data.marketTotals(d.amountCents, 0).buyerFee)} buyer fee + shipping` : '';
    pay.disabled = true; pay.textContent = 'Pay';
    return;
  }
  const t = data.marketTotals(d.amountCents, opt.cents);
  el.textContent = `${money(d.amountCents)} + ${money(opt.cents)} shipping + ${money(t.buyerFee)} buyer fee`;
  pay.disabled = false;
  pay.textContent = `Pay ${money(t.buyerTotal)}`;
}
async function payMarketOrder() {
  const d = state.marketPayDraft;
  if (!d || !d.rateId || d.busy) return;
  const btn = document.getElementById('mp-pay');
  d.busy = true; btn.disabled = true; btn.textContent = 'Opening checkout…';
  try {
    const out = await data.marketPayCall({ action: 'checkout', offerId: d.offerId, shipmentId: d.shipmentId, rateId: d.rateId, returnBase: data.marketReturnBase() });
    window.location.assign(out.url);
  } catch (err) {
    console.error('checkout', err);
    mpError(err.message);
    d.busy = false;
    renderMarketPayTotal();
    if (err.code === 'HOLD_ENDED' || err.code === 'ALREADY_PAID') { closeMarketPayModal(); await refreshMarket(); }
  }
}

async function marketRespond(offerId, action) {
  const o = state.marketOffers.find((x) => x.id === offerId);
  if (!o) return;
  if (action === 'accept' && !confirm(`Accept ${money(o.amountCents)} for ${stripOutfitWord(o.listing?.name || 'this')}? It’s held for the buyer for 48 hours.`)) return;
  if (action === 'decline' && !confirm('Decline this offer?')) return;
  try {
    if (action === 'withdraw') await data.withdrawMarketOffer(offerId);
    else await data.respondMarketOffer(offerId, action);
    toast({ accept: 'Offer accepted.', decline: 'Offer declined.', withdraw: 'Offer withdrawn.' }[action]);
  } catch (err) {
    console.error('marketRespond', action, err);
    toast(marketErrorText(err));
  }
  await refreshMarket();
}

Object.assign(TRADE_ACTIONS, {
  'mkt-filter': (b) => { state.saleFilter = b.dataset.filter; renderSale(); },
  'mkt-offer': (b) => {
    const l = state.marketBrowse.find((x) => x.id === b.dataset.id);
    if (!l) return;
    const mine = state.marketOffers.find((o) => o.listingId === l.id && o.buyerId === window.currentUser.id && offerIsLive(o) && o.fromRole === 'buyer');
    openMarketOfferModal({ mode: 'offer', listingId: l.id, name: l.name, askCents: l.priceCents, shippingCents: l.shippingCents, currentCents: mine?.amountCents });
  },
  'mkt-counter': (b) => {
    const o = state.marketOffers.find((x) => x.id === b.dataset.id);
    if (!o) return;
    openMarketOfferModal({ mode: 'counter', offerId: o.id, listingId: o.listingId, name: o.listing?.name || '', askCents: o.listing?.priceCents, shippingCents: o.listing?.shippingCents });
  },
  'mkt-pay': (b) => openMarketPayModal(b.dataset.id),
  'mkt-label-retry': async (b) => {
    b.disabled = true;
    try {
      await data.marketPayCall({ action: 'label_retry', orderId: b.dataset.id });
      toast('Label ready — print it from the order.');
    } catch (err) { toast(err.message); }
    await refreshMarket();
  },
  'mkt-payouts': async (b) => {
    if (!state.sellerTermsOk) { requireSellerTerms(() => TRADE_ACTIONS['mkt-payouts'](b)); return; }
    b.disabled = true;
    try {
      const out = await data.marketPayCall({ action: 'payouts_setup', returnBase: data.marketReturnBase() });
      window.location.assign(out.url);
    } catch (err) {
      console.error('mkt-payouts', err);
      toast(err.message);
      b.disabled = false;
    }
  },
  'mkt-payouts-dash': async (b) => {
    // Open the tab synchronously so popup blockers allow it, then point it at Stripe.
    const win = window.open('', '_blank');
    try {
      const out = await data.marketPayCall({ action: 'payouts_dashboard' });
      if (win) win.location.href = out.url; else window.location.assign(out.url);
    } catch (err) {
      win?.close();
      toast(err.message);
    }
  },
  'mkt-arrived': async (b) => {
    if (!confirm('Confirm it arrived and is what was listed? This pays the seller now and can’t be undone.')) return;
    b.disabled = true;
    try {
      await data.marketPayCall({ action: 'confirm', orderId: b.dataset.id });
      toast('Thanks — the seller has been paid.');
    } catch (err) { toast(err.message); }
    await refreshMarket();
  },
  'mkt-refund': async (b) => {
    const o = (state.marketOrders || []).find((x) => x.id === b.dataset.id);
    const fee = o && o.sellerId === window.currentUser.id ? o.sellerFeeCents : 0;
    if (!confirm(`Cancel this sale and refund the buyer in full?${fee ? ` Your ${money(fee)} seller fee still applies — it comes out of your next payout.` : ''} The listing comes down; you can relist it later.`)) return;
    b.disabled = true;
    try {
      await data.marketPayCall({ action: 'refund', orderId: b.dataset.id });
      toast('Refunded.');
    } catch (err) { toast(err.message); }
    await refreshMarket();
  },
  'mkt-accept':   (b) => marketRespond(b.dataset.id, 'accept'),
  'mkt-decline':  (b) => marketRespond(b.dataset.id, 'decline'),
  'mkt-withdraw': (b) => marketRespond(b.dataset.id, 'withdraw'),
  'mkt-edit': (b) => {
    const l = state.myListings.find((x) => x.id === b.dataset.id);
    if (l) openSellModal(null, l);
  },
  'mkt-remove': async (b) => {
    if (!confirm('Take this listing down? Any pending offers on it are declined.')) return;
    try { await data.removeMarketListing(b.dataset.id); toast('Listing removed.'); }
    catch (err) { toast(marketErrorText(err)); }
    await refreshMarket();
  },
});
