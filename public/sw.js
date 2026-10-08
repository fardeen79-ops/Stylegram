// Stylegram service worker: makes the app installable and lets it open offline.
const VERSION = "v8";
const SHELL_CACHE = `shell-${VERSION}`;
const MEDIA_CACHE = `media-${VERSION}`;
const FONT_CACHE = `fonts-${VERSION}`;
// Last-seen API responses, so the feed, profiles and posts still open offline.
// The page deletes this cache whenever someone logs in or out.
const API_CACHE = "api-v1";
const API_NO_CACHE = ["/api/auth/", "/api/admin/", "/api/brand/"];
const SHELL = [
  "/",
  "/app.js",
  "/icons.js",
  "/i18n.js",
  "/style.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-64.png",
];
const MAX_MEDIA = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, MEDIA_CACHE, FONT_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/** Serve from cache immediately, refresh the cache in the background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Fonts (cross-origin): cache-first.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(async (c) => (await c.match(request)) ?? fetch(request).then((r) => (c.put(request, r.clone()), r))));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Outbound shop links always go to the network.
  if (url.pathname.startsWith("/t/")) return;

  // API reads: network first; when offline, answer with the last response we saw (marked as cached).
  if (url.pathname.startsWith("/api/")) {
    if (API_NO_CACHE.some((p) => url.pathname.startsWith(p))) return;
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Clone now: once the page starts reading the body, it can no longer be copied.
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request, { cacheName: API_CACHE });
          if (!hit) throw new Error("offline");
          const headers = new Headers(hit.headers);
          headers.set("X-Offline-Cache", "1");
          return new Response(hit.body, { status: hit.status, headers });
        }),
    );
    return;
  }

  // Photos never change once uploaded (random file names): cache-first.
  if (url.pathname.startsWith("/media/")) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async (c) => {
        const hit = await c.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) { c.put(request, res.clone()); trim(MEDIA_CACHE, MAX_MEDIA); }
        return res;
      }),
    );
    return;
  }

  // Page loads: network first, fall back to the cached app shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
