// Cloudflare Pages Function: /core/busytex/*
// Dual-Mode delivery pipeline:
// 1. If TEEEX_ENGINE_BUCKET is bound (R2 mode), serves directly from private R2 bucket with HTTP Range support.
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

function isSafeKey(key: string): boolean {
  return Boolean(key) && !key.includes('..') && !key.startsWith('/');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const method = context.request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(context.request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/core\/busytex\//, ''));

  if (!isSafeKey(key)) {
    return new Response('Not Found', { status: 404 });
  }

  // 1. Priority 1: R2 bucket with HTTP Range & ETag support
  if (context.env?.TEEEX_ENGINE_BUCKET) {
    try {
      if (method === 'HEAD') {
        const headObj = await context.env.TEEEX_ENGINE_BUCKET.head(key);
        if (headObj) {
          const headers = new Headers();
          headObj.writeHttpMetadata(headers);
          headers.set('etag', headObj.httpEtag);
          headers.set('Accept-Ranges', 'bytes');
          headers.set('Content-Length', String(headObj.size));
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          headers.set('Cross-Origin-Resource-Policy', 'same-origin');
          headers.set('Content-Type', getContentType(key));
          return new Response(null, { status: 200, headers });
        }
      } else {
        const rangeHeader = context.request.headers.get('range');
        const object = await context.env.TEEEX_ENGINE_BUCKET.get(
          key,
          rangeHeader ? { range: context.request.headers } : undefined
        );

        if (object) {
          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
          headers.set('Accept-Ranges', 'bytes');
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          headers.set('Cross-Origin-Resource-Policy', 'same-origin');
          headers.set('Content-Type', getContentType(key));

          const clientEtag = context.request.headers.get('if-none-match');
          if (clientEtag && clientEtag === object.httpEtag) {
            return new Response(null, { status: 304, headers });
          }

          if (
            object.range &&
            'offset' in object.range &&
            'length' in object.range &&
            typeof object.range.offset === 'number' &&
            typeof object.range.length === 'number'
          ) {
            const { offset, length } = object.range;
            const end = offset + length - 1;
            headers.set('Content-Range', `bytes ${offset}-${end}/${object.size}`);
            headers.set('Content-Length', String(length));
            return new Response(object.body, { status: 206, headers });
          }

          headers.set('Content-Length', String(object.size));
          return new Response(object.body, { status: 200, headers });
        }
      }
    } catch {
      // Fall through to next handler on R2 error
    }
  }

  // 2. Priority 2: Static files <= 25MB in deployment bundle
  const isHeavyFile = key === 'texlive-basic.data' || key === 'busytex.wasm' || key === 'biber.data';
  if (!isHeavyFile) {
    const staticResponse = await context.next();
    const contentType = staticResponse.headers.get('content-type') || '';
    if (staticResponse.status === 200 && !contentType.includes('text/html')) {
      const headers = new Headers(staticResponse.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('Content-Type', getContentType(key));
      return new Response(method === 'HEAD' ? null : staticResponse.body, {
        status: 200,
        headers,
      });
    }
  }

  // 3. Priority 3: Zero-Credit-Card Mode (stream large files and cache at Cloudflare edge)
  try {
    const upstreamBase = (context.env?.TEEEX_ENGINE_BASE_URL || DEFAULT_UPSTREAM_BASE).replace(/\/+$/, '');
    const upstreamUrl = `${upstreamBase}/${key}`;
    const upstreamHeaders: Record<string, string> = {
      'Accept-Encoding': 'identity',
    };
    const rangeHeader = context.request.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      cf: {
        cacheTtl: 31536000,
        cacheEverything: true,
      },
    });

    const upstreamCt = upstreamRes.headers.get('content-type') || '';
    if ((upstreamRes.ok || upstreamRes.status === 206) && !upstreamCt.includes('text/html')) {
      const headers = new Headers();
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Type', getContentType(key));

      const rawLen = upstreamRes.headers.get('content-length');
      if (rawLen) headers.set('Content-Length', rawLen);

      const contentRange = upstreamRes.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);

      return new Response(method === 'HEAD' ? null : upstreamRes.body, {
        status: upstreamRes.status,
        headers,
      });
    }
  } catch {
    // Return honest 404 below
  }

  return new Response(`Asset not found: ${key}`, { status: 404 });
};