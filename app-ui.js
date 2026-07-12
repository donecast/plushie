// ════════════════════════════════════════════════════════════════════
// app-ui.js — part 4 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Card actions, restocks, notifications, toasts, filters, event wiring.
// ════════════════════════════════════════════════════════════════════

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
    const item = state.collection.find((x) => x.id === id) || state.wishlist.find((x) => x.id === id);
    if (!item) return;
    const isWish = !state.collection.some((x) => x.id === id);
    // On the wide rails layout, a plain tap opens the item in the right-rail
    // master-detail panel (Crypt Vitals steps aside). Otherwise fall back: the
    // collection has its full edit modal; the wish list (no editor) opens the
    // lightbox so there's still a "see it bigger" path on narrow screens.
    if (action === 'open-detail' && railRightVisible()) {
      state.railDetailId = id;
      renderRightRail();
    } else if (isWish) {
      const src = photoSrc(item) || catalogImageFor(item.catalogId);
      if (src) openLightbox(src, stripOutfitWord(item.name || ''));
    } else {
      openModal('collection', item);
    }
  } else if (action === 'zoom-photo') {
    const item = state.collection.find((x) => x.id === id) || state.wishlist.find((x) => x.id === id);
    const src = item && (photoSrc(item) || catalogImageFor(item.catalogId));
    if (src) openLightbox(src, stripOutfitWord(item.nickname || item.name || ''));
  } else if (action === 'move-up') {
    await moveCollectionItem(id, 'up');
  } else if (action === 'move-down') {
    await moveCollectionItem(id, 'down');
  } else if (action === 'move-up-wish') {
    await moveWishlistItem(id, 'up');
  } else if (action === 'move-down-wish') {
    await moveWishlistItem(id, 'down');
  } else if (action === 'delete') {
    await removeCollectionItem(id);
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
    // Catalog detail goes to the right rail on the wide layout, modal otherwise.
    if (railRightVisible()) {
      state.railDetailId = null;
      state.railCatalogId = cid;
      maybeRefreshCatalogDetail(cid);
      renderRightRail();
    } else {
      openCatalogDetailModal(cid);
    }
  } else if (action === 'cat-expand') {
    // Pop the rail's catalog detail back out into the full-screen modal.
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
  } else if (action === 'cat-admin-override') {
    if (window.currentUser?.isAdmin) openCatalogOverrideModal(cid);
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
    // Variants share the product name; fold the variant label into the
    // snapshot so the owned row is self-describing (e.g. "Flower Crown — Purple").
    name: cleanCatalogName(cat.name) + (cat.isVariant && cat.formLabel ? ` — ${cat.formLabel}` : ''),
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
      hideEl('catalog-detail-modal');
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
    if (!wasOn) { scheduleReminderCheck(); ensurePushSubscription(); }
    else disablePushSubscription();
  } else if (Notification.permission === 'denied') {
    toast('Notifications blocked in browser settings.');
  } else {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      await idb.setMeta('notify_enabled', true);
      updateNotifyButton();
      toast('Reminders on.');
      scheduleReminderCheck();
      ensurePushSubscription();
    }
  }
}

// Notifications default to ON. A brand-new user (no stored preference) is
// treated as opted in: subscribe immediately if the OS already allows it,
// otherwise ask for permission on their first interaction. iOS Safari only
// shows the permission prompt from inside an installed PWA and only in
// response to a user gesture, so we can't prompt on boot — we arm a one-shot
// listener instead. An explicit OFF (notify_enabled === false) is always
// respected: we never re-nag someone who turned reminders off, and an OS-level
// block is likewise left alone.
async function maybeAutoEnableNotifications() {
  if (!('Notification' in window)) return;
  const pref = await idb.getMeta('notify_enabled');
  if (pref === false) return;                        // explicitly opted out
  if (Notification.permission === 'denied') return;  // OS-blocked; can't prompt
  if (Notification.permission === 'granted') {
    // Already allowed at OS level → honor default-on: mark enabled (if the user
    // never chose) and make sure this device is subscribed for real push.
    if (pref == null) await idb.setMeta('notify_enabled', true);
    updateNotifyButton();
    ensurePushSubscription();
    return;
  }
  // permission === 'default' and not opted out → ask on the first user gesture.
  armNotifyPrompt();
}

// One-shot: the next tap/keypress requests notification permission, then
// subscribes (grant) or remembers the refusal (deny, so we stop asking). A
// dismissed prompt leaves the preference unset so we can gently ask again on a
// later visit — that's the "default ON" intent.
function armNotifyPrompt() {
  if (window._notifyPromptArmed) return;
  window._notifyPromptArmed = true;
  const ask = async () => {
    document.removeEventListener('pointerdown', ask, true);
    document.removeEventListener('keydown', ask, true);
    if (Notification.permission !== 'default') return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        await idb.setMeta('notify_enabled', true);
        updateNotifyButton();
        ensurePushSubscription();
        scheduleReminderCheck();
      } else if (perm === 'denied') {
        await idb.setMeta('notify_enabled', false);  // honor the refusal; stop asking
      }
    } catch (e) { console.warn('auto notify prompt failed', e); }
  };
  document.addEventListener('pointerdown', ask, true);
  document.addEventListener('keydown', ask, true);
}

// Reflect the current reminders state onto the Settings toggle (the header
// bell is gone — notifications now live under Account & settings). Safe to
// call any time; no-ops if the checkbox isn't in the DOM yet.
async function updateNotifyButton() {
  const enabled = await idb.getMeta('notify_enabled');
  const granted = 'Notification' in window && Notification.permission === 'granted';
  const on = !!(enabled && granted);
  const chk = document.getElementById('acct-notify');
  if (chk) chk.checked = on;
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
  // Real push already covers every trade transition (offer/counter/accept/
  // decline/ship). Stay quiet only when server push is CONFIRMED deliverable to
  // this device, so we don't double up with an OS banner. If push isn't
  // actually wired up (subscription never stored), local remains the fallback.
  if (await serverPushDeliverable()) return;
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

// ─── Web Push subscription ───────────────────────────────────────────
// Real push (reaches a closed app) layered on top of the local
// fire-while-open notifications above. Subscribing is best-effort and
// always degrades gracefully: if the browser can't do push (no
// PushManager, iOS Safari outside an installed PWA, VAPID key unset, or
// the table/edge function not deployed yet), we just keep the local
// notifications and move on. The eventual Capacitor wrap swaps the
// transport (APNs/FCM device token) but reuses the same push_subscriptions
// table and send-push function.

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported() {
  return 'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!window.VAPID_PUBLIC_KEY;
}

// True when THIS device has a live push subscription, i.e. the backend will
// deliver friend/trade/social events as real push (reaching the app even when
// closed). The local fire-while-open helpers use this to step aside so you get
// exactly ONE notification per event: push when subscribed, local only as a
// fallback for browsers where push isn't available.
async function pushActive() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch (_) {
    return false;
  }
}

