// ════════════════════════════════════════════════════════════════════
// app-admin.js — part 7 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Admin console: user list, dispute review, and the reports queue.
// ════════════════════════════════════════════════════════════════════

// ─── Admin ───────────────────────────────────────────────────────────
async function loadAdminUsers() {
  if (!window.currentUser?.isAdmin) return;
  try {
    state.adminUsers = await data.adminListUsers();
    // Also surface counts on the Tools strip badges. Non-fatal if any
    // of these fails — the queues still open from their buttons.
    const [disp, cats, photos, reports] = await Promise.allSettled([
      data.adminListDisputes(),
      data.adminListCatalogPending(),
      data.adminListPhotoSuggestions('pending'),
      data.adminListReports('open'),
    ]);
    if (disp.status === 'fulfilled') state.adminOpenDisputes = disp.value;
    if (cats.status === 'fulfilled') state.adminPendingCatalog = cats.value;
    if (photos.status === 'fulfilled') state.adminPendingPhotos = photos.value;
    if (reports.status === 'fulfilled') state.adminOpenReports = reports.value;
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
    const f = u.feedback || { good_count: 0, meh_count: 0, bad_count: 0, total_count: 0 };
    const me = u.id === window.currentUser.id;
    const dateCell = (iso) => iso ? new Date(iso).toLocaleDateString() : '—';
    return `
      <tr data-uid="${u.id}" class="admin-row">
        <td><strong>@${escapeHtml(u.username)}</strong>${me ? ' <span class="dim">(you)</span>' : ''}${u.is_admin ? ' <span class="role-tag">admin</span>' : ''}</td>
        <td>${u.full_name ? escapeHtml(u.full_name) : '<span class="dim">—</span>'}</td>
        <td class="dim">${dateCell(u.created_at)}</td>
        <td class="admin-num">${u.collection_count ?? 0}</td>
        <td class="admin-num">${u.wishlist_count ?? 0}</td>
        <td class="admin-num">${u.for_trade_count ?? 0}</td>
        <td class="dim">${dateCell(u.last_seen_at)}</td>
        <td class="admin-fb dim"><span class="fb-good">${f.good_count}</span>·<span class="fb-meh">${f.meh_count}</span>·<span class="fb-bad">${f.bad_count}</span></td>
        <td><button data-admin-action="open" data-uid="${u.id}">Inspect →</button></td>
      </tr>
    `;
  }).join('');
  // Only rows actually awaiting a decision count as "pending". The
  // queue list also carries already-approved-but-unreviewed rows
  // (trusted-submitter auto-approvals); those are NOT pending and
  // must not inflate the badge.
  const pendingCustomCount = (state.adminPendingCatalog || [])
    .filter((r) => r.status === 'pending').length;
  const pendingCustomBadge = pendingCustomCount
    ? `<span class="badge badge-form">${pendingCustomCount} pending</span>` : '';
  const pendingPhotoBadge = (state.adminPendingPhotos || []).length
    ? `<span class="badge badge-form">${state.adminPendingPhotos.length} pending</span>` : '';
  document.getElementById('admin-content').innerHTML = `
    <section class="admin-tools">
      <h2 class="trader-head"><span>Tools</span></h2>

      <div class="admin-tool admin-maint${(data.appSettings || {})['maintenance.enabled'] === true ? ' admin-maint-on' : ''}">
        <div>
          <strong>Maintenance mode ${(data.appSettings || {})['maintenance.enabled'] === true ? '<span class="badge badge-oos">ON</span>' : ''}</strong>
          <p class="dim">Show everyone but admins a "down for maintenance" screen with the reason below — for when you need to take the crypt down for a few minutes. You stay in.</p>
          <input type="text" id="admin-maint-reason" class="admin-maint-reason" maxlength="200"
            placeholder="Reason (e.g. Quick fix in progress — back in ~10 minutes)"
            value="${escapeHtml((data.appSettings || {})['maintenance.reason'] || '')}" />
        </div>
        <button class="${(data.appSettings || {})['maintenance.enabled'] === true ? 'btn-primary' : 'btn-ghost'}" data-admin-action="toggle-maintenance">${(data.appSettings || {})['maintenance.enabled'] === true ? 'Turn off' : 'Turn on'}</button>
      </div>

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
          <strong>User &amp; content reports ${(state.adminOpenReports || []).length ? `<span class="badge badge-form">${state.adminOpenReports.length} open</span>` : ''}</strong>
          <p class="dim">Posts, comments, and collectors reported by users. Review and remove the content or dismiss.</p>
        </div>
        <button data-admin-action="review-reports">Review</button>
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
    <h2 class="trader-head"><span>Users</span>
      <button class="btn-ghost" data-admin-action="download-users-csv">⬇ Download CSV</button>
    </h2>
    <table class="admin-table">
      <thead><tr><th>Username</th><th>Name</th><th>Joined</th><th class="admin-num">Coll.</th><th class="admin-num">Wish</th><th class="admin-num">Trade</th><th>Last seen</th><th class="dim">Fb (g/m/b)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Build a CSV from the admin user rows. Pure (no DOM) so it's unit-tested.
// One row per user; dates as YYYY-MM-DD; fields quoted/escaped per RFC 4180.
function buildUsersCsv(users) {
  const header = ['Username', 'Name', 'Joined', 'Last seen',
    'Collection', 'Wishlist', 'For trade', 'Good', 'Meh', 'Bad', 'Total feedback'];
  const day = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  };
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const u of users || []) {
    const f = u.feedback || {};
    lines.push([
      u.username, u.full_name, day(u.created_at), day(u.last_seen_at),
      u.collection_count ?? 0, u.wishlist_count ?? 0, u.for_trade_count ?? 0,
      f.good_count ?? 0, f.meh_count ?? 0, f.bad_count ?? 0, f.total_count ?? 0,
    ].map(esc).join(','));
  }
  return lines.join('\r\n');
}

function downloadUsersCsv() {
  const csv = buildUsersCsv(state.adminUsers || []);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plushcrypt-users-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

async function onToggleCustomClothingForUser(e) {
  const cb = e.target;
  const userId = cb.dataset.userId;
  const next = cb.checked;
  cb.disabled = true;
  try {
    await data.adminSetCustomClothing(userId, next);
    const u = state.adminUsers.find((x) => x.id === userId);
    if (u) u.custom_clothing_enabled = next;
    if (state.adminUserView?.user?.id === userId) {
      state.adminUserView.user.custom_clothing_enabled = next;
    }
    // If the admin toggled their own row, update the live shadow + re-render
    // so the closet's add button re-gates immediately.
    if (userId === window.currentUser?.id) {
      window.currentUser.customClothingEnabled = next;
      if (state.tab === 'collection') render();
    }
    toast(next ? 'Custom clothing enabled for this user.' : 'Custom clothing disabled for this user.');
  } catch (err) {
    console.error(err);
    cb.checked = !next;
    toast('Could not save: ' + (err.message || err));
  } finally {
    cb.disabled = false;
  }
}

// Admin moderation toggles (db/0046). Re-render after saving so the adjacent
// label reflects the new state. A DB trigger refuses to moderate admins.
async function onToggleAppBlockForUser(e) {
  const cb = e.target;
  const userId = cb.dataset.userId;
  const next = cb.checked;
  cb.disabled = true;
  try {
    await data.adminSetAppBlocked(userId, next);
    if (state.adminUserView?.snapshot?.moderation) state.adminUserView.snapshot.moderation.app_blocked = next;
    toast(next ? 'User blocked from the entire app.' : 'User unblocked.');
    renderAdmin();
  } catch (err) {
    console.error(err);
    cb.checked = !next;
    cb.disabled = false;
    toast('Could not save: ' + (err.message || err));
  }
}

async function onToggleGhostForUser(e) {
  const cb = e.target;
  const userId = cb.dataset.userId;
  const next = cb.checked;
  cb.disabled = true;
  try {
    await data.adminSetGhosted(userId, next);
    if (state.adminUserView?.snapshot?.moderation) state.adminUserView.snapshot.moderation.ghosted = next;
    toast(next ? 'User ghosted — isolated from everyone else.' : 'Ghost mode lifted.');
    renderAdmin();
  } catch (err) {
    console.error(err);
    cb.checked = !next;
    cb.disabled = false;
    toast('Could not save: ' + (err.message || err));
  }
}

function renderAdminUserView() {
  const { user, snapshot } = state.adminUserView;
  // Compact, read-only row. The whole card opens a read-only detail modal
  // (the compact grid hides meta/meaning, so detail is where the rest of
  // the facts live + a tap-to-enlarge photo).
  const renderItemRow = (it, kind) => {
    const src = it.photo || catalogImageFor(it.catalogId);
    const photo = src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" />` : `<span class="no-photo">🖤</span>`;
    return `
      <article class="card admin-item-card" data-admin-action="item-detail" data-id="${it.id}" data-kind="${kind}" role="button" tabindex="0" title="View details">
        <div class="card-photo">${photo}</div>
        <div class="card-body card-clickable">
          <h3 class="card-name">${escapeHtml(it.nickname || stripOutfitWord(it.name))}</h3>
        </div>
      </article>
    `;
  };

  const f = snapshot.feedback || {};

  // Trades: surface the ones an admin actually cares about — in-process
  // (pending/accepted), disputed (any status with an open dispute), and
  // successful (completed). Cancelled/rejected/expired/countered noise is
  // tucked behind a "show all other trades" toggle.
  const renderTradeLi = (t) => {
    const them = t.proposer_id === user.id ? t.recipient?.username : t.proposer?.username;
    const direction = t.proposer_id === user.id ? '→' : '←';
    const lines = (t.trade_line_items || []).map((l) =>
      `${l.quantity}× ${escapeHtml(l.trade_item?.name ?? 'item')} (${l.side})`
    ).join(', ');
    const disputed = t.dispute_open ? ' <span class="meta-warn">⚠ disputed</span>' : '';
    return `<li><strong>${direction} @${escapeHtml(them || '?')}</strong> · ${escapeHtml(t.status)}${disputed} · <span class="dim">${new Date(t.created_at).toLocaleDateString()}</span><br/><span class="dim">${lines}</span>${t.message ? `<br/><em>"${escapeHtml(t.message)}"</em>` : ''}</li>`;
  };
  const isPrimaryTrade = (t) => t.dispute_open || ['pending', 'accepted', 'completed'].includes(t.status);
  const primaryTrades = snapshot.trades.filter(isPrimaryTrade);
  const otherTrades = snapshot.trades.filter((t) => !isPrimaryTrade(t));
  const tradesHtml = primaryTrades.slice(0, 50).map(renderTradeLi).join('');
  const otherTradesHtml = otherTrades.map(renderTradeLi).join('');

  const { blocksInitiated = [], blockedBy = [] } = snapshot;
  const blockLi = (b) => `<li>@${escapeHtml(b.username)} <span class="dim">· ${new Date(b.created_at).toLocaleDateString()}</span></li>`;

  document.getElementById('admin-content').innerHTML = `
    <div class="admin-back">
      <button data-admin-action="back">← Back to users</button>
    </div>
    <h2 class="trader-head"><span>@${escapeHtml(user.username)}</span>
      ${user.full_name ? `<span class="dim">${escapeHtml(user.full_name)}</span>` : ''}
      <span class="dim">${snapshot.collection?.name ?? '(no collection)'}</span>
    </h2>
    <div class="feedback-summary feedback-summary-dim">
      <div class="fb-cell"><span class="fb-num fb-good">${f.good_count || 0}</span><span class="fb-label">good</span></div>
      <div class="fb-cell"><span class="fb-num fb-meh">${f.meh_count || 0}</span><span class="fb-label">meh</span></div>
      <div class="fb-cell"><span class="fb-num fb-bad">${f.bad_count || 0}</span><span class="fb-label">bad</span></div>
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
      <div class="admin-tool">
        <div>
          <strong>Custom clothing (private closets)</strong>
          <p class="dim">Lets this user add their own off-catalog clothing to a plush's closet — pieces that aren't from Plushie Dreadfuls. Private to their collection. Admins (and a small built-in allowlist) are always allowed.</p>
        </div>
        ${(() => {
          const alwaysOn = user.is_admin || (data.ALWAYS_GRANTED_USERNAMES || []).includes((user.username || '').toLowerCase());
          return `<label class="checkbox" style="white-space:nowrap;">
          <input type="checkbox" data-admin-toggle="custom-clothing" data-user-id="${user.id}" ${user.custom_clothing_enabled === true ? 'checked' : ''} ${alwaysOn ? 'disabled title="Always allowed"' : ''} />
          <span>${alwaysOn ? `Always on (${user.is_admin ? 'admin' : 'allowlist'})` : (user.custom_clothing_enabled === true ? 'Enabled' : 'Disabled')}</span>
        </label>`;
        })()}
      </div>
    </section>

    ${(() => {
      const mod = snapshot.moderation || {};
      const lock = mod.is_admin ? 'disabled title="Admins can\'t be moderated"' : '';
      return `
    <section class="my-items-section">
      <h3 class="trader-head"><span>Moderation</span></h3>
      <div class="admin-tool">
        <div>
          <strong>Block from app</strong>
          <p class="dim">A full ban. This user gets a "removed" takeover at sign-in and can't use the app at all. They're hidden from everyone, and see nothing themselves.</p>
        </div>
        <label class="checkbox" style="white-space:nowrap;">
          <input type="checkbox" data-admin-toggle="app-block" data-user-id="${user.id}" ${mod.app_blocked ? 'checked' : ''} ${lock} />
          <span>${mod.is_admin ? 'N/A (admin)' : (mod.app_blocked ? 'Blocked' : 'Allowed')}</span>
        </label>
      </div>
      <div class="admin-tool">
        <div>
          <strong>Ghost mode</strong>
          <p class="dim">A shadow-ban. This user can still sign in and use the app, but sees nothing from anyone else (empty social, empty trades, no other profiles) — and no one else sees their posts, trades, or friendships.</p>
        </div>
        <label class="checkbox" style="white-space:nowrap;">
          <input type="checkbox" data-admin-toggle="ghost" data-user-id="${user.id}" ${mod.ghosted ? 'checked' : ''} ${lock} />
          <span>${mod.is_admin ? 'N/A (admin)' : (mod.ghosted ? 'Ghosted' : 'Visible')}</span>
        </label>
      </div>
    </section>`;
    })()}

    <section class="my-items-section">
      <h3 class="trader-head"><span>Collection (${snapshot.plushies.length})</span><span class="dim">read-only · tap to view</span></h3>
      <div class="grid grid-compact">${snapshot.plushies.map((i) => renderItemRow(i, 'collection')).join('') || '<p class="dim">Empty.</p>'}</div>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Wish list (${snapshot.wishlist.length})</span><span class="dim">read-only · tap to view</span></h3>
      <div class="grid grid-compact">${snapshot.wishlist.map((i) => renderItemRow(i, 'wishlist')).join('') || '<p class="dim">Empty.</p>'}</div>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Trade items (${snapshot.tradeItems.length})</span></h3>
      <ul class="member-list">
        ${snapshot.tradeItems.map((ti) => `<li><span>${ti.kind === 'offering' ? '↻' : '↺'} ${escapeHtml(ti.name)} · ${ti.kind} · qty ${ti.quantity} (${ti.reserved} reserved)</span></li>`).join('') || '<li class="dim">none</li>'}
      </ul>
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Trades (${primaryTrades.length})</span><span class="dim">in-process · disputed · completed</span></h3>
      <ul class="member-list">${tradesHtml || '<li class="dim">no active, disputed, or completed trades</li>'}</ul>
      ${otherTrades.length ? `
        <button type="button" class="admin-collapse-toggle" data-admin-action="toggle-other-trades" aria-expanded="false">
          Show all other trades (${otherTrades.length}) ▾
        </button>
        <ul class="member-list hidden" id="admin-other-trades">${otherTradesHtml}</ul>
      ` : ''}
    </section>

    <section class="my-items-section">
      <h3 class="trader-head"><span>Blocks</span></h3>
      <div class="admin-blocks">
        <div>
          <h4 class="admin-blocks-head">Blocks initiated (${blocksInitiated.length})</h4>
          <ul class="member-list">${blocksInitiated.map(blockLi).join('') || '<li class="dim">none</li>'}</ul>
        </div>
        <div>
          <h4 class="admin-blocks-head">Blocked by (${blockedBy.length})</h4>
          <ul class="member-list">${blockedBy.map(blockLi).join('') || '<li class="dim">none</li>'}</ul>
        </div>
      </div>
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
  document.querySelector('[data-admin-toggle="custom-clothing"]')
    ?.addEventListener('change', onToggleCustomClothingForUser);
  document.querySelector('[data-admin-toggle="app-block"]')
    ?.addEventListener('change', onToggleAppBlockForUser);
  document.querySelector('[data-admin-toggle="ghost"]')
    ?.addEventListener('change', onToggleGhostForUser);
}

// Read-only detail for an item in the admin collection/wishlist view —
// the "view more" behind a compact row. Reuses the generic admin queue
// modal. The photo is tap-to-enlarge (lightbox).
function openAdminItemDetail(id, kind) {
  const snap = state.adminUserView?.snapshot;
  if (!snap) return;
  const list = kind === 'wishlist' ? snap.wishlist : snap.plushies;
  const it = (list || []).find((x) => x.id === id);
  if (!it) return;
  const src = it.photo || catalogImageFor(it.catalogId);
  const photo = src
    ? `<img src="${escapeHtml(src)}" alt="" class="admin-detail-photo" data-admin-action="zoom-item" data-id="${escapeHtml(id)}" data-kind="${escapeHtml(kind)}" role="button" title="Tap to enlarge" />`
    : `<div class="admin-detail-photo no-photo">🖤</div>`;

  const facts = [];
  if (it.nickname) facts.push(['Nickname', escapeHtml(it.nickname)]);
  facts.push(['Item', escapeHtml(stripOutfitWord(it.name))]);
  if (kind === 'collection') {
    if (it.meaning) facts.push(['Meaning', escapeHtml(it.meaning)]);
    if (it.dateCollected) facts.push(['Collected', escapeHtml(formatDate(it.dateCollected))]);
    if (it.acquiredHow) facts.push(['Acquired', escapeHtml(it.acquiredHow)]);
    if ((it.quantity || 1) > 1) facts.push(['Quantity', `×${it.quantity}`]);
    const missing = Array.isArray(it.missingAccessories) ? it.missingAccessories : [];
    if (missing.length) facts.push(['Missing', escapeHtml(missing.join(', '))]);
    else if (it.hasBag === false) facts.push(['Missing', 'tote bag']);
    if (it.retired) facts.push(['Status', 'Retired']);
  } else {
    if (it.outOfStock) facts.push(['Status', 'Out of stock']);
    if (it.url) facts.push(['Link', `<a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">plushiedreadfuls.com ↗</a>`]);
  }

  document.getElementById('aq-title').textContent = it.nickname || stripOutfitWord(it.name);
  document.getElementById('aq-body').innerHTML = `
    <div class="admin-item-detail">
      <div class="admin-detail-photo-wrap">${photo}</div>
      <dl class="admin-detail-facts">
        ${facts.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`).join('')}
      </dl>
    </div>
  `;
  document.getElementById('admin-queue-modal').classList.remove('hidden');
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
  } else if (action === 'download-users-csv') {
    downloadUsersCsv();
  } else if (action === 'toggle-maintenance') {
    const reason = (document.getElementById('admin-maint-reason')?.value || '').trim();
    const turningOn = (data.appSettings || {})['maintenance.enabled'] !== true;
    btn.disabled = true;
    try {
      // Save the reason first so it's in place before the gate flips on.
      await data.adminSetSetting('maintenance.reason', reason);
      await data.adminSetSetting('maintenance.enabled', turningOn);
      toast(turningOn ? 'Maintenance mode ON — non-admins see the down screen.' : 'Maintenance mode OFF.');
      renderAdmin();
    } catch (err) {
      console.error('toggle-maintenance', err);
      toast('Could not change maintenance mode.');
      btn.disabled = false;
    }
  } else if (action === 'back') {
    state.adminUserView = null;
    renderAdmin();
  } else if (action === 'item-detail') {
    openAdminItemDetail(btn.dataset.id, btn.dataset.kind);
  } else if (action === 'zoom-item') {
    const snap = state.adminUserView?.snapshot;
    const list = btn.dataset.kind === 'wishlist' ? snap?.wishlist : snap?.plushies;
    const it = (list || []).find((x) => x.id === btn.dataset.id);
    const src = it && (it.photo || catalogImageFor(it.catalogId));
    if (src) openLightbox(src, stripOutfitWord(it.nickname || it.name || ''));
  } else if (action === 'toggle-other-trades') {
    const list = document.getElementById('admin-other-trades');
    if (list) {
      const open = list.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open
        ? 'Hide other trades ▴'
        : `Show all other trades (${list.children.length}) ▾`;
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
  } else if (action === 'review-reports') {
    await openReportsModal();
  } else if (action === 'resolve-report') {
    await adminResolveReportAction(btn.dataset.id, btn.dataset.status);
  } else if (action === 'delete-reported') {
    await adminDeleteReportedAction(btn.dataset.id, btn.dataset.targetType, btn.dataset.targetId);
  } else if (action === 'approve-catalog-item') {
    await adminApproveCatalogItem(btn.dataset.id);
  } else if (action === 'reject-catalog-item') {
    await adminRejectCatalogItem(btn.dataset.id);
  } else if (action === 'merge-catalog-item') {
    openCatalogMergeModal(btn.dataset.id, btn.dataset.handle);
  } else if (action === 'dismiss-catalog-item') {
    await adminDismissCatalogItem(btn.dataset.id);
  } else if (action === 'toggle-approved-catalog') {
    toggleApprovedCatalog(btn);
  } else if (action === 'approve-photo-suggestion') {
    await adminApprovePhotoSuggestion(btn.dataset.id);
  } else if (action === 'reject-photo-suggestion') {
    await adminRejectPhotoSuggestion(btn.dataset.id);
  } else if (action === 'catalog-photo-add') {
    await catalogPhotoAdd();
  } else if (action === 'catalog-photo-delete') {
    await catalogPhotoDelete(btn.dataset.id);
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

// ─── Reports queue (mirrors the disputes queue) ─────────────────────
async function openReportsModal() {
  const body = document.getElementById('aq-body');
  document.getElementById('aq-title').textContent = 'Open reports';
  body.innerHTML = '<p class="dim">Loading…</p>';
  document.getElementById('admin-queue-modal').classList.remove('hidden');
  try {
    const rows = await data.adminListReports('open');
    state.adminOpenReports = rows;
    body.innerHTML = rows.length
      ? rows.map(renderReportRow).join('')
      : '<p class="dim">No open reports. ✨</p>';
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="dim">Couldn't load: ${escapeHtml(err.message || String(err))}</p>`;
  }
}

