// Cloud data layer. Talks to Supabase. Mirrors enough of the old IDB
// interface to make app.js's existing call sites work with minimal churn.
//
// Active collection = the user's owned collection. Multi-collection
// switching is a future affordance; for now we always operate on the
// member-row marked role='owner'.
//
// Item shape exposed to the rest of the app:
//   id, name, catalogId, catalogHandle,
//   photoPath  — what's stored (uuid path, or external URL, or null)
//   photo      — resolved URL string for rendering (signed URL for storage paths)
//   addedAt, updatedAt,
//   …collection or wishlist fields…

const data = {
  collectionId: null,
  _photoUrlCache: new Map(),    // path → signed URL

  // ─── Bootstrap ────────────────────────────────────────────────────
  memberships: [],

  async loadActiveCollection() {
    const userId = window.currentUser.id;
    const memberships = await data.listMyMemberships();
    if (memberships.length === 0) throw new Error('no_collection');
    data.memberships = memberships;
    const stored = localStorage.getItem(`active_collection_${userId}`);
    let active = memberships.find((m) => m.collection_id === stored);
    if (!active) active = memberships.find((m) => m.role === 'owner') || memberships[0];
    data.collectionId = active.collection_id;
    return data.collectionId;
  },

  async switchActiveCollection(collectionId) {
    data.collectionId = collectionId;
    localStorage.setItem(`active_collection_${window.currentUser.id}`, collectionId);
  },

  async listMyMemberships() {
    const userId = window.currentUser.id;
    const { data: rows, error } = await sb
      .from('collection_members')
      .select('collection_id, role')
      .eq('user_id', userId);
    if (error) throw error;
    if (!rows || rows.length === 0) return [];
    // Fetch collection metadata separately (owner_id, name)
    const ids = rows.map((r) => r.collection_id);
    const { data: cols } = await sb.from('collections').select('id, name, owner_id').in('id', ids);
    const byId = new Map((cols || []).map((c) => [c.id, c]));
    return rows.map((r) => ({
      collection_id: r.collection_id,
      role: r.role,
      name: byId.get(r.collection_id)?.name ?? '(collection)',
      owner_id: byId.get(r.collection_id)?.owner_id,
    }));
  },

  async listMembers() {
    const { data: rows, error } = await sb
      .from('collection_members')
      .select('user_id, role, invited_at')
      .eq('collection_id', data.collectionId);
    if (error) throw error;
    const ids = rows.map((r) => r.user_id);
    let usernames = new Map();
    if (ids.length) {
      const { data: profs } = await sb.from('profiles').select('id, username').in('id', ids);
      usernames = new Map((profs || []).map((p) => [p.id, p.username]));
    }
    return rows.map((r) => ({ ...r, username: usernames.get(r.user_id) }));
  },

  async removeMember(userId) {
    const { error } = await sb
      .from('collection_members')
      .delete()
      .eq('collection_id', data.collectionId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async createInvite(role = 'editor') {
    const { data: row, error } = await sb
      .from('collection_invites')
      .insert({
        collection_id: data.collectionId,
        created_by: window.currentUser.id,
        role,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        uses_remaining: 1,
      })
      .select()
      .single();
    if (error) throw error;
    return row.token;
  },

  async acceptInvite(token) {
    const { data: cid, error } = await sb.rpc('accept_collection_invite', { invite_token: token });
    if (error) throw error;
    return cid;
  },

  // ─── Reads ────────────────────────────────────────────────────────
  async list(kind) {
    const table = kind === 'collection' ? 'plushies' : 'wishlist';
    const { data: rows, error } = await sb
      .from(table)
      .select('*')
      .eq('collection_id', data.collectionId)
      .order('added_at', { ascending: false });
    if (error) throw error;
    const items = rows.map((r) => data._rowToItem(r, kind));
    await data._resolvePhotos(items);
    return items;
  },

  async listPens() {
    const { data: rows, error } = await sb
      .from('pen_counts')
      .select('pen_id, count')
      .eq('collection_id', data.collectionId);
    if (error) throw error;
    return new Map(rows.map((r) => [r.pen_id, r.count]));
  },

  // ─── Writes ───────────────────────────────────────────────────────
  async put(kind, item) {
    const table = kind === 'collection' ? 'plushies' : 'wishlist';

    // Resolve the photo column:
    //   prefer an explicit photoPath that came from a prior fetch;
    //   if not present, upload a Blob or persist an external URL string.
    let photoPath = item.photoPath ?? null;
    if (!photoPath) {
      if (item.photo instanceof Blob) {
        photoPath = await data.uploadPhoto(item.photo, item.id);
      } else if (typeof item.photo === 'string' && item.photo.startsWith('http')) {
        photoPath = item.photo;
      }
    }

    const row = data._itemToRow(item, kind);
    row.photo_path = photoPath;

    // First attempt with the full row. If a migration hasn't been run yet,
    // PostgREST returns "Could not find the 'X' column of 'Y' in the schema
    // cache" — strip the missing column and retry, up to a few times. Keeps
    // the app functional even when a new column hasn't been applied yet.
    let attempts = 0;
    while (attempts++ < 4) {
      const { error } = await sb.from(table).upsert(row);
      if (!error) return;
      const missing = /Could not find the '(\w+)' column/i.exec(error.message || '');
      if (missing && missing[1] in row) {
        console.warn(`[data.put] missing column ${missing[1]}; retrying without it`);
        delete row[missing[1]];
        continue;
      }
      throw error;
    }
  },

  async delete(kind, id, { keepPhoto = false } = {}) {
    const table = kind === 'collection' ? 'plushies' : 'wishlist';
    // Best-effort photo cleanup unless the caller wants to keep it
    // (e.g. moving a wishlist row to collection — same photo path).
    if (!keepPhoto) {
      const { data: row } = await sb.from(table).select('photo_path').eq('id', id).maybeSingle();
      if (row?.photo_path && !row.photo_path.startsWith('http')) {
        await data.deletePhoto(row.photo_path).catch(() => {});
      }
    }
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  },

  async setPen(penId, count) {
    if (count <= 0) {
      const { error } = await sb
        .from('pen_counts')
        .delete()
        .eq('collection_id', data.collectionId)
        .eq('pen_id', penId);
      if (error) throw error;
    } else {
      const { error } = await sb.from('pen_counts').upsert({
        collection_id: data.collectionId,
        pen_id: penId,
        count,
      });
      if (error) throw error;
    }
  },

  // ─── Photos (Supabase Storage) ────────────────────────────────────
  async uploadPhoto(blob, id) {
    const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
    const path = `${data.collectionId}/${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
    const { error } = await sb.storage
      .from('photos')
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    return path;
  },

  async photoUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    if (data._photoUrlCache.has(path)) return data._photoUrlCache.get(path);
    const { data: signed, error } = await sb
      .storage.from('photos')
      .createSignedUrl(path, 3600);
    if (error) { console.warn('signed url failed', path, error); return null; }
    data._photoUrlCache.set(path, signed.signedUrl);
    return signed.signedUrl;
  },

  async deletePhoto(path) {
    if (!path || path.startsWith('http')) return;
    await sb.storage.from('photos').remove([path]);
    data._photoUrlCache.delete(path);
  },

  async _resolvePhotos(items) {
    await Promise.all(items.map(async (it) => {
      if (it.photoPath) it.photo = await data.photoUrl(it.photoPath);
    }));
  },

  // ─── Row ↔ item shape conversion ──────────────────────────────────
  _rowToItem(r, kind) {
    const base = {
      id: r.id,
      name: r.name,
      catalogId: r.catalog_id,
      catalogHandle: r.catalog_handle,
      photoPath: r.photo_path || null,
      photo: null,  // resolved post-fetch
      addedAt: r.added_at ? +new Date(r.added_at) : Date.now(),
      updatedAt: r.updated_at ? +new Date(r.updated_at) : Date.now(),
    };
    if (kind === 'collection') {
      return {
        ...base,
        nickname: r.nickname,
        meaning: r.meaning,
        dateCollected: r.date_collected,
        acquiredHow: r.acquired_how,
        hasBag: r.has_bag,
        retired: r.retired,
        quantity: r.quantity ?? 1,
      };
    }
    return {
      ...base,
      url: r.url,
      outOfStock: r.out_of_stock,
      retired: false,
    };
  },

  _itemToRow(item, kind) {
    const base = {
      id: item.id,
      collection_id: data.collectionId,
      name: item.name,
      catalog_id: item.catalogId ?? null,
      catalog_handle: item.catalogHandle ?? null,
      updated_at: new Date().toISOString(),
    };
    if (kind === 'collection') {
      return {
        ...base,
        nickname: item.nickname ?? null,
        meaning: item.meaning ?? null,
        date_collected: item.dateCollected ?? null,
        acquired_how: item.acquiredHow ?? null,
        has_bag: item.hasBag !== false,
        retired: !!item.retired,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
      };
    }
    return {
      ...base,
      url: item.url ?? null,
      out_of_stock: !!item.outOfStock,
    };
  },

  // ─── One-time migration from local IDB ────────────────────────────
  async migrateFromIDB() {
    const flagKey = `cloud_migrated_${data.collectionId}`;
    if (await idb.getMeta(flagKey)) return false;

    const cloudCol = await sb
      .from('plushies')
      .select('id', { count: 'exact', head: true })
      .eq('collection_id', data.collectionId);
    if ((cloudCol.count ?? 0) > 0) {
      await idb.setMeta(flagKey, true);
      return false;
    }

    const [localCol, localWish, penMeta] = await Promise.all([
      idb.getAll('collection').catch(() => []),
      idb.getAll('wishlist').catch(() => []),
      idb.getMeta('pens_owned').catch(() => null),
    ]);
    const hasAny = localCol.length || localWish.length || (Array.isArray(penMeta) && penMeta.length);
    if (!hasAny) {
      await idb.setMeta(flagKey, true);
      return false;
    }

    toast(`Uploading your local data…`);

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    async function prepItem(item) {
      // Postgres uuid column won't accept anything else.
      if (!item.id || !UUID_RE.test(item.id)) item.id = crypto.randomUUID();
      if (item.photo instanceof Blob) return; // data.put handles it
      if (typeof item.photo === 'string' && item.photo.startsWith('http')) {
        try {
          const resp = await fetch(item.photo, { mode: 'cors' });
          if (resp.ok) item.photo = await resp.blob();
        } catch { /* leave URL string; data.put stores it as-is */ }
      }
    }

    for (const it of localCol)  { await prepItem(it); try { await data.put('collection', it); } catch (e) { console.warn('migrate col', e); } }
    for (const it of localWish) { await prepItem(it); try { await data.put('wishlist', it);   } catch (e) { console.warn('migrate wish', e); } }

    if (Array.isArray(penMeta)) {
      const entries = penMeta.map((e) => Array.isArray(e) ? e : [e, 1]);
      for (const [penId, count] of entries) {
        if (count > 0) await data.setPen(penId, count);
      }
    }

    await idb.setMeta(flagKey, true);
    toast('Sync complete.');
    return true;
  },
};

// ─── Trade items ───────────────────────────────────────────────────
data.listMyTradeItems = async function () {
  const { data: rows, error } = await sb
    .from('trade_items')
    .select('*')
    .eq('owner_id', window.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const items = rows.map(data._tradeItemFromRow);
  await Promise.all(items.map(async (it) => {
    if (it.photoPath) it.photo = await data.photoUrl(it.photoPath);
  }));
  return items;
};

data.addTradeItem = async function ({ kind, catalogId, catalogHandle, name, photoPath, quantity, notes }) {
  const { data: row, error } = await sb.from('trade_items').insert({
    owner_id: window.currentUser.id,
    kind, catalog_id: catalogId, catalog_handle: catalogHandle,
    name, photo_path: photoPath ?? null,
    quantity, notes: notes ?? null,
  }).select().single();
  if (error) throw error;
  return data._tradeItemFromRow(row);
};

data.updateTradeItem = async function (id, patch) {
  const row = {};
  if ('quantity' in patch) row.quantity = patch.quantity;
  if ('notes' in patch) row.notes = patch.notes;
  row.updated_at = new Date().toISOString();
  const { error } = await sb.from('trade_items').update(row).eq('id', id);
  if (error) throw error;
};

data.deleteTradeItem = async function (id) {
  const { error } = await sb.from('trade_items').delete().eq('id', id);
  if (error) throw error;
};

// ─── Discovery ─────────────────────────────────────────────────────
data.browseOfferings = async function () {
  // All offerings except the current user's, where at least one unit is unreserved.
  const { data: rows, error } = await sb
    .from('trade_items')
    .select('id, owner_id, name, catalog_id, catalog_handle, photo_path, quantity, reserved, notes, created_at, kind')
    .eq('kind', 'offering')
    .neq('owner_id', window.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const available = rows.filter((r) => (r.quantity - r.reserved) > 0);
  // Resolve usernames separately — there's no FK from trade_items.owner_id to profiles.id.
  const ownerIds = [...new Set(available.map((r) => r.owner_id))];
  let usernames = new Map();
  if (ownerIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', ownerIds);
    usernames = new Map((profs || []).map((p) => [p.id, p.username]));
  }
  const items = available.map((r) => ({
    ...data._tradeItemFromRow(r),
    ownerUsername: usernames.get(r.owner_id) ?? 'unknown',
  }));
  // Don't try to resolve photoPath here — the storage bucket's RLS is
  // collection-scoped, so other users' photos are unreadable and produce
  // 400s in the console. The card renderer falls back to the catalog
  // image (keyed by catalog_id) instead.
  return items;
};

data.getFeedbackSummary = async function (userId) {
  const { data: row, error } = await sb
    .from('user_feedback_summary')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return row || {
    user_id: userId,
    good_count: 0, meh_count: 0, bad_count: 0,
    net_score: 0, total_count: 0,
    comm_up: 0, comm_down: 0,
    ship_up: 0, ship_down: 0,
    acc_up: 0, acc_down: 0,
    overall_percent: null,
  };
};

// Batch reputation fetch — used to fill the per-user badge cache in one
// round-trip when the trade tab renders. Returns rows keyed by user_id.
data.getFeedbackSummaryBatch = async function (userIds) {
  if (!userIds || userIds.length === 0) return {};
  const { data: rows, error } = await sb
    .from('user_feedback_summary')
    .select('*')
    .in('user_id', userIds);
  if (error) throw error;
  const out = {};
  for (const r of rows) out[r.user_id] = r;
  return out;
};

// Most recent public-facing feedback for a user, with the rater's
// username. Used by the mini-profile popover; excludes trade_id so a
// reader can't trace a comment back to a specific exchange.
data.getPublicFeedback = async function (userId, limit = 8) {
  const { data: rows, error } = await sb
    .from('public_feedback_recent')
    .select('*')
    .eq('ratee_id', userId)
    .limit(limit);
  if (error) throw error;
  return rows;
};

// ─── Trades ────────────────────────────────────────────────────────
data.listTrades = async function () {
  const uid = window.currentUser.id;
  const { data: rows, error } = await sb
    .from('trades')
    .select(`
      *,
      trade_line_items (
        side, quantity,
        trade_item:trade_items (id, name, photo_path, catalog_id, owner_id)
      )
    `)
    .or(`proposer_id.eq.${uid},recipient_id.eq.${uid}`)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Resolve usernames separately (no FK between trades and profiles).
  const userIds = new Set();
  for (const t of rows) { userIds.add(t.proposer_id); userIds.add(t.recipient_id); }
  let byId = new Map();
  if (userIds.size) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', [...userIds]);
    byId = new Map((profs || []).map((p) => [p.id, p]));
  }
  for (const t of rows) {
    t.proposer  = byId.get(t.proposer_id);
    t.recipient = byId.get(t.recipient_id);
  }

  // Warm photo cache for line items
  const photos = new Set();
  for (const t of rows) {
    for (const li of (t.trade_line_items || [])) {
      if (li.trade_item?.photo_path) photos.add(li.trade_item.photo_path);
    }
  }
  await Promise.all([...photos].map((p) => data.photoUrl(p)));
  return rows;
};

data.createTrade = async function ({ recipientId, proposerLines, recipientLines, message, parentTradeId }) {
  const insert = {
    proposer_id: window.currentUser.id,
    recipient_id: recipientId,
    message: message ?? null,
  };
  if (parentTradeId) insert.parent_trade_id = parentTradeId;
  const { data: t, error } = await sb.from('trades').insert(insert).select().single();
  if (error) throw error;

  const lines = [
    ...proposerLines.map((l) => ({ trade_id: t.id, side: 'proposer', trade_item_id: l.tradeItemId, quantity: l.quantity })),
    ...recipientLines.map((l) => ({ trade_id: t.id, side: 'recipient', trade_item_id: l.tradeItemId, quantity: l.quantity })),
  ];
  const { error: lineErr } = await sb.from('trade_line_items').insert(lines);
  if (lineErr) {
    // Roll back the parent on line-insert failure so we don't leave a dangling pending trade.
    await sb.from('trades').delete().eq('id', t.id);
    throw lineErr;
  }
  // Auto-share default address if set — saves a manual step later.
  await data._autoShareAddress(t.id);
  return t;
};

data._autoShareAddress = async function (tradeId) {
  try {
    const addr = await data.getMyAddress();
    if (addr) {
      await sb.from('trade_addresses').upsert({
        trade_id: tradeId,
        user_id: window.currentUser.id,
        address: addr,
      });
    }
  } catch (e) {
    console.warn('autoShareAddress', e);
  }
};

// Accept a trade — also marks the parent as 'countered' if this is a counter response,
// and reserves quantities on each line item. Done client-side without a transaction;
// the reserved check constraint catches over-reservation.
data.acceptTrade = async function (tradeId) {
  const { data: lines, error: lineErr } = await sb
    .from('trade_line_items')
    .select('trade_item_id, quantity')
    .eq('trade_id', tradeId);
  if (lineErr) throw lineErr;

  // Try to reserve each unique item by reading its current values and updating.
  // If two acceptors race and over-reserve, the check constraint trips.
  const byItem = new Map();
  for (const l of lines) byItem.set(l.trade_item_id, (byItem.get(l.trade_item_id) || 0) + l.quantity);

  for (const [itemId, qty] of byItem) {
    const { data: cur, error } = await sb
      .from('trade_items')
      .select('quantity, reserved')
      .eq('id', itemId)
      .single();
    if (error) throw error;
    const newReserved = cur.reserved + qty;
    if (newReserved > cur.quantity) throw new Error('item_unavailable');
    const { error: upErr } = await sb
      .from('trade_items')
      .update({ reserved: newReserved })
      .eq('id', itemId);
    if (upErr) throw upErr;
  }

  const { error: stErr } = await sb
    .from('trades')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', tradeId);
  if (stErr) throw stErr;
  await data._autoShareAddress(tradeId);
};

data.rejectTrade = async function (tradeId) {
  const { error } = await sb
    .from('trades')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', tradeId);
  if (error) throw error;
};

data.markCountered = async function (tradeId) {
  const { error } = await sb
    .from('trades')
    .update({ status: 'countered', responded_at: new Date().toISOString() })
    .eq('id', tradeId);
  if (error) throw error;
};

// Free reservations from a trade that didn't complete (rejected after accept, etc.)
data._releaseReservations = async function (tradeId) {
  const { data: lines } = await sb.from('trade_line_items').select('trade_item_id, quantity').eq('trade_id', tradeId);
  const byItem = new Map();
  for (const l of (lines || [])) byItem.set(l.trade_item_id, (byItem.get(l.trade_item_id) || 0) + l.quantity);
  for (const [itemId, qty] of byItem) {
    const { data: cur } = await sb.from('trade_items').select('quantity, reserved').eq('id', itemId).single();
    if (!cur) continue;
    const newReserved = Math.max(0, cur.reserved - qty);
    await sb.from('trade_items').update({ reserved: newReserved }).eq('id', itemId);
  }
};

data.cancelTrade = async function (tradeId, status = 'cancelled') {
  await data._releaseReservations(tradeId);
  const { error } = await sb.from('trades').update({ status }).eq('id', tradeId);
  if (error) throw error;
};

data.markShipped = async function (tradeId, side) {
  const col = side === 'proposer' ? 'proposer_shipped_at' : 'recipient_shipped_at';
  const { error } = await sb.from('trades').update({ [col]: new Date().toISOString() }).eq('id', tradeId);
  if (error) throw error;
};

data.markReceived = async function (tradeId, side) {
  // side here is which side RECEIVED. We need the column for the receiver.
  const col = side === 'proposer' ? 'proposer_received_at' : 'recipient_received_at';
  const { error } = await sb.from('trades').update({ [col]: new Date().toISOString() }).eq('id', tradeId);
  if (error) throw error;

  // If both received, mark complete and clear reservations + consume offered qty.
  const { data: t } = await sb.from('trades').select('*').eq('id', tradeId).single();
  if (t.proposer_received_at && t.recipient_received_at && t.status === 'accepted') {
    const { data: lines } = await sb.from('trade_line_items').select('trade_item_id, quantity').eq('trade_id', tradeId);
    const byItem = new Map();
    for (const l of (lines || [])) byItem.set(l.trade_item_id, (byItem.get(l.trade_item_id) || 0) + l.quantity);
    for (const [itemId, qty] of byItem) {
      const { data: cur } = await sb.from('trade_items').select('quantity, reserved').eq('id', itemId).single();
      if (!cur) continue;
      // Burn the qty from both quantity and reserved.
      const newQty = Math.max(0, cur.quantity - qty);
      const newRes = Math.max(0, cur.reserved - qty);
      if (newQty === 0) {
        await sb.from('trade_items').delete().eq('id', itemId);
      } else {
        await sb.from('trade_items').update({ quantity: newQty, reserved: newRes }).eq('id', itemId);
      }
    }
    await sb.from('trades').update({ status: 'completed' }).eq('id', tradeId);
  }
};

data.setAddress = async function (tradeId, address) {
  const { error } = await sb.from('trade_addresses').upsert({
    trade_id: tradeId,
    user_id: window.currentUser.id,
    address,
  });
  if (error) throw error;
};

data.getAddresses = async function (tradeId) {
  const { data: rows, error } = await sb
    .from('trade_addresses')
    .select('*')
    .eq('trade_id', tradeId);
  if (error) throw error;
  return rows;
};

// ─── User account ───────────────────────────────────────────────────
data.getMyAddress = async function () {
  const { data: row, error } = await sb
    .from('user_addresses')
    .select('address')
    .eq('user_id', window.currentUser.id)
    .maybeSingle();
  if (error) {
    // If the migration hasn't run yet, the table doesn't exist; treat as empty.
    console.warn('getMyAddress', error);
    return '';
  }
  return row?.address ?? '';
};

data.setMyAddress = async function (address) {
  const { error } = await sb.from('user_addresses').upsert({
    user_id: window.currentUser.id,
    address,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
};

data.updateUsername = async function (username) {
  const { error } = await sb
    .from('profiles')
    .update({ username })
    .eq('id', window.currentUser.id);
  if (error) throw error;
  window.currentUser.username = username;
};

data.updateEmail = async function (email) {
  const { error } = await sb.auth.updateUser({ email });
  if (error) throw error;
  // Supabase sends a confirmation email; the change takes effect after they click.
};

// ─── Admin: cross-user inspection ─────────────────────────────────
// These all rely on the RLS policies from migration 0005 — non-admins will
// see only their own data even if they call these.

data.adminListUsers = async function () {
  const { data: rows, error } = await sb
    .from('profiles')
    .select('id, username, is_admin, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Enrich with feedback summary
  const { data: fb } = await sb.from('user_feedback_summary').select('*');
  const byId = new Map((fb || []).map((f) => [f.user_id, f]));
  return rows.map((r) => ({ ...r, feedback: byId.get(r.id) || null }));
};

data.adminUserSnapshot = async function (userId) {
  // Find the user's owned collection (the one auto-created on signup).
  const { data: col } = await sb
    .from('collections')
    .select('id, name')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  let plushies = [];
  let wishlist = [];
  let pens = [];
  if (col) {
    const cid = col.id;
    const [{ data: p }, { data: w }, { data: pn }] = await Promise.all([
      sb.from('plushies').select('*').eq('collection_id', cid).order('added_at', { ascending: false }),
      sb.from('wishlist').select('*').eq('collection_id', cid).order('added_at', { ascending: false }),
      sb.from('pen_counts').select('pen_id, count').eq('collection_id', cid),
    ]);
    plushies = (p || []).map((r) => data._rowToItem(r, 'collection'));
    wishlist = (w || []).map((r) => data._rowToItem(r, 'wishlist'));
    pens = pn || [];
    // Resolve photos so the admin actually sees them.
    await Promise.all([...plushies, ...wishlist].map(async (it) => {
      if (it.photoPath) it.photo = await data.photoUrl(it.photoPath);
    }));
  }
  // Trades involving this user
  const { data: trades } = await sb
    .from('trades')
    .select('*, trade_line_items(side, quantity, trade_item:trade_items(id, name, photo_path, catalog_id, owner_id))')
    .or(`proposer_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  // Resolve trade partners' usernames
  const partnerIds = new Set();
  for (const t of (trades || [])) { partnerIds.add(t.proposer_id); partnerIds.add(t.recipient_id); }
  let usernames = new Map();
  if (partnerIds.size) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', [...partnerIds]);
    usernames = new Map((profs || []).map((p) => [p.id, p.username]));
  }
  for (const t of (trades || [])) {
    t.proposer = usernames.get(t.proposer_id) ? { username: usernames.get(t.proposer_id) } : null;
    t.recipient = usernames.get(t.recipient_id) ? { username: usernames.get(t.recipient_id) } : null;
  }
  // Trade items owned by this user
  const { data: tradeItems } = await sb
    .from('trade_items')
    .select('*')
    .eq('owner_id', userId);
  // Feedback summary
  const fb = await data.getFeedbackSummary(userId);
  return { collection: col, plushies, wishlist, pens, trades: trades || [], tradeItems: tradeItems || [], feedback: fb };
};

// Wipes a user account end-to-end (auth row + cascade through every
// FK-bound table + storage photos for the user's collections). Backed
// by the admin_purge_user RPC; the SECURITY DEFINER function rechecks
// is_admin() on the server so the client-side guard isn't load-bearing.
data.adminPurgeUser = async function (userId) {
  const { error } = await sb.rpc('admin_purge_user', { target: userId });
  if (error) throw error;
};

data.adminUpdateWishlist = async function (wishlistId, patch) {
  const { error } = await sb
    .from('wishlist')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', wishlistId);
  if (error) throw error;
};

data.adminDeleteWishlist = async function (wishlistId) {
  const { error } = await sb.from('wishlist').delete().eq('id', wishlistId);
  if (error) throw error;
};

// Write feedback for a trade — accepts the structured thumbs ratings
// (each boolean | null) plus an optional comment. The legacy `rating`
// enum is derived from the average of the thumbs (>=66% good, <=33%
// bad, else meh) so old code paths and the user_feedback_summary view's
// fallback math keep working.
data.leaveFeedback = async function (tradeId, rateeId, ratings, comment) {
  const enumRating = deriveEnumRating(ratings);
  const { error } = await sb.from('trade_feedback').insert({
    trade_id: tradeId,
    rater_id: window.currentUser.id,
    ratee_id: rateeId,
    rating: enumRating,
    rating_communication: ratings.communication,
    rating_shipping:      ratings.shipping,
    rating_accuracy:      ratings.accuracy,
    comment: comment ?? null,
  });
  if (error) throw error;
};

// Edit an existing feedback row. The DB policy enforces the 7-day
// window; we don't double-check here so a clock skew on the client
// never wins over the server.
data.updateFeedback = async function (tradeId, ratings, comment) {
  const enumRating = deriveEnumRating(ratings);
  const { error } = await sb
    .from('trade_feedback')
    .update({
      rating: enumRating,
      rating_communication: ratings.communication,
      rating_shipping:      ratings.shipping,
      rating_accuracy:      ratings.accuracy,
      comment: comment ?? null,
    })
    .eq('trade_id', tradeId)
    .eq('rater_id', window.currentUser.id);
  if (error) throw error;
};

function deriveEnumRating(r) {
  const vals = [r.communication, r.shipping, r.accuracy].filter((x) => x === true || x === false);
  if (vals.length === 0) return 'meh';
  const ups = vals.filter((x) => x === true).length;
  const pct = ups / vals.length;
  if (pct >= 0.66) return 'good';
  if (pct <= 0.33) return 'bad';
  return 'meh';
}

data.getFeedbackForTrade = async function (tradeId) {
  const { data: rows, error } = await sb
    .from('trade_feedback')
    .select('*')
    .eq('trade_id', tradeId);
  if (error) throw error;
  return rows;
};

// All feedback rows I've left, keyed by trade_id. Used to flip the
// completed-trade action between "Leave feedback" and "Edit feedback"
// at render time without an extra query per row.
data.listMyFeedback = async function () {
  const { data: rows, error } = await sb
    .from('trade_feedback')
    .select('*')
    .eq('rater_id', window.currentUser.id);
  if (error) throw error;
  const out = {};
  for (const r of rows) out[r.trade_id] = r;
  return out;
};

// My own feedback row on a specific trade, if I've left one. Used to
// prefill the edit-feedback UI for completed trades.
data.getMyFeedbackForTrade = async function (tradeId) {
  const { data: row, error } = await sb
    .from('trade_feedback')
    .select('*')
    .eq('trade_id', tradeId)
    .eq('rater_id', window.currentUser.id)
    .maybeSingle();
  if (error) throw error;
  return row;
};

data._tradeItemFromRow = function (r) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    kind: r.kind,
    name: r.name,
    catalogId: r.catalog_id,
    catalogHandle: r.catalog_handle,
    photoPath: r.photo_path || null,
    photo: null,
    quantity: r.quantity,
    reserved: r.reserved,
    available: r.quantity - r.reserved,
    notes: r.notes,
    createdAt: r.created_at ? +new Date(r.created_at) : Date.now(),
  };
};

// Ship-first rule: net score gap ≥ 3 AND lower side < 20 → lower ships first.
data.whoShipsFirst = function (myNet, theirNet) {
  const gap = Math.abs(myNet - theirNet);
  if (gap < 3) return 'simultaneous';
  const lower = Math.min(myNet, theirNet);
  if (lower >= 20) return 'simultaneous';
  return myNet < theirNet ? 'me' : 'them';
};

window.data = data;
