/* yearning service worker — drop into /public/sw.js
 *
 * ⚠️ CRITICAL: This service worker NEVER touches localStorage.
 * Memories live in localStorage which the browser keeps independent of the SW.
 * Updates only swap CSS/JS/HTML — your memories stay exactly where they are.
 *
 * Bump SW_VERSION any time you deploy. The browser sees a new SW, installs it,
 * the app shows the "update ready" banner, and the user refreshes to pick it up.
 */

const SW_VERSION = "yearning-v1.2.0";
const CORE_CACHE = `${SW_VERSION}-core`;

// Files that should be cached for offline use (relative paths)
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  // Don't auto-skipWaiting — we let the app prompt the user first via the banner.
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) =>
      // Use addAll defensively — failures shouldn't block install
      Promise.all(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: "no-cache" })
            .then((res) => res.ok && cache.put(url, res))
            .catch(() => {})
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  // Clean up old SW caches (does NOT touch localStorage or IndexedDB)
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("yearning-") && !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Listen for the app's "go ahead and update" message
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch strategy:
// - Network-first for HTML/JS/CSS so updates roll out immediately when online
// - Cache fallback when offline
// - Tile and Nominatim requests pass through untouched (privacy: never cached)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Don't intercept third-party tile/search requests — they have their own caching
  const passthrough = [
    "basemaps.cartocdn.com",
    "nominatim.openstreetmap.org",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "cdnjs.cloudflare.com",
  ];
  if (passthrough.some((host) => url.hostname.includes(host))) return;

  // Same-origin: network-first, then cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Stash a copy for offline use
          if (response.ok) {
            const copy = response.clone();
            caches.open(CORE_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
  }
});