const CACHE = 'oaf-tasks-v23';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'assets/base.css?v=23', 'assets/theme.css?v=23', 'assets/app.js?v=23', 'assets/config.js?v=23', 'assets/sync.js?v=23'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// network first so updates show up, cache as offline fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
