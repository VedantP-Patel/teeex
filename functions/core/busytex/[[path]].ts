// Cloudflare Pages Function: proxies /core/busytex/* from Cloudflare R2
// 1. If TEEEX_ENGINE_BUCKET is bound, serves from R2.
// 2. Otherwise falls back to static files (for worker scripts <= 25MB).
// 3. For large engine assets not in static bundle (>25MB), proxies from upstream and caches at edge.

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

        // Handle conditional GET (If-None-Match)
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

  // 2. Try static asset in Pages bundle (for worker scripts <= 25MB)
  const staticResponse = await context.next();
  if (staticResponse.status !== 404) {
    return staticResponse;
  }

  // 3. Fallback for large assets (>25MB) when R2 is not populated yet
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
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers,
      });
    }
  } catch (_err) {
    // Return 404 if upstream fetch fails
  }

  return staticResponse;
};
