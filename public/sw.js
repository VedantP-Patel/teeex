/**
 * Teeex — 3-Tier Partitioned Service Worker Cache with LRU Eviction & Navigation Freshness.
 *
 * Cache Partitioning:
 * - CACHE_STATIC: Build-stamped application shell, JS/CSS bundles, fonts, and icons.
 *   Purged automatically on worker activation when new deploys are detected.
 * - CACHE_ENGINE: Version-pinned TeX engine assets (/core/busytex/*).
 *   Preserved across application releases to avoid re-downloading ~152 MB.
 * - CACHE_PACKAGES: Dynamic on-demand TeX Live packages (/packages/*, /api/texlive/*).
 *   Guarded against HTML response poisoning; capped at 300 entries with LRU eviction.
 */

const CACHE_STATIC = 'teeex-static-v6-20261018';
const CACHE_ENGINE = 'teeex-engine-v1.4.0';
const CACHE_PACKAGES = 'teeex-packages-v1';
const MAX_PACKAGE_ENTRIES = 300;

const PRECACHE_STATIC_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/packages/IEEEtran.cls',
  '/packages/booktabs.sty',
  '/packages/microtype.sty',
  '/packages/cite.sty',
];

let swChannel = null;
try {
  swChannel = new BroadcastChannel('teeex_sw_channel');
} catch {}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_STATIC_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_ENGINE && k !== CACHE_PACKAGES)
          .map((k) => caches.delete(k))
      );
      // Evict stale pipeline JS script from CACHE_ENGINE so fresh patched file is used
      try {
        const engineCache = await caches.open(CACHE_ENGINE);
        await engineCache.delete('/core/busytex/busytex_pipeline.js');
      } catch {}
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', async (event) => {
  if (event.data?.type === 'GET_ENGINE_STATUS') {
    try {
      const cache = await caches.open(CACHE_ENGINE);
      const wasm = await cache.match('/core/busytex/busytex.wasm');
      const data = await cache.match('/core/busytex/texlive-basic.data');
      event.ports?.[0]?.postMessage({
        isCached: Boolean(wasm && data),
        hasWasm: Boolean(wasm),
        hasData: Boolean(data),
      });
    } catch {
      event.ports?.[0]?.postMessage({ isCached: false });
    }
  } else if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


async function trimCache(cache, maxItems) {
  try {
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const purgeCount = Math.ceil(maxItems * 0.2); // Purge oldest 20%
      for (let i = 0; i < purgeCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch {
    // Non-fatal
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Navigation requests: Network-First with 2.5s timeout, falling back to cached index.html
  // Fixes Defect S3a (the stale-deploy trap) where users were stuck on old builds indefinitely.
  if (
    request.mode === 'navigate' ||
    (url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html'))
  ) {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const networkRes = await fetch(request, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (networkRes && networkRes.ok) {
            const cache = await caches.open(CACHE_STATIC);
            cache.put(request, networkRes.clone()).catch(() => {});
            return networkRes;
          }
        } catch (_err) {
          // Offline or network timeout — fall back to cache below
        }

        const cached = await caches.match(request);
        if (cached) return cached;
        const indexFallback = await caches.match('/index.html');
        if (indexFallback) return indexFallback;

        return new Response('Offline: Teeex is unavailable without network.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })()
    );
    return;
  }

  // 2. TeX Engine Assets (/core/busytex/*): Network-First for JS scripts, Cache-First for heavy binaries
  if (url.origin === self.location.origin && url.pathname.startsWith('/core/busytex/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_ENGINE);
        const isScript = url.pathname.endsWith('.js');

        // Fast-path: Network-First for lightweight JS scripts so patches take effect immediately
        if (isScript) {
          try {
            const res = await fetch(request);
            const ct = res.headers.get('content-type') || '';
            if (res.ok && !ct.includes('text/html')) {
              cache.put(request, res.clone()).catch(() => {});
            }
            return res;
          } catch {
            const cached = await cache.match(request);
            if (cached) return cached;
            return new Response('Offline: Engine script unavailable', { status: 503 });
          }
        }

        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const res = await fetch(request);
          const ct = res.headers.get('content-type') || '';
          // Guard: Never cache SPA HTML fallback responses as engine binaries
          if (res.ok && !ct.includes('text/html')) {
            cache.put(request, res.clone()).catch(() => {});
            try {
              swChannel?.postMessage({ type: 'ENGINE_ASSET_CACHED', url: url.pathname });
            } catch {}
          }
          return res;
        } catch (_err) {
          return new Response('Offline: Engine asset unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  // 3. Dynamic TeX Live Packages (/packages/*, /api/texlive/*): Cache-First with LRU & HTML Poison Guard
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/packages/') || url.pathname.startsWith('/api/texlive/'))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_PACKAGES);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const res = await fetch(request);
          const ct = res.headers.get('content-type') || '';
          // Guard: Never cache 404 HTML fallback responses into TeX package cache
          if (res.ok && !ct.includes('text/html')) {
            cache.put(request, res.clone()).then(() => trimCache(cache, MAX_PACKAGE_ENTRIES)).catch(() => {});
          }
          return res;
        } catch (_err) {
          return new Response('Offline: Package unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  // 4. Content-Hashed Assets, Fonts, & PDF.js (/assets/*, /fonts/*, /pdfjs/*): Cache-First
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/fonts/') ||
      url.pathname.startsWith('/pdfjs/'))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const res = await fetch(request);
          if (res.ok) {
            cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        } catch (_err) {
          return new Response('Offline asset unavailable', { status: 503 });
        }
      })()
    );
    return;
  }

  // 5. General same-origin assets: Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(request);
        const netFetch = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || netFetch;
      })()
    );
  }
});