// True only when server push is genuinely deliverable to THIS device: the
// browser holds a live subscription AND we confirmed it landed in our
// push_subscriptions table (so send-push can actually reach it). The local
// fire-while-open fallbacks gate on THIS, not on pushActive() alone. The
// difference matters: a browser subscription whose DB upsert silently failed
// makes pushActive() true while the server has nothing to send to — which
// would suppress the local fallback AND get no server push, leaving the user
// with zero notifications. Gating on confirmed registration means we fall
// back to local whenever server delivery isn't actually wired up.
async function serverPushDeliverable() {
  if (!(await pushActive())) return false;
  return !!(await idb.getMeta('push_registered'));
}

// Ensure this device has a push subscription stored server-side. Idempotent:
// reuses any existing browser subscription, upserts the row keyed on
// (user, endpoint). Returns true if a subscription is registered.
async function ensurePushSubscription() {
  // TEMPORARY diagnostics (db/0078 analytics): push_subscriptions is empty in
  // prod, so no device is registering for closed-app push and we can't see why
  // from here. Record the exact bail point on each attempt so we can query
  // analytics_events (event='push_debug') and pinpoint it, then remove this.
  const dbg = (step, extra) => { try { data.track?.('push_debug', { step, ...(extra || {}) }); } catch (_) {} };

  // Any bail here means server push is NOT deliverable to this device, so we
  // clear the confirmed-registered flag — that's what keeps the local
  // fire-while-open notifications firing as the fallback (see
  // serverPushDeliverable). Only a clean upsert below sets it true.
  if (!pushSupported()) {
    // Break out WHICH capability is missing (esp. PushManager on a non-installed
    // iOS PWA, or an empty VAPID key) rather than a bare "unsupported".
    dbg('unsupported', {
      sw: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      notification: 'Notification' in window,
      vapid: !!window.VAPID_PUBLIC_KEY,
      standalone: window.matchMedia?.('(display-mode: standalone)')?.matches ?? null,
    });
    await idb.setMeta('push_registered', false);
    return false;
  }
  if (Notification.permission !== 'granted') {
    dbg('not_granted', { perm: Notification.permission });
    await idb.setMeta('push_registered', false);
    return false;
  }
  const uid = window.currentUser?.id;
  if (!uid || !window.sb) { dbg('no_user', { hasUid: !!uid, hasSb: !!window.sb }); return false; }
  try {
    // Self-sufficient: if this session never registered the SW (the old
    // load-listener race), register it now rather than depending on boot's
    // registerSW() having won. And NEVER await .ready bare — it's a promise
    // that simply never settles when no SW activates, which is exactly how
    // this function used to hang silently before its first diagnostic.
    if (!(await navigator.serviceWorker.getRegistration())) {
      await navigator.serviceWorker.register('./sw.js');
    }
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('sw-ready-timeout')), 15000)),
    ]);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const { error } = await window.sb.from('push_subscriptions').upsert({
      user_id: uid,
      platform: 'web',
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh || null,
      auth: json.keys?.auth || null,
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' });
    if (error) {
      // Upsert failed → server can't reach us. Leave local as the fallback.
      console.warn('push subscribe upsert failed', error.message);
      dbg('upsert_error', { message: error.message, code: error.code });
      await idb.setMeta('push_registered', false);
      return false;
    }
    // Confirmed stored server-side: server push will deliver, so the local
    // fallbacks can now stand down.
    dbg('ok', {});
    await idb.setMeta('push_registered', true);
    return true;
  } catch (e) {
    // Most likely a pushManager.subscribe() rejection (bad key, iOS push
    // service error, permission edge). Capture the error identity.
    console.warn('push subscribe failed', e);
    dbg('exception', { name: e?.name || null, message: String(e?.message || e).slice(0, 200) });
    await idb.setMeta('push_registered', false);
    return false;
  }
}

// Tear down this device's subscription when the user turns reminders off.
async function disablePushSubscription() {
  if (!('serviceWorker' in navigator)) return;
  await idb.setMeta('push_registered', false);
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    if (window.sb && window.currentUser?.id) {
      await window.sb.from('push_subscriptions')
        .delete()
        .eq('user_id', window.currentUser.id)
        .eq('endpoint', endpoint)
        .then(undefined, () => {});
    }
  } catch (e) {
    console.warn('push unsubscribe failed', e);
  }
}

// Verification helper: ask the edge function to push a test to THIS user's
// own devices. Exposed on window so it can be triggered from the console
// (or an admin button later) before any automated trigger exists.
async function sendSelfTestPush() {
  if (!window.sb) { toast('Not signed in.'); return; }
  const { data, error } = await window.sb.functions.invoke('send-push', {
    body: { title: '🦇 The Plush Crypt', body: 'Push is wired up. 🎉', tag: 'self-test' },
  });
  if (error) { console.warn('send-push failed', error); toast('Test push failed — see console.'); return; }
  console.log('send-push result', data);
  toast('Test push sent.');
}
window.sendSelfTestPush = sendSelfTestPush;

// Local notification when a new incoming friend request appears. Same
// model as trades/reminders: fires while the app is open or loading (no
// backend push). Tracks the set of request user-ids we've already
// notified for in IDB; the first run after enabling seeds silently so a
// backlog of pending requests doesn't dump all at once.
async function maybeFireFriendNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;
  // Friend requests already arrive as real push; skip the local copy only when
  // server push is CONFIRMED deliverable to this device, so you don't get two.
  // If push isn't actually wired up, local remains the fallback (otherwise a
  // half-subscribed device gets neither).
  if (await serverPushDeliverable()) return;

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

// New private message(s) landed while the app is open. Same stance as
// friend requests: real push covers it when confirmed deliverable; local
// is the fallback so a half-subscribed device still hears about it.
async function maybeFireDmNotification(unread) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;
  if (await serverPushDeliverable()) return;
  // Don't buzz about a conversation the user is literally looking at.
  if (state.tab === 'home' && state.socSubTab === 'messages') return;
  const body = unread === 1 ? 'You have a new message 💌' : `${unread} unread messages in the crypt 💌`;
  await fireLocalNotification('🦇 The Plush Crypt', body, 'dm-unread');
}

// ─── Notification inbox drain (db/0085) ──────────────────────────────
// Every server-side push event also queues a `notifications` row, even when
// the recipient has no push subscription. This poll (piggybacking the 5-min
// social check) locally fires whatever real push didn't deliver — the
// uniform fallback that finally covers post events (comments, replies,
// likes, mentions, feedback, approvals) while the app is open. Tags whose
// bespoke pollers already announce them (friends, trades, DMs) are marked
// delivered but not re-shown, so nothing ever doubles up.
const QUEUE_OWNED_ELSEWHERE = (tag) =>
  !tag ? false
  : tag === 'friend-request' || tag === 'friend-accept'   // maybeFireFriendNotifications
    || tag.startsWith('dm-')                              // maybeFireDmNotification
    || tag.startsWith('trade-');                          // maybeFireTradeNotifications

