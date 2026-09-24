
const CACHE = "testrekrut-scs-static-v2";

const STATIC = [
  "./",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        return Promise.all(
          STATIC.map(url =>
            cache.add(url).catch(err => {
              console.warn("Nie udało się zapisać w cache:", url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();

              caches.open(CACHE)
                .then(cache => cache.put(event.request, copy))
                .catch(() => {});
            }

            return response;
          })
          .catch(() => {
            return caches.match("./");
          });
      })
  );
});
