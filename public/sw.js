// Empreende iCEV — Service Worker
// v3: drops the v2 caches, which also held Supabase responses (codes, profiles).
const CACHE_NAME = 'empreende-icev-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/favicon.svg',
  '/icons/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/brand/logo.svg',
  '/brand/logo-on-dark.svg',
  '/brand/wordmark-on-dark.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Only the site's own files are cached (network first, cache when offline). Supabase and the
// API carry personal data (coupon codes, profiles) and are never stored on the device.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then((cached) => {
        if (cached) return cached;
        // Offline: pages open the app shell; a missing file stays a network error.
        return e.request.mode === 'navigate' ? caches.match('/index.html') : Response.error();
      }))
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'Empreende iCEV', body: 'Você tem uma nova notificação.' };

  try {
    if (e.data) {
      data = e.data.json();
    }
  } catch {
    if (e.data) {
      data.body = e.data.text();
    }
  }

  const options = {
    body: data.body || '',
    icon: '/icons/favicon.png',
    badge: '/icons/favicon.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || data.action_url || '/',
      notificationId: data.id,
    },
    actions: data.actions || [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
    tag: data.tag || 'empreende-notification',
    renotify: true,
  };

  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  if (e.action === 'dismiss') return;

  const url = e.notification.data?.url || '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-coupons') {
    e.waitUntil(syncPendingCoupons());
  }
});

async function syncPendingCoupons() {
  console.log('[SW] Syncing pending coupons...');
}
