/* EVEN offline cache for the hosted app. The page and its icons come from the cache at once (works without a
   connection); in the background the network is asked for a newer copy, which is used from the next start on.
   The cache name carries the build version (same as <meta name="build"> in src/01_head.html): a new build = a new cache.
   All Design Lab apps share the origin jeetx1.github.io and with it one cache storage: only EVEN's own caches are cleared. */
const CACHE = 'even-2026-10-25.4';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  /* cache: 'reload' skips the browser's HTTP cache, so a new build never caches the previous page */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('even-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(r, { ignoreSearch: true }).then(hit => {
    const netz = fetch(r).then(antwort => { if (antwort.ok) c.put(r, antwort.clone()); return antwort; }).catch(() => hit);
    return hit || netz;
  })));
});
