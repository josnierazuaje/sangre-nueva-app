// Sube este número cada vez que publiques cambios importantes en Netlify
// para que los celulares con la app instalada dejen de usar la versión vieja.
const CACHE_VERSION = "v1";
const CACHE_NAME = "sangre-nueva-" + CACHE_VERSION;

const CACHE_FIRST_ASSETS = [
  "icons/icon-192.png",
  "icons/icon-512.png",
  "manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FIRST_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isCacheFirstAsset(url) {
  return CACHE_FIRST_ASSETS.some((asset) => url.pathname.endsWith(asset));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isCacheFirstAsset(url)) {
    // Cache-first: íconos y manifest casi nunca cambian.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  const isHTMLRequest =
    request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname === "/";

  if (isHTMLRequest) {
    // Network-first: siempre intenta traer la última versión publicada en Netlify.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
