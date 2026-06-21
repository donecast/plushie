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
  appSettings: {},              // key → parsed jsonb value, loaded at boot

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

  // Attach a clothing accessory (a collection row) to the plush wearing
  // it, or pass null to detach. A dedicated column update so it never
  // rides through _itemToRow / put() — edits and qty changes leave
  // worn_by untouched because that column isn't in the upsert payload.
  async setWornBy(itemId, wearerId) {
    const { error } = await sb
      .from('plushies')
      .update({ worn_by: wearerId, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) throw error;
  },

  // Per-item visibility (item 11). A dedicated column update so it never rides
  // through _itemToRow — that keeps ordinary saves working even before the
  // 0031 migration adds the column (this call just no-ops with a warning).
  async setItemVisibility(itemId, visibility) {
    const { error } = await sb
      .from('plushies')
      .update({ visibility })
      .eq('id', itemId);
    if (error) throw error;
  },

  // Persist a manual collection ordering (item 20). `orderedIds` is the full
  // sequence; we write each row's sort_order = its index. One update per row
  // keeps it RLS-safe. Tolerates the column not existing yet (pre-0029).
  async saveCollectionOrder(orderedIds) {
    const now = new Date().toISOString();
    const results = await Promise.all(orderedIds.map((id, i) =>
      sb.from('plushies').update({ sort_order: i, updated_at: now }).eq('id', id)));
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  },

  // ─── Photos (R2 via Worker, with Supabase Storage fallback) ──────
  // Routing is controlled by window.R2_BASE in config.js:
  //   * empty / unset → legacy Supabase Storage 'photos' bucket
  //   * set to Worker URL → all uploads PUT to R2, reads return the
  //     Worker URL directly.
  // Same path schema (<collection_id>/<id>.<ext>) on both sides so the
  // photo_path column in the DB is unchanged across the migration.
  async uploadPhoto(blob, id) {
    const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
    const path = `${data.collectionId}/${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
    return await data._uploadToStorage('photos', path, blob);
  },

  // Used by the admin backfill tool which iterates other people's
  // plushies + wishlist rows.
  async adminUploadPhoto(blob, collectionId, id) {
    const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
    const path = `${collectionId}/${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
    return await data._uploadToStorage('photos', path, blob);
  },

  async photoUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return await data._urlFor('photos', path);
  },

  // ─── Routing helpers ─────────────────────────────────────────────
  async _uploadToStorage(bucket, path, blob) {
    // Re-uploading to an existing path (e.g. replacing a collection
    // photo) must invalidate any cached URL so the next render fetches
    // the new image instead of the stale signed URL.
    data._photoUrlCache.delete(`${bucket}:${path}`);
    if (window.R2_BASE) {
      return await data._r2Put(bucket, path, blob);
    }
    const { error } = await sb.storage
      .from(bucket)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    return path;
  },

  async _r2Put(bucket, path, blob) {
    const base = (window.R2_BASE || '').replace(/\/$/, '');
    if (!base) throw new Error('R2 not configured');
    const { data: session } = await sb.auth.getSession();
    const jwt = session?.session?.access_token;
    if (!jwt) throw new Error('no session');
    const url = `${base}/${bucket}/${path}`;
    const resp = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: {
        'content-type': blob.type || 'image/jpeg',
        'authorization': `Bearer ${jwt}`,
      },
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`R2 upload ${resp.status}: ${detail.slice(0, 120)}`);
    }
    return path;
  },

  async _r2Delete(bucket, path) {
    const base = (window.R2_BASE || '').replace(/\/$/, '');
    if (!base || !path) return;
    const { data: session } = await sb.auth.getSession();
    const jwt = session?.session?.access_token;
    if (!jwt) return;
    await fetch(`${base}/${bucket}/${path}`, {
      method: 'DELETE',
      headers: { 'authorization': `Bearer ${jwt}` },
    }).catch(() => {});
  },

  async _urlFor(bucket, path) {
    if (!path) return null;
    // Same cache for both code paths — short-circuits a re-fetch on
    // every render. R2 URLs are stable; Supabase signed URLs valid
    // for an hour. Cache both for the session.
    if (data._photoUrlCache.has(`${bucket}:${path}`)) return data._photoUrlCache.get(`${bucket}:${path}`);
    let url = null;
    if (window.R2_BASE) {
      const base = window.R2_BASE.replace(/\/$/, '');
      url = `${base}/${bucket}/${path}`;
    } else {
      const { data: signed, error } = await sb
        .storage.from(bucket)
        .createSignedUrl(path, 3600);
      if (error) { console.warn('signed url failed', path, error); return null; }
      url = signed.signedUrl;
    }
    data._photoUrlCache.set(`${bucket}:${path}`, url);
    return url;
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
        missingAccessories: Array.isArray(r.missing_accessories) ? r.missing_accessories : [],
        retired: r.retired,
        quantity: r.quantity ?? 1,
        wornBy: r.worn_by || null,
        sortOrder: r.sort_order ?? null,
        visibility: r.visibility || 'friends',
        // Set only on user-added off-catalog clothing ('full' | 'mini').
        // null for everything sourced from the catalog.
        clothingScale: r.clothing_scale || null,
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
      // Keep has_bag in sync with the new missing_accessories array
      // for older clients that still read it — flip to false whenever
      // the new array contains any tote/bag entry.
      const missing = Array.isArray(item.missingAccessories) ? item.missingAccessories : [];
      const stillHasBag = !missing.some((a) => /\bbag\b/i.test(a));
      return {
        ...base,
        nickname: item.nickname ?? null,
        meaning: item.meaning ?? null,
        date_collected: item.dateCollected ?? null,
        acquired_how: item.acquiredHow ?? null,
        has_bag: stillHasBag,
        missing_accessories: missing,
        retired: !!item.retired,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
        clothing_scale: item.clothingScale ?? null,
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
    .eq('archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const items = rows.map(data._tradeItemFromRow);
  await Promise.all(items.map(async (it) => {
    if (it.photoPath) it.photo = await data.photoUrl(it.photoPath);
  }));
  return items;
};

data.addTradeItem = async function ({ kind, catalogId, catalogHandle, name, photoPath, photoSocialPath, quantity, notes }) {
  const insert = {
    owner_id: window.currentUser.id,
    kind, catalog_id: catalogId, catalog_handle: catalogHandle,
    name, photo_path: photoPath ?? null,
    photo_social_path: photoSocialPath ?? null,
    quantity, notes: notes ?? null,
  };
  // photo_social_path arrived in migration 0024 — if it hasn't been run
  // yet, PostgREST rejects the unknown column; strip it and retry so
  // listing for trade still works (the photo just won't reach Browse).
  let attempts = 0;
  while (attempts++ < 2) {
    const { data: row, error } = await sb.from('trade_items').insert(insert).select().single();
    if (!error) return data._tradeItemFromRow(row);
    const missing = /Could not find the '(\w+)' column/i.exec(error.message || '');
    if (missing && missing[1] in insert) {
      console.warn(`[addTradeItem] missing column ${missing[1]}; retrying without it`);
      delete insert[missing[1]];
      continue;
    }
    throw error;
  }
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
  // Try a hard delete first. If the item is referenced by any
  // trade_line_items (a current or historical trade), the FK is
  // ON DELETE RESTRICT and Postgres rejects it with code 23503. In
  // that case fall back to a soft-delete: mark archived = true so the
  // item disappears from the owner's offerings and from Browse while
  // the historical trade record keeps its reference intact.
  const { error } = await sb.from('trade_items').delete().eq('id', id);
  if (!error) return;
  const isFkViolation = error.code === '23503'
    || /foreign key|violates|referenced/i.test(error.message || '');
  if (!isFkViolation) throw error;
  const { error: archiveErr } = await sb
    .from('trade_items')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (archiveErr) throw archiveErr;
};

// ─── Discovery ─────────────────────────────────────────────────────
data.browseOfferings = async function () {
  // All offerings except the current user's, where at least one unit is unreserved.
  const { data: rows, error } = await sb
    .from('trade_items')
    .select('id, owner_id, name, catalog_id, catalog_handle, photo_path, photo_social_path, quantity, reserved, notes, created_at, kind')
    .eq('kind', 'offering')
    .eq('archived', false)
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
  // Resolve photos from the public 'social' bucket (photo_social_path),
  // not photoPath — the 'photos' bucket is collection-scoped and other
  // users' objects there are unreadable (400s). Items listed before
  // migration 0024, or whose copy-to-social failed, have no social path;
  // the card renderer falls back to the catalog image (keyed by
  // catalog_id) for those.
  await Promise.all(items.map(async (it) => {
    if (it.photoSocialPath) it.photo = await data.socialPhotoUrl(it.photoSocialPath);
  }));
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
  // Defensive: a trade reaches 'rejected' from 'pending' (no
  // reservations yet) in the normal flow, but if something ever
  // routes a previously-accepted trade through here, drop its
  // reservations so they don't get stuck.
  await data._releaseReservations(tradeId).catch(() => {});
  const { error } = await sb
    .from('trades')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', tradeId);
  if (error) throw error;
};

data.markCountered = async function (tradeId) {
  await data._releaseReservations(tradeId).catch(() => {});
  const { error } = await sb
    .from('trades')
    .update({ status: 'countered', responded_at: new Date().toISOString() })
    .eq('id', tradeId);
  if (error) throw error;
};

// Free reservations from a trade that didn't complete (rejected after
// accept, fell-through confirmed, etc.). Routes through a SECURITY
// DEFINER RPC so the decrement bypasses the trade_items.write RLS
// policy (which only allows the owner) — the canceller is often the
// other party, and used to silently no-op leaving stuck reservations.
data._releaseReservations = async function (tradeId) {
  const { error } = await sb.rpc('release_trade_reservations', { target_trade: tradeId });
  if (error) throw error;
};

data.cancelTrade = async function (tradeId, status = 'cancelled') {
  await data._releaseReservations(tradeId);
  const { error } = await sb
    .from('trades')
    .update({
      status,
      // Clear any in-flight fall-through request — relevant when the
      // partner confirmed and we're routing through cancelTrade.
      fell_through_requested_by: null,
      fell_through_requested_at: null,
    })
    .eq('id', tradeId);
  if (error) throw error;
};

// Two-party fall-through:
//   * requestFellThrough — caller flags 'I think this fell through'.
//     Trade stays accepted; partner sees a confirm/dispute banner.
//   * confirmFellThrough — the OTHER party confirms; we run the full
//     cancelTrade path (release reservations, status=cancelled).
//   * disputeFellThrough — the OTHER party disagrees; clear the
//     request and the trade keeps going.
//   * withdrawFellThrough — the requester takes it back.

data.requestFellThrough = async function (tradeId) {
  const { error } = await sb
    .from('trades')
    .update({
      fell_through_requested_by: window.currentUser.id,
      fell_through_requested_at: new Date().toISOString(),
    })
    .eq('id', tradeId);
  if (error) throw error;
};

data.withdrawFellThrough = async function (tradeId) {
  const { error } = await sb
    .from('trades')
    .update({
      fell_through_requested_by: null,
      fell_through_requested_at: null,
    })
    .eq('id', tradeId)
    .eq('fell_through_requested_by', window.currentUser.id);
  if (error) throw error;
};

// Opening a dispute: caller is the side that disagrees with the
// fall-through request. We save their statement, mark the trade as
// disputed, and clear the fell-through request fields (the dispute
// supersedes them). The other side will get prompted for their own
// statement next time they open the trade.
data.openDisputeWithStatement = async function (tradeId, statement) {
  const uid = window.currentUser.id;
  // Figure out which side I am so we save into the right column.
  const { data: t, error: tErr } = await sb
    .from('trades')
    .select('proposer_id, recipient_id')
    .eq('id', tradeId)
    .single();
  if (tErr) throw tErr;
  const sideCol = t.proposer_id === uid ? 'dispute_proposer_statement' : 'dispute_recipient_statement';
  const sideAtCol = t.proposer_id === uid ? 'dispute_proposer_statement_at' : 'dispute_recipient_statement_at';
  const update = {
    dispute_open: true,
    dispute_opened_by: uid,
    dispute_opened_at: new Date().toISOString(),
    fell_through_requested_by: null,
    fell_through_requested_at: null,
  };
  update[sideCol] = statement;
  update[sideAtCol] = new Date().toISOString();
  const { error } = await sb
    .from('trades')
    .update(update)
    .eq('id', tradeId);
  if (error) throw error;
};

// The non-opening side adds their statement to an already-open dispute.
data.addDisputeStatement = async function (tradeId, statement) {
  const uid = window.currentUser.id;
  const { data: t, error: tErr } = await sb
    .from('trades')
    .select('proposer_id, recipient_id')
    .eq('id', tradeId)
    .single();
  if (tErr) throw tErr;
  const sideCol = t.proposer_id === uid ? 'dispute_proposer_statement' : 'dispute_recipient_statement';
  const sideAtCol = t.proposer_id === uid ? 'dispute_proposer_statement_at' : 'dispute_recipient_statement_at';
  const update = {};
  update[sideCol] = statement;
  update[sideAtCol] = new Date().toISOString();
  const { error } = await sb
    .from('trades')
    .update(update)
    .eq('id', tradeId);
  if (error) throw error;
};

// Admin queue: every trade in a dispute, regardless of whether both
// statements are filed yet. Sorted oldest-first so the trickiest get
// addressed before they age. Returns the full trade row so the queue
// can render usernames + line items.
data.adminListDisputes = async function () {
  const { data: rows, error } = await sb
    .from('trades')
    .select(`*,
      trade_line_items (
        side, quantity,
        trade_item:trade_items (id, name, photo_path, catalog_id, owner_id)
      )
    `)
    .eq('dispute_open', true)
    .order('dispute_opened_at', { ascending: true });
  if (error) throw error;
  // Resolve usernames so the UI can show @handles instead of UUIDs.
  const uids = new Set();
  for (const r of rows) {
    if (r.proposer_id) uids.add(r.proposer_id);
    if (r.recipient_id) uids.add(r.recipient_id);
  }
  if (uids.size > 0) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', [...uids]);
    const map = new Map((profs || []).map((p) => [p.id, p.username]));
    for (const r of rows) {
      r.proposer = { username: map.get(r.proposer_id) || '?' };
      r.recipient = { username: map.get(r.recipient_id) || '?' };
    }
  }
  return rows;
};

data.adminResolveDispute = async function (tradeId, outcome, notes) {
  const uid = window.currentUser.id;
  if (outcome === 'cancelled') {
    await data._releaseReservations(tradeId);
  }
  // 'restored' → trade goes back to accepted, dispute closes.
  // 'completed' → admin forces the trade complete (rare but possible
  // if both sides actually received and one is being unreasonable).
  // 'cancelled' → reservations released above; status flipped here.
  const update = {
    dispute_open: false,
    dispute_outcome: outcome,
    dispute_admin_notes: notes || null,
    dispute_resolved_at: new Date().toISOString(),
    dispute_resolved_by: uid,
  };
  if (outcome === 'cancelled') update.status = 'cancelled';
  if (outcome === 'completed') update.status = 'completed';
  // 'restored' leaves status as 'accepted' — nothing else to change.
  const { error } = await sb
    .from('trades')
    .update(update)
    .eq('id', tradeId);
  if (error) throw error;
};

// Legacy alias — kept so any cached client builds calling the old
// name still work. The new flow opens a dispute via the statement
// modal in the UI; this method is no longer wired from the client.
data.disputeFellThrough = async function (tradeId) {
  const { error } = await sb
    .from('trades')
    .update({
      fell_through_requested_by: null,
      fell_through_requested_at: null,
    })
    .eq('id', tradeId)
    .neq('fell_through_requested_by', window.currentUser.id);
  if (error) throw error;
};

data.confirmFellThrough = async function (tradeId) {
  // Identical effect to cancelTrade; provided as a separate method
  // so the UI can be explicit about which path it's taking.
  await data.cancelTrade(tradeId, 'cancelled');
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

// Structured default shipping address (item 7). Falls back gracefully if the
// 0028 migration hasn't been applied (the extra columns won't exist yet) by
// returning just the legacy blob in `address`.
data.getMyAddressFull = async function () {
  const cols = 'recipient_name, line1, line2, city, region, postal, country, verified, verified_at, address';
  let { data: row, error } = await sb
    .from('user_addresses')
    .select(cols)
    .eq('user_id', window.currentUser.id)
    .maybeSingle();
  if (error) {
    // Pre-0027 schema: retry with just the legacy blob.
    const fallback = await sb
      .from('user_addresses')
      .select('address')
      .eq('user_id', window.currentUser.id)
      .maybeSingle();
    row = fallback.data || null;
  }
  return {
    recipientName: row?.recipient_name ?? '',
    line1: row?.line1 ?? '',
    line2: row?.line2 ?? '',
    city: row?.city ?? '',
    region: row?.region ?? '',
    postal: row?.postal ?? '',
    country: row?.country ?? '',
    verified: !!row?.verified,
    legacy: row?.address ?? '',
  };
};

// Compose the structured fields into the legacy one-line(ish) blob used by the
// trade address-exchange UI.
data.composeAddress = function (a) {
  return [
    a.recipientName,
    a.line1,
    a.line2,
    [a.city, a.region, a.postal].filter(Boolean).join(', '),
    a.country,
  ].map((s) => (s || '').trim()).filter(Boolean).join('\n');
};

data.setMyAddressFull = async function (a, { verified = false } = {}) {
  const address = data.composeAddress(a);
  const patch = {
    user_id: window.currentUser.id,
    recipient_name: a.recipientName || null,
    line1: a.line1 || null,
    line2: a.line2 || null,
    city: a.city || null,
    region: a.region || null,
    postal: a.postal || null,
    country: a.country || null,
    verified,
    verified_at: verified ? new Date().toISOString() : null,
    address,
    updated_at: new Date().toISOString(),
  };
  let { error } = await sb.from('user_addresses').upsert(patch);
  if (error) {
    // Pre-0027 schema: fall back to writing just the legacy blob so the user
    // isn't blocked before the migration lands.
    console.warn('setMyAddressFull (structured) failed, falling back to blob', error);
    const fb = await sb.from('user_addresses').upsert({
      user_id: window.currentUser.id, address, updated_at: new Date().toISOString(),
    });
    if (fb.error) throw fb.error;
  }
  return address;
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

// When did the username last change? Used to show the 30-day cooldown hint
// (item 8). Returns a Date or null. Tolerates the column not existing yet.
data.getUsernameChangedAt = async function () {
  const { data: row, error } = await sb
    .from('profiles')
    .select('username_updated_at')
    .eq('id', window.currentUser.id)
    .maybeSingle();
  if (error) { console.warn('getUsernameChangedAt', error); return null; }
  return row?.username_updated_at ? new Date(row.username_updated_at) : null;
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
    .select('id, username, is_admin, created_at, photo_uploads_enabled, custom_clothing_enabled')
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


// ─── Catalog items (admin-curated additions to the Shopify feed) ──
// Approved rows merge into state.catalog client-side so they show up
// in the Catalog tab next to live Shopify products. The catalog
// bucket holds their images; we sign URLs for display, the addFromCatalog
// snapshot then re-fetches and uploads to the user's own folder.

data.catalogImageUrl = async function (path) {
  if (!path) return null;
  return await data._urlFor('catalog', path);
};

// Approved items only — fed into state.catalog merge.
data.listApprovedCatalogItems = async function () {
  const { data: rows, error } = await sb
    .from('catalog_items')
    .select('*')
    .eq('status', 'approved');
  if (error) throw error;
  // Resolve image URLs in parallel so the catalog grid has photos
  // ready when we render.
  await Promise.all(rows.map(async (r) => {
    r.image = r.image_path ? await data.catalogImageUrl(r.image_path) : null;
  }));
  return rows;
};

// Admin queue: everything not yet seen plus everything still pending.
data.adminListCatalogPending = async function () {
  const { data: rows, error } = await sb
    .from('catalog_items')
    .select('*')
    .or('status.eq.pending,review_seen.eq.false')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  await Promise.all(rows.map(async (r) => {
    r.image = r.image_path ? await data.catalogImageUrl(r.image_path) : null;
  }));
  return rows;
};

// Upload an image (Blob) to the 'catalog' bucket. Returns the path.
// Path format: 'items/<slug>-<random>.<ext>'. The random suffix lets
// admin re-upload without colliding with the previous version.
data.uploadCatalogImage = async function (blob, slug) {
  const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const safeSlug = (slug || 'item').replace(/[^a-z0-9-]/gi, '-').slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `items/${safeSlug}-${rand}.${ext === 'jpeg' ? 'jpg' : ext}`;
  return await data._uploadToStorage('catalog', path, blob);
};

// Upload to suggestions/ prefix instead. Anyone authenticated can do
// this (the suggestions RLS policy permits it). The catalog_items
// row's image_path stays null until admin approves a suggestion.
data.uploadCatalogSuggestionImage = async function (blob, slug) {
  const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const safeSlug = (slug || 'item').replace(/[^a-z0-9-]/gi, '-').slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `suggestions/${safeSlug}-${rand}.${ext === 'jpeg' ? 'jpg' : ext}`;
  return await data._uploadToStorage('catalog', path, blob);
};

// Create a catalog_items row. Three paths:
//   * Admin: status='approved' on insert (RLS allows because is_admin()).
//   * Trusted submitter (>=1 prior approved row): status='approved' on
//     insert, review_seen left false so admin still sees it in queue.
//   * Untrusted submitter: status='pending'.
// If the caller doesn't pass an explicit status, we resolve it from
// the trust check. RLS in 0015 enforces this server-side too.
data.createCatalogItem = async function (record) {
  let status = record.status;
  if (!status) {
    if (window.currentUser?.isAdmin) status = 'approved';
    else status = (await data.userIsTrustedSubmitter()) ? 'approved' : 'pending';
  }
  const insert = {
    name: record.name,
    handle: record.handle,
    type: record.type || 'plush',
    parent_handle: record.parent_handle || null,
    form_label: record.form_label || null,
    image_path: record.image_path || null,
    description: record.description || null,
    lore: record.lore || null,
    symbolism: record.symbolism || null,
    tags: record.tags || [],
    accessories: Array.isArray(record.accessories) ? record.accessories : [],
    release_year: record.release_year ?? null,
    available: record.available !== false,
    retired: !!record.retired,
    status,
    submitted_by: window.currentUser.id,
    notes_to_admin: record.notes_to_admin || null,
    // review_seen stays false on submit so trusted-user submissions
    // still show up in the admin queue for retroactive review.
    approved_by: status === 'approved' ? window.currentUser.id : null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
  };
  const { data: row, error } = await sb
    .from('catalog_items')
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  return row;
};

// Admin-only update of an existing catalog item. RLS enforces admin
// in the database; we only call this from the admin edit modal. Patch
// is partial — pass exactly the columns you want to change.
data.adminUpdateCatalogItem = async function (id, patch) {
  const { data: row, error } = await sb
    .from('catalog_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return row;
};

// True when the current user has at least one approved catalog_items
// submission. Trusted users' future submissions skip the queue (still
// flagged for retroactive admin review via review_seen = false).
data.userIsTrustedSubmitter = async function () {
  const { count, error } = await sb
    .from('catalog_items')
    .select('id', { count: 'exact', head: true })
    .eq('submitted_by', window.currentUser.id)
    .eq('status', 'approved');
  if (error) { console.warn('trust check failed', error); return false; }
  return (count || 0) >= 1;
};

// Find users by username prefix — used by the admin 'pick from a
// user's collection' helper in the Add Catalog Item modal.
data.adminFindUsersByPrefix = async function (prefix, limit = 8) {
  if (!prefix) return [];
  const { data: rows, error } = await sb
    .from('profiles')
    .select('id, username')
    .ilike('username', prefix + '%')
    .limit(limit);
  if (error) throw error;
  return rows || [];
};

// Read a single user's plushies (admin-only via 0005 RLS). Used by
// the admin photo picker — admin types a username, sees that user's
// collection thumbnails, clicks one to copy as the catalog item's
// image.
data.adminListUserPlushies = async function (userId) {
  const { data: rows, error } = await sb
    .from('plushies')
    .select('id, name, nickname, catalog_id, photo_path, collection_id')
    .eq('collection_id', sb.from('collections').select('id').eq('owner_id', userId).limit(1))
    .order('added_at', { ascending: false });
  if (error) {
    // Fall back to a two-step lookup if the embedded subquery shape
    // isn't accepted by PostgREST.
    const { data: col } = await sb.from('collections').select('id').eq('owner_id', userId).limit(1).single();
    if (!col) return [];
    const { data: rows2, error: e2 } = await sb
      .from('plushies')
      .select('id, name, nickname, catalog_id, photo_path, collection_id')
      .eq('collection_id', col.id)
      .order('added_at', { ascending: false });
    if (e2) throw e2;
    return rows2 || [];
  }
  return rows || [];
};

// Copy a photo from the 'photos' bucket (per-collection scoped) into
// the 'catalog' bucket (admin-only writes). Used by the picker. The
// admin RLS on photos lets us read; admin RLS on catalog lets us
// write. Returns the new catalog/* path.
data.adminCopyPhotoToCatalog = async function (sourcePhotoPath, slugHint) {
  const { data: signed, error: e1 } = await sb
    .storage.from('photos')
    .createSignedUrl(sourcePhotoPath, 300);
  if (e1) throw e1;
  const resp = await fetch(signed.signedUrl, { mode: 'cors' });
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const blob = await resp.blob();
  return await data.uploadCatalogImage(blob, slugHint || 'item');
};

// Merge a duplicate catalog_items submission into a canonical
// catalog item. winner_id can be a Shopify id (numeric string) or a
// catalog_items UUID. See migration 0015.
data.adminMergeCatalogItem = async function (duplicateId, winnerId) {
  const { error } = await sb.rpc('admin_merge_catalog_item', {
    duplicate_id: duplicateId,
    winner_id: winnerId,
  });
  if (error) throw error;
};

data.adminApproveCatalogItem = async function (id) {
  const { error } = await sb
    .from('catalog_items')
    .update({
      status: 'approved',
      approved_by: window.currentUser.id,
      approved_at: new Date().toISOString(),
      review_seen: true,
    })
    .eq('id', id);
  if (error) throw error;
};

data.adminRejectCatalogItem = async function (id) {
  const { error } = await sb
    .from('catalog_items')
    .update({
      status: 'rejected',
      approved_by: window.currentUser.id,
      approved_at: new Date().toISOString(),
      review_seen: true,
    })
    .eq('id', id);
  if (error) throw error;
};

// Mark a row as having been reviewed without changing status — used
// when admin glances at a trusted-submitter's pre-approved row.
data.adminMarkCatalogReviewSeen = async function (id) {
  const { error } = await sb
    .from('catalog_items')
    .update({ review_seen: true })
    .eq('id', id);
  if (error) throw error;
};


// ─── Photo suggestions ─────────────────────────────────────────────
// Anyone authenticated can suggest a photo for a catalog item that
// lacks one. Submission flow: upload blob via uploadCatalogSuggestionImage,
// then insert a row here pointing to the storage path. Admin reviews
// from the queue, accepts → copy path to catalog_items.image_path.

data.suggestCatalogPhoto = async function ({ targetShopifyId, targetCatalogItemId, targetPenId, imagePath, notes }) {
  const { error } = await sb.from('catalog_photo_suggestions').insert({
    target_shopify_id: targetShopifyId || null,
    target_catalog_item_id: targetCatalogItemId || null,
    target_pen_id: targetPenId || null,
    image_path: imagePath,
    notes: notes || null,
    submitted_by: window.currentUser.id,
  });
  if (error) throw error;
};

// Pen metadata + photo URLs (one row per pen across all users).
// Distinct from data.listPens which returns the CURRENT user's per-pen
// COUNTS. Loaded once at boot; cached in state.pensMeta and merged
// with state.pensOwned at render time.
data.listPenMeta = async function () {
  const { data: rows, error } = await sb
    .from('pens')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  await Promise.all(rows.map(async (r) => {
    r.image = r.image_path ? await data.catalogImageUrl(r.image_path) : null;
  }));
  return rows;
};

data.adminListPhotoSuggestions = async function (status = 'pending') {
  const { data: rows, error } = await sb
    .from('catalog_photo_suggestions')
    .select('*')
    .eq('status', status)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  await Promise.all(rows.map(async (r) => {
    r.image = r.image_path ? await data.catalogImageUrl(r.image_path) : null;
  }));
  return rows;
};

// Approve a suggestion. If the target is a catalog_items UUID, the
// image_path is copied onto that row. If the target is a raw Shopify
// id, we now AUTO-CREATE a catalog_items row first using the Shopify
// product info the caller passes in (name/handle/type — from
// state.catalog client-side). Replaces the earlier 'create one first'
// error path.
data.adminApprovePhotoSuggestion = async function (suggestionId, shopifyProductIfNeeded) {
  const { data: row, error: e1 } = await sb
    .from('catalog_photo_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single();
  if (e1) throw e1;

  // Pen target — direct path. Drop the image_path into the pens row.
  if (row.target_pen_id) {
    const { error: ep } = await sb
      .from('pens')
      .update({ image_path: row.image_path })
      .eq('id', row.target_pen_id);
    if (ep) throw ep;
    const { error: e3 } = await sb
      .from('catalog_photo_suggestions')
      .update({
        status: 'approved',
        reviewed_by: window.currentUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', suggestionId);
    if (e3) throw e3;
    return;
  }

  let targetCatalogId = row.target_catalog_item_id;

  if (!targetCatalogId) {
    if (!shopifyProductIfNeeded || !shopifyProductIfNeeded.name || !shopifyProductIfNeeded.handle) {
      throw new Error('Shopify-targeted suggestion needs the upstream product info passed in.');
    }
    // Don't double-create if a catalog_items row already covers this
    // Shopify product (matched on handle).
    const { data: existing } = await sb
      .from('catalog_items')
      .select('id, image_path')
      .eq('handle', shopifyProductIfNeeded.handle)
      .maybeSingle();
    if (existing) {
      targetCatalogId = existing.id;
    } else {
      const created = await data.createCatalogItem({
        name: shopifyProductIfNeeded.name,
        handle: shopifyProductIfNeeded.handle,
        type: shopifyProductIfNeeded.type || 'plush',
        image_path: row.image_path,
        status: 'approved',
      });
      targetCatalogId = created.id;
    }
  }

  // Always write the image_path through (handles the existing-catalog
  // case AND the freshly-created case where image_path was set on insert).
  const { error: e2 } = await sb
    .from('catalog_items')
    .update({ image_path: row.image_path })
    .eq('id', targetCatalogId);
  if (e2) throw e2;

  const { error: e3 } = await sb
    .from('catalog_photo_suggestions')
    .update({
      status: 'approved',
      reviewed_by: window.currentUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', suggestionId);
  if (e3) throw e3;
};

data.adminRejectPhotoSuggestion = async function (suggestionId) {
  const { error } = await sb
    .from('catalog_photo_suggestions')
    .update({
      status: 'rejected',
      reviewed_by: window.currentUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', suggestionId);
  if (error) throw error;
};


// All plushie + wishlist rows site-wide whose photo_path is still a
// hot-link (starts with http) — i.e. the snapshot failed at add time
// and the card is hanging off the upstream CDN. Used by the admin
// re-snapshot tool. Returns rows annotated with collection_id so the
// backfill knows which Storage folder to upload into.
data.adminListHotlinkedPhotos = async function () {
  const [{ data: ps, error: pe }, { data: ws, error: we }] = await Promise.all([
    sb.from('plushies').select('id, name, catalog_id, photo_path, collection_id').like('photo_path', 'http%'),
    sb.from('wishlist').select('id, name, catalog_id, photo_path, collection_id').like('photo_path', 'http%'),
  ]);
  if (pe) throw pe;
  if (we) throw we;
  return [
    ...(ps || []).map((r) => ({ ...r, kind: 'collection' })),
    ...(ws || []).map((r) => ({ ...r, kind: 'wishlist' })),
  ];
};

data.adminUpdatePhotoPath = async function (kind, id, path) {
  const table = kind === 'collection' ? 'plushies' : 'wishlist';
  const { error } = await sb.from(table).update({ photo_path: path }).eq('id', id);
  if (error) throw error;
};

// Wipes a user account end-to-end (auth row + cascade through every
// FK-bound table + storage photos for the user's collections). The
// SECURITY DEFINER RPC rechecks is_admin() on the server, deletes the
// auth.users row (cascading the public schema), and returns the list
// of collection_ids it owned. We then sweep photos through the
// Storage / R2 APIs — direct DELETE FROM storage.objects from inside
// a SECURITY DEFINER function is no longer allowed by Supabase, which
// is why the RPC stopped at the cascade and handed us the cleanup.
data.adminPurgeUser = async function (userId) {
  const { data: collectionIds, error } = await sb.rpc('admin_purge_user', { target: userId });
  if (error) throw error;
  const ids = Array.isArray(collectionIds) ? collectionIds : [];
  if (ids.length === 0) return;
  // Photos live at <collection_id>/<plushie_id>.<ext>. List then delete.
  // We sweep both backends — once R2 cutover is complete we can drop
  // the Supabase branch.
  for (const cid of ids) {
    try { await data._purgePhotoFolder(cid); }
    catch (e) { console.warn('photo purge failed for collection', cid, e); }
  }
};

data._purgePhotoFolder = async function (collectionId) {
  // Supabase Storage path: list then remove.
  try {
    const { data: rows, error } = await sb.storage.from('photos').list(collectionId, { limit: 1000 });
    if (!error && rows && rows.length) {
      const paths = rows.map((r) => `${collectionId}/${r.name}`);
      await sb.storage.from('photos').remove(paths);
    }
  } catch (e) { console.warn('supabase photo purge', e); }

  // R2 (via the Worker) — only if cutover has happened. We don't
  // have a list endpoint on the Worker yet, so this is a best-effort
  // no-op for now. If R2_BASE isn't set, there's nothing in R2 to
  // clean up anyway. Once a list endpoint is added we can iterate.
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
    // Public 'social'-bucket copy used by Browse so other collectors can
    // see the photo (the owner reads photoPath out of 'photos' directly).
    photoSocialPath: r.photo_social_path || null,
    photo: null,
    quantity: r.quantity,
    reserved: r.reserved,
    available: r.quantity - r.reserved,
    notes: r.notes,
    createdAt: r.created_at ? +new Date(r.created_at) : Date.now(),
  };
};

// ─── App settings (admin-toggled feature flags) ───────────────────
// Live in the app_settings table. Loaded once at boot; admin writes
// patch the cache + DB. featureEnabled() defaults to true so a flag
// that hasn't been seeded yet behaves as "on" — flip a row off to
// gate a feature.
data.loadAppSettings = async function () {
  try {
    const { data: rows, error } = await sb.from('app_settings').select('key, value');
    if (error) throw error;
    const next = {};
    for (const r of rows || []) next[r.key] = r.value;
    data.appSettings = next;
  } catch (e) {
    console.warn('app settings load failed', e);
    data.appSettings = {};
  }
};

// Usernames (lowercase) that are always granted gated features
// regardless of their per-user flag — alongside admins. Kept tiny and
// explicit; add a name here to comp someone before billing exists.
data.ALWAYS_GRANTED_USERNAMES = ['redrambler'];

data.featureEnabled = function (key, defaultValue = true) {
  // Per-user photo uploads: profiles.photo_uploads_enabled, with an
  // unconditional admin override. The global app_settings row from
  // 0017 is no longer consulted for this key — toggling now happens
  // on the per-user admin page.
  if (key === 'feature.user_photo_uploads') {
    if (window.currentUser?.isAdmin) return true;
    // Off by default — only an explicit clearance enables uploads.
    return window.currentUser?.photoUploadsEnabled === true;
  }
  // Private custom clothing: profiles.custom_clothing_enabled, OFF by
  // default. Admins + the allowlist always have it; everyone else needs
  // an admin to flip their flag.
  if (key === 'feature.custom_clothing') {
    if (window.currentUser?.isAdmin) return true;
    const uname = (window.currentUser?.username || '').toLowerCase();
    if (data.ALWAYS_GRANTED_USERNAMES.includes(uname)) return true;
    return window.currentUser?.customClothingEnabled === true;
  }
  const v = data.appSettings[key];
  if (v === undefined || v === null) return defaultValue;
  return v !== false;
};

// Admin toggles another user's photo-upload permission. RLS lets
// admins update any profile row (covered by the existing admin
// policy on profiles); regular users can only update their own.
data.adminSetPhotoUploads = async function (userId, enabled) {
  const { error } = await sb
    .from('profiles')
    .update({ photo_uploads_enabled: !!enabled })
    .eq('id', userId);
  if (error) throw error;
};

// Admin toggles another user's access to private custom clothing. Same
// RLS path as adminSetPhotoUploads (admins can update any profile row).
data.adminSetCustomClothing = async function (userId, enabled) {
  const { error } = await sb
    .from('profiles')
    .update({ custom_clothing_enabled: !!enabled })
    .eq('id', userId);
  if (error) throw error;
};

data.adminSetSetting = async function (key, value) {
  const row = { key, value, updated_at: new Date().toISOString(), updated_by: window.currentUser?.id };
  const { error } = await sb.from('app_settings').upsert(row);
  if (error) throw error;
  data.appSettings[key] = value;
};

// Ship-first rule: net score gap ≥ 3 AND lower side < 20 → lower ships first.
data.whoShipsFirst = function (myNet, theirNet) {
  const gap = Math.abs(myNet - theirNet);
  if (gap < 3) return 'simultaneous';
  const lower = Math.min(myNet, theirNet);
  if (lower >= 20) return 'simultaneous';
  return myNet < theirNet ? 'me' : 'them';
};

// ════════════════════════════════════════════════════════════════════
// Social — friends (Coven), Castle Crew, posts, likes, comments, Top 8.
// Mirrors the trade layer's conventions: denormalized snapshots instead
// of cross-user FKs, usernames resolved in a separate batch query, and
// photos routed through the same storage helpers (here, the 'social'
// bucket from migration 0021).
// ════════════════════════════════════════════════════════════════════

// ─── Social photos ──────────────────────────────────────────────────
data.uploadSocialPhoto = async function (blob) {
  const uid = window.currentUser.id;
  const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const rand = crypto.randomUUID();
  const path = `${uid}/${rand}.${ext === 'jpeg' ? 'jpg' : ext}`;
  return await data._uploadToStorage('social', path, blob);
};

data.socialPhotoUrl = async function (path) {
  if (!path) return null;
  // Absolute URLs and same-origin asset paths (e.g. the seeded
  // '/tom.jpg' mascot) are served as-is; everything else is a 'social'
  // bucket object key that needs a signed/R2 URL.
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return await data._urlFor('social', path);
};

// Copy one of MY collection photos (in the collection-scoped 'photos'
// bucket, unreadable by other users) into the 'social' bucket so it can
// be shown on a public profile / feed. Returns the new social path.
data._copyPhotoToSocial = async function (photosPath) {
  if (!photosPath) return null;
  if (photosPath.startsWith('http')) return photosPath;   // already an external URL
  const url = await data.photoUrl(photosPath);             // signed/R2 url I can read
  if (!url) return null;
  const resp = await fetch(url, { mode: 'cors' });
  if (!resp.ok) throw new Error(`copy-to-social fetch ${resp.status}`);
  return await data.uploadSocialPhoto(await resp.blob());
};

// Batch-resolve profiles → { id → {username, bio, avatar_path, avatarUrl} }.
data._resolveProfiles = async function (ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;
  const { data: rows } = await sb
    .from('profiles')
    .select('id, username, bio, avatar_path')
    .in('id', uniq);
  await Promise.all((rows || []).map(async (p) => {
    map.set(p.id, { ...p, avatarUrl: p.avatar_path ? await data.socialPhotoUrl(p.avatar_path) : null });
  }));
  return map;
};

// ─── Friend graph ───────────────────────────────────────────────────
data.listFriends = async function () {
  const uid = window.currentUser.id;
  const { data: rows, error } = await sb
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  if (error) throw error;
  const otherIds = rows.map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
  const { data: inner } = await sb.from('inner_circle').select('member_id').eq('owner_id', uid);
  const innerSet = new Set((inner || []).map((r) => r.member_id));
  // Coffin Buddies (item 10) — best-effort so older schemas don't break.
  let coffinSet = new Set();
  try {
    const { data: coffin } = await sb.from('coffin_buddies').select('member_id').eq('owner_id', uid);
    coffinSet = new Set((coffin || []).map((r) => r.member_id));
  } catch (e) { console.warn('coffin_buddies load', e); }
  const profs = await data._resolveProfiles(otherIds);
  return otherIds.map((id) => ({
    userId: id,
    username: profs.get(id)?.username ?? 'unknown',
    avatarUrl: profs.get(id)?.avatarUrl ?? null,
    isInner: innerSet.has(id) || coffinSet.has(id),
    isCoffinBuddy: coffinSet.has(id),
  })).sort((a, b) => a.username.localeCompare(b.username));
};

data.listIncomingRequests = async function () {
  const uid = window.currentUser.id;
  const { data: rows, error } = await sb
    .from('friendships')
    .select('requester_id, created_at')
    .eq('addressee_id', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const profs = await data._resolveProfiles(rows.map((r) => r.requester_id));
  return rows.map((r) => ({
    userId: r.requester_id,
    username: profs.get(r.requester_id)?.username ?? 'unknown',
    avatarUrl: profs.get(r.requester_id)?.avatarUrl ?? null,
    createdAt: r.created_at,
  }));
};

data.countPendingFriendRequests = async function () {
  const { count, error } = await sb
    .from('friendships')
    .select('requester_id', { count: 'exact', head: true })
    .eq('addressee_id', window.currentUser.id)
    .eq('status', 'pending');
  if (error) { console.warn('friend req count', error); return 0; }
  return count || 0;
};

// 'none' | 'friends' | 'incoming' (they asked me) | 'outgoing' (I asked)
data.friendshipWith = async function (otherId) {
  const uid = window.currentUser.id;
  const { data: rows, error } = await sb
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${uid})`);
  if (error) throw error;
  const row = (rows || [])[0];
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requester_id === uid ? 'outgoing' : 'incoming';
};

data.sendFriendRequest = async function (otherId) {
  const { error } = await sb.from('friendships').insert({
    requester_id: window.currentUser.id,
    addressee_id: otherId,
  });
  if (error) throw error;
};

data.acceptFriendRequest = async function (requesterId) {
  const { error } = await sb
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', window.currentUser.id);
  if (error) throw error;
};

// Decline an incoming request, cancel an outgoing one, or unfriend —
// all are "delete the row in whichever direction it exists".
data.removeFriend = async function (otherId) {
  const uid = window.currentUser.id;
  const { error } = await sb
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${uid})`);
  if (error) throw error;
  // Also drop them from my Castle Crew if present (best-effort).
  try { await sb.from('inner_circle').delete().eq('owner_id', uid).eq('member_id', otherId); }
  catch (e) { console.warn('inner cleanup', e); }
};

data.setInner = async function (otherId, on) {
  const uid = window.currentUser.id;
  if (on) {
    const { error } = await sb.from('inner_circle').upsert({ owner_id: uid, member_id: otherId });
    if (error) throw error;
  } else {
    // DB trigger cascades the matching coffin_buddies removal (Castle Crew is a
    // prerequisite for Coffin Buddies).
    const { error } = await sb.from('inner_circle').delete().eq('owner_id', uid).eq('member_id', otherId);
    if (error) throw error;
  }
};

// Coffin Buddies (item 10). Adding implies Castle Crew (a DB trigger inserts
// the inner_circle row); removing leaves Castle Crew intact.
data.setCoffinBuddy = async function (otherId, on) {
  const uid = window.currentUser.id;
  if (on) {
    const { error } = await sb.from('coffin_buddies').upsert({ owner_id: uid, member_id: otherId });
    if (error) throw error;
  } else {
    const { error } = await sb.from('coffin_buddies').delete().eq('owner_id', uid).eq('member_id', otherId);
    if (error) throw error;
  }
};

data.searchUsers = async function (prefix, limit = 12) {
  const q = (prefix || '').trim();
  if (!q) return [];
  const { data: rows, error } = await sb
    .from('profiles')
    .select('id, username, avatar_path')
    .ilike('username', q + '%')
    .neq('id', window.currentUser.id)
    .limit(limit);
  if (error) throw error;
  return await Promise.all((rows || []).map(async (r) => ({
    userId: r.id,
    username: r.username,
    avatarUrl: r.avatar_path ? await data.socialPhotoUrl(r.avatar_path) : null,
  })));
};

// ─── Profile ────────────────────────────────────────────────────────
data.getSocialProfile = async function (userId) {
  const { data: row, error } = await sb
    .from('profiles')
    .select('id, username, bio, avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  return { ...row, avatarUrl: row.avatar_path ? await data.socialPhotoUrl(row.avatar_path) : null };
};

data.updateMyProfile = async function ({ bio, avatarBlob }) {
  const patch = {};
  if (bio !== undefined) patch.bio = bio;
  if (avatarBlob instanceof Blob) patch.avatar_path = await data.uploadSocialPhoto(avatarBlob);
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb.from('profiles').update(patch).eq('id', window.currentUser.id);
  if (error) throw error;
};

// ─── Posts ──────────────────────────────────────────────────────────
data.createPost = async function ({ body, visibility, photoBlob, catalogId, plushName }) {
  let photoPath = null;
  if (photoBlob instanceof Blob) photoPath = await data.uploadSocialPhoto(photoBlob);
  const { data: row, error } = await sb.from('posts').insert({
    author_id: window.currentUser.id,
    body: body || null,
    photo_path: photoPath,
    catalog_id: catalogId || null,
    plush_name: plushName || null,
    visibility: visibility || 'friends',
  }).select().single();
  if (error) throw error;
  return row;
};

data.deletePost = async function (postId) {
  const { error } = await sb.from('posts').delete().eq('id', postId);
  if (error) throw error;
};

// Edit an existing post. Partial patch: only the passed keys change.
// `photoBlob` replaces the photo; `removePhoto` clears it. The DB's
// body_or_photo check is also guarded in the UI before this is called.
data.updatePost = async function (postId, { body, visibility, photoBlob, removePhoto, catalogId, plushName }) {
  const patch = { updated_at: new Date().toISOString() };
  if (body !== undefined)       patch.body = body || null;
  if (visibility !== undefined) patch.visibility = visibility;
  if (catalogId !== undefined)  patch.catalog_id = catalogId || null;
  if (plushName !== undefined)  patch.plush_name = plushName || null;
  if (photoBlob instanceof Blob) patch.photo_path = await data.uploadSocialPhoto(photoBlob);
  else if (removePhoto)          patch.photo_path = null;
  const { error } = await sb.from('posts').update(patch).eq('id', postId);
  if (error) throw error;
};

// Shared post → view-object hydration (profiles, likes, comments, photo
// URLs). Used by both the feed and a single profile's post list.
data._hydratePosts = async function (rows) {
  if (!rows || !rows.length) return [];
  const uid = window.currentUser.id;
  const postIds = rows.map((r) => r.id);

  const [{ data: likes }, { data: comments }] = await Promise.all([
    sb.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    // parent_comment_id may not exist pre-0032; select('*') so the query
    // doesn't error on older schemas.
    sb.from('post_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
  ]);

  const likeCount = new Map();
  const likedByMe = new Set();
  for (const l of (likes || [])) {
    likeCount.set(l.post_id, (likeCount.get(l.post_id) || 0) + 1);
    if (l.user_id === uid) likedByMe.add(l.post_id);
  }
  const commentsByPost = new Map();
  for (const c of (comments || [])) {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
    commentsByPost.get(c.post_id).push(c);
  }

  // Comment reactions (item 5) — best-effort so a pre-0032 client still works.
  const commentIds = (comments || []).map((c) => c.id);
  const reactByComment = new Map();
  if (commentIds.length) {
    try {
      const { data: reacts } = await sb.from('comment_reactions')
        .select('comment_id, user_id, emoji').in('comment_id', commentIds);
      for (const r of (reacts || [])) {
        if (!reactByComment.has(r.comment_id)) reactByComment.set(r.comment_id, new Map());
        const m = reactByComment.get(r.comment_id);
        const cur = m.get(r.emoji) || { count: 0, mine: false };
        cur.count++; if (r.user_id === uid) cur.mine = true;
        m.set(r.emoji, cur);
      }
    } catch (e) { console.warn('comment_reactions load', e); }
  }
  const reactionsFor = (cid) => {
    const m = reactByComment.get(cid);
    return m ? [...m.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })) : [];
  };

  // Resolve every author (posts + comment authors) in one batch.
  const ids = new Set(rows.map((r) => r.author_id));
  for (const c of (comments || [])) ids.add(c.author_id);
  const profs = await data._resolveProfiles([...ids]);

  // Build a threaded comment tree (top-level + nested replies), preserving the
  // chronological order the rows already arrived in.
  const buildThread = (list, postAuthorId) => {
    const toView = (c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: profs.get(c.author_id)?.username ?? 'unknown',
      body: c.body,
      createdAt: c.created_at,
      parentId: c.parent_comment_id || null,
      mine: c.author_id === uid,
      canDelete: c.author_id === uid || postAuthorId === uid,
      reactions: reactionsFor(c.id),
      replies: [],
    });
    const byId = new Map();
    const tops = [];
    for (const c of list) byId.set(c.id, toView(c));
    for (const c of list) {
      const v = byId.get(c.id);
      if (v.parentId && byId.has(v.parentId)) byId.get(v.parentId).replies.push(v);
      else tops.push(v);
    }
    return tops;
  };

  return await Promise.all(rows.map(async (r) => ({
    id: r.id,
    authorId: r.author_id,
    authorName: profs.get(r.author_id)?.username ?? 'unknown',
    authorAvatar: profs.get(r.author_id)?.avatarUrl ?? null,
    body: r.body,
    photoUrl: r.photo_path ? await data.socialPhotoUrl(r.photo_path) : null,
    catalogId: r.catalog_id,
    plushName: r.plush_name,
    visibility: r.visibility,
    createdAt: r.created_at,
    // "edited" when updated_at drifts more than a few seconds past
    // created_at (the insert sets them ~equal).
    edited: r.updated_at ? (+new Date(r.updated_at) - +new Date(r.created_at) > 5000) : false,
    mine: r.author_id === uid,
    likeCount: likeCount.get(r.id) || 0,
    likedByMe: likedByMe.has(r.id),
    comments: buildThread(commentsByPost.get(r.id) || [], r.author_id),
    commentCount: (commentsByPost.get(r.id) || []).length,
  })));
};

// The feed: every post RLS lets me see (mine + friends' + public),
// newest first. Early-Facebook style — one global-ish river.
data.listFeed = async function (limit = 60) {
  const { data: rows, error } = await sb
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return await data._hydratePosts(rows);
};

data.listUserPosts = async function (userId, limit = 40) {
  const { data: rows, error } = await sb
    .from('posts')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return await data._hydratePosts(rows);
};

data.toggleLike = async function (postId, on) {
  if (on) {
    const { error } = await sb.from('post_likes').upsert({ post_id: postId, user_id: window.currentUser.id });
    if (error) throw error;
  } else {
    const { error } = await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', window.currentUser.id);
    if (error) throw error;
  }
};

data.addComment = async function (postId, body, parentCommentId = null) {
  const insert = { post_id: postId, author_id: window.currentUser.id, body };
  if (parentCommentId) insert.parent_comment_id = parentCommentId;
  const { data: row, error } = await sb.from('post_comments').insert(insert).select().single();
  if (error) throw error;
  return row;
};

data.deleteComment = async function (commentId) {
  const { error } = await sb.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
};

// Toggle one of my emoji reactions on a comment (item 5).
data.toggleCommentReaction = async function (commentId, emoji, on) {
  const uid = window.currentUser.id;
  if (on) {
    const { error } = await sb.from('comment_reactions')
      .upsert({ comment_id: commentId, user_id: uid, emoji });
    if (error) throw error;
  } else {
    const { error } = await sb.from('comment_reactions')
      .delete().eq('comment_id', commentId).eq('user_id', uid).eq('emoji', emoji);
    if (error) throw error;
  }
};

// Resolve a @username to a user id (for tapping an @mention). Case-insensitive.
data.findUserIdByUsername = async function (username) {
  const { data: row, error } = await sb.from('profiles')
    .select('id').ilike('username', username).maybeSingle();
  if (error) { console.warn('findUserIdByUsername', error); return null; }
  return row?.id || null;
};

// ─── Top 8 ──────────────────────────────────────────────────────────
data.getTopPlushes = async function (userId) {
  const { data: rows, error } = await sb
    .from('top_plushes')
    .select('position, plush_name, catalog_id, photo_path')
    .eq('owner_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return await Promise.all((rows || []).map(async (r) => ({
    position: r.position,
    plushName: r.plush_name,
    catalogId: r.catalog_id,
    photoUrl: r.photo_path ? await data.socialPhotoUrl(r.photo_path) : null,
  })));
};

// Replace my whole Top 8 with `entries` (ordered array, max 8). Each
// entry: { plushName, catalogId?, photoPath? }. photoPath here is the
// item's ORIGINAL 'photos'-bucket path; we copy it into 'social' so
// viewers can see it. Items with a catalogId skip the copy (the client
// renders the catalog image as a reliable fallback).
// Tom — the hidden catalog mascot — always rides along in Top 8 Buns
// until the user fills all 8 of their own. His image is the same-origin
// /tom.jpg asset (no social-bucket copy needed).
data.TOM_TOP = { plushName: 'Tom', catalogId: 'd3adc0de-0000-4000-8000-000000000001', photoPath: '/tom.jpg' };

data.setTopPlushes = async function (entries, { keepTom = true } = {}) {
  const uid = window.currentUser.id;
  let clean = (entries || []).slice(0, 8);
  // Keep Tom present whenever there's a free slot — the picker only knows
  // the user's collection (Tom isn't in it), so without this a save would
  // wipe him out. Unless the user has excommunicated him (keepTom=false).
  const hasTom = clean.some((e) =>
    e.catalogId === data.TOM_TOP.catalogId || (e.plushName || '').trim().toLowerCase() === 'tom');
  if (keepTom && !hasTom && clean.length < 8) clean = [...clean, data.TOM_TOP];

  const rows = [];
  for (let i = 0; i < clean.length; i++) {
    const e = clean[i];
    let photoPath = null;
    if (e.photoPath && (e.photoPath.startsWith('/') || e.photoPath.startsWith('http'))) {
      // Same-origin asset (Tom) or an already-external URL — store as-is.
      photoPath = e.photoPath;
    } else if (!e.catalogId && e.photoPath) {
      try { photoPath = await data._copyPhotoToSocial(e.photoPath); }
      catch (err) { console.warn('top8 photo copy failed', err); }
    }
    rows.push({
      owner_id: uid,
      position: i + 1,
      plush_name: e.plushName,
      catalog_id: e.catalogId || null,
      photo_path: photoPath,
    });
  }
  // Replace-all: clear then insert the new ordering.
  const { error: delErr } = await sb.from('top_plushes').delete().eq('owner_id', uid);
  if (delErr) throw delErr;
  if (rows.length) {
    const { error } = await sb.from('top_plushes').insert(rows);
    if (error) throw error;
  }
};

window.data = data;
