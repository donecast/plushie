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
  } finally {
    // Mark attempted either way: a genuine empty browse should show its
    // real empty-state, not a forever "Summoning…" spinner.
    state.ready.add('trade');
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
  showEl('offer-modal');
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
  hideEl('offer-modal');
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

