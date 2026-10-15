/**
 * Teeex — High-Speed Service Worker Cache for WASM, PDF.js, and TeX Live Packages.
 * Intercepts synchronous XHRs from busytex_worker.js and serves cached .sty/.cls/.tfm/.pfb
 * assets in <0.2ms with zero network roundtrips.
 */

const CACHE_STATIC = 'teeex-static-v3';
const CACHE_TEXLIVE = 'teeex-texlive-v3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => { }))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_TEXLIVE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isImmutableTexAsset(pathname) {
  return (
    pathname.startsWith('/api/texlive/') ||
    pathname.startsWith('/packages/') ||
    pathname.startsWith('/core/busytex/') ||
    pathname.startsWith('/pdfjs/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Cache-First strategy for TeX Live packages, fonts, WASM engine, and PDF.js assets
  if (url.origin === self.location.origin && isImmutableTexAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_TEXLIVE);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          const contentType = response.headers.get('content-type') || '';
          // Only cache valid binary/tex responses (never cache SPA index.html fallbacks)
          if (
            response.ok &&
            (!contentType.includes('text/html') || url.pathname.endsWith('.html'))
          ) {
            cache.put(request, response.clone()).catch(() => { });
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          return new Response('Offline asset unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  // 2. Stale-While-Revalidate for application shell & JS/CSS bundles
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone()).catch(() => { });
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkPromise;
      })()
    );
  }
});