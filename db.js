// IndexedDB wrapper for Plushie Dreadfuls tracker.
const DB_NAME = 'plushie-dreadful';
const DB_VERSION = 1;
const STORES = ['collection', 'wishlist', 'meta'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('collection')) {
        db.createObjectStore('collection', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('wishlist')) {
        db.createObjectStore('wishlist', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idb = {
  async getAll(store) {
    return reqToPromise((await tx(store)).getAll());
  },
  async get(store, id) {
    return reqToPromise((await tx(store)).get(id));
  },
  async put(store, item) {
    return reqToPromise((await tx(store, 'readwrite')).put(item));
  },
  async delete(store, id) {
    return reqToPromise((await tx(store, 'readwrite')).delete(id));
  },
  async setMeta(key, value) {
    return reqToPromise((await tx('meta', 'readwrite')).put({ key, value }));
  },
  async getMeta(key) {
    const row = await reqToPromise((await tx('meta')).get(key));
    return row ? row.value : null;
  },
};

window.idb = idb;
