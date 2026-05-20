// Linka — Service Worker (v1.2)
const CACHE_NAME = 'linka-v1.5';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/favicon.png',
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'Linka', body: 'Você tem uma nova notificação!' };

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
    tag: data.tag || 'linka-notification',
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
