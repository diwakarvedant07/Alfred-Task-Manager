const CACHE_NAME = "arc-shell-v3";
// Relative to this script's URL, so they resolve under the app's basePath.
const SHELL_ASSETS = ["./", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  // Replace an older (cache-first) worker right away instead of waiting for
  // every tab to close, so stale pages stop being served.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Network-first for page navigations only: always serve the live app, and
// fall back to the cached shell only when offline. Everything else (JS
// chunks, API/auth calls, the dev HMR socket) goes straight to the network.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached ?? caches.match("./"))
    )
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