let _queueDrainInFlight = false;
async function maybeFireQueuedNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;
  if (_queueDrainInFlight) return;
  _queueDrainInFlight = true;
  try {
    const rows = await data.listUndeliveredNotifications();
    if (!rows.length) return;
    // With confirmed server push, the OS banner already showed these —
    // just clear the queue. Otherwise we ARE the delivery.
    if (!(await serverPushDeliverable())) {
      const show = rows.filter((r) => !QUEUE_OWNED_ELSEWHERE(r.tag));
      if (show.length > 3) {
        // A pile (first open in a while): one digest instead of a buzz-storm.
        await fireLocalNotification('🦇 The Plush Crypt',
          `${show.length} things happened in the crypt while you were away 🦇`, 'crypt-digest');
      } else {
        for (const r of show) await fireLocalNotification(r.title, r.body, r.tag);
      }
    }
    await data.markNotificationsDelivered(rows.map((r) => r.id));
  } catch (e) {
    console.warn('notification queue drain', e);
  } finally {
    _queueDrainInFlight = false;
  }
}

let _reminderInFlight = false;
// Fire a notification ONLY when a wishlist plush actually comes back into
// stock — the event people care about. This replaced the old daily "N items
// still out of stock" nag, which fired every day just to say nothing had
// changed. We track which wishlist items were out of stock last time we
// looked; anything that was out then and is available now is a genuine
// restock, so we announce it once. No time throttle: a restock is a one-off
// transition, and the tracked set is what stops it repeating.
async function maybeFireReminder() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await idb.getMeta('notify_enabled'))) return;
  // scheduleReminderCheck() runs on boot, after edits, and on toggle, so two
  // calls can overlap. This synchronous guard lets only one through at a time
  // so concurrent calls can't each fire (or race the stored set).
  if (_reminderInFlight) return;
  // Stock + retirement are read from the live catalog, so a check that runs
  // before the catalog has loaded would see nothing. At boot this fires
  // before loadCatalog() resolves, so bail until the catalog is in hand — the
  // hourly interval (and the post-catalog boot call) re-runs it once loaded.
  if (!state.catalog || state.catalog.length === 0) return;
  _reminderInFlight = true;
  try {
    // Which wishlist items are OUT OF STOCK right now, keyed by catalog id.
    // The live catalog is the source of truth (the wishlist row's own
    // `outOfStock` is a snapshot from when it was added, so it goes stale).
    // Retired plush are dropped entirely: they're gone for good and can't
    // restock, so they'd otherwise sit in the tracked set forever. Items
    // without a catalog match have no live stock signal, so we can't tell.
    const oosNow = new Set();
    for (const w of state.wishlist) {
      const liveCat = w.catalogId ? catalogForItem(w) : null;
      if (!liveCat) continue;
      if (w.retired || liveCat.retired) continue;
      if (!liveCat.available) oosNow.add(w.catalogId);
    }

    const prev = await idb.getMeta('oos_wishlist');   // array of catalogIds; null on first run
    await idb.setMeta('oos_wishlist', [...oosNow]);
    // First run after enabling (or after this feature ships): seed the set
    // silently so a wishlist full of long-standing out-of-stock items doesn't
    // all "restock" at once on the very first check.
    if (prev === null) return;

    // Restocked = was out of stock last time, is available now, still on the
    // wishlist, not retired. Pull the name from the wishlist row / live
    // catalog at report time.
    const prevSet = new Set(prev);
    const restocked = [];
    for (const w of state.wishlist) {
      if (!w.catalogId || !prevSet.has(w.catalogId) || oosNow.has(w.catalogId)) continue;
      const liveCat = catalogForItem(w);
      if (!liveCat || liveCat.retired || !liveCat.available) continue;
      restocked.push(w.name || cleanCatalogName(liveCat.name));
    }
    if (restocked.length === 0) return;

    const body = restocked.length === 1
      ? `${restocked[0]} is back in stock! 🖤`
      : `${restocked.length} wishlist plushes are back in stock 🖤`;
    await fireLocalNotification('🦇 The Plush Crypt', body, 'restock-alert');
  } finally {
    _reminderInFlight = false;
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
// The active tab lives in sessionStorage (not localStorage) on purpose: it
// survives a page refresh within the same session but is cleared when the tab
// /app is closed. So a manual refresh keeps you where you were, while coming
// back fresh (a new visit) lands on the default Social tab.
const SESSION_TAB_KEY = 'activeTab';
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
      wishView: state.wishView,
      catalogFilter: state.catalogFilter,
      catalogStatuses: [...state.catalogStatuses],
      catalogUnowned: state.catalogUnowned,
      catalogOriginal: state.catalogOriginal,
      catalogTheme: state.catalogTheme,
      catalogColor: state.catalogColor,
      catalogSort: state.catalogSort,
      // Per-section search text (each remembered independently).
      colQuery: state.colQuery,
      catQuery: state.catQuery,
      wishQuery: state.wishQuery,
      tradeFilter: state.tradeFilter,
      tradeSubTab: state.tradeSubTab,
    }));
  } catch { /* localStorage blocked or full — non-fatal */ }
  // Remember the active tab for this session only, so a refresh restores it.
  try { sessionStorage.setItem(SESSION_TAB_KEY, state.tab); } catch { /* blocked — non-fatal */ }
}

function loadFilters() {
  // Restore the active tab from sessionStorage: present only when this is a
  // refresh of an already-open session (kept you where you were), absent on a
  // fresh return so the app lands on the default Social tab. Done before the
  // filter parse so the legacy-tab migrations below also fix it up.
  try {
    const savedTab = sessionStorage.getItem(SESSION_TAB_KEY);
    if (savedTab) state.tab = savedTab;
  } catch { /* sessionStorage blocked — fall through to default tab */ }
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || !s) return;
    // Copy known scalar keys, fall back to current default if missing.
    // Note: 'tab' is NOT restored from localStorage — a fresh return lands on
    // the default Social tab. (A same-session refresh restores it from
    // sessionStorage above.) Filters/sub-tabs still persist so each tab keeps
    // its settings once you switch to it.
    const scalars = [
      'colSubTab', 'filter', 'colCategory', 'colSort', 'colView', 'wishCategory', 'wishSort', 'wishView',
      'catalogFilter', 'catalogTheme', 'catalogColor', 'catalogSort',
      'colQuery', 'catQuery', 'wishQuery', 'tradeSubTab', 'tradeFilter',
    ];
    for (const k of scalars) if (k in s) state[k] = s[k];
    // Back-compat: the old single shared search ('query') seeds the collection.
    if (typeof s.query === 'string' && !('colQuery' in s)) state.colQuery = s.query;
    const bools = ['colDupes', 'colNoBag', 'wishInStock', 'catalogUnowned', 'catalogOriginal'];
    for (const k of bools) if (k in s) state[k] = !!s[k];
    if (Array.isArray(s.catalogStatuses)) state.catalogStatuses = new Set(s.catalogStatuses);
    // Legacy migration: 'pens' was a top-level tab pre-v52; users who had
    // it saved should land on Collection → Pens sub-tab instead so they
    // don't see an empty / non-existent tab.
    if (state.tab === 'pens') { state.tab = 'crypt'; state.colSubTab = 'pens'; }
    // IA v2: 'Social' → 'home'; 'My Collection' + 'Wish List' merged into the
    // 'crypt' tab (Wish List becomes a sub-tab). Map any saved value forward.
    if (state.tab === 'social') state.tab = 'home';
    if (state.tab === 'collection') state.tab = 'crypt';
    if (state.tab === 'wishlist') { state.tab = 'crypt'; state.colSubTab = 'wishlist'; }
    // The collection sub-tabs were split from 'plushies'/'pens' into
    // plushes/minis/accessories/other/pens (+ wishlist in v2). Map the old
    // plushies value and guard against any unknown stored value.
    if (state.colSubTab === 'plushies') state.colSubTab = 'plushes';
    if (!['plushes', 'minis', 'accessories', 'other', 'pens', 'wishlist'].includes(state.colSubTab)) {
      state.colSubTab = 'plushes';
    }
    // Sync the search box to whichever section we're restoring into (render()
    // also keeps it in sync on every tab/sub-tab switch).
    const searchEl = document.getElementById('search');
    const qKey = activeQueryKey();
    if (searchEl && qKey) searchEl.value = state[qKey] || '';
  } catch { /* corrupt JSON — ignore */ }
}

