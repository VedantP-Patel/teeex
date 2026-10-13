// Teeex — High-Performance Engine & Asset Cache Service Worker
const CACHE_NAME = 'teeex-engine-cache-v1';

// Immutable engine, viewer, and remote TeX Live package assets
const CACHE_PATTERNS = [
  /\/core\/busytex\//,
  /\/pdfjs\//,
  /\/packages\//,
  /\/api\/texlive\//,
];

self.addEventListener('install', () => {
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME && key.startsWith('teeex-engine-')) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests for same-origin engine and static package assets
  if (event.request.method !== 'GET') return;

  const isEngineAsset = CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
  if (!isEngineAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        // Only cache valid full responses (status 200)
        if (response.status === 200) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        throw err;
      }
    }),
  );
});
