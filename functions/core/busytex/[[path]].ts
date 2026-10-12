// Cloudflare Pages Function: proxies /core/busytex/*
// 1. If TEEEX_ENGINE_BUCKET is bound, serves from R2.
// 2. Otherwise falls back to static files (for worker scripts <= 25MB).
// 3. For large engine assets not in static bundle (>25MB), proxies from upstream and caches at Cloudflare edge.

interface Env {
  // Bound in Cloudflare Pages dashboard -> Settings -> Functions -> R2 bucket bindings
  TEEEX_ENGINE_BUCKET?: R2Bucket;
}

const UPSTREAM_ASSET_BASE = 'https://texlyre.github.io/texlyre-busytex/core/busytex';

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  // Extract key after /core/busytex/
  const key = url.pathname.replace(/^\/core\/busytex\//, '');

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  // 1. Try R2 bucket first if bound
  if (context.env?.TEEEX_ENGINE_BUCKET) {
    try {
      const object = await context.env.TEEEX_ENGINE_BUCKET.get(key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        headers.set('Cross-Origin-Resource-Policy', 'same-origin');

        const clientEtag = context.request.headers.get('if-none-match');
        if (clientEtag && clientEtag === object.httpEtag) {
          return new Response(null, { status: 304, headers });
        }

        return new Response(object.body, { headers });
      }
    } catch (_err) {
      // Fall through on R2 error
    }
  }

  // 2. For scripts <= 25MB that are in the static bundle, serve statically
  // Note: files > 25MB (like busytex.wasm and *.data) are not in the static bundle
  const isHeavyFile = key.endsWith('.data') || key === 'busytex.wasm';
  if (!isHeavyFile) {
    const staticResponse = await context.next();
    const contentType = staticResponse.headers.get('content-type') || '';
    // If the file exists statically, it will NOT be text/html (our SPA fallback is index.html)
    if (staticResponse.status === 200 && !contentType.includes('text/html')) {
      return staticResponse;
    }
  }

  // 3. Fallback: proxy from upstream and cache for 1 year at Cloudflare edge
  try {
    const upstreamUrl = `${UPSTREAM_ASSET_BASE}/${key}`;
    const upstreamRes = await fetch(upstreamUrl, {
      cf: {
        cacheTtl: 31536000,
        cacheEverything: true,
      },
    });

    if (upstreamRes.ok && upstreamRes.body) {
      const headers = new Headers(upstreamRes.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      if (key.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm');
      if (key.endsWith('.data')) headers.set('Content-Type', 'application/octet-stream');
      if (key.endsWith('.js')) headers.set('Content-Type', 'application/javascript');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers,
      });
    }
  } catch (_err) {
    // Return error if upstream fetch fails
  }

  return new Response(`Asset not found: ${key}`, { status: 404 });
};
