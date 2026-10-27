// Cloudflare Pages Function: /core/busytex/*
// Dual-Mode delivery pipeline:
// 1. If TEEEX_ENGINE_BUCKET is bound (R2 mode), serves directly from private R2 bucket.
// 2. Otherwise serves static assets <= 25MB from the deployment bundle.
// 3. For large engine assets (>25MB) in Zero-Credit-Card mode (no R2 bound),
//    streams from the configured upstream engine source and caches indefinitely at Cloudflare edge.

interface Env {
  TEEEX_ENGINE_BUCKET?: R2Bucket;
  TEEEX_ENGINE_BASE_URL?: string;
}

const DEFAULT_UPSTREAM_BASE = 'https://texlyre.github.io/texlyre-busytex/core/busytex';

function getContentType(key: string): string {
  if (key.endsWith('.wasm')) return 'application/wasm';
  if (key.endsWith('.data')) return 'application/octet-stream';
  if (key.endsWith('.js')) return 'application/javascript';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const key = url.pathname.replace(/^\/core\/busytex\//, '');

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  // 1. Priority 1: Try R2 bucket first if bound
  if (context.env?.TEEEX_ENGINE_BUCKET) {
    try {
      const object = await context.env.TEEEX_ENGINE_BUCKET.get(key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Cross-Origin-Resource-Policy', 'same-origin');
        headers.set('Content-Type', getContentType(key));

        const clientEtag = context.request.headers.get('if-none-match');
        if (clientEtag && clientEtag === object.httpEtag) {
          return new Response(null, { status: 304, headers });
        }

        return new Response(object.body, { headers });
      }
    } catch (_err) {
      // Fall through to next handler on R2 error
    }
  }

  // 2. Priority 2: Static files <= 25MB in deployment bundle
  const isHeavyFile = key.endsWith('.data') || key === 'busytex.wasm';
  if (!isHeavyFile) {
    const staticResponse = await context.next();
    const contentType = staticResponse.headers.get('content-type') || '';
    if (staticResponse.status === 200 && !contentType.includes('text/html')) {
      const headers = new Headers(staticResponse.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('Content-Type', getContentType(key));
      return new Response(staticResponse.body, {
        status: 200,
        headers,
      });
    }
  }

  // 3. Priority 3: Zero-Credit-Card Mode (stream large files and cache at Cloudflare edge)
  try {
    const upstreamBase = (context.env?.TEEEX_ENGINE_BASE_URL || DEFAULT_UPSTREAM_BASE).replace(/\/+$/, '');
    const upstreamUrl = `${upstreamBase}/${key}`;
    const upstreamRes = await fetch(upstreamUrl, {
      cf: {
        cacheTtl: 31536000,
        cacheEverything: true,
      },
    });

    if (upstreamRes.ok && upstreamRes.body) {
      const headers = new Headers();
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Content-Type', getContentType(key));
      // Upstream GitHub Pages responses are often gzipped and transparently
      // decompressed by Cloudflare's runtime fetch(). Never forward upstream
      // 'content-encoding: gzip' or compressed 'content-length' headers to avoid
      // net::ERR_CONTENT_DECODING_FAILED crashes inside browser Web Workers.

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers,
      });
    }
  } catch (_err) {
    // Return honest 404 below
  }

  return new Response(`Asset not found: ${key}`, { status: 404 });
};
