// TESTREKRUT SG — cache version 6
const CACHE = "testrekrut-sg-v6";
const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-512.png"
];
const OPTIONAL_FILES = ["./icon-header.png", "./testrekrut-sg-bg.jpg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Core files must be available; optional graphics must not block SW installation.
    await cache.addAll(CORE_FILES);
    await Promise.all(OPTIONAL_FILES.map(async path => {
      try { await cache.add(path); }
      catch (error) { console.warn("TESTREKRUT PWA: pominięto opcjonalny plik:", path, error); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("testrekrut-sg-") && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put("./index.html", response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match("./index.html");
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Manifest and icons are refreshed from the network first to avoid stale branding.
  const path = url.pathname;
  const isBrandAsset = /\/(manifest\.webmanifest|icon-180\.png|icon-512\.png|icon-header\.png)$/.test(path);
  if (isBrandAsset) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
