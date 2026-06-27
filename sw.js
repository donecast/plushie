// Plushie Dreadfuls service worker — offline app shell.
const CACHE = 'plushie-dreadful-v158';
// Only precache the root + static assets that don't carry cache-buster query
// strings. Versioned files (app.js?v=N, styles.css?v=N, catalog.json?v=N)
// get fetched and cached on demand by the fetch handler — listing them here
// with a stale version would 404 the addAll and block the install entirely.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Network-first for navigations so deploys land quickly; cache fallback offline.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
        return resp;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for same-origin assets.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      }).catch(() => hit))
    );
  }
});

// Real Web Push: a payload from the send-push edge function arrives even
// when the app is closed. Shape: { title, body, url, tag, icon }. We keep
// the rendering identical to the in-app fireLocalNotification helper so a
// Capacitor Push plugin can later deliver the same payload shape natively.
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (_) {
    data = { body: e.data ? e.data.text() : '' };
  }
  const title = data.title || '🦇 The Plush Crypt';
  const opts = {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'plush-push',
    data: { url: data.url || './' },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Map a notification's tag to the app tab it should open. Tags are set by the
// push triggers / local helpers (e.g. 'trade-<id>', 'friend-request',
// 'like-<id>'); we only need the prefix to pick a destination. null = root.
function tabForTag(tag) {
  if (!tag) return null;
  if (tag.startsWith('trade-') || tag === 'trade-action') return 'trade';
  if (tag === 'friend-request' || tag === 'friend-accept' ||
      tag === 'coffin-buddy' ||
      tag.startsWith('post-') || tag.startsWith('like-') || tag.startsWith('comment-')) {
    return 'home';
  }
  return null;
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tab = tabForTag(e.notification.tag);
  const target = tab ? `./#${tab}` : ((e.notification.data && e.notification.data.url) || './');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) {
          // App is already open — tell it which tab to show, then focus it.
          if (tab) c.postMessage({ type: 'notification-nav', tab });
          return c.focus();
        }
      }
      // Nothing open — launch with the tab in the hash so boot lands there.
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
