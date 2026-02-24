// public/sw.js — Service Worker: cache + push notifications
const CACHE = 'richcouple-v2';
const PRECACHE = ['/', '/dashboard', '/manifest.json'];

// ── Install ─────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch (cache first para assets, network first para navegação) ─
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/dashboard')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});

// ── Push Notifications ──────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: 'The Rich Couple', body: e.data.text() };
  }

  const { title = 'The Rich Couple', body = '', icon = '/icon-192.png', url = '/dashboard', tag } = payload;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icon-192.png',
      tag: tag || 'rc-default',
      renotify: true,
      data: { url },
      vibrate: [200, 100, 200],
    })
  );
});

// ── Notification Click ──────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || '/dashboard';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(target);
      } else {
        clients.openWindow(target);
      }
    })
  );
});

// ── Background Sync (checagem local de lembretes) ───────────────
// Disparado pelo app quando volta online após período offline
self.addEventListener('sync', (e) => {
  if (e.tag === 'check-reminders') {
    e.waitUntil(checkLocalReminders());
  }
});

async function checkLocalReminders() {
  // Busca lembretes salvos localmente pelo app (sem precisar de servidor)
  const cache = await caches.open(CACHE);
  const remindersRes = await cache.match('/reminders.json');
  if (!remindersRes) return;

  const reminders = await remindersRes.json();
  const today = new Date().toISOString().split('T')[0];

  for (const r of reminders) {
    if (r.date === today) {
      await self.registration.showNotification(r.title, {
        body: r.body,
        icon: '/icon-192.png',
        tag: `reminder-${r.id}`,
        data: { url: r.url || '/dashboard' },
      });
    }
  }
}