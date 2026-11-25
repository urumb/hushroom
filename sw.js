// sw.js — tiny offline cache. Pre-caches the static files, then serves
// network-first (so updates show immediately) and falls back to the cache when offline.
// Bump VERSION whenever you change files so users get the update.

const VERSION = 'hushroom-v8';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/main.js', 'js/timer.js', 'js/audio.js', 'js/scene.js', 'js/tasks.js', 'js/stats.js', 'js/storage.js',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.some((k) => k !== VERSION);
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Someone with an older copy open: refresh it once so they see the new design.
    if (hadOld) (await self.clients.matchAll({ type: 'window' })).forEach((c) => c.navigate(c.url));
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
