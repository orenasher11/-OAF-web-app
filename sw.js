const CACHE = 'oaf-tasks-v2';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'design/', 'design/base.css', 'design/app.js', 'design/blueprint.html', 'design/blueprint.css', 'design/midnight.html', 'design/midnight.css', 'design/hivis.html', 'design/hivis.css'];

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
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
