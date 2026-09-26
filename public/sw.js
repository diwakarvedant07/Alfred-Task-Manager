// Bump CACHE_NAME whenever caching behaviour changes so stale caches are purged.
const CACHE_NAME = "arc-shell-v2";
const SHELL_ASSETS = ["/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always serve fresh HTML/chunks (build hashes change on every
// build), and only fall back to the cache when offline. Never intercept
// non-GET requests or cross-origin traffic.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error())));
});
