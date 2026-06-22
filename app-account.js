// ════════════════════════════════════════════════════════════════════
// app-account.js — part 6 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Collection sharing, the account modal, and shipping addresses.
// ════════════════════════════════════════════════════════════════════

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
  // Gated change-log items (.changelog-gated) only show for "insiders":
  // admins plus the small ALWAYS_GRANTED allowlist (e.g. redrambler). Recompute
  // each open so it reflects the signed-in user even if they signed in after a
  // previous open (the modal is reachable pre-auth from the footer).
  const u = window.currentUser;
  const insider = !!u && (
    u.isAdmin ||
    (data.ALWAYS_GRANTED_USERNAMES || []).includes((u.username || '').toLowerCase())
  );
  document.body.classList.toggle('cl-insider', insider);
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
  renderSocialLinkFields(state._mySocialLinks || {});
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
  // Make the one-month lock explicit before they commit (item 8).
  if (!confirm(`Change your username to @${u}?\n\nYou won't be able to change it again for 30 days.`)) return;
  try {
    await data.updateUsername(u);
    document.querySelector('#user-badge .user-name').textContent = '@' + u;
    toast('Username updated. Locked for 30 days.');
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
  hint.classList.remove('hidden');
  if (next && next > new Date()) {
    hint.textContent = `🔒 Locked — you can change your username again on ${next.toISOString().slice(0, 10)}.`;
    if (saveBtn) saveBtn.disabled = true;
  } else {
    // Always warn up front that a change is a 30-day commitment (item 8).
    hint.textContent = '⚠️ Heads up: you can only change your username once every 30 days.';
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
  // "✓ Saved" shows whenever a usable address is on file (line1 present).
  const badge = document.getElementById('acct-addr-verified');
  if (badge) badge.classList.toggle('hidden', !a.line1);
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
    // NB: this is a *format* check (required fields + ZIP shape), not a real
    // postal lookup — so we don't claim the address is "verified", only saved.
    // A real provider (USPS/Loqate/Google) can slot into verifyAddress() later.
    await data.setMyAddressFull(normalized, { verified: false });
    // Reflect normalization back into the fields.
    for (const [key, id] of Object.entries(ADDR_FIELDS)) {
      const el = document.getElementById(id);
      if (el) el.value = normalized[key] || '';
    }
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    if (badge) badge.classList.remove('hidden');
    toast('Address saved. ✓');
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

// Render one labelled username box per social network in the account modal,
// pre-filled from the saved handles.
function renderSocialLinkFields(links) {
  const wrap = document.getElementById('acct-social-links');
  if (!wrap) return;
  wrap.innerHTML = SOCIAL_PLATFORMS.map((p) => `
    <label class="social-link-row">
      <span class="social-link-label" title="${escapeHtml(p.label)}">${p.glyph} ${escapeHtml(p.label)}</span>
      <input type="text" class="social-link-input" data-social-key="${p.key}"
             autocomplete="off" autocapitalize="none" spellcheck="false"
             placeholder="e.g. ${escapeHtml(p.eg)}" value="${escapeHtml(links?.[p.key] || '')}" />
    </label>`).join('');
}

// Read the social-link inputs back into a clean { platform: handle } map,
// dropping blanks and sanitizing whatever the user typed (handles or URLs).
function collectSocialLinks() {
  const out = {};
  document.querySelectorAll('#acct-social-links .social-link-input').forEach((inp) => {
    const handle = sanitizeSocialHandle(inp.value);
    if (handle) out[inp.dataset.socialKey] = handle;
  });
  return out;
}

async function saveAccountProfile() {
  const bio = document.getElementById('acct-bio').value.trim();
  const socialLinks = collectSocialLinks();
  try {
    await data.updateMyProfile({ bio, socialLinks, avatarBlob: state._acctAvatarBlob });
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

