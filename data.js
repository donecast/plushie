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
        // Loud, not silent. The save still proceeds without this column so the
        // user isn't blocked mid-migration — but that field's VALUE is being
        // dropped, which is real data loss if we let it pass with a bare warn.
        // Surface it (console.error + an admin toast) so it's diagnosable — the
        // same fail-loud stance as the read side (catalog overrides, #117).
        console.error(`[data.put] column '${missing[1]}' missing from '${table}' — saving WITHOUT it; its value is being dropped. Apply the db/00NN migration that adds it.`);
        if (typeof toast === 'function' && window.currentUser?.isAdmin) {
          toast(`⚠️ Saved without '${missing[1]}' — that column's migration isn't applied yet. See console.`);
        }
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

  // Bulk edit: stamp "how acquired" / "date collected" onto many rows at once.
  //
  // A dedicated column update, like setWornBy/setItemVisibility — deliberately
  // NOT a mass put()/upsert. An upsert would rewrite every column of every row
  // from the client's in-memory copy, so anything stale or not-yet-loaded there
  // would be clobbered; here only the columns the user actually filled in move.
  //
  // Chunked because PostgREST puts `id=in.(…)` in the query string: 600 UUIDs
  // is a ~23KB URL, past what proxies will carry. 100 ids ≈ 3.7KB.
  //
  // Returns the number of rows the DATABASE reports as updated — not the number
  // we asked for. If RLS silently drops some (another member's items, say), the
  // caller needs the real figure, not our optimistic one.
  async bulkUpdateCollection(ids, patch) {
    const cols = {};
    if ('acquiredHow' in patch)   cols.acquired_how   = patch.acquiredHow ?? null;
    if ('dateCollected' in patch) cols.date_collected = patch.dateCollected ?? null;
    if (!Object.keys(cols).length) throw new Error('bulkUpdateCollection: no fields to change');
    // Answering the method by hand retires the db/0102 question marker: the
    // owner has now said what this one was, whatever they said.
    if ('acquiredHow' in patch) cols.acquired_how_backfilled = false;
    cols.updated_at = new Date().toISOString();

    const CHUNK = 100;
    let changed = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: rows, error } = await sb
        .from('plushies')
        .update(cols)
        .in('id', ids.slice(i, i + CHUNK))
        .select('id');
      // Fail loudly and immediately — the caller re-reads from the server so a
      // half-applied batch never leaves the screen showing something untrue.
      if (error) throw error;
      changed += (rows || []).length;
    }
    return changed;
  },

  // "They were all bought new" — retire the db/0103 question across this
  // collection in one statement. Nothing about the plushes changes; only the
  // marker that says we still owe the owner a question. Returns how many rows
  // the DB actually cleared so the caller can report a real number.
  async clearAcquireBackfillFlags() {
    const { data: rows, error } = await sb
      .from('plushies')
      .update({ acquired_how_backfilled: false })
      .eq('collection_id', data.collectionId)
      .eq('acquired_how_backfilled', true)
      .select('id');
    if (error) throw error;
    return (rows || []).length;
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

  // Same idea for the wish list (priority order). Tolerates the column not
  // existing yet (pre-0042).
  async saveWishlistOrder(orderedIds) {
    const now = new Date().toISOString();
    const results = await Promise.all(orderedIds.map((id, i) =>
      sb.from('wishlist').update({ sort_order: i, updated_at: now }).eq('id', id)));
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

  // strict: throw instead of silently skipping/failing, for callers where a
  // file left behind is a real problem (admin catalog photo removal) rather
  // than best-effort tidy-up (user photo replacement).
  async _r2Delete(bucket, path, { strict = false } = {}) {
    const base = (window.R2_BASE || '').replace(/\/$/, '');
    if (!base || !path) {
      if (strict) throw new Error('R2 not configured — file not deleted');
      return;
    }
    const { data: session } = await sb.auth.getSession();
    const jwt = session?.session?.access_token;
    if (!jwt) {
      if (strict) throw new Error('Not signed in — file not deleted');
      return;
    }
    const req = fetch(`${base}/${bucket}/${path}`, {
      method: 'DELETE',
      headers: { 'authorization': `Bearer ${jwt}` },
    });
    if (!strict) { await req.catch(() => {}); return; }
    const resp = await req;
    if (!resp.ok) throw new Error(`R2 delete failed (${resp.status}) — file not deleted`);
  },

  async _urlFor(bucket, path) {
    if (!path) return null;
    // Same cache for both code paths — short-circuits a re-fetch on
    // every render. R2 URLs are stable. We cache signed URLs for the
    // whole page session, so they must outlive any realistic session:
    // a 1h expiry left long-lived tabs / PWAs showing broken images
    // once the cached URL aged out. Sign for 7 days instead.
    if (data._photoUrlCache.has(`${bucket}:${path}`)) return data._photoUrlCache.get(`${bucket}:${path}`);
    let url = null;
    if (window.R2_BASE) {
      const base = window.R2_BASE.replace(/\/$/, '');
      url = `${base}/${bucket}/${path}`;
    } else {
      const { data: signed, error } = await sb
        .storage.from(bucket)
        .createSignedUrl(path, 604800);
      if (error) {
        // A genuinely missing object is permanent — cache the miss so we
        // don't re-sign (and re-fire a 400 + console noise) on every
        // render. Transient failures (auth not ready yet, network blip)
        // stay uncached so a later render can retry and recover.
        const missing = error.status === 400 || error.status === 404 ||
          /not.?found/i.test(error.message || '');
        if (missing) { data._photoUrlCache.set(`${bucket}:${path}`, null); }
        else { console.warn('signed url failed', path, error); }
        return null;
      }
      url = signed.signedUrl;
    }
    data._photoUrlCache.set(`${bucket}:${path}`, url);
    return url;
  },

  async deletePhoto(path) {
    if (!path || path.startsWith('http')) return;
    data._photoUrlCache.delete(`photos:${path}`);
    if (window.R2_BASE) { await data._r2Delete('photos', path); return; }
    await sb.storage.from('photos').remove([path]);
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
        damagedAccessories: Array.isArray(r.damaged_accessories) ? r.damaged_accessories : [],
        oddfulReason: r.oddful_reason || null,
        // db/0103: this row's method came from the Direct Purchase → first-hand
        // backfill, so the app should ask the owner once whether it was really
        // a secondhand buy. Cleared by any save (see _itemToRow).
        acquiredHowBackfilled: !!r.acquired_how_backfilled,
        retired: r.retired,
        quantity: r.quantity ?? 1,
        wornBy: r.worn_by || null,
        sortOrder: r.sort_order ?? null,
        visibility: r.visibility || 'friends',
        // Present / gift metadata (db/0096, db/0099). Columns may be absent on
        // an older backend; select('*') just omits them → these read false/null.
        isPresent: !!r.is_present,
        isGift: !!r.is_gift,
        giftedBy: r.gifted_by || null,
        giftedByUsername: r.gifted_by_username || null,
        giftMessage: r.gift_message || null,
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
      const damaged = Array.isArray(item.damagedAccessories) ? item.damagedAccessories : [];
      // Legacy has_bag: only a MISSING bag means "no bag" — a damaged bag is
      // still a bag you have (just damaged), so it stays true.
      const stillHasBag = !missing.some((a) => /\bbag\b/i.test(a));
      return {
        ...base,
        nickname: item.nickname ?? null,
        meaning: item.meaning ?? null,
        date_collected: item.dateCollected ?? null,
        acquired_how: item.acquiredHow ?? null,
        has_bag: stillHasBag,
        missing_accessories: missing,
        damaged_accessories: damaged,
        oddful_reason: item.oddfulReason ?? null,
        // Saving an item means its owner has had the acquire field in front of
        // them, so the db/0103 "was this secondhand?" question is answered —
        // whether they changed the value or left it.
        acquired_how_backfilled: false,
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
  // Overlay the real-photo gallery — for offerings this replaces the cover
  // with the first proof photo and exposes it.photos for the manage UI.
  await data._attachTradeItemPhotos(items);
  return items;
};

data.addTradeItem = async function ({ kind, catalogId, catalogHandle, name, photoPath, photoSocialPath, quantity, notes, extras }) {
  const insert = {
    owner_id: window.currentUser.id,
    kind, catalog_id: catalogId, catalog_handle: catalogHandle,
    name, photo_path: photoPath ?? null,
    photo_social_path: photoSocialPath ?? null,
    quantity, notes: notes ?? null,
    // [{ name, included }] snapshot of the includes checklist (migration 0086).
    extras: extras ?? null,
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
      // Loud, not silent — same stance as data.put above: still list so the
      // user isn't blocked, but the dropped column's value is real data loss,
      // so make it diagnosable rather than a bare warn.
      console.error(`[addTradeItem] column '${missing[1]}' missing from 'trade_items' — listing WITHOUT it; its value is being dropped. Apply the db/00NN migration that adds it.`);
      if (typeof toast === 'function' && window.currentUser?.isAdmin) {
        toast(`⚠️ Listed without '${missing[1]}' — that column's migration isn't applied yet. See console.`);
      }
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
  if ('extras' in patch) row.extras = patch.extras;
  if ('photoSocialPath' in patch) row.photo_social_path = patch.photoSocialPath;
  row.updated_at = new Date().toISOString();
  const { error } = await sb.from('trade_items').update(row).eq('id', id);
  if (error) throw error;
};

// ─── Trade proof photos (real-photo gallery, migration 0074) ─────────
// Insert one row per photo, positioned after any that already exist.
data.addTradeItemPhotos = async function (tradeItemId, socialPaths, startPos = 0) {
  const paths = (socialPaths || []).filter(Boolean);
  if (!paths.length) return;
  const rows = paths.map((p, i) => ({
    trade_item_id: tradeItemId,
    social_path: p,
    position: startPos + i,
  }));
  const { error } = await sb.from('trade_item_photos').insert(rows);
  if (error) throw error;
};

data.deleteTradeItemPhoto = async function (id) {
  const { error } = await sb.from('trade_item_photos').delete().eq('id', id);
  if (error) throw error;
};

// Batch-fetch gallery rows for a set of trade item ids → Map(itemId → rows[]),
// each rows[] ordered by position. Degrades to an empty Map if migration 0074
// hasn't been applied yet, so trades still render (just without proof photos).
data.listTradeItemPhotos = async function (itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data: rows, error } = await sb
    .from('trade_item_photos')
    .select('id, trade_item_id, social_path, position')
    .in('trade_item_id', ids)
    .order('position', { ascending: true });
  if (error) {
    if (error.code === '42P01' || /trade_item_photos.*does not exist/i.test(error.message || '')) {
      console.warn('[listTradeItemPhotos] table missing — apply migration 0074');
      return new Map();
    }
    throw error;
  }
  const byItem = new Map();
  for (const r of rows) {
    if (!byItem.has(r.trade_item_id)) byItem.set(r.trade_item_id, []);
    byItem.get(r.trade_item_id).push(r);
  }
  return byItem;
};

// Attach a resolved `.photos` array ([{id, socialPath, url}]) to each trade
// item object, and promote the first real photo to the card cover. Shared by
// listMyTradeItems and browseOfferings.
data._attachTradeItemPhotos = async function (items) {
  const byItem = await data.listTradeItemPhotos(items.map((i) => i.id));
  await Promise.all(items.map(async (it) => {
    const rows = byItem.get(it.id) || [];
    it.photos = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      socialPath: r.social_path,
      url: await data.socialPhotoUrl(r.social_path),
    })));
    if (it.photos.length) it.photo = it.photos[0].url;
  }));
  return items;
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
  const fetchRows = (cols) => sb
    .from('trade_items')
    .select(cols)
    .eq('kind', 'offering')
    .eq('archived', false)
    .neq('owner_id', window.currentUser.id)
    .order('created_at', { ascending: false });
  const BASE_COLS = 'id, owner_id, name, catalog_id, catalog_handle, photo_path, photo_social_path, quantity, reserved, notes, created_at, kind';
  let { data: rows, error } = await fetchRows(`${BASE_COLS}, extras`);
  if (error && /extras/i.test(error.message || '')) {
    // Migration 0086 not applied yet — retry without the column so Browse
    // keeps working, but loudly: includes checklists are invisible until then.
    console.error("[browseOfferings] 'extras' column missing — apply db/0086 (includes checklists won't show until then).");
    ({ data: rows, error } = await fetchRows(BASE_COLS));
  }
  if (error) throw error;
  // Refresh the blocked set so we never surface offerings from someone
  // you're blocked-with (either direction).
  try { await data.loadBlockedIds(); } catch { /* non-fatal */ }
  const available = rows.filter((r) =>
    (r.quantity - r.reserved) > 0 && !data.isBlocked(r.owner_id));
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
  // Overlay the real-photo gallery so Browse cards can show every proof shot.
  await data._attachTradeItemPhotos(items);
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
  if (data.isGhosted()) return [];
  const uid = window.currentUser.id;
  const { data: rows, error } = await sb
    .from('trades')
    .select(`
      *,
      trade_line_items (
        side, quantity,
        trade_item:trade_items (id, name, photo_path, catalog_id, owner_id, kind)
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

  // Attach each line item's real-photo gallery (public 'social' bucket) so the
  // trade card can show proof shots for both "you give" and "you get" — the
  // owner's photo_path above is collection-scoped and unreadable cross-user.
  const liIds = new Set();
  for (const t of rows) {
    for (const li of (t.trade_line_items || [])) {
      if (li.trade_item?.id) liIds.add(li.trade_item.id);
    }
  }
  if (liIds.size) {
    const byItem = await data.listTradeItemPhotos([...liIds]);
    const urlCache = new Map();
    const urlFor = async (p) => {
      if (!urlCache.has(p)) urlCache.set(p, await data.socialPhotoUrl(p));
      return urlCache.get(p);
    };
    for (const t of rows) {
      for (const li of (t.trade_line_items || [])) {
        const ti = li.trade_item;
        if (!ti) continue;
        const gal = byItem.get(ti.id) || [];
        ti.photos = await Promise.all(gal.map((r) => urlFor(r.social_path)));
      }
    }
  }
  return rows;
};

data.createTrade = async function ({ recipientId, proposerLines, recipientLines, message, parentTradeId }) {
  // Can't trade with someone you're blocked-with (either direction). The
  // trades insert policy (0034) enforces this too; we check first for a
  // clean message instead of a raw RLS error mid-insert.
  const { data: blk } = await sb.rpc('blocked_with_me', { other: recipientId });
  if (blk === true) throw new Error('blocked');
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

// Accept a trade: flip pending -> accepted and reserve each line item.
// Runs in one atomic SECURITY DEFINER RPC (db/0081) so a concurrent accept
// of the same item can't over-reserve (the old client-side read-modify-write
// last-write-wins could) and a failed reservation rolls the status back.
// The RPC raises 'item_unavailable', 'trade_not_pending', or 'forbidden'.
data.acceptTrade = async function (tradeId) {
  const { error } = await sb.rpc('accept_trade', { target_trade: tradeId });
  if (error) throw error;
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
        trade_item:trade_items (id, name, photo_path, catalog_id, owner_id, kind)
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
  // Both terminal outcomes free the reserved units so they stop counting
  // against the parties' offerings. 'cancelled' obviously; 'completed'
  // too — the trade is over, so the reservation must not linger (the old
  // bug: force-complete left `reserved` inflated forever, so the items
  // showed as stuck-reserved). We only release the reservation, not the
  // owned quantity: a disputed, admin-forced completion has an uncertain
  // physical outcome, so we don't destroy inventory on the parties' behalf.
  // 'restored' keeps the trade active, so its reservation stays.
  if (outcome === 'cancelled' || outcome === 'completed') {
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

// ─── Blocking ───────────────────────────────────────────────────────
// Block is directed (me → them) but enforced mutually in the DB. The
// 0034 trigger severs any friendship / circle membership on insert.
data.blockUser = async function (otherId) {
  const { error } = await sb.from('user_blocks').insert({
    blocker_id: window.currentUser.id,
    blocked_id: otherId,
  });
  if (error && !/duplicate key/i.test(error.message || '')) throw error;
  await data.loadBlockedIds();
};

data.unblockUser = async function (otherId) {
  const { error } = await sb.from('user_blocks').delete()
    .eq('blocker_id', window.currentUser.id)
    .eq('blocked_id', otherId);
  if (error) throw error;
  await data.loadBlockedIds();
};

// People I have blocked (for the "Blocked collectors" management list and
// the Unblock affordance on their profile).
data.listMyBlocks = async function () {
  const { data: rows, error } = await sb.from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', window.currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = rows.map((r) => r.blocked_id);
  let names = new Map();
  if (ids.length) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', ids);
    names = new Map((profs || []).map((p) => [p.id, p.username]));
  }
  data._myBlockIds = new Set(ids);
  return rows.map((r) => ({
    id: r.blocked_id,
    username: names.get(r.blocked_id) || 'unknown',
    createdAt: r.created_at,
  }));
};

// Union of "people I blocked" + "people who blocked me" (direction hidden
// on purpose). Cached on data._blockedIds for synchronous filtering.
data.loadBlockedIds = async function () {
  const { data: rows, error } = await sb.rpc('blocked_user_ids');
  if (error) { console.warn('blocked_user_ids', error); data._blockedIds = data._blockedIds || new Set(); return data._blockedIds; }
  data._blockedIds = new Set((rows || []).map((r) => (typeof r === 'string' ? r : (r.blocked_user_ids ?? r.id))));
  return data._blockedIds;
};
data._blockedIds = new Set();
data._myBlockIds = new Set();
data.isBlocked   = function (uid) { return data._blockedIds.has(uid); };
data.isMyBlock   = function (uid) { return data._myBlockIds.has(uid); };

// Accounts that can never be blocked: admins + the redrambler moderator.
// Mirrors is_protected_user() in db/0036 — the DB policy is the real
// guard; this just hides the Block affordance client-side. Callers pass
// whatever they know about the target (username always, is_admin when
// available).
data.PROTECTED_USERNAMES = new Set(['thegamersdome', 'redrambler']);
data.isUnblockable = function ({ username, is_admin, is_moderator } = {}) {
  if (is_admin || is_moderator) return true;
  return data.PROTECTED_USERNAMES.has((username || '').toLowerCase());
};

// ─── Reports ────────────────────────────────────────────────────────
data.reportContent = async function ({ targetType, targetId, targetOwnerId, reason, details }) {
  const { error } = await sb.from('content_reports').insert({
    reporter_id: window.currentUser.id,
    target_type: targetType,
    target_id: String(targetId),
    target_owner_id: targetOwnerId || null,
    reason,
    details: details || null,
  });
  if (error) throw error;
};

data.adminListReports = async function (status = 'open') {
  const { data: rows, error } = await sb.from('content_reports')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const uids = new Set();
  for (const r of rows) {
    if (r.reporter_id) uids.add(r.reporter_id);
    if (r.target_owner_id) uids.add(r.target_owner_id);
  }
  if (uids.size) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', [...uids]);
    const map = new Map((profs || []).map((p) => [p.id, p.username]));
    for (const r of rows) {
      r.reporterName = map.get(r.reporter_id) || '?';
      r.targetOwnerName = r.target_owner_id ? (map.get(r.target_owner_id) || '?') : null;
    }
  }
  return rows;
};

// Resolve ('resolved' kept / 'dismissed') with an optional note.
data.adminResolveReport = async function (reportId, status, note) {
  const { error } = await sb.from('content_reports').update({
    status,
    resolution_note: note || null,
    resolved_by: window.currentUser.id,
    resolved_at: new Date().toISOString(),
  }).eq('id', reportId);
  if (error) throw error;
};

// ─── Account deletion review queue (db/0068) ────────────────────────────
// Accounts whose owner asked to "delete" them, newest first. The flag lives
// on profiles (admins read all rows); the exit-survey reason lives in
// profile_private (admins read via pp_admin_read). Two reads, joined here.
data.adminListDeletionRequests = async function () {
  const { data: rows, error } = await sb.from('profiles')
    .select('id, username, deletion_requested_at')
    .not('deletion_requested_at', 'is', null)
    .order('deletion_requested_at', { ascending: false });
  if (error) throw error;
  if (!rows || !rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { data: priv } = await sb.from('profile_private')
    .select('id, deletion_reason').in('id', ids);
  const reasons = new Map((priv || []).map((p) => [p.id, p.deletion_reason]));
  return rows.map((r) => ({ ...r, deletion_reason: reasons.get(r.id) || null }));
};

// Restore an account that had asked to be deleted — clears the flag (admin
// escape hatch profiles_update_admin, db/0019) so the owner can sign in again.
// The stale reason in profile_private is harmless and left as-is.
data.adminClearDeletionRequest = async function (userId) {
  const { error } = await sb.from('profiles')
    .update({ deletion_requested_at: null }).eq('id', userId);
  if (error) throw error;
};

// Remove the reported post or comment (admin delete grant from 0034).
data.adminDeleteReportedContent = async function (targetType, targetId) {
  if (targetType === 'post') {
    const { error } = await sb.from('posts').delete().eq('id', targetId);
    if (error) throw error;
  } else if (targetType === 'comment') {
    const { error } = await sb.from('post_comments').delete().eq('id', targetId);
    if (error) throw error;
  } else {
    throw new Error('Only posts and comments can be removed this way.');
  }
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

// Per-user role/moderation flags for the admin-list badges (is_moderator from
// db/0066, ghosted/app_blocked from db/0046). The overview RPC doesn't carry
// these, so fetch them in one shot — admins can read every profiles row — and
// merge by id. Degrades gracefully if a column isn't migrated yet.
data._adminModerationFlags = async function () {
  let { data: rows, error } = await sb.from('profiles').select('id, is_moderator, ghosted, app_blocked');
  if (error && /column.*is_moderator/i.test(error.message || '')) {
    ({ data: rows } = await sb.from('profiles').select('id, ghosted, app_blocked'));
  } else if (error && /column.*(ghosted|app_blocked)/i.test(error.message || '')) {
    ({ data: rows } = await sb.from('profiles').select('id'));
  } else if (error) {
    console.warn('adminModerationFlags', error);
  }
  return new Map((rows || []).map((r) => [r.id, r]));
};

data.adminListUsers = async function () {
  // One round trip: per-user counts (collection / wish list / for trade),
  // last seen, full name, and feedback tallies. Falls back to the old
  // profiles+summary path if migration 0045 hasn't been applied yet.
  // Don't swallow a real failure here: an empty map would render every user
  // as un-flagged (not ghosted/blocked/moderator) — a moderator would see
  // clean content that's actually flagged. Let it throw so the admin UI's
  // catch shows "Could not load users." instead of a misleading list.
  const flags = await data._adminModerationFlags();
  const withFlags = (id, base) => {
    const f = flags.get(id) || {};
    return { ...base, is_moderator: f.is_moderator === true, ghosted: f.ghosted === true, app_blocked: f.app_blocked === true };
  };
  try {
    const { data: rows, error } = await sb.rpc('admin_user_overview');
    if (error) throw error;
    return (rows || []).map((r) => withFlags(r.id, {
      id: r.id,
      username: r.username,
      email: r.email,
      is_admin: r.is_admin,
      created_at: r.created_at,
      last_seen_at: r.last_seen_at,
      full_name: r.full_name,
      collection_count: r.collection_count,
      wishlist_count: r.wishlist_count,
      for_trade_count: r.for_trade_count,
      feedback: {
        good_count: r.good_count, meh_count: r.meh_count,
        bad_count: r.bad_count, total_count: r.total_count,
      },
    }));
  } catch (err) {
    if (!/admin_user_overview|does not exist|schema cache|function|404/i.test(err.message || '')) throw err;
    console.warn('[adminListUsers] admin_user_overview missing; run migration 0045. Falling back.');
    const { data: rows, error } = await sb
      .from('profiles')
      .select('id, username, is_admin, created_at, photo_uploads_enabled, custom_clothing_enabled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const { data: fb } = await sb.from('user_feedback_summary').select('*');
    const byId = new Map((fb || []).map((f) => [f.user_id, f]));
    return rows.map((r) => withFlags(r.id, { ...r, feedback: byId.get(r.id) || null }));
  }
};

// People who started an auth account but never finished (no profiles row):
// either never verified their magic-link email, or signed in once and bailed
// before choosing a username. Admin-only (db/0092, SECURITY DEFINER + is_admin
// gate). Returns [] for non-admins — the RPC just yields nothing.
data.adminListIncompleteSignups = async function () {
  const { data: rows, error } = await sb.rpc('admin_incomplete_signups');
  if (error) throw error;
  return (rows || []).map((r) => ({
    id: r.id,
    email: r.email,
    created_at: r.created_at,
    last_sign_in_at: r.last_sign_in_at,
    confirmed: r.confirmed === true,
  }));
};

// Blow away one incomplete sign-up: delete the auth.users row for an account
// that never became a member. Admin-only (db/0093, SECURITY DEFINER +
// is_admin gate). The RPC refuses if a profiles row exists, so this can only
// ever remove a genuinely profile-less sign-up — never a real member.
data.adminDeleteIncompleteSignup = async function (userId) {
  const { error } = await sb.rpc('admin_delete_incomplete_signup', { target: userId });
  if (error) throw error;
};

// ─── Real names (db/0045: profile_private + security-definer accessors) ──
// Self reads/writes its own raw fields directly (RLS gates the row);
// everyone else reaches a name only through the display/partner RPCs.
data.getMyNameFields = async function () {
  const { data: row, error } = await sb
    .from('profile_private')
    .select('first_name, last_name, name_visibility')
    .eq('id', window.currentUser.id)
    .maybeSingle();
  if (error) { console.warn('getMyNameFields', error); return null; }
  return row || { first_name: '', last_name: '', name_visibility: 'first_initial' };
};

data.setMyName = async function ({ firstName, lastName, visibility }) {
  const first = (firstName || '').trim();
  if (!first) throw new Error('first_name_required');
  const patch = {
    id: window.currentUser.id,
    first_name: first,
    last_name: (lastName || '').trim() || null,
  };
  if (visibility) patch.name_visibility = visibility;
  const { error } = await sb.from('profile_private').upsert(patch);
  if (error) throw error;
};

// ─── Self-serve account deletion (db/0068) ──────────────────────────────
// What the user experiences as "delete my account" is really a REQUEST: we
// stamp profiles.deletion_requested_at (allowed by profiles_update_self) and
// stash their optional exit-survey reason in the locked-down profile_private
// table (admin + self read only — never world-readable like profiles rows).
// The row is NOT deleted; an admin reviews the queue and either purges or
// restores it. From this call on, boot shows them the "deleted" takeover and
// is_suppressed() hides them from everyone else.
data.requestAccountDeletion = async function (reason) {
  const uid = window.currentUser.id;
  const text = (reason || '').trim().slice(0, 2000);
  // Save the reason first (best-effort) so it's in place before the flag flips;
  // a failure here must not block the user from leaving.
  if (text) {
    const { error: rErr } = await sb.from('profile_private')
      .upsert({ id: uid, deletion_reason: text });
    if (rErr) console.warn('requestAccountDeletion: reason save skipped', rErr);
  }
  const { error } = await sb.from('profiles')
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq('id', uid);
  if (error) throw error;
};

// Best-effort heartbeat written once per app boot.
data.touchLastSeen = async function () {
  try { await sb.rpc('touch_last_seen'); }
  catch (err) { console.warn('touchLastSeen', err); }
};

// ─── First-party analytics (db/0078) ─────────────────────────────────
// A thin, swappable seam — same spirit as fireLocalNotification: record
// one append-only event per meaningful action so retention (DAU/WAU, D1/D7)
// and feature engagement fall out of a SQL query, with zero third-party
// SDK. Always fire-and-forget and non-blocking: analytics must never slow
// down, block, or break a real user action. No-ops when signed out, when
// sb is missing, or when the table isn't deployed yet (the insert just
// fails and we swallow it). The eventual Capacitor wrap sets platform to
// 'ios'/'android' and reuses this exact call and table.
//
// props is a tiny, non-PII bag (e.g. { tab: 'trade' }). Don't put names,
// emails, or free text here — this is for counts, not surveillance.
data._sessionId = null;
data._sessionId_get = function () {
  if (!data._sessionId) {
    try { data._sessionId = crypto.randomUUID(); }
    catch { data._sessionId = String(Date.now()); }
  }
  return data._sessionId;
};

data.track = function (event, props) {
  const uid = window.currentUser?.id;
  if (!uid || !window.sb || !event) return;
  // Fire and forget: kick the insert off and return immediately. Any
  // failure (offline, table not yet migrated, RLS) is swallowed — a
  // missing metric must never surface to the user.
  sb.from('analytics_events').insert({
    user_id: uid,
    event,
    props: props || {},
    platform: 'web',
    session_id: data._sessionId_get(),
  }).then(({ error }) => {
    if (error) console.warn('[analytics] track failed', event, error.message);
  }, (err) => console.warn('[analytics] track threw', event, err));
};

// Session open, deduped so a token refresh (which re-runs the boot
// callback) doesn't inflate the count. One 'app_open' per ~30-minute
// window per device is the unit we treat as a "visit" for retention.
data.trackSession = function () {
  const GATE_MS = 30 * 60 * 1000;
  try {
    const last = Number(localStorage.getItem('analytics_last_open') || 0);
    if (Date.now() - last < GATE_MS) return;
    localStorage.setItem('analytics_last_open', String(Date.now()));
  } catch { /* storage blocked — fall through and still record the open */ }
  data.track('app_open', {});
};

// Visibility-aware public name for any profile (null if hidden / unset).
data.publicDisplayName = async function (userId) {
  try {
    const { data: name, error } = await sb.rpc('public_display_name', { p_user: userId });
    if (error) throw error;
    return name || null;
  } catch (err) { console.warn('publicDisplayName', err); return null; }
};

// Full name of the other party in a trade (shipping safety). Null unless
// the caller is a participant in that trade.
data.tradePartnerName = async function (tradeId, userId) {
  try {
    const { data: name, error } = await sb.rpc('trade_party_name', { p_trade: tradeId, p_user: userId });
    if (error) throw error;
    return name || null;
  } catch (err) { console.warn('tradePartnerName', err); return null; }
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
  // Blocks this user is involved in. Direction matters in the admin view
    // (initiated vs received), unlike the symmetric client-side block set.
    // Reading other people's blocks needs the is_admin() select policy from
    // db/0036; until that's applied these come back empty for non-self rows.
  const [{ data: bi }, { data: bb }] = await Promise.all([
    sb.from('user_blocks').select('blocked_id, created_at').eq('blocker_id', userId),
    sb.from('user_blocks').select('blocker_id, created_at').eq('blocked_id', userId),
  ]);
  const blockIds = new Set();
  (bi || []).forEach((r) => blockIds.add(r.blocked_id));
  (bb || []).forEach((r) => blockIds.add(r.blocker_id));
  let blockNames = new Map();
  if (blockIds.size) {
    const { data: bp } = await sb.from('profiles').select('id, username').in('id', [...blockIds]);
    blockNames = new Map((bp || []).map((p) => [p.id, p.username]));
  }
  const blocksInitiated = (bi || []).map((r) => ({
    id: r.blocked_id, username: blockNames.get(r.blocked_id) || 'unknown', created_at: r.created_at,
  }));
  const blockedBy = (bb || []).map((r) => ({
    id: r.blocker_id, username: blockNames.get(r.blocker_id) || 'unknown', created_at: r.created_at,
  }));
  // Feedback summary
  const fb = await data.getFeedbackSummary(userId);
  // Moderation flags (db/0046) — fetched fresh so the admin toggles reflect
  // current state. Falls back to all-false if the migration isn't applied yet.
  let moderation = { app_blocked: false, ghosted: false, is_admin: false, is_moderator: false };
  {
    let { data: prof, error } = await sb
      .from('profiles').select('app_blocked, ghosted, is_admin, is_moderator').eq('id', userId).maybeSingle();
    if (error && /column.*is_moderator/i.test(error.message || '')) {
      ({ data: prof, error } = await sb.from('profiles').select('app_blocked, ghosted, is_admin').eq('id', userId).maybeSingle());
    }
    if (error && /column.*(app_blocked|ghosted)/i.test(error.message || '')) {
      ({ data: prof } = await sb.from('profiles').select('is_admin').eq('id', userId).maybeSingle());
    }
    if (prof) moderation = {
      app_blocked: prof.app_blocked === true,
      ghosted: prof.ghosted === true,
      is_admin: prof.is_admin === true,
      is_moderator: prof.is_moderator === true,
    };
  }
  // Self-requested deletion (db/0068): surfaced in the danger zone so an admin
  // reviewing the account sees why they're here and their exit feedback. Both
  // reads are best-effort — a missing column (migration not applied) just
  // leaves deletion null.
  let deletion = null;
  try {
    const { data: dp } = await sb.from('profiles')
      .select('deletion_requested_at').eq('id', userId).maybeSingle();
    if (dp && dp.deletion_requested_at) {
      const { data: dpriv } = await sb.from('profile_private')
        .select('deletion_reason').eq('id', userId).maybeSingle();
      deletion = {
        requested_at: dp.deletion_requested_at,
        reason: (dpriv && dpriv.deletion_reason) || null,
      };
    }
  } catch (e) { console.warn('deletion snapshot skipped', e); }
  return {
    collection: col, plushies, wishlist, pens,
    trades: trades || [], tradeItems: tradeItems || [],
    blocksInitiated, blockedBy, feedback: fb, moderation, deletion,
  };
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

// ─── Catalog photos: admin gallery management ────────────────────────
// The `catalog_photos` table is the system of record for an item's extra
// pictures. Slots are LETTERED ('A','B',… = community/fan) or NUMBERED
// ('0','1',… = official PD). Everywhere we list them, LETTERED sorts BEFORE
// NUMBERED (Scott's rule). RLS lets admins insert/update/delete; everyone can
// read. The live catalog still resolves its cover from catalog_overrides.image
// (the "render bridge"), so making a photo the cover mirrors its URL there.
function _catPhotoTargetFilter(q, target) {
  // A variant target is the most specific: its photos live under the parent
  // handle but are tagged with the variant id, so filter on that alone.
  if (target.variantId) return q.eq('target_variant_id', target.variantId);
  // A plain handle target means the WHOLE product's photos — exclude any
  // variant-tagged rows so a parent's gallery never absorbs its variants'.
  if (target.handle) return q.eq('target_handle', target.handle).is('target_variant_id', null);
  if (target.catalogItemId) return q.eq('target_catalog_item_id', target.catalogItemId);
  if (target.penId) return q.eq('target_pen_id', target.penId);
  return null;
}
function _slotSort(a, b) {
  const al = /^[A-Za-z]/.test(a.slot), bl = /^[A-Za-z]/.test(b.slot);
  if (al !== bl) return al ? -1 : 1;                 // lettered before numbered
  return String(a.slot).localeCompare(String(b.slot), undefined, { numeric: true });
}

// List an item's photos, lettered-first, each with a resolved display `url`.
data.adminListCatalogPhotos = async function (target) {
  let q = sb.from('catalog_photos').select(
    'id, target_handle, target_catalog_item_id, target_pen_id, target_variant_id, slot, image_path, image_url, bucket, source, source_url, credit, notes, is_primary');
  q = _catPhotoTargetFilter(q, target);
  if (!q) return [];
  const { data: rows, error } = await q;
  if (error) { console.warn('catalog photos load skipped', error); return []; }
  const out = [];
  for (const r of (rows || [])) {
    const url = r.image_url || await data.catalogImageUrl(r.image_path);
    out.push({ ...r, url });
  }
  out.sort(_slotSort);
  return out;
};

// Add a photo. `imageUrl` is stored as a hot-link in image_url (the simplest
// path for web/community shots); pass `imagePath` instead for an R2 key.
data.adminAddCatalogPhoto = async function (target, { slot, imageUrl = null, imagePath = null, source = 'community', credit = null, creditAnon = false, notes = null }) {
  if (!slot) throw new Error('A slot (A, B… or 0, 1…) is required.');
  if (!imageUrl && !imagePath) throw new Error('A photo URL (or R2 path) is required.');
  const row = {
    slot: String(slot).trim(),
    image_url: imageUrl, image_path: imagePath, source, credit, credit_anon: creditAnon === true, notes,
    submitted_by: window.currentUser?.id || null,
  };
  if (target.variantId) {
    // Variant photos sit under the parent handle AND carry the variant id, so
    // the gallery groups under the product while staying scoped to one variant.
    if (!target.handle) throw new Error('A variant photo needs its parent handle.');
    row.target_handle = target.handle;
    row.target_variant_id = target.variantId;
  } else if (target.handle) row.target_handle = target.handle;
  else if (target.catalogItemId) row.target_catalog_item_id = target.catalogItemId;
  else if (target.penId) row.target_pen_id = target.penId;
  else throw new Error('No photo target.');
  const { data: saved, error } = await sb.from('catalog_photos').insert(row).select().single();
  if (error) throw error;
  return saved;
};

// The R2 objects a catalog_photos row owns. A row can reference its file two
// ways at once — an `image_path` key and/or an `image_url` that points back
// at our own R2 worker (the photo pipeline writes both for the same object) —
// so resolve each and dedupe. A URL on any other host is an external
// hot-link: nothing of ours to delete.
data._r2PhotoLocations = function (row) {
  const out = new Map();
  if (row.image_path) {
    const bucket = row.bucket || 'catalog';
    out.set(`${bucket}/${row.image_path}`, { bucket, path: row.image_path });
  }
  const base = (window.R2_BASE || '').replace(/\/$/, '');
  if (base && row.image_url && row.image_url.startsWith(base + '/')) {
    const rest = row.image_url.slice(base.length + 1).split(/[?#]/)[0];
    const slash = rest.indexOf('/');
    if (slash > 0) {
      const bucket = rest.slice(0, slash);
      const path = decodeURIComponent(rest.slice(slash + 1));
      if (path) out.set(`${bucket}/${path}`, { bucket, path });
    }
  }
  return [...out.values()];
};

// Deleting a photo removes its FILE too when we host it: an admin rejecting a
// community shot and reverting to the store photo must not leave the file in
// the bucket (a store cover means "no usable community photo exists"). Files
// delete FIRST and loudly — on failure the row survives so the admin can
// retry, and re-deleting an already-gone R2 key is a no-op, so a
// half-finished retry converges.
data.adminDeleteCatalogPhoto = async function (photoId) {
  const { data: row, error: loadErr } = await sb.from('catalog_photos')
    .select('id, bucket, image_path, image_url, target_handle, target_variant_id')
    .eq('id', photoId).maybeSingle();
  if (loadErr) throw loadErr;
  if (!row) return; // already gone (double-click, another admin)

  for (const loc of data._r2PhotoLocations(row)) {
    await data._r2Delete(loc.bucket, loc.path, { strict: true });
  }

  const { error } = await sb.from('catalog_photos').delete().eq('id', photoId);
  if (error) throw error;

  // If this photo was mirrored as the live cover, clear the mirror back to
  // the store default — the file is gone, so the stale URL would 404. Same
  // resolved-URL expression adminSetCatalogPhotoPrimary mirrors, so an exact
  // match identifies "this photo is the cover".
  const coverUrl = row.image_url || (row.image_path ? await data.catalogImageUrl(row.image_path) : null);
  if (!coverUrl) return;
  const cleared = { image: null, image_credit: null, credit_anon: false, updated_by: window.currentUser?.id || null };
  if (row.target_variant_id) {
    const { error: e } = await sb.from('catalog_variant_covers')
      .update(cleared).eq('variant_id', row.target_variant_id).eq('image', coverUrl);
    if (e) throw e;
  } else if (row.target_handle) {
    const { error: e } = await sb.from('catalog_overrides')
      .update(cleared).eq('handle', row.target_handle).eq('image', coverUrl);
    if (e) throw e;
  }
};

// Relabel a slot (e.g. move a shot from numbered '1' to lettered 'B', or
// reorder within a kind). Slot is just text; the lettered-first sort does the
// rest at display time.
data.adminSetCatalogPhotoSlot = async function (photoId, slot) {
  if (!slot) throw new Error('Slot cannot be empty.');
  const { error } = await sb.from('catalog_photos').update({ slot: String(slot).trim() }).eq('id', photoId);
  if (error) throw error;
};

// Make a photo the item's cover: flip is_primary (one per target) AND mirror
// its resolved URL into catalog_overrides.image so the live render path shows
// it. Pass photoId=null to clear the primary (cover reverts to store default).
// Only handle-targeted items use the override mirror; custom catalog_items
// carry their own image elsewhere.
data.adminSetCatalogPhotoPrimary = async function (target, photoId) {
  let clr = sb.from('catalog_photos').update({ is_primary: false });
  clr = _catPhotoTargetFilter(clr, target);
  if (!clr) throw new Error('No photo target.');
  { const { error } = await clr.eq('is_primary', true); if (error) throw error; }

  let coverUrl = null;
  let coverCredit = null;
  let coverAnon = false;
  if (photoId) {
    const { data: row, error } = await sb.from('catalog_photos')
      .update({ is_primary: true }).eq('id', photoId)
      .select('image_path, image_url, source, credit, credit_anon').single();
    if (error) throw error;
    coverUrl = row.image_url || await data.catalogImageUrl(row.image_path);
    // Only community shots earn a courtesy credit in the detail view — and only
    // a community shot can carry the contributor's "hide my name" opt-out.
    if (row.source === 'community') { coverCredit = row.credit || null; coverAnon = row.credit_anon === true; }
  }
  // Mirror to the render bridge. A variant target writes catalog_variant_covers
  // (keyed by variant id) so the cover lands ONLY on that variant's card; a
  // plain handle target writes catalog_overrides, touching ONLY image +
  // image_credit via merge-upsert so lore/alt_lore/etc. are never clobbered.
  if (target.variantId) {
    const { error } = await sb.from('catalog_variant_covers')
      .upsert({ variant_id: target.variantId, handle: target.handle || null, image: coverUrl, image_credit: coverCredit, credit_anon: coverAnon, updated_by: window.currentUser?.id || null },
              { onConflict: 'variant_id' });
    if (error) throw error;
  } else if (target.handle) {
    const { error } = await sb.from('catalog_overrides')
      .upsert({ handle: target.handle, image: coverUrl, image_credit: coverCredit, credit_anon: coverAnon, updated_by: window.currentUser?.id || null },
              { onConflict: 'handle' });
    if (error) throw error;
  }
  return coverUrl;
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
// Enriched with the submitter's @handle and their track record (how many
// items they've had approved before) so the admin card can show who sent
// each suggestion and whether they're a first-timer or a trusted hand —
// the two signals that most inform the approve/reject/merge call.
data.adminListCatalogPending = async function () {
  const { data: rows, error } = await sb
    .from('catalog_items')
    .select('*')
    .or('status.eq.pending,review_seen.eq.false')
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  // Resolve submitter @handles (bare UUID → username) in one round-trip,
  // mirroring adminListPhotoSuggestions.
  const submitterIds = [...new Set(rows.map((r) => r.submitted_by).filter(Boolean))];
  let submitters = new Map();
  let approvedCounts = new Map();
  if (submitterIds.length) {
    const [{ data: profs }, { data: approvedRows }] = await Promise.all([
      sb.from('profiles').select('id, username').in('id', submitterIds),
      // Every approved item by these submitters — tally per user for the
      // "first submission" vs "N approved" trust badge.
      sb.from('catalog_items').select('id, submitted_by')
        .eq('status', 'approved').in('submitted_by', submitterIds),
    ]);
    submitters = new Map((profs || []).map((p) => [p.id, p.username]));
    (approvedRows || []).forEach((r) => {
      approvedCounts.set(r.submitted_by, (approvedCounts.get(r.submitted_by) || 0) + 1);
    });
  }

  await Promise.all(rows.map(async (r) => {
    r.image = r.image_path ? await data.catalogImageUrl(r.image_path) : null;
    r.submitted_by_username = submitters.get(r.submitted_by) || null;
    // Their approvals *not counting this row* — so an auto-approved row that
    // itself surfaces here doesn't inflate its own submitter's track record.
    const total = approvedCounts.get(r.submitted_by) || 0;
    r.submitter_prior_approved = Math.max(0, total - (r.status === 'approved' ? 1 : 0));
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

// Upload a community/extra photo file to the 'catalog' bucket (community/
// prefix) and return its path, for catalog_photos.image_path. Mirrors the
// proven uploadCatalogImage flow; admin-only (the catalog bucket gates writes).
data.uploadCatalogPhotoFile = async function (blob, handle) {
  const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const safe = (handle || 'item').replace(/[^a-z0-9-]/gi, '-').slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 8);
  // Use the same 'items/' prefix as uploadCatalogImage — the one the R2 Worker
  // is already known to authorize for admin client writes.
  const path = `items/${safe}-${rand}.${ext === 'jpeg' ? 'jpg' : ext}`;
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
    image_credit: record.image_credit || null,
    description: record.description || null,
    lore: record.lore || null,
    alt_lore: record.alt_lore || null,
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

// ─── Catalog overrides (hand-edited fields on Shopify-fed items) ──
// Read every override row. The catalog merge lays these on top of the
// live-parsed Shopify data, keyed by handle.
//
// THROW on error — do NOT mask a failed query as an empty result. A
// silent `return []` here is indistinguishable from "no overrides," so a
// single broken column (e.g. selecting `image_credit` before its
// migration is applied) would blank EVERY community photo and retelling
// catalog-wide and look exactly like data loss. The caller decides how to
// degrade (it falls back to the store base + a loud, visible warning), but
// it can only do that if it can tell an error from genuine emptiness.
data.listCatalogOverrides = async function () {
  const { data: rows, error } = await sb
    .from('catalog_overrides')
    .select('handle, lore, alt_lore, symbolism, accessories, image, image_credit, credit_anon, category, retired');
  if (error) throw error;
  return rows || [];
};

// Per-variant community covers (catalog_variant_covers), keyed by Shopify
// variant id. Read by everyone — applyVariantCovers lays each onto its
// matching expanded variant child. Kept separate from listCatalogOverrides so
// a missing db/0069 fails only the variant layer, not the whole catalog.
data.listVariantCovers = async function () {
  const { data: rows, error } = await sb
    .from('catalog_variant_covers')
    .select('variant_id, handle, image, image_credit, credit_anon');
  if (error) throw error;
  return rows || [];
};

// Admin: set (or clear) one variant's cover. image=null deletes the row so the
// variant reverts cleanly to its own store photo. Mirrors the override flow but
// keyed by variant id, so it never touches sibling variants.
data.adminSetVariantCover = async function (variantId, handle, image, imageCredit) {
  if (!variantId) throw new Error('A variant id is required.');
  if (!image) {
    const { error } = await sb.from('catalog_variant_covers').delete().eq('variant_id', variantId);
    if (error) throw error;
    return null;
  }
  const { data: saved, error } = await sb.from('catalog_variant_covers')
    .upsert({ variant_id: variantId, handle: handle || null, image, image_credit: imageCredit || null, updated_by: window.currentUser?.id || null },
            { onConflict: 'variant_id' })
    .select().single();
  if (error) throw error;
  return saved;
};

// Admin upsert. patch carries { lore, symbolism, accessories, image } — any
// field null/omitted means "no override, inherit live". When every field
// is empty the row is deleted instead so the table stays tidy and the
// item reverts cleanly to the live feed.
data.adminUpsertCatalogOverride = async function (handle, patch) {
  const lore = patch.lore || null;
  const altLore = patch.altLore || null;
  const symbolism = patch.symbolism || null;
  const accessories = (Array.isArray(patch.accessories) && patch.accessories.length)
    ? patch.accessories : null;
  // `image` is optional: when the caller omits the key entirely (the photo
  // picker couldn't load), we leave the existing column untouched — the upsert
  // simply doesn't include it, so a prior cover override survives. When the key
  // is present, '' / null clears it.
  const hasImage = Object.prototype.hasOwnProperty.call(patch, 'image');
  const image = patch.image || null;
  // Cover attribution rides with the image: a community cover carries the
  // submitter's display credit (e.g. '@redrambler'); a store/official cover
  // clears it. It's only meaningful alongside a cover, so we write it on the
  // same condition as `image` and let it follow the cover's lifecycle.
  const imageCredit = patch.imageCredit || null;
  // Tag overrides: category (null = inherit) and retired (true/false = force,
  // null = inherit).
  const category = patch.category || null;
  const retired = (patch.retired === true || patch.retired === false) ? patch.retired : null;
  // Delete the row only when we know the full picture is empty — i.e. the image
  // key was provided (so we're sure there's no cover override to preserve) AND
  // no tag overrides remain.
  if (lore === null && altLore === null && symbolism === null && accessories === null
      && category === null && retired === null && hasImage && image === null) {
    const { error } = await sb.from('catalog_overrides').delete().eq('handle', handle);
    if (error) throw error;
    return null;
  }
  const row = { handle, lore, alt_lore: altLore, symbolism, accessories, category, retired, updated_by: window.currentUser.id };
  if (hasImage) { row.image = image; row.image_credit = imageCredit; }
  const { data: saved, error } = await sb
    .from('catalog_overrides')
    .upsert(row, { onConflict: 'handle' })
    .select()
    .single();
  if (error) throw error;
  return saved;
};

// ─── Catalog change feed ("Stirrings") ───────────────────────────────
// Push the current store state; the DB function diffs it against the snapshot
// and records any added/restocked/sold-out/retired transitions. Returns the
// number of new events. Best-effort — never throws into the caller.
data.syncCatalogEvents = async function (items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  try {
    const { data: n, error } = await sb.rpc('sync_catalog_events', { items });
    if (error) { console.warn('syncCatalogEvents', error.message || error); return 0; }
    return n || 0;
  } catch (e) { console.warn('syncCatalogEvents', e); return 0; }
};

// Read the most recent change-feed events, newest first.
data.listCatalogEvents = async function (limit = 30) {
  try {
    const { data: rows, error } = await sb
      .from('catalog_events')
      .select('id, handle, name, image, kind, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.warn('listCatalogEvents', error.message || error); return []; }
    return rows || [];
  } catch (e) { console.warn('listCatalogEvents', e); return []; }
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
  // Read through the routing helper so this works post-R2-cutover:
  // new photos live only in R2, so a direct Supabase signed URL would
  // 404. photoUrl() returns the R2 Worker URL when R2_BASE is set and
  // a Supabase signed URL otherwise.
  const url = await data.photoUrl(sourcePhotoPath);
  if (!url) throw new Error('source photo not found');
  const resp = await fetch(url, { mode: 'cors' });
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

data.suggestCatalogPhoto = async function ({ targetShopifyId, targetCatalogItemId, targetPenId, imagePath, notes, creditAnon }) {
  const { error } = await sb.from('catalog_photo_suggestions').insert({
    target_shopify_id: targetShopifyId || null,
    target_catalog_item_id: targetCatalogItemId || null,
    target_pen_id: targetPenId || null,
    image_path: imagePath,
    notes: notes || null,
    credit_anon: creditAnon === true,
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
  // Resolve who submitted each shot so the admin queue can show "@handle"
  // instead of a bare UUID (and so the same handle can become the photo
  // credit on approval).
  const submitterIds = [...new Set(rows.map((r) => r.submitted_by).filter(Boolean))];
  let submitters = new Map();
  if (submitterIds.length) {
    const { data: profs } = await sb.from('profiles').select('id, username').in('id', submitterIds);
    submitters = new Map((profs || []).map((p) => [p.id, p.username]));
  }
  await Promise.all(rows.map(async (r) => {
    r.image = r.image_path ? await data.catalogImageUrl(r.image_path) : null;
    r.submitted_by_username = submitters.get(r.submitted_by) || null;
  }));
  return rows;
};

// Approve a suggestion and route the photo to where its target renders:
//   • pen  → pens.image_path (single image).
//   • custom catalog_items UUID → that row's image_path/credit.
//   • raw Shopify id → the photo enters the item's catalog_photos gallery as
//     the new cover (slot A), bumping any existing A to the next free letter,
//     and mirrors to catalog_overrides.image. Caller passes the upstream
//     handle (from state.catalog). No shadow catalog_items row is created —
//     that used to spawn a phantom duplicate card next to the Shopify item.
data.adminApprovePhotoSuggestion = async function (suggestionId, shopifyProductIfNeeded) {
  const { data: row, error: e1 } = await sb
    .from('catalog_photo_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single();
  if (e1) throw e1;

  // Resolve the contributor's @handle so the approved cover credits whoever
  // sent it ("Image courtesy of @handle" in the detail view). Null if the
  // submitter has no profile/username — we'd rather show no credit than a
  // stale one carried over from a previous photo.
  let imageCredit = null;
  if (row.submitted_by) {
    const { data: prof } = await sb
      .from('profiles').select('username').eq('id', row.submitted_by).maybeSingle();
    if (prof?.username) imageCredit = '@' + prof.username;
  }

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

  // Flip the suggestion to approved — shared by every target branch below.
  const markApproved = async () => {
    const { error } = await sb
      .from('catalog_photo_suggestions')
      .update({
        status: 'approved',
        reviewed_by: window.currentUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', suggestionId);
    if (error) throw error;
  };

  // Custom catalog_items target — that row carries its own cover image, so
  // copy the path (and credit) straight onto it.
  if (row.target_catalog_item_id) {
    const { error: e2 } = await sb
      .from('catalog_items')
      .update({ image_path: row.image_path, image_credit: imageCredit, credit_anon: row.credit_anon === true })
      .eq('id', row.target_catalog_item_id);
    if (e2) throw e2;
    await markApproved();
    return;
  }

  // Shopify-product target (target_shopify_id). The approved photo joins the
  // item's catalog_photos gallery as the new cover (slot A); making it primary
  // mirrors its URL into catalog_overrides.image — the live render bridge.
  // We deliberately do NOT create a shadow catalog_items row: that produced a
  // phantom duplicate card sitting next to the real Shopify item.
  const handle = shopifyProductIfNeeded && shopifyProductIfNeeded.handle;
  if (!handle) {
    throw new Error('Shopify-targeted suggestion needs the upstream product handle passed in.');
  }
  const target = { handle };

  // The incoming shot always becomes Photo A. If an A already exists, bump it
  // to the letter just past the highest lettered slot in use (A,B,C → old A
  // becomes D; A only → old A becomes B) so the newest is always the cover.
  const existing = await data.adminListCatalogPhotos(target);
  const existingA = existing.find((p) => p.slot === 'A');
  if (existingA) {
    const codes = existing
      .map((p) => String(p.slot))
      .filter((s) => /^[A-Z]$/.test(s))
      .map((s) => s.charCodeAt(0));
    let bumpSlot;
    const nextCode = Math.max(...codes) + 1;
    if (nextCode <= 'Z'.charCodeAt(0)) {
      bumpSlot = String.fromCharCode(nextCode);
    } else {
      // Alphabet exhausted (26 community shots) — drop into the lowest free gap.
      const used = new Set(existing.map((p) => String(p.slot)));
      for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0) && !bumpSlot; c++) {
        const ch = String.fromCharCode(c);
        if (!used.has(ch)) bumpSlot = ch;
      }
      if (!bumpSlot) throw new Error('No free community photo slot (A–Z all taken).');
    }
    await data.adminSetCatalogPhotoSlot(existingA.id, bumpSlot);
  }

  const saved = await data.adminAddCatalogPhoto(target, {
    slot: 'A',
    imagePath: row.image_path,
    source: 'community',
    credit: imageCredit,
    creditAnon: row.credit_anon === true,
  });
  await data.adminSetCatalogPhotoPrimary(target, saved.id);

  await markApproved();
};

// "Keep, but not as the cover." Files an approved suggestion into the item's
// catalog_photos gallery at the lowest free lettered slot WITHOUT making it the
// cover (is_primary stays false; the current cover / override is untouched).
// Prep for a real multi-photo gallery: good shots are retained even when they
// aren't the chosen Picture A. Works for Shopify (handle), custom item, or pen
// targets — catalog_photos can hold all three.
data.adminKeepPhotoSuggestion = async function (suggestionId, shopifyProductIfNeeded) {
  const { data: row, error: e1 } = await sb
    .from('catalog_photo_suggestions').select('*').eq('id', suggestionId).single();
  if (e1) throw e1;

  let imageCredit = null;
  if (row.submitted_by) {
    const { data: prof } = await sb
      .from('profiles').select('username').eq('id', row.submitted_by).maybeSingle();
    if (prof?.username) imageCredit = '@' + prof.username;
  }

  let target;
  if (row.target_pen_id) target = { penId: row.target_pen_id };
  else if (row.target_catalog_item_id) target = { catalogItemId: row.target_catalog_item_id };
  else {
    const handle = shopifyProductIfNeeded && shopifyProductIfNeeded.handle;
    if (!handle) throw new Error('Shopify-targeted suggestion needs the upstream product handle passed in.');
    target = { handle };
  }

  // Lowest free lettered slot (A when the gallery is empty), so the kept shot
  // joins the gallery without disturbing whatever the cover currently is.
  const existing = await data.adminListCatalogPhotos(target);
  const used = new Set(existing.map((p) => String(p.slot)));
  let slot;
  for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const ch = String.fromCharCode(c);
    if (!used.has(ch)) { slot = ch; break; }
  }
  if (!slot) throw new Error('No free community photo slot (A–Z all taken).');

  await data.adminAddCatalogPhoto(target, {
    slot, imagePath: row.image_path, source: 'community', credit: imageCredit, creditAnon: row.credit_anon === true,
  });
  const { error } = await sb.from('catalog_photo_suggestions').update({
    status: 'approved', reviewed_by: window.currentUser.id, reviewed_at: new Date().toISOString(),
  }).eq('id', suggestionId);
  if (error) throw error;
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

  // R2 (via the Worker) — only once cutover has happened. List the
  // collection's objects through the Worker's prefix-list endpoint,
  // then delete each. If R2_BASE isn't set there's nothing in R2.
  if (window.R2_BASE) {
    try {
      const base = window.R2_BASE.replace(/\/$/, '');
      const { data: session } = await sb.auth.getSession();
      const jwt = session?.session?.access_token;
      if (jwt) {
        const resp = await fetch(`${base}/photos/${collectionId}/?list`, {
          headers: { authorization: `Bearer ${jwt}` },
        });
        if (resp.ok) {
          const { keys } = await resp.json();
          await Promise.all((keys || []).map((k) => data._r2Delete('photos', k)));
        }
      }
    } catch (e) { console.warn('r2 photo purge', e); }
  }
};

data.adminUpdateWishlist = async function (wishlistId, patch) {
  const { error } = await sb
    .from('wishlist')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', wishlistId);
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
    extras: Array.isArray(r.extras) ? r.extras : null,
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

// ─── Demo mode ───────────────────────────────────────────────────────
// A purely client-side, per-device recording aid. When ON, the signed-in
// account presents as an ordinary collector: every feature that isn't
// publicly available is hidden — gated perks (custom clothing), gated
// photo uploads, admin tooling, and the blue "insider" change-log notes —
// so an insider (e.g. redrambler) can record instructional videos that
// only show what regular members see.
//
// It is deliberately the lightest possible mechanism: a single
// localStorage flag. It writes NOTHING to the database, changes nothing
// for any other user, and is fully reversible — flipping it back off (or
// clearing site data) restores everything exactly. Auth re-derives the
// real identity from the profile on every boot, and toggling reloads the
// page so all gates re-evaluate cleanly with no half-applied UI state.
data.DEMO_MODE_KEY = 'plushcrypt.demoMode';
data.isDemoMode = function () {
  try { return localStorage.getItem(data.DEMO_MODE_KEY) === '1'; }
  catch { return false; }
};
data.setDemoMode = function (on) {
  try {
    if (on) localStorage.setItem(data.DEMO_MODE_KEY, '1');
    else localStorage.removeItem(data.DEMO_MODE_KEY);
  } catch { /* storage disabled (private mode) — non-fatal */ }
};

data.featureEnabled = function (key, defaultValue = true) {
  // Demo mode hides not-yet-public, gated features so recordings only show
  // what ordinary collectors have. custom_clothing is still an insider perk;
  // the allowlist/admin override below would otherwise keep it on for
  // redrambler, so short-circuit it here.
  // NOTE: user_photo_uploads used to be short-circuited here too, back when it
  // was an insider-gated perk. Since #128 opened photo suggestions to every
  // signed-in user, it IS what ordinary collectors see — so demo mode must no
  // longer hide it, or it misrepresents the live app (and leaves admins with no
  // way to see the upload field while previewing in demo mode).
  if (data.isDemoMode() && key === 'feature.custom_clothing') {
    return false;
  }
  // Per-user photo uploads: profiles.photo_uploads_enabled, with an
  // unconditional admin override. The global app_settings row from
  // 0017 is no longer consulted for this key — toggling now happens
  // on the per-user admin page.
  if (key === 'feature.user_photo_uploads') {
    if (window.currentUser?.isAdmin) return true;
    // Open to the whole community: any signed-in user can suggest a picture.
    // (Demo mode already short-circuited above; blocked/ghosted users can't use
    // the app at all.) Suggestions land in the admin review queue as 'pending'
    // and go live only on approval, so this is safe to open. Was per-user
    // opt-in (profiles.photo_uploads_enabled), now on for everyone logged in.
    return !!window.currentUser;
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
  // Insider prototype: the experimental 3-zone "rails" layout (left nav rail +
  // right contextual rail). Admin + allowlist only for now — no public toggle.
  if (key === 'feature.side_rails') {
    if (window.currentUser?.isAdmin) return true;
    const uname = (window.currentUser?.username || '').toLowerCase();
    return data.ALWAYS_GRANTED_USERNAMES.includes(uname);
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

// Admin moderation (db/0046). Same RLS path as the toggles above (admins may
// update any profile row); a DB trigger refuses to block/ghost an admin.
data.adminSetAppBlocked = async function (userId, on) {
  const { error } = await sb.from('profiles').update({ app_blocked: !!on }).eq('id', userId);
  if (error) throw error;
};
data.adminSetGhosted = async function (userId, on) {
  const { error } = await sb.from('profiles').update({ ghosted: !!on }).eq('id', userId);
  if (error) throw error;
};
// Moderator role (db/0066). Grants delete-any-content + the reports queue.
// Admin-only RLS update; safe to call again to flip it off.
data.adminSetModerator = async function (userId, on) {
  const { error } = await sb.from('profiles').update({ is_moderator: !!on }).eq('id', userId);
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
  if (data.isGhosted()) return [];
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
  if (data.isGhosted()) return [];
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
  // The 0034 RLS check rejects requests to someone you're blocked-with;
  // surface that as a friendly message instead of a raw policy error.
  if (error) {
    if (/row-level security|violates row-level/i.test(error.message || '')) {
      throw new Error('blocked');
    }
    throw error;
  }
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

// Lower rank = closer friend, used to float best friends to the top of the
// @mention typeahead (Coffin Buddy < Inner Circle < friend). Cached briefly so
// typing a handle doesn't re-query the whole friends list on every keystroke.
data._friendRankCache = null;   // { at: ms, map: Map<userId, rank> }
data.friendRankMap = async function () {
  const now = Date.now();
  if (data._friendRankCache && now - data._friendRankCache.at < 120000) {
    return data._friendRankCache.map;
  }
  const map = new Map();
  try {
    for (const f of await data.listFriends()) {
      map.set(f.userId, f.isCoffinBuddy ? 0 : f.isInner ? 1 : 2);
    }
  } catch (e) { console.warn('friendRankMap', e); }
  data._friendRankCache = { at: now, map };
  return map;
};

data.searchUsers = async function (prefix, limit = 12, opts = {}) {
  if (data.isGhosted()) return [];
  const q = (prefix || '').trim();
  if (!q) return [];
  // When ranking friends first, over-fetch candidates so a close friend whose
  // handle sorts late alphabetically still surfaces before we trim to `limit`.
  const fetchLimit = opts.rankByFriends ? Math.max(limit * 4, 24) : limit;
  const { data: rows, error } = await sb
    .from('profiles')
    .select('id, username, avatar_path')
    .ilike('username', q + '%')
    .neq('id', window.currentUser.id)
    .limit(fetchLimit);
  if (error) throw error;
  let list = rows || [];
  if (opts.rankByFriends) {
    const ranks = await data.friendRankMap();
    const rankOf = (r) => (ranks.has(r.id) ? ranks.get(r.id) : 3);
    list = list.slice().sort((a, b) => {
      const dr = rankOf(a) - rankOf(b);
      return dr || a.username.localeCompare(b.username);
    });
  }
  list = list.slice(0, limit);
  return await Promise.all(list.map(async (r) => ({
    userId: r.id,
    username: r.username,
    avatarUrl: r.avatar_path ? await data.socialPhotoUrl(r.avatar_path) : null,
  })));
};

// ─── Profile ────────────────────────────────────────────────────────
// ─── Share links (db/0089) ──────────────────────────────────────────
// Opt-in read-only public pages for a wish list or crypt showcase. The
// token is the whole secret: minting/revoking is RLS-scoped to the owner;
// viewing goes through the anon-callable shared_list_page RPC.
data.getShareLink = async function (kind) {
  const { data: row, error } = await sb.from('share_links').select('token')
    .eq('user_id', window.currentUser.id)
    .eq('collection_id', data.collectionId)
    .eq('kind', kind)
    .maybeSingle();
  if (error) throw error;
  return row?.token || null;
};

data.createShareLink = async function (kind) {
  const existing = await data.getShareLink(kind);
  if (existing) return existing;
  const { data: row, error } = await sb.from('share_links')
    .insert({ user_id: window.currentUser.id, collection_id: data.collectionId, kind })
    .select('token').single();
  if (error) throw error;
  return row.token;
};

data.revokeShareLink = async function (kind) {
  const { error } = await sb.from('share_links').delete()
    .eq('user_id', window.currentUser.id)
    .eq('collection_id', data.collectionId)
    .eq('kind', kind);
  if (error) throw error;
};

// Anonymous read — runs before (and without) sign-in on the share page.
data.fetchSharedPage = async function (token) {
  const { data: page, error } = await sb.rpc('shared_list_page', { p_token: token });
  if (error) throw error;
  return page;   // { owner, kind, items } | null (unknown/revoked token)
};

data.getSocialProfile = async function (userId) {
  // social_links may not exist pre-0035; fall back to the base columns so an
  // un-migrated client still loads profiles.
  let row, error;
  ({ data: row, error } = await sb
    .from('profiles')
    .select('id, username, bio, avatar_path, social_links, default_item_visibility')
    .eq('id', userId)
    .maybeSingle());
  // social_links (pre-0035) / default_item_visibility (pre-0094) may not exist
  // yet; fall back to the base columns so an un-migrated client still loads.
  if (error && /social_links|default_item_visibility/.test(error.message || '')) {
    ({ data: row, error } = await sb
      .from('profiles')
      .select('id, username, bio, avatar_path')
      .eq('id', userId)
      .maybeSingle());
  }
  if (error) throw error;
  if (!row) return null;
  return {
    ...row,
    socialLinks: row.social_links || {},
    // Castle Crew is the product default when the column is absent/unset.
    defaultItemVisibility: row.default_item_visibility || 'inner',
    avatarUrl: row.avatar_path ? await data.socialPhotoUrl(row.avatar_path) : null,
    // Visibility-aware public name (null when the owner opted out).
    displayName: await data.publicDisplayName(userId),
  };
};

// Another collector's crypt for the vault browser, filtered SERVER-SIDE to the
// plushes your friend tier is allowed to see (get_user_vault, db/0095). Returns
// collection view-items with resolved photo URLs, newest/sorted first. Viewing
// your own id returns your whole crypt (the RPC's owner branch).
data.getUserVault = async function (userId) {
  const { data: rows, error } = await sb.rpc('get_user_vault', { target: userId });
  if (error) {
    // Pre-0095 backend: the RPC doesn't exist yet. Degrade to an empty vault so
    // the rest of the profile still loads rather than throwing.
    if (/get_user_vault|does not exist|schema cache|function/i.test(error.message || '')) {
      console.warn('getUserVault (RPC absent?)', error.message);
      return [];
    }
    throw error;
  }
  const items = (rows || []).map((r) => data._rowToItem(r, 'collection'));
  await Promise.all(items.map(async (it) => {
    if (it.photoPath) { try { it.photo = await data.photoUrl(it.photoPath); } catch { /* leave unresolved */ } }
  }));
  return items;
};

// "How does my profile look to someone at tier X?" (db/0104). The tier ladder
// is defined once, in SQL, next to the real can_see_item rule — a JS copy would
// drift, and it would drift toward telling people their things are more private
// than they are. Both RPCs are hard-wired to auth.uid(), so this can only ever
// show you less of your OWN crypt.
//
// No silent degradation if the RPC is missing: a preview that quietly returns
// nothing would read as "nobody can see anything", which is the most dangerous
// wrong answer this feature could give.
data.previewMyProfileAs = async function (tier) {
  const [vaultRes, postRes] = await Promise.all([
    sb.rpc('preview_my_vault_as', { p_tier: tier }),
    sb.rpc('preview_my_posts_as', { p_tier: tier }),
  ]);
  if (vaultRes.error) throw vaultRes.error;
  if (postRes.error) throw postRes.error;

  const items = (vaultRes.data || []).map((r) => data._rowToItem(r, 'collection'));
  await Promise.all(items.map(async (it) => {
    if (it.photoPath) { try { it.photo = await data.photoUrl(it.photoPath); } catch { /* leave unresolved */ } }
  }));
  return { items, posts: await data._hydratePosts(postRes.data || []) };
};

// ─── Gifts + presents (db/0096) ─────────────────────────────────────
// Mark / unmark one of my own plushes as a "present": marking forces Only-me
// visibility (a present is a surprise) and sets the is_present flag for the
// badge. Un-marking clears the flag but leaves visibility as the user set it.
data.setPresent = async function (plushId, isPresent) {
  const patch = isPresent
    ? { is_present: true, visibility: 'private', updated_at: new Date().toISOString() }
    : { is_present: false, updated_at: new Date().toISOString() };
  const { error } = await sb.from('plushies').update(patch).eq('id', plushId);
  if (error) throw error;
};

// Offer a plush to a Coven+ friend. Server enforces ownership + tier + block +
// one-pending-per-plush. Returns the gift id.
data.sendGift = async function (plushId, recipientId, message) {
  const { data: id, error } = await sb.rpc('send_gift', {
    p_plush: plushId, p_recipient: recipientId, p_message: message || null,
  });
  if (error) throw error;
  return id;
};

// Recipient accepts (moves the plush into their crypt) or declines.
data.respondGift = async function (giftId, accept) {
  const { error } = await sb.rpc('respond_gift', { p_gift: giftId, p_accept: !!accept });
  if (error) throw error;
};

// Sender withdraws a still-pending gift.
data.cancelGift = async function (giftId) {
  const { error } = await sb.rpc('cancel_gift', { p_gift: giftId });
  if (error) throw error;
};

// Pending gifts in both directions, with resolved photos. Empty on a pre-0096
// backend so the UI degrades rather than throwing.
data.listMyGifts = async function () {
  const { data: rows, error } = await sb.rpc('list_my_gifts');
  if (error) {
    if (/list_my_gifts|does not exist|schema cache|function/i.test(error.message || '')) {
      console.warn('listMyGifts (RPC absent?)', error.message);
      return [];
    }
    throw error;
  }
  const gifts = (rows || []).map((r) => ({
    id: r.id,
    direction: r.direction,          // 'in' | 'out'
    status: r.status,
    message: r.message || null,
    plushId: r.plush_id,
    plushName: r.plush_name,
    photoPath: r.photo_path || null,
    photo: null,
    catalogId: r.catalog_id || null,
    otherId: r.other_id,
    otherUsername: r.other_username,
    createdAt: r.created_at,
  }));
  await Promise.all(gifts.map(async (g) => {
    if (g.photoPath) { try { g.photo = await data.photoUrl(g.photoPath); } catch { /* leave */ } }
  }));
  return gifts;
};

// Clear the note that came with a received gift — the recipient's to keep or
// remove. Leaves is_gift / gifted_by intact.
data.clearGiftMessage = async function (plushId) {
  const { error } = await sb.from('plushies')
    .update({ gift_message: null, updated_at: new Date().toISOString() })
    .eq('id', plushId);
  if (error) throw error;
};

// ─── Relics (db/0088) ───────────────────────────────────────────────
// Achievement badges. Earned server-side (triggers + claim_time_relics);
// the client only ever reads them. Best-effort: a pre-0088 backend just
// yields an empty shelf rather than a broken profile.
data.listRelics = async function (userId) {
  try {
    const { data: rows, error } = await sb
      .from('user_relics')
      .select('relic_key, earned_at')
      .eq('user_id', userId)
      .order('earned_at', { ascending: true });
    if (error) throw error;
    return (rows || []).map((r) => ({ key: r.relic_key, earnedAt: r.earned_at }));
  } catch (e) { console.warn('listRelics', e); return []; }
};

// Boot-time claim for time-based relics (year-one). Fire-and-forget.
data.claimTimeRelics = async function () {
  try { await sb.rpc('claim_time_relics'); }
  catch (e) { console.warn('claimTimeRelics', e); }
};

data.updateMyProfile = async function ({ bio, avatarBlob, socialLinks, defaultItemVisibility }) {
  const patch = {};
  if (bio !== undefined) patch.bio = bio;
  if (socialLinks !== undefined) patch.social_links = socialLinks;
  if (defaultItemVisibility !== undefined) patch.default_item_visibility = defaultItemVisibility;
  if (avatarBlob instanceof Blob) patch.avatar_path = await data.uploadSocialPhoto(avatarBlob);
  if (Object.keys(patch).length === 0) return;
  let { error } = await sb.from('profiles').update(patch).eq('id', window.currentUser.id);
  // Newer columns may not exist on an un-migrated backend (social_links pre-0035,
  // default_item_visibility pre-0094) — strip the offending one and retry so the
  // rest of the update still lands rather than failing the whole thing.
  for (const col of ['social_links', 'default_item_visibility']) {
    if (error && new RegExp(col).test(error.message || '') && col in patch) {
      delete patch[col];
      if (Object.keys(patch).length === 0) return;
      ({ error } = await sb.from('profiles').update(patch).eq('id', window.currentUser.id));
    }
  }
  if (error) throw error;
};

// ─── Posts ──────────────────────────────────────────────────────────
data.createPost = async function ({ body, visibility, photoBlob, catalogId, plushName, poll }) {
  let photoPath = null;
  if (photoBlob instanceof Blob) photoPath = await data.uploadSocialPhoto(photoBlob);
  const { data: row, error } = await sb.from('posts').insert({
    author_id: window.currentUser.id,
    body: body || null,
    photo_path: photoPath,
    catalog_id: catalogId || null,
    plush_name: plushName || null,
    visibility: visibility || 'public',
  }).select().single();
  if (error) throw error;
  // Optional attached poll (0079). The post body is the question (FB standard);
  // here we persist the poll row + its options. Options with blank labels are
  // dropped and duplicates (case-insensitive) collapsed.
  //
  // Atomicity: the post row is already committed (Supabase has no client-side
  // multi-statement transaction), so if any poll write fails we'd otherwise be
  // left with a poll-LESS post that looks published — the confusing symptom a
  // user hit. Per "fail loudly, no fake success," we instead undo the post and
  // throw, so the composer's catch surfaces a real error and nothing half-saved
  // survives. The user can cleanly retry.
  if (poll && Array.isArray(poll.options)) {
    const seen = new Set();
    const options = [];
    for (const raw of poll.options) {
      const label = String(raw || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(label);
    }
    try {
      // The composer already blocks < 2 options; this is the server-side guard.
      // Treat it as a hard failure rather than silently dropping the poll.
      if (options.length < 2) throw new Error('A poll needs at least 2 options.');
      const { error: pe } = await sb.from('polls').insert({
        post_id: row.id,
        multi: !!poll.multi,
        allow_add: !!poll.allowAdd,
        closes_at: poll.closesAt || null,
      });
      if (pe) throw pe;
      const { error: oe } = await sb.from('poll_options').insert(
        options.map((label, i) => ({ post_id: row.id, label, position: i, added_by: window.currentUser.id }))
      );
      if (oe) throw oe;
    } catch (err) {
      // Roll back the orphan post (best-effort) so a failed poll doesn't leave a
      // stray poll-less post behind, then re-throw for the caller to report.
      try { await sb.from('posts').delete().eq('id', row.id); }
      catch (cleanupErr) { console.error('createPost: orphan post cleanup failed', cleanupErr); }
      throw err;
    }
  }
  return row;
};

// Vote on a poll option, or remove my vote (on=false). Single-choice polls keep
// one vote per user: we delete my other votes on this post, then insert — the
// same swap pattern reactPost uses. Multi-choice polls just toggle the one
// (option_id, user_id) row. RLS rejects votes on a closed poll.
data.votePoll = async function (postId, optionId, on, multi) {
  const uid = window.currentUser.id;
  if (on) {
    if (!multi) {
      const { error: de } = await sb.from('poll_votes')
        .delete().eq('post_id', postId).eq('user_id', uid);
      if (de) throw de;
    }
    const { error } = await sb.from('poll_votes')
      .upsert({ option_id: optionId, post_id: postId, user_id: uid }, { onConflict: 'option_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await sb.from('poll_votes')
      .delete().eq('option_id', optionId).eq('user_id', uid);
    if (error) throw error;
  }
};

// Add an option to an existing poll (only works when the poll has allow_add, or
// I'm the post author — enforced by RLS). Returns the new option row.
data.addPollOption = async function (postId, label) {
  const clean = String(label || '').trim();
  if (!clean) throw new Error('Empty poll option');
  const { data: row, error } = await sb.from('poll_options')
    .insert({ post_id: postId, label: clean, position: 999, added_by: window.currentUser.id })
    .select().single();
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
    // emoji may not exist pre-0076; select('*') so the query doesn't error on
    // older schemas (a missing emoji falls back to 🖤, the legacy heart-like).
    sb.from('post_likes').select('*').in('post_id', postIds),
    // parent_comment_id may not exist pre-0032; select('*') so the query
    // doesn't error on older schemas.
    sb.from('post_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
  ]);

  // Posts carry the same Facebook-style emoji reactions as comments (0076). The
  // (post_id, user_id) PK means one reaction per user, so this aggregates into
  // the same {emoji, count, mine}[] shape renderPostCard shares with comments.
  const likeCount = new Map();
  const reactByPost = new Map();
  for (const l of (likes || [])) {
    const emoji = l.emoji || '🖤';
    likeCount.set(l.post_id, (likeCount.get(l.post_id) || 0) + 1);
    if (!reactByPost.has(l.post_id)) reactByPost.set(l.post_id, new Map());
    const m = reactByPost.get(l.post_id);
    const cur = m.get(emoji) || { count: 0, mine: false };
    cur.count++; if (l.user_id === uid) cur.mine = true;
    m.set(emoji, cur);
  }
  const postReactionsFor = (pid) => {
    const m = reactByPost.get(pid);
    return m ? [...m.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine })) : [];
  };
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

  // Polls (0079) — best-effort so a pre-0079 client still works. A post has at
  // most one poll; options + votes hang off post_id. Votes are anonymous in the
  // product, so we only keep tallies, my own picks, and the distinct voter count
  // (the denominator for each option's % — matches how Facebook shows multi-
  // select polls, where one option can reach 100% of voters).
  const pollByPost = new Map();
  const optionsByPost = new Map();
  const votesByOption = new Map();     // option_id -> vote count
  const votersByOption = new Map();    // option_id -> [user_id, …] (who voted; polls are non-anonymous, FB-style)
  const myVoteOptions = new Set();     // option_ids I voted for
  const voterCountByPost = new Map();  // post_id -> distinct voter count
  try {
    const [{ data: polls }, { data: options }] = await Promise.all([
      sb.from('polls').select('*').in('post_id', postIds),
      sb.from('poll_options').select('*').in('post_id', postIds).order('position', { ascending: true }),
    ]);
    for (const pl of (polls || [])) pollByPost.set(pl.post_id, pl);
    for (const o of (options || [])) {
      if (!optionsByPost.has(o.post_id)) optionsByPost.set(o.post_id, []);
      optionsByPost.get(o.post_id).push(o);
    }
    const optionIds = (options || []).map((o) => o.id);
    if (optionIds.length) {
      const { data: votes } = await sb.from('poll_votes')
        .select('option_id, post_id, user_id').in('option_id', optionIds);
      const votersByPost = new Map(); // post_id -> Set(user_id)
      for (const v of (votes || [])) {
        votesByOption.set(v.option_id, (votesByOption.get(v.option_id) || 0) + 1);
        if (!votersByOption.has(v.option_id)) votersByOption.set(v.option_id, []);
        votersByOption.get(v.option_id).push(v.user_id);
        if (v.user_id === uid) myVoteOptions.add(v.option_id);
        if (!votersByPost.has(v.post_id)) votersByPost.set(v.post_id, new Set());
        votersByPost.get(v.post_id).add(v.user_id);
      }
      for (const [pid, set] of votersByPost) voterCountByPost.set(pid, set.size);
    }
  } catch (e) { console.warn('polls load', e); }
  const pollFor = (pid) => {
    const pl = pollByPost.get(pid);
    if (!pl) return null;
    const opts = optionsByPost.get(pid) || [];
    const totalVoters = voterCountByPost.get(pid) || 0;
    const closed = pl.closes_at ? (+new Date(pl.closes_at) <= Date.now()) : false;
    return {
      multi: !!pl.multi,
      allowAdd: !!pl.allow_add,
      closesAt: pl.closes_at || null,
      closed,
      totalVoters,
      options: opts.map((o) => {
        const count = votesByOption.get(o.id) || 0;
        return {
          id: o.id,
          label: o.label,
          count,
          mine: myVoteOptions.has(o.id),
          // % of voters (not votes) — sums to 100 for single-choice, and lets a
          // single option reach 100% for multi-choice, as Facebook does.
          pct: totalVoters ? Math.round((count / totalVoters) * 100) : 0,
          // Who voted for this option (FB-style, non-anonymous). Resolved to
          // display names; ids that don't resolve (e.g. ghosted) fall back below.
          voters: (votersByOption.get(o.id) || []).map((vid) => ({
            id: vid,
            name: profs.get(vid)?.username ?? 'unknown',
            avatarUrl: profs.get(vid)?.avatarUrl ?? null,
          })),
        };
      }),
    };
  };

  // Resolve every author (posts + comment authors) in one batch.
  const ids = new Set(rows.map((r) => r.author_id));
  for (const c of (comments || [])) ids.add(c.author_id);
  for (const voters of votersByOption.values()) for (const vid of voters) ids.add(vid);
  const profs = await data._resolveProfiles([...ids]);

  // Resolve comment photo urls up front (0090) — buildThread is sync.
  const commentPhotoUrls = new Map();
  for (const c of (comments || [])) {
    if (c.photo_path && !commentPhotoUrls.has(c.photo_path)) {
      commentPhotoUrls.set(c.photo_path, await data.socialPhotoUrl(c.photo_path));
    }
  }

  // Build a threaded comment tree (top-level + nested replies), preserving the
  // chronological order the rows already arrived in.
  const buildThread = (list, postAuthorId) => {
    const toView = (c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: profs.get(c.author_id)?.username ?? 'unknown',
      authorAvatar: profs.get(c.author_id)?.avatarUrl ?? null,
      body: c.body,
      photoUrl: c.photo_path ? commentPhotoUrls.get(c.photo_path) : null,
      createdAt: c.created_at,
      parentId: c.parent_comment_id || null,
      mine: c.author_id === uid,
      canDelete: c.author_id === uid || postAuthorId === uid || window.currentUser?.canModerate === true,
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
    relicKey: r.relic_key || null,   // db/0088 — renders the ornate relic card
    createdAt: r.created_at,
    // "edited" when updated_at drifts more than a few seconds past
    // created_at (the insert sets them ~equal).
    edited: r.updated_at ? (+new Date(r.updated_at) - +new Date(r.created_at) > 5000) : false,
    mine: r.author_id === uid,
    likeCount: likeCount.get(r.id) || 0,
    reactions: postReactionsFor(r.id),
    poll: pollFor(r.id),
    comments: buildThread(commentsByPost.get(r.id) || [], r.author_id),
    commentCount: (commentsByPost.get(r.id) || []).length,
  })));
};

// A ghosted (or app-blocked) user is isolated from everyone else: server RLS
// already hides others' rows and shadow-hides theirs, but we also short-circuit
// the client list calls so social/trades read as cleanly empty (no flicker, and
// not even their own rows leak into a feed that should look dead). db/0046.
data.isGhosted = function () {
  return window.currentUser?.ghosted === true || window.currentUser?.appBlocked === true;
};

// The feed: every post RLS lets me see (mine + friends' + public),
// newest first. Early-Facebook style — one global-ish river.
data.listFeed = async function (limit = 60) {
  if (data.isGhosted()) return [];
  const { data: rows, error } = await sb
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return await data._hydratePosts(rows);
};

data.listUserPosts = async function (userId, limit = 40) {
  // A ghost can still see their own profile, but no one else's.
  if (data.isGhosted() && userId !== window.currentUser?.id) return [];
  const { data: rows, error } = await sb
    .from('posts')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return await data._hydratePosts(rows);
};

// React to a post with an emoji, or remove my reaction (on=false). One row per
// user per post (PK post_id,user_id), so a *swap* upserts on that conflict —
// an UPDATE, which doesn't re-fire the after-insert push trigger (0042/0076).
data.reactPost = async function (postId, emoji, on) {
  const uid = window.currentUser.id;
  if (on) {
    const { error } = await sb.from('post_likes')
      .upsert({ post_id: postId, user_id: uid, emoji }, { onConflict: 'post_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await sb.from('post_likes')
      .delete().eq('post_id', postId).eq('user_id', uid);
    if (error) throw error;
  }
};

data.addComment = async function (postId, body, parentCommentId = null, photoBlob = null) {
  // body may be null for a photo-only comment (0090's check constraint
  // requires text or a photo). Upload first so a failed upload never
  // leaves a photo-less "photo comment" row behind.
  const insert = { post_id: postId, author_id: window.currentUser.id, body: body || null };
  if (photoBlob instanceof Blob) insert.photo_path = await data.uploadSocialPhoto(photoBlob);
  if (parentCommentId) insert.parent_comment_id = parentCommentId;
  const { data: row, error } = await sb.from('post_comments').insert(insert).select().single();
  if (error) throw error;
  return row;
};

data.deleteComment = async function (commentId) {
  const { error } = await sb.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
};

// Edit one of my own comments (item 25). RLS restricts updates to the author.
data.editComment = async function (commentId, body) {
  const { error } = await sb.from('post_comments')
    .update({ body }).eq('id', commentId).eq('author_id', window.currentUser.id);
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
    // Raw stored path (a 'social' object key, an external URL, or Tom's
    // /tom.jpg asset) — kept so the picker can re-save without re-copying
    // or losing a bespoke upload; photoUrl is the resolved display URL.
    photoPath: r.photo_path || null,
    photoUrl: r.photo_path ? await data.socialPhotoUrl(r.photo_path) : null,
  })));
};

// Replace my whole Top 8 with `entries` (ordered array, max 8). Each
// entry: { plushName, catalogId?, socialBlob?, socialPath?, photoPath? }.
// Photo precedence per bun (first that's present wins):
//   socialBlob  — a freshly-uploaded photo just for this slot; goes to 'social'.
//   socialPath  — a path already stored last save (social key / URL / Tom's
//                 asset); kept as-is, so re-saving never loses a bespoke
//                 upload nor re-copies.
//   photoPath   — the bun's ORIGINAL 'photos'-bucket path from the owner's
//                 collection; copied into 'social' so viewers can see it.
// A bun always keeps its catalog_id too, so renderTop8 can fall back to the
// store/catalog image whenever no photo of their own is set.
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
    if (e.socialBlob) {
      // A photo they just uploaded for this slot — straight into 'social'.
      try { photoPath = await data.uploadSocialPhoto(e.socialBlob); }
      catch (err) { console.warn('top8 photo upload failed', err); }
    } else if (e.socialPath) {
      // Already-stored path (prior social copy, external URL, or Tom's asset).
      photoPath = e.socialPath;
    } else if (e.photoPath && (e.photoPath.startsWith('/') || e.photoPath.startsWith('http'))) {
      // Same-origin asset or an already-external URL — store as-is.
      photoPath = e.photoPath;
    } else if (e.photoPath) {
      // Their own collection photo (private 'photos' bucket) — copy into
      // 'social' so viewers can see it. Runs even for catalog buns now, so
      // their photo shows instead of the shared store image.
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
  // Replace-all in one atomic RPC (db/0081): the old delete-then-insert had
  // no transaction, so a failed insert permanently wiped the user's Top 8
  // (free plan = no backups). The RPC deletes + inserts in one transaction —
  // if the insert fails the delete rolls back and the old list survives.
  // owner_id is forced to auth.uid() server-side, so we strip it here.
  const payload = rows.map(({ owner_id, ...r }) => r);
  const { error } = await sb.rpc('set_top_plushes', { p_rows: payload });
  if (error) throw error;
};

// ─── Private messages (DMs, db/0083) ─────────────────────────────────
// Friends-only 1:1 messages. All the rules live in the DB (RLS): friends
// only, blocks kill the channel, ghosted senders are filtered from the
// recipient's reads. No isGhosted() client guard here on purpose — a ghost
// still sees their own conversations and can "send" (the recipient just
// never receives), which is the same illusion the feed maintains.

// Thread list: latest message + unread count per partner, newest first.
data.listDmThreads = async function () {
  const { data: rows, error } = await sb.rpc('dm_threads');
  if (error) throw error;
  return await Promise.all((rows || []).map(async (r) => ({
    partnerId: r.partner_id,
    username: r.username,
    avatarUrl: r.avatar_path ? await data.socialPhotoUrl(r.avatar_path) : null,
    lastBody: r.last_body,
    lastFromMe: r.last_sender === window.currentUser.id,
    lastAt: r.last_at,
    unread: Number(r.unread) || 0,
  })));
};

// One conversation, oldest → newest (capped; DMs are short-form).
data.listDmMessages = async function (partnerId, { limit = 200 } = {}) {
  const uid = window.currentUser.id;
  const { data: rows, error } = await sb
    .from('dm_messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(`and(sender_id.eq.${uid},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${uid})`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (rows || []).reverse().map((m) => ({
    id: m.id,
    mine: m.sender_id === uid,
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));
};

data.sendDm = async function (recipientId, body) {
  const { data: row, error } = await sb
    .from('dm_messages')
    .insert({ sender_id: window.currentUser.id, recipient_id: recipientId, body })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return row;
};

// Mark everything they sent me as read (opening the conversation).
data.markDmRead = async function (partnerId) {
  const { error } = await sb
    .from('dm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', window.currentUser.id)
    .eq('sender_id', partnerId)
    .is('read_at', null);
  if (error) throw error;
};

// Total unread across all conversations — drives the 💬 header badge.
data.dmUnreadCount = async function () {
  const { count, error } = await sb
    .from('dm_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', window.currentUser.id)
    .is('read_at', null);
  if (error) throw error;
  return count || 0;
};

// ─── Notification inbox (db/0085) ────────────────────────────────────
// Every push trigger queues here via _push_send; the app-open poll
// (maybeFireQueuedNotifications) locally fires whatever real push didn't
// deliver. Oldest first so a burst reads in order.
data.listUndeliveredNotifications = async function ({ limit = 20 } = {}) {
  const { data: rows, error } = await sb
    .from('notifications')
    .select('id, title, body, url, tag, created_at, actor_id, kind, post_id, comment_id, excerpt')
    .eq('user_id', window.currentUser.id)
    .is('delivered_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return rows || [];
};

data.markNotificationsDelivered = async function (ids) {
  if (!ids?.length) return;
  const { error } = await sb
    .from('notifications')
    .update({ delivered_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
};

// ─── In-app notification bell (db/0085's reserved seen_at) ──────────
// The 🔔 inbox: recent rows regardless of delivery — a push that buzzed a
// phone still shows here, so a desktop session can catch up on what the
// OS banner (or another device) announced. Newest first.
data.listRecentNotifications = async function ({ limit = 30 } = {}) {
  const { data: rows, error } = await sb
    .from('notifications')
    .select('id, title, body, url, tag, created_at, seen_at, actor_id, kind, post_id, comment_id, excerpt')
    .eq('user_id', window.currentUser.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return rows || [];
};

// Opening the inbox stamps what it showed (0085 grants UPDATE on seen_at).
data.markNotificationsSeen = async function (ids) {
  if (!ids?.length) return;
  const { error } = await sb
    .from('notifications')
    .update({ seen_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
};

window.data = data;
