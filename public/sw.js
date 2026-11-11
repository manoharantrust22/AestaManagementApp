// Service Worker for Aesta Construction Manager
// Handles: PWA caching + offline fallback + push notifications

const PWA_CACHE = "aesta-pwa-v3";

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

// ---------------------------------------------------------------------------
// Web push — payload sent by /api/push/dispatch:
//   { title, body, url, tag, needsAction }
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Aesta", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Aesta";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: !!data.needsAction,
    data: { url: data.url || "/site/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/site/dashboard",
    self.location.origin
  ).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          return w.focus().then((fw) => (fw && "navigate" in fw ? fw.navigate(target) : fw));
        }
      }
      return clients.openWindow(target);
    })
  );
});

// Browser rotated the subscription — tell the server (best effort).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint }),
        })
      )
      .catch(() => undefined)
  );
});