const REPORT_REASON_LABELS = {
  spam: 'Spam or scam', harassment: 'Harassment or bullying', hate: 'Hate or violence',
  sexual: 'Sexual or inappropriate', impersonation: 'Impersonation', other: 'Something else',
};
const REPORT_TYPE_LABELS = { post: 'Post', comment: 'Comment', user: 'Collector' };

function renderReportRow(r) {
  const canRemove = r.target_type === 'post' || r.target_type === 'comment';
  return `
    <article class="catalog-pending-row">
      <div class="catalog-pending-body">
        <h3>${REPORT_TYPE_LABELS[r.target_type] || r.target_type} report${r.targetOwnerName ? ` · @${escapeHtml(r.targetOwnerName)}` : ''}</h3>
        <p class="dim">Reason: <strong>${escapeHtml(REPORT_REASON_LABELS[r.reason] || r.reason)}</strong>
          · by @${escapeHtml(r.reporterName || '?')} · ${new Date(r.created_at).toLocaleString()}</p>
        ${r.details ? `<p class="dispute-statement-box">${escapeHtml(r.details).replace(/\n/g, '<br/>')}</p>` : ''}
        <p class="dim">Target id: <code>${escapeHtml(r.target_id)}</code></p>
        <div class="form-actions">
          ${canRemove ? `<button class="btn-danger admin-purge-btn" data-admin-action="delete-reported" data-id="${r.id}" data-target-type="${r.target_type}" data-target-id="${escapeHtml(r.target_id)}">Remove ${r.target_type}</button>` : ''}
          <button class="btn-primary" data-admin-action="resolve-report" data-id="${r.id}" data-status="resolved">Mark resolved</button>
          <button class="btn-ghost" data-admin-action="resolve-report" data-id="${r.id}" data-status="dismissed">Dismiss</button>
        </div>
      </div>
    </article>`;
}

async function adminResolveReportAction(reportId, status) {
  const note = status === 'dismissed'
    ? (prompt('Optional note (why dismissed):') || '')
    : '';
  try {
    await data.adminResolveReport(reportId, status, note);
    toast(status === 'dismissed' ? 'Report dismissed.' : 'Report resolved.');
    await openReportsModal();
  } catch (err) {
    console.error(err);
    toast('Could not update report.');
  }
}

async function adminDeleteReportedAction(reportId, targetType, targetId) {
  if (!confirm(`Permanently remove this ${targetType}? This can't be undone.`)) return;
  try {
    await data.adminDeleteReportedContent(targetType, targetId);
    // Removing the content resolves the report.
    await data.adminResolveReport(reportId, 'resolved', 'Content removed.');
    toast(`${targetType[0].toUpperCase() + targetType.slice(1)} removed.`);
    await openReportsModal();
  } catch (err) {
    console.error(err);
    toast('Could not remove that content.');
  }
}