// ─── Catalog change feed ("Stirrings") ───────────────────────────────
const STIR_META = {
  added:     { icon: '✨', label: 'New' },
  restocked: { icon: '🔄', label: 'Restocked' },
  sold_out:  { icon: '💔', label: 'Sold out' },
  retired:   { icon: '🪦', label: 'Retired' },
  unretired: { icon: '↩️', label: 'Back' },
};

// Push the current store state so the DB can record changes. Only rails users
// (admins/allowlist) see the feed, so only their sessions drive the sync —
// once per session is plenty, and it bounds the cost.
async function maybeSyncCatalogEvents() {
  if (state._stirSynced) return;
  if (!(typeof data !== 'undefined' && data.featureEnabled && data.featureEnabled('feature.side_rails', false))) return;
  state._stirSynced = true;
  const items = (state.catalog || [])
    .filter((c) => c.handle && !c.isVariant && !c.variantParent && !c.isCustom)
    .map((c) => ({
      handle: c.handle,
      name: typeof cleanCatalogName === 'function' ? cleanCatalogName(c.name) : c.name,
      image: c.image || null,
      available: !!c.available,
      retired: !!c.retired,
      price: c.price ?? null,
    }));
  try { await data.syncCatalogEvents(items); } catch { /* best-effort */ }
  loadCatalogEvents();
}

async function loadCatalogEvents() {
  if (!document.body.classList.contains('rails-on')) return;
  state._stirrings = await data.listCatalogEvents(12);
  renderRailStirrings();
}

