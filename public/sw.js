/* yearning service worker — /public/sw.js
 *
 * ⚠️ CRITICAL: This service worker NEVER touches localStorage.
 * Memories live in localStorage which the browser keeps independent of the SW.
 * Updates only swap CSS/JS/HTML — your memories stay exactly where they are.
 *
 * Bump SW_VERSION on every deploy so the browser detects the new worker,
 * the app shows the "update ready" banner, and the user refreshes to pick it up.
 */

const SW_VERSION = "yearning-v1.3.0";
const CORE_CACHE = `${SW_VERSION}-core`;

// ─── Core assets to cache on install ────────────────────────────────────────
// If you move to next-pwa or workbox-build, this list is auto-generated.
// For now keep it in sync with what Vercel actually serves at these paths.
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
];

// ─── Install ─────────────────────────────────────────────────────────────────
// Don't auto-skipWaiting — we let the app prompt the user via the update banner.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) =>
      Promise.all(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: "no-cache" })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {
              // Non-fatal: if an asset is missing at install time, don't block.
              console.warn(`[SW] Failed to cache ${url} — skipping.`);
            })
        )
      )
    )
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
// Delete all old yearning-* caches. Does NOT touch localStorage or IndexedDB.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("yearning-") && !k.startsWith(SW_VERSION)
            )
            .map((k) => {
              console.log(`[SW] Deleting old cache: ${k}`);
              return caches.delete(k);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Message ─────────────────────────────────────────────────────────────────
// The app sends SKIP_WAITING when the user taps "refresh" in the update banner.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
// Strategy: network-first for same-origin, pass-through for third-party.
// On network failure, fall back to cache → root shell → 503 text.
const PASSTHROUGH_HOSTS = [
  "basemaps.cartocdn.com",
  "nominatim.openstreetmap.org",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdnjs.cloudflare.com",
  "esm.sh",
  "unpkg.com",
  "vercel.live",
  "va.vercel-scripts.com",
];

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Pass third-party requests straight through — no caching, no interception
  if (PASSTHROUGH_HOSTS.some((host) => url.hostname.includes(host))) return;

  // Same-origin: network-first, cache on success, safe fallback on failure
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Stash a fresh copy for offline use
            const copy = response.clone();
            caches
              .open(CORE_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // Network failed — try exact match, then root shell, then 503
          const cached = await caches.match(request);
          if (cached) return cached;

          const root = await caches.match("/");
          if (root) return root;

          // Last resort: tell the browser we're offline rather than hanging
          return new Response(
            "Yearning is offline. Open the app when you're back online.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            }
          );
        })
    );
  }
});