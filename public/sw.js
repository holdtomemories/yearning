/* ─────────────────────────────────────────────────────────────────────────
   yearning — Service Worker
   Strategy:
     • App shell (/, /index.html, JS/CSS bundles)  → Cache-first, revalidate
     • Map tiles (cartocdn)                         → Cache-first, long TTL
     • Google Fonts                                 → Cache-first, long TTL
     • Nominatim search                             → Network-first, offline fallback
     • Everything else                              → Network-first
   Pins live in localStorage (same origin) — they are NOT in the SW cache.
   The SW only caches *assets*, never user data. localStorage is always
   available to both the browser tab and the installed PWA because they
   share the same origin scope.
───────────────────────────────────────────────────────────────────────── */

const APP_SHELL_CACHE  = "yearning-shell-v1";
const TILE_CACHE       = "yearning-tiles-v1";
const FONT_CACHE       = "yearning-fonts-v1";

// Assets to pre-cache on install (Next.js will bust these via hashed filenames;
// list the stable paths — Next.js also emits a __NEXT_DATA__ manifest we can read).
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Take over immediately — don't wait for old SW to die
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const CURRENT_CACHES = [APP_SHELL_CACHE, TILE_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !CURRENT_CACHES.includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // ── Map tiles (Cartocdn) — cache-first, 7-day TTL, max 500 entries ──────
  if (url.hostname.includes("cartocdn.com") || url.hostname.includes("basemaps")) {
    event.respondWith(cacheFirstWithExpiry(request, TILE_CACHE, 7 * 24 * 60 * 60, 500));
    return;
  }

  // ── Google Fonts — cache-first, long TTL ────────────────────────────────
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirstWithExpiry(request, FONT_CACHE, 30 * 24 * 60 * 60, 50));
    return;
  }

  // ── Nominatim search — network-first, no offline fallback needed ─────────
  if (url.hostname.includes("nominatim.openstreetmap.org")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Leaflet CDN assets — cache-first ─────────────────────────────────────
  if (url.hostname.includes("cdnjs.cloudflare.com")) {
    event.respondWith(cacheFirstWithExpiry(request, APP_SHELL_CACHE, 7 * 24 * 60 * 60, 20));
    return;
  }

  // ── Same-origin app shell — stale-while-revalidate ───────────────────────
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
    return;
  }

  // ── Default: network-first ───────────────────────────────────────────────
  event.respondWith(networkFirst(request));
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

async function cacheFirstWithExpiry(request, cacheName, maxAgeSeconds, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const dateHeader = cached.headers.get("date");
    if (dateHeader) {
      const age = (Date.now() - new Date(dateHeader).getTime()) / 1000;
      if (age < maxAgeSeconds) return cached;
    } else {
      // No date header — treat as fresh (tiles often omit it)
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      await trimCache(cache, maxEntries - 1);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || new Response("", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await networkPromise) || new Response("", { status: 503 });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

// ── Update notification ───────────────────────────────────────────────────────
// When a new SW installs and takes over, tell all open tabs so the app
// can show a "update available" prompt if desired.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});