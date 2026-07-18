// Service Worker for Aesta Construction Manager
// Handles: PWA caching + offline fallback + push notifications

const PWA_CACHE = "aesta-pwa-v2";

// Assets to precache during install
const PRECACHE_URLS = [
  "/offline.html",
  "/favicon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Install event - precache offline page and key assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker");
  event.waitUntil(
    caches.open(PWA_CACHE).then((cache) => {
      console.log("[SW] Precaching offline page and icons");
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker");
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith("aesta-") && name !== PWA_CACHE)
            .map((name) => {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            })
        );
      }),
    ])
  );
});

// Fetch event - caching strategies for different request types
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests (Supabase, analytics, etc.)
  if (url.origin !== self.location.origin) return;

  // Skip Next.js internals (chunks, HMR, webpack)
  if (url.pathname.startsWith("/_next/")) return;

  // Skip API routes
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests (HTML pages): network-first, offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match("/offline.html");
      })
    );
    return;
  }

  // Static assets in /icons/ + the favicon: cache-first.
  // favicon.png is precached on install but used to fall through to the
  // passthrough branch below, so it revalidated (304) on every navigation.
  // Serving it from the precache here eliminates that per-load round trip.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/favicon.png") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(PWA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Manifest: cache-first
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(PWA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: passthrough (no event.respondWith)
});

// Message event for communication with the main app
self.addEventListener("message", (event) => {
  console.log("[SW] Message received:", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