// Compact "what changed in the store" ticker in the left rail.
function renderRailStirrings() {
  const el = document.getElementById('rail-stirrings');
  if (!el) return;
  const events = state._stirrings || [];
  const sig = events.map((e) => e.id).join(',');
  if (el._sig === sig) return;   // no change — skip repaint
  el._sig = sig;
  if (!events.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="rail-stir-head">Stirrings 🕯️</div>
    <ul class="rail-stir-list">
      ${events.map((e) => {
        const m = STIR_META[e.kind] || { icon: '•', label: e.kind };
        const name = escapeHtml(e.name || e.handle || '');
        const handle = escapeHtml(e.handle || '');
        const q = escapeHtml(cleanCatalogName ? cleanCatalogName(e.name || e.handle || '') : (e.name || e.handle || ''));
        return `<li class="rail-stir" data-tab="catalog" data-stir-handle="${handle}" data-stir-name="${q}" role="button" title="${m.label}: ${name} — open this item">
          <span class="rail-stir-ico">${m.icon}</span>
          <span class="rail-stir-text">
            <span class="rail-stir-name">${name}</span>
            <span class="rail-stir-kind">${m.label}</span>
          </span>
        </li>`;
      }).join('')}
    </ul>`;
}

// ─── Experimental "rails" layout (insider feature.side_rails) ────────
// The left rail is a slim identity card + vertical nav + a compose CTA; the
// right rail is a contextual companion that mirrors the stage. Everything here
// is a no-op unless body.rails-on is set (admins/allowlist) — the markup lives
// in index.html and stays display:none for everyone else.

// Header account button: the user's avatar (falling back to a heart), which
// opens the account popover. Replaces the old @name + caret pill. Kept in sync
// from render() and whenever the avatar/username changes.
function updateUserBadge() {
  const badge = document.getElementById('user-badge');
  const slot = document.getElementById('user-avatar');
  if (!badge || !slot || !window.currentUser) return;
  badge.classList.remove('hidden');
  const u = window.currentUser.username || 'you';
  badge.title = `@${u}`;
  badge.setAttribute('aria-label', `@${u} — account menu`);
  const sig = state._myAvatarUrl || '';
  if (slot._avSig === sig) return;   // avatar unchanged — skip repaint
  slot._avSig = sig;
  slot.innerHTML = state._myAvatarUrl
    ? `<img src="${escapeHtml(state._myAvatarUrl)}" alt="" class="user-avatar-img" />`
    : '<span class="user-avatar-fallback">🖤</span>';
}

// Left rail identity card — avatar, @name, a one-line vital. Clicking it jumps
// to My Crypt (delegated via the .app-shell [data-tab] handler).
function renderRailIdentity() {
  const el = document.getElementById('rail-identity');
  if (!el || !window.currentUser) return;
  const u = window.currentUser;
  const avatar = state._myAvatarUrl
    ? `<img src="${escapeHtml(state._myAvatarUrl)}" alt="" class="rail-avatar-img" />`
    : '<span class="rail-avatar-fallback">🖤</span>';
  const owned = (state.collection || []).filter(isBun).length;
  const sig = `${u.username || ''}|${state._myAvatarUrl || ''}|${owned}`;
  if (el._idSig === sig && el.childNodes.length) return;  // skip needless repaints
  el._idSig = sig;
  el.innerHTML = `
    <button class="rail-id-card" data-tab="crypt" type="button" title="View my crypt">
      <span class="rail-avatar">${avatar}</span>
      <span class="rail-id-text">
        <span class="rail-id-name">@${escapeHtml(u.username || 'you')}</span>
        <span class="rail-id-stat">${owned} ${owned === 1 ? 'bun' : 'buns'} in the crypt</span>
      </span>
    </button>`;
}

// True when the right rail is actually on screen (wide rails layout). Below the
// 1180px breakpoint the CSS hides it, so item taps fall back to the modal.
function railRightVisible() {
  return document.body.classList.contains('rails-on') && window.innerWidth > 1180;
}

// Right rail dispatcher: one slot, many faces. A selected item (master-detail)
// wins; otherwise My Crypt shows Vitals; other tabs collapse the rail.
function renderRightRail() {
  const el = document.getElementById('rail-right');
  if (!el) return;
  let detailItem = null;
  if (state.railDetailId) {
    detailItem = (state.collection || []).find((x) => x.id === state.railDetailId)
      || (state.wishlist || []).find((x) => x.id === state.railDetailId)
      || null;
    if (!detailItem) state.railDetailId = null;   // item gone (deleted) — drop it
  }
  let html = '';
  if (detailItem) {
    html = renderRailItemDetail(detailItem);
  } else if (state.railCatalogId) {
    // Catalog master-detail (the richer Lore / Set Includes / Have-Want-Buy view).
    const body = typeof catalogDetailBodyHtml === 'function' ? catalogDetailBodyHtml(state.railCatalogId, { forRail: true }) : null;
    if (body == null) state.railCatalogId = null;
    else html = `
      <section class="vitals-card rail-detail rail-catalog-detail">
        <div class="rail-detail-head">
          <h2 class="rail-head">Details</h2>
          <button class="rail-detail-close" data-rail-action="close-detail" type="button" aria-label="Close details">×</button>
        </div>
        ${body}
      </section>`;
  } else if (state.tab === 'crypt') {
    html = renderCryptVitals();
  }
  if (el._railHtml === html) return;  // identical — skip repaint (avoids thumb flicker)
  el._railHtml = html;
  el.innerHTML = html;
  el.classList.toggle('rail-right--active', !!html);
  // Collapse the reserved right-rail grid track when there's no rail content, so
  // the stage (Catalog / Trade / Admin …) gets that width back instead of a gap.
  document.querySelector('.app-shell')?.classList.toggle('has-right-rail', !!html);
}

// Right-rail master-detail panel for a collection item: photo, name, meaning,
// a few facts, and Edit (full modal) / Close. Read-only summary by design —
// the heavy edit form stays in the familiar modal.
function renderRailItemDetail(item) {
  const src = (typeof photoSrc === 'function' ? photoSrc(item) : null)
    || (typeof catalogImageFor === 'function' ? catalogImageFor(item.catalogId) : '');
  const photo = src
    ? `<img src="${escapeHtml(src)}" alt="" class="rail-detail-photo" loading="lazy" />`
    : '<div class="rail-detail-photo rail-detail-noimg">🖤</div>';

  // Wish-list items have no editor — show the whole picture, name, notes and a
  // Buy link instead of the collection's facts + Edit.
  const isWish = !(state.collection || []).some((x) => x.id === item.id);
  if (isWish) {
    return `
      <section class="vitals-card rail-detail">
        <div class="rail-detail-head">
          <h2 class="rail-head">Details</h2>
          <button class="rail-detail-close" data-rail-action="close-detail" type="button" aria-label="Close details">×</button>
        </div>
        ${photo}
        <h3 class="rail-detail-name">${escapeHtml(stripOutfitWord(item.name || ''))}</h3>
        ${item.outOfStock ? '<p class="rail-detail-product">Out of stock</p>' : ''}
        ${item.notes ? `<p class="rail-detail-meaning">${escapeHtml(item.notes)}</p>` : ''}
        ${item.url ? `<a class="rail-detail-edit" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Buy ↗</a>` : ''}
      </section>`;
  }

  const name = item.nickname
    ? `<h3 class="rail-detail-name">${escapeHtml(item.nickname)}</h3>
       <p class="rail-detail-product">${escapeHtml(stripOutfitWord(item.name || ''))}</p>`
    : `<h3 class="rail-detail-name">${escapeHtml(stripOutfitWord(item.name || ''))}</h3>`;
  const facts = [];
  if (item.dateCollected) facts.push(['Collected', item.dateCollected]);
  if (item.acquiredHow)   facts.push(['How', item.acquiredHow]);
  if ((item.quantity || 1) > 1) facts.push(['Quantity', `×${item.quantity}`]);
  if (item.retired) facts.push(['Status', 'Retired']);
  const factsHtml = facts.length
    ? `<dl class="rail-detail-facts">${facts.map(([k, v]) =>
        `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('')}</dl>`
    : '';
  return `
    <section class="vitals-card rail-detail">
      <div class="rail-detail-head">
        <h2 class="rail-head">Details</h2>
        <button class="rail-detail-close" data-rail-action="close-detail" type="button" aria-label="Close details">×</button>
      </div>
      ${photo}
      ${name}
      ${item.meaning ? `<p class="rail-detail-meaning">${escapeHtml(item.meaning)}</p>` : ''}
      ${factsHtml}
      <button class="rail-detail-edit" data-rail-action="edit-detail" data-id="${item.id}" type="button">Edit</button>
    </section>`;
}

// Crypt Vitals — your collection at a glance: total buns, a category split,
// pens progress, and the TOP of your wish list (priority order) as a little
// most-wanted shortlist. Deliberately NO "collect them all" % — this community
// isn't completionist. The thumbnails carry data-tab/data-subtab so the
// .app-shell handler routes a click straight to your wish list.
function renderCryptVitals() {
  const col = state.collection || [];
  // Buns = plushes + minis only. Clothing/accessories/other aren't buns.
  let plush = 0, mini = 0, acc = 0;
  for (const it of col) {
    if (isWearableItem(it)) continue;          // clothing isn't a bun
    const c = itemCategory(it);
    if (c === 'plush') plush++;
    else if (c === 'mini') mini++;
    else if (c === 'accessory') acc++;
  }
  const owned = plush + mini;

  const pensTotal = (typeof activePens === 'function' ? activePens() : []).length;
  let pensOwned = 0;
  if (state.pensOwned && state.pensOwned.forEach) state.pensOwned.forEach((n) => { if (n > 0) pensOwned++; });

  const wlAll = state.wishlist || [];
  const top = (typeof sortWishlist === 'function' ? sortWishlist(wlAll.slice(), 'manual') : wlAll).slice(0, 5);
  const wishHtml = top.length ? `
    <div class="vitals-missing">
      <div class="vitals-sub"><span>Top of your wish list</span></div>
      <div class="vitals-missing-row">
        ${top.map((it) => {
          const src = (typeof photoSrc === 'function' ? photoSrc(it) : null)
            || (typeof catalogImageFor === 'function' ? catalogImageFor(it.catalogId) : '');
          return `
          <button class="vitals-miss" data-tab="crypt" data-subtab="wishlist" type="button" title="${escapeHtml(it.name || '')}">
            ${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" />` : '<span class="no-photo">🖤</span>'}
          </button>`;
        }).join('')}
      </div>
    </div>` : '';

  return `
    <section class="vitals-card">
      <h2 class="rail-head">Crypt Vitals 🕯️</h2>
      <div class="vitals-big">
        <span class="vitals-num">${owned}</span>
        <span class="vitals-big-label">buns in the crypt</span>
      </div>
      <div class="vitals-chips">
        <span class="vitals-chip">🧸 ${plush} plush</span>
        <span class="vitals-chip">🐭 ${mini} mini</span>
        <span class="vitals-chip">🎀 ${acc} acc</span>
      </div>
      <div class="vitals-stats">
        <div class="vitals-stat"><span class="vitals-stat-n">${pensOwned}/${pensTotal}</span><span class="vitals-stat-l">pens</span></div>
        <div class="vitals-stat"><span class="vitals-stat-n">${wlAll.length}</span><span class="vitals-stat-l">wish list</span></div>
      </div>
      ${wishHtml}
    </section>`;
}

// Which per-section query the single search box is driving right now, or null
// when search doesn't apply (Pens / Trade / Home / Admin). Keeps Collection,
// Catalog, and Wish List searches independent.
function activeQueryKey() {
  if (state.tab === 'catalog') return 'catQuery';
  if (state.tab === 'crypt') {
    if (state.colSubTab === 'wishlist') return 'wishQuery';
    if (state.colSubTab === 'pens') return null;
    return 'colQuery';
  }
  return null;
}

// Switch to a top-level tab by name (home/catalog/crypt/trade), or one of the
// surfaces that live outside the header tab strip: 'messages' (the 💬 icon)
// and 'admin' (the user-menu entry). Clicks the owning control so each reuses
// its full enter logic. Returns false if the target isn't present (e.g.
// signed-out shell). Used by notification taps (hash + notification-nav).
function goToTab(tab) {
  if (tab === 'messages') {
    const dm = document.getElementById('dm-btn');
    if (dm) { dm.click(); return true; }
    return false;
  }
  if (tab === 'admin') {
    const item = document.querySelector('#user-menu [data-go="admin"]');
    if (item) { item.click(); return true; }
    return false;
  }
  const top = document.querySelector(`header .tabs .tab[data-tab="${tab}"]`);
  if (top) { top.click(); return true; }
  return false;
}

// Focus the catalog on a single item by name — used by the Stirrings feed so a
// change-feed entry links to the plush it refers to. We set the search box and
// clear the other catalog filters so the target is guaranteed visible whatever
// its status (a "sold out" stirring still surfaces its item, not an empty list).
// The caller switches to the catalog tab right after, so render() re-syncs the
// search input and repaints the filter chips from this state.
function focusCatalogItem(name) {
  if (!name) return;
  state.catQuery = name;
  state.catalogFilter = 'all';
  state.catalogStatuses = new Set();
  state.catalogTheme = 'all';
  state.catalogColor = 'all';
  state.catalogUnowned = false;
  state.catalogOriginal = false;
}

// Open the exact catalog item a Stirrings entry refers to. Resolves the feed's
// handle to its catalog row and opens that item's detail — the right-rail
// master-detail on the wide layout, the full modal otherwise — reusing the same
// path a catalog card's "details" tap uses. Falls back to a name-filtered
// catalog view only when the handle isn't in the loaded catalog (e.g. removed),
// so the user still lands somewhere sensible.
function openStirringItem(handle, fallbackName) {
  const raw = handle && (
    state.catalog.find((c) => c.handle === handle && !c.isVariant && !c.isCustom)
    || state.catalog.find((c) => c.handle === handle)
  );
  if (raw) {
    // Stirrings get the loud treatment: on the wide layout we light up the
    // right-rail companion *and* throw open the full modal at once, so a change
    // in the store lands right in the user's face instead of quietly in a
    // column they might not be looking at. Narrow layouts just get the modal.
    if (railRightVisible()) {
      state.railDetailId = null;
      state.railCatalogId = raw.id;
      renderRightRail();
    }
    openCatalogDetailModal(raw.id);
    return;
  }
  focusCatalogItem(fallbackName);
  goToTab('catalog');
}

// When the app is launched from a tapped notification it carries the target
// tab in the hash (./#trade). Land there, then strip the hash so a later
// manual refresh doesn't keep forcing that tab.
function handleNotificationHash() {
  const tab = (location.hash || '').replace(/^#/, '');
  if (!tab) return;
  if (goToTab(tab)) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// ─── Event wiring ────────────────────────────────────────────────────
function wireEvents() {
  // A notification tapped while the app is already open posts us the tab to
  // show (the SW can't navigate an existing client itself).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notification-nav' && e.data.tab) goToTab(e.data.tab);
    });
  }
  // Rails navigation is delegated: rail buttons (nav, identity card, vitals
  // thumbnails) carry data-tab but aren't bound by the .tab loop below (some are
  // rendered dynamically). Route them through the matching header tab so they
  // reuse its full enter logic (data loads, scroll restore) — single source.
  const shell = document.querySelector('.app-shell');
  if (shell) {
    shell.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      // Messages is a Home sub-surface, not a top-level tab — route the
      // bottom-nav 💬 through the header icon so both share one enter logic.
      if (t.dataset.tab === 'messages') { document.getElementById('dm-btn')?.click(); return; }
      // A data-subtab (e.g. the wishlist thumbnails) lands on that crypt sub-tab.
      if (t.dataset.subtab) state.colSubTab = t.dataset.subtab;
      // Stirrings feed entries open the exact item they refer to (detail rail or
      // modal), rather than just switching tabs.
      if (t.dataset.stirHandle) { openStirringItem(t.dataset.stirHandle, t.dataset.stirName || ''); return; }
      const top = document.querySelector(`header .tabs .tab[data-tab="${t.dataset.tab}"]`);
      if (top) { top.click(); return; }
      // No header tab (Admin lives in the user menu, not the top tab bar) —
      // drive it through the matching menu item so it reuses that enter logic.
      const menuItem = document.querySelector(`#user-menu [data-go="${t.dataset.tab}"]`);
      if (menuItem) menuItem.click();
    });
  }
  const railCompose = document.getElementById('rail-compose');
  if (railCompose) railCompose.addEventListener('click', () => {
    if (typeof openComposer === 'function') openComposer();
  });
  // Right-rail master-detail controls (Edit → full modal, Close → back to Vitals).
  const railRightEl = document.getElementById('rail-right');
  if (railRightEl) {
    railRightEl.addEventListener('click', (e) => {
      const a = e.target.closest('[data-rail-action]');
      if (!a) return;
      if (a.dataset.railAction === 'close-detail') {
        state.railDetailId = null;
        state.railCatalogId = null;
        renderRightRail();
      } else if (a.dataset.railAction === 'edit-detail') {
        const item = state.collection.find((x) => x.id === a.dataset.id);
        if (item) openModal('collection', item);
      }
    });
    // Catalog detail in the rail carries the normal card actions (Have / Want /
    // Buy / admin edit) — route them through the same handler the cards use.
    railRightEl.addEventListener('click', onCardClick);
  }

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', async () => {
      // Remember the scroll position of the tab we're leaving so we can
      // restore it when the user comes back.
      tabScroll.set(state.tab, window.scrollY);
      state.railDetailId = null;   // leaving the tab closes any rail master-detail
      state.railCatalogId = null;
      state.tab = t.dataset.tab;
      data.track?.('tab_view', { tab: state.tab });   // feature-engagement signal (db/0078)
      if (state.tab === 'trade') {
        state.tradeSubTab = 'browse';   // always land on Browse (item 21)
        await loadTradeData();          // refresh from server on enter
      }
      if (state.tab === 'home') {
        state.socProfile = null;       // always land on the feed, not a stale profile
        state.socSubTab = 'feed';
        await loadSocialData();
      }
      if (state.tab === 'crypt') {
        // My Crypt's masthead reads the my-profile cache; refresh it on enter.
        await loadMyProfileCache();
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
      state.railDetailId = null;   // changing sub-tab closes any rail master-detail
      state.railCatalogId = null;
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
  wireSelect('col-view', 'colView');
  // Compact list view is desktop-only (hidden + forced off on phones). Re-render
  // when crossing that breakpoint so a desktop→phone resize drops back to cards,
  // and back to the saved compact layout when widening again.
  const phoneMq = window.matchMedia(PHONE_MEDIA);
  const onPhoneBreakpoint = () => render();
  if (phoneMq.addEventListener) phoneMq.addEventListener('change', onPhoneBreakpoint);
  else if (phoneMq.addListener) phoneMq.addListener(onPhoneBreakpoint);
  // Sort menu: switching to any sort other than "My order" leaves arrange mode
  // (you can't drag a date/name-sorted list into a custom order).
  const sortSel = document.getElementById('col-sort');
  if (sortSel) sortSel.addEventListener('change', () => {
    state.colSort = sortSel.value;
    if (state.colSort !== 'manual') state.arranging = false;
    render();
  });
  // Arrange button: tap to start arranging (which switches the view to the
  // saved "My order" so you're dragging the real order), tap again when done.
  // Finishing leaves the collection *showing* My order — it just turns off the
  // live drag handles — so the order you set sticks (item 20).
  const arrangeBtn = document.getElementById('col-arrange');
  if (arrangeBtn) arrangeBtn.addEventListener('click', () => {
    if (state.arranging) {
      state.arranging = false;          // done — keep colSort on 'manual' so the order shows
    } else {
      state.arranging = true;
      state.colSort = 'manual';
    }
    render();
  });
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
  wireSelect('wish-view', 'wishView');
  // Sort menu mirrors the collection: leaving "My order" turns off arrange mode.
  const wishSortSel = document.getElementById('wish-sort');
  if (wishSortSel) wishSortSel.addEventListener('change', () => {
    state.wishSort = wishSortSel.value;
    if (state.wishSort !== 'manual') state.wishArranging = false;
    render();
  });
  // Arrange button: start dragging (snaps the sort to "My order"); tap again
  // when done — the saved priority order keeps showing.
  const wishArrangeBtn = document.getElementById('wish-arrange');
  if (wishArrangeBtn) wishArrangeBtn.addEventListener('click', () => {
    if (state.wishArranging) {
      state.wishArranging = false;
    } else {
      state.wishArranging = true;
      state.wishSort = 'manual';
    }
    render();
  });
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

  // Search is per-section: route the input to whichever section is showing so
  // the text doesn't leak between Collection / Catalog / Wish List, and each
  // restores its own on return (render() re-syncs the box — see below).
  // Debounce the re-render: each keystroke used to re-filter + re-sort the
  // whole catalog/collection and rebuild the grid innerHTML synchronously,
  // making typing janky on large lists. The query state is updated
  // immediately (so the box + the debounced render both see the latest
  // text); only the expensive render is coalesced. Mirrors the friends
  // search debounce in app-social.js.
  let _searchDebounce;
  document.getElementById('search').addEventListener('input', (e) => {
    const key = activeQueryKey();
    if (key) state[key] = e.target.value;
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(render, 160);
  });

  document.getElementById('check-restocks').addEventListener('click', checkAllRestocks);
  const notifyChk = document.getElementById('acct-notify');
  if (notifyChk) notifyChk.addEventListener('change', async () => {
    await toggleNotifications();
    updateNotifyButton();   // resync (e.g. if permission was denied, revert the box)
  });

  document.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeModal)
  );

  document.getElementById('plushie-form').addEventListener('submit', submitForm);
  document.getElementById('modal-remove').addEventListener('click', async () => {
    if (!state.editingId) return;
    const ok = await removeCollectionItem(state.editingId);
    if (ok) closeModal();
  });

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

  // Wish-list drag-and-drop (same mechanics as the collection grid, item 20).
  const wishGrid = document.getElementById('wishlist-grid');
  wishGrid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-reorder-id]');
    if (!card) return;
    state._dragId = card.dataset.reorderId;
    card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  wishGrid.addEventListener('dragover', (e) => { if (state._dragId) e.preventDefault(); });
  wishGrid.addEventListener('dragend', () => {
    wishGrid.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    state._dragId = null;
  });
  wishGrid.addEventListener('drop', async (e) => {
    if (!state._dragId) return;
    e.preventDefault();
    const target = e.target.closest('[data-reorder-id]');
    const dragId = state._dragId;
    state._dragId = null;
    wishGrid.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    if (target && target.dataset.reorderId !== dragId) {
      await dropReorderWish(dragId, target.dataset.reorderId);
    }
  });

  // Add-your-own clothing: open from the closet header, plus modal wiring.
  document.getElementById('add-custom-clothing-btn').addEventListener('click', (e) => {
    openCustomClothingModal(e.currentTarget.dataset.scale || 'full');
  });
  document.getElementById('custom-clothing-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close-cc]')) closeCustomClothingModal();
  });
  document.getElementById('custom-clothing-form').addEventListener('submit', submitCustomClothing);
  document.getElementById('cc-photo').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    document.getElementById('cc-photo-name').textContent = file ? '✓ ' + file.name : '';
  });

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
  // The catalog override modal hosts the community/extra photos manager
  // (Add / Delete use data-admin-action), so bind it to the same dispatcher.
  document.getElementById('catalog-override-modal')?.addEventListener('click', onAdminClick);

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

  // Trade-list modal (quantity + required real proof photos).
  document.querySelectorAll('[data-close-tradelist]').forEach((el) =>
    el.addEventListener('click', closeTradeListModal)
  );
  document.getElementById('tl-add-photo').addEventListener('click', () =>
    document.getElementById('tl-photo-input').click()
  );
  document.getElementById('tl-photo-input').addEventListener('change', async (e) => {
    await onTradeListAddPhotos(e.target.files);
    e.target.value = '';   // allow re-picking the same file
  });
  document.getElementById('tl-photos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tl-remove]');
    if (btn) removeTradeListPhoto(parseInt(btn.dataset.tlRemove, 10));
  });
  document.getElementById('tl-suggestion').addEventListener('click', (e) => {
    if (e.target.closest('#tl-use-collection')) useCollectionPhoto();
  });
  document.getElementById('tl-save').addEventListener('click', saveTradeList);

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

  // Account dropdown under the user badge (replaces the old direct-to-modal
  // click). Houses View my crypt / Account / Admin (is_admin only) / Sign out.
  const userBadge = document.getElementById('user-badge');
  const userMenu = document.getElementById('user-menu');
  const closeUserMenu = () => {
    userMenu.classList.add('hidden');
    userBadge.setAttribute('aria-expanded', 'false');
  };
  userBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = userMenu.classList.contains('hidden');
    userMenu.classList.toggle('hidden', !open);
    userBadge.setAttribute('aria-expanded', open ? 'true' : 'false');
    // Admin entry mirrors the old hidden admin tab's is_admin gate — now also
    // shown to moderators, who get a reports-only view of the console.
    document.getElementById('menu-admin').classList.toggle('hidden', !window.currentUser?.canModerate);
  });
  document.addEventListener('click', (e) => {
    if (userMenu.classList.contains('hidden')) return;
    if (!userMenu.contains(e.target) && !userBadge.contains(e.target)) closeUserMenu();
  });
  userMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-go]');
    if (!item) return;
    closeUserMenu();
    const go = item.dataset.go;
    if (go === 'profile') { openProfileModal(); return; }
    if (go === 'settings') { openSettingsModal(); return; }
    if (go === 'invite') { shareApp(); return; }
    if (go === 'signout') { handleSignOut(); return; }
    // crypt | admin — switch tabs the same way a .tab click would.
    tabScroll.set(state.tab, window.scrollY);
    state.tab = go;
    if (go === 'crypt') await loadMyProfileCache();
    if (go === 'admin') { state.adminUserView = null; await loadAdminUsers(); }
    render();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    saveFilters();
  });

  // Coven (friends / requests) — ambient header icon. Lands on Home and opens
  // the friends surface (the old Social → Friends sub-tab).
  document.getElementById('coven-btn').addEventListener('click', async () => {
    tabScroll.set(state.tab, window.scrollY);
    state.tab = 'home';
    state.socProfile = null;
    await loadSocialData();
    state.socSubTab = 'friends';
    render();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    saveFilters();
  });

  // Messages (💬) — same ambient pattern as the Coven icon: land on Home,
  // open the thread list (or straight back into the conversation that was
  // open before, if any — matches Messenger's "resume where you were").
  document.getElementById('dm-btn')?.addEventListener('click', async () => {
    tabScroll.set(state.tab, window.scrollY);
    state.tab = 'home';
    state.socProfile = null;
    state.socSubTab = 'messages';
    try { await loadDmThreads(); } catch (e) { console.warn('dm threads', e); }
    render();
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    saveFilters();
  });

  // Catalog item create + suggest photo + admin queue modals.
  document.querySelectorAll('[data-close-catalog-item]').forEach((el) =>
    el.addEventListener('click', () => hideEl('catalog-item-modal'))
  );
  document.querySelectorAll('[data-close-catalog-detail]').forEach((el) =>
    el.addEventListener('click', () => hideEl('catalog-detail-modal'))
  );
  document.querySelectorAll('[data-close-bundle-picker]').forEach((el) =>
    el.addEventListener('click', () => hideEl('bundle-picker-modal'))
  );
  document.getElementById('bundle-picker-form').addEventListener('submit', submitBundlePickerForm);
  // Merge tool wiring.
  document.querySelectorAll('[data-close-catalog-merge]').forEach((el) =>
    el.addEventListener('click', () => hideEl('catalog-merge-modal'))
  );
  document.getElementById('cm-search').addEventListener('input', onMergeSearchInput);
  document.getElementById('cm-results').addEventListener('click', (e) => {
    const t = e.target.closest('[data-merge-id]');
    if (t) onMergeSelectWinner(t.dataset.mergeId, t.dataset.mergeName, t.dataset.mergeHandle);
  });
  document.getElementById('cm-submit').addEventListener('click', submitCatalogMerge);
  document.getElementById('catalog-item-form').addEventListener('submit', submitCatalogItemForm);
  // Shopify catalog overrides (admin lore / symbolism / Set Includes edits).
  document.querySelectorAll('[data-close-catalog-override]').forEach((el) =>
    el.addEventListener('click', () => hideEl('catalog-override-modal'))
  );
  document.getElementById('catalog-override-form').addEventListener('submit', submitCatalogOverrideForm);
  document.getElementById('co-image').addEventListener('change', updateCoverPhotoPreview);
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
    el.addEventListener('click', () => hideEl('suggest-photo-modal'))
  );
  document.getElementById('suggest-photo-form').addEventListener('submit', submitSuggestPhotoForm);
  document.querySelectorAll('[data-close-admin-queue]').forEach((el) =>
    el.addEventListener('click', () => hideEl('admin-queue-modal'))
  );
  document.querySelectorAll('[data-close-dispute-stmt]').forEach((el) =>
    el.addEventListener('click', () => hideEl('dispute-statement-modal'))
  );
  document.getElementById('dispute-statement-form').addEventListener('submit', submitDisputeStatementForm);
  document.getElementById('report-form').addEventListener('submit', submitReport);
  document.querySelectorAll('[data-close-report]').forEach((el) =>
    el.addEventListener('click', () => hideEl('report-modal'))
  );
  document.querySelectorAll('[data-close-dispute-review]').forEach((el) =>
    el.addEventListener('click', () => hideEl('dispute-review-modal'))
  );

  // Account modal
  document.querySelectorAll('[data-close-account]').forEach((el) =>
    el.addEventListener('click', closeAccountModal)
  );
  document.getElementById('acct-save-username').addEventListener('click', saveUsername);
  document.getElementById('acct-save-email').addEventListener('click', saveEmail);
  document.getElementById('acct-save-address').addEventListener('click', saveDefaultAddress);
  document.getElementById('acct-save-profile').addEventListener('click', saveAccountProfile);
  document.getElementById('acct-save-name').addEventListener('click', saveAccountName);
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
  // Delete account — opens the exit survey + final confirm (app-account.js).
  document.getElementById('acct-delete')?.addEventListener('click', openDeleteAccountModal);
  document.getElementById('delacct-confirm')?.addEventListener('click', submitAccountDeletion);
  document.querySelectorAll('[data-close-delacct]').forEach((el) =>
    el.addEventListener('click', closeDeleteAccountModal));
  // Demo mode: a per-device recording aid that hides everything non-public.
  // Reload so auth re-derives identity and every gate re-evaluates cleanly
  // (no half-applied UI). Writes nothing server-side; fully reversible.
  document.getElementById('acct-demo-mode')?.addEventListener('change', (e) => {
    data.setDemoMode(e.target.checked);
    window.location.reload();
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
  // data-close-lightbox attribute. Tapping the image closes it too:
  // on a phone the photo fills the screen, so tap-anywhere-to-dismiss
  // is the only closing gesture that reliably works (the backdrop
  // margin is a thin sliver and the × can hide under a notch).
  document.querySelectorAll('[data-close-lightbox]').forEach((el) =>
    el.addEventListener('click', () => hideEl('lightbox-modal'))
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal').classList.contains('hidden')) {
      closeModal();
    }
  });
}

