const CACHE_NAME = 'testrekrut-scs-v1';
const BASE = new URL('./', self.location.href);
const PRECACHE = [
  new URL('./', self.location.href).href,
  new URL('./index.html', self.location.href).href,
  new URL('./manifest.webmanifest', self.location.href).href,
  new URL('./icon-192.png', self.location.href).href,
  new URL('./icon-512.png', self.location.href).href
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k.startsWith('testrekrut-scs-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache Firebase/API traffic; authentication and access-code checks need the network.
  if (url.pathname.includes('/__/') || url.hostname.includes('firebase') || url.hostname.includes('googleapis.com')) return;

  if (req.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./index.html', self.location.href).href).then(cached => cached || fetch(req)));
    return;
  }

  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    if (response && response.ok && url.origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
    }
    return response;
  }).catch(() => caches.match(req))));
});
