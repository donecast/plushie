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
  async loadActiveCollection() {
    const userId = window.currentUser.id;
    const { data: rows, error } = await sb
      .from('collection_members')
      .select('collection_id, role')
      .eq('user_id', userId);
    if (error) throw error;
    if (!rows || rows.length === 0) throw new Error('no_collection');
    const owned = rows.find((r) => r.role === 'owner') || rows[0];
    data.collectionId = owned.collection_id;
    return data.collectionId;
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
    const { error } = await sb.from(table).upsert(row);
    if (error) throw error;
  },

  async delete(kind, id) {
    const table = kind === 'collection' ? 'plushies' : 'wishlist';
    // Best-effort photo cleanup
    const { data: row } = await sb.from(table).select('photo_path').eq('id', id).maybeSingle();
    if (row?.photo_path && !row.photo_path.startsWith('http')) {
      await data.deletePhoto(row.photo_path).catch(() => {});
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
        meaning: r.meaning,
        dateCollected: r.date_collected,
        acquiredHow: r.acquired_how,
        hasBag: r.has_bag,
        retired: r.retired,
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
        meaning: item.meaning ?? null,
        date_collected: item.dateCollected ?? null,
        acquired_how: item.acquiredHow ?? null,
        has_bag: item.hasBag !== false,
        retired: !!item.retired,
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

    async function prepPhoto(item) {
      if (item.photo instanceof Blob) return; // data.put handles it
      if (typeof item.photo === 'string' && item.photo.startsWith('http')) {
        try {
          const resp = await fetch(item.photo, { mode: 'cors' });
          if (resp.ok) item.photo = await resp.blob();
        } catch { /* leave URL string; data.put will store it as-is */ }
      }
    }

    for (const it of localCol) { await prepPhoto(it); await data.put('collection', it); }
    for (const it of localWish) { await prepPhoto(it); await data.put('wishlist', it); }

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

window.data = data;
