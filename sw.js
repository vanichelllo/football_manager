// Офлайн-режим: спершу мережа (щоб завжди була свіжа версія), без мережі — збережена копія.
// cache: 'no-cache' — щоразу питаємо сервер, чи файл змінився (GitHub Pages інакше дозволяє браузеру
// 10 хвилин тримати стару копію, і встановлений застосунок не бачить нової версії одразу після публікації).
const CACHE = 'golovnyi-trener-v2';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